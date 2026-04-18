using System.Diagnostics;
using System.Globalization;
using System.Net.NetworkInformation;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows.Forms;

namespace WindowsMonitorHelper;

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    [STAThread]
    private static async Task Main()
    {
        using var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (_, eventArgs) =>
        {
            eventArgs.Cancel = true;
            cts.Cancel();
        };

        using var runtime = new MonitorRuntime();
        await runtime.RunAsync(cts.Token);
    }

    private sealed class MonitorRuntime : IDisposable
    {
        private readonly object gate = new();
        private readonly StreamWriter stdout;
        private readonly JsonSerializerOptions jsonOptions = JsonOptions;
        private readonly System.Threading.Timer sampleTimer;
        private readonly PerformanceCounter? cpuCounter;
        private readonly PerformanceCounterCategory? gpuCategory;
        private readonly List<GpuCounterHandle> gpuCounters = [];
        private readonly Thread uiThread;
        private readonly ManualResetEventSlim uiReady = new(false);
        private TaskbarMonitorForm? taskbarForm;
        private SampleSnapshot latestSnapshot;
        private TaskbarWidgetRuntimeStatus taskbarWidgetRuntimeStatus = TaskbarWidgetRuntimeStatus.Disabled;
        private RuntimeConfig config = new();
        private NetworkTotals? previousNetworkTotals;
        private DateTimeOffset? previousNetworkRecordedAt;
        private bool disposed;

        public MonitorRuntime()
        {
            stdout = new StreamWriter(Console.OpenStandardOutput())
            {
                AutoFlush = true,
            };

            cpuCounter = TryCreateCpuCounter();
            gpuCategory = TryCreateGpuCategory();
            RefreshGpuCounters();
            PrimeCpuCounter();

            latestSnapshot = CaptureSnapshot(DateTimeOffset.UtcNow);
            sampleTimer = new System.Threading.Timer(SampleTick, null, Timeout.Infinite, Timeout.Infinite);

            uiThread = new Thread(RunUiThread)
            {
                IsBackground = true,
                Name = "FreeCliSystemMonitorTaskbarUi",
            };
            uiThread.SetApartmentState(ApartmentState.STA);
            uiThread.Start();
            uiReady.Wait();
        }

        public async Task RunAsync(CancellationToken cancellationToken)
        {
            lock (gate)
            {
                sampleTimer.Change(0, 1000);
            }

            using var reader = new StreamReader(Console.OpenStandardInput());
            while (!cancellationToken.IsCancellationRequested)
            {
                string? line = await reader.ReadLineAsync(cancellationToken);
                if (line is null)
                {
                    break;
                }

                if (string.IsNullOrWhiteSpace(line))
                {
                    continue;
                }

                await HandleCommandAsync(line, cancellationToken);
            }
        }

        public void Dispose()
        {
            if (disposed)
            {
                return;
            }

            disposed = true;
            sampleTimer.Dispose();
            cpuCounter?.Dispose();
            foreach (GpuCounterHandle counter in gpuCounters)
            {
                counter.Dispose();
            }

            if (taskbarForm?.IsHandleCreated == true)
            {
                try
                {
                    taskbarForm.BeginInvoke(new Action(() => taskbarForm?.Close()));
                }
                catch
                {
                    // Ignore UI shutdown races.
                }
            }

            uiReady.Dispose();
        }

        private async Task HandleCommandAsync(string line, CancellationToken cancellationToken)
        {
            try
            {
                HelperCommand? command = JsonSerializer.Deserialize<HelperCommand>(line, jsonOptions);
                if (command?.Type is null)
                {
                    await WriteEnvelopeAsync(new HelperEnvelope(false, null, "Invalid command", "Missing command type"), cancellationToken);
                    return;
                }

                switch (command.Type)
                {
                    case "configure":
                        TaskbarWidgetRuntimeStatus configuredTaskbarStatus;
                        lock (gate)
                        {
                            config = command.Config ?? new RuntimeConfig();
                            RefreshGpuCounters();
                        }

                        configuredTaskbarStatus = UpdateTaskbarVisibility();
                        lock (gate)
                        {
                            taskbarWidgetRuntimeStatus = configuredTaskbarStatus;
                        }

                        await WriteEnvelopeAsync(
                            new HelperEnvelope(
                                true,
                                new ConfigurePayload(true, configuredTaskbarStatus),
                                null,
                                null),
                            cancellationToken);
                        break;
                    case "snapshot":
                        await WriteEnvelopeAsync(
                            new HelperEnvelope(
                                true,
                                new SnapshotPayload(GetLatestSnapshot(), GetTaskbarWidgetRuntimeStatus()),
                                null,
                                null),
                            cancellationToken);
                        break;
                    case "stop":
                        await WriteEnvelopeAsync(new HelperEnvelope(true, new { stopping = true }, null, null), cancellationToken);
                        Dispose();
                        Environment.Exit(0);
                        break;
                    default:
                        await WriteEnvelopeAsync(new HelperEnvelope(false, null, "Unsupported command", command.Type), cancellationToken);
                        break;
                }
            }
            catch (Exception exception)
            {
                await WriteEnvelopeAsync(new HelperEnvelope(false, null, exception.Message, exception.ToString()), cancellationToken);
            }
        }

        private SampleSnapshot GetLatestSnapshot()
        {
            lock (gate)
            {
                return latestSnapshot;
            }
        }

        private async Task WriteEnvelopeAsync(HelperEnvelope envelope, CancellationToken cancellationToken)
        {
            string json = JsonSerializer.Serialize(envelope, jsonOptions);
            await stdout.WriteLineAsync(json.AsMemory(), cancellationToken);
            await stdout.FlushAsync();
        }

        private void SampleTick(object? state)
        {
            try
            {
                SampleSnapshot snapshot = CaptureSnapshot(DateTimeOffset.UtcNow);
                lock (gate)
                {
                    latestSnapshot = snapshot;
                }

                if (taskbarForm?.IsHandleCreated == true)
                {
                    try
                    {
                        taskbarForm.BeginInvoke(
                            new Action(() =>
                            {
                                if (taskbarForm is null)
                                {
                                    return;
                                }

                                TaskbarWidgetRuntimeStatus status = taskbarForm.ApplySnapshot(
                                    snapshot,
                                    config.TaskbarWidgetEnabled,
                                    config.TaskbarWidget);
                                lock (gate)
                                {
                                    taskbarWidgetRuntimeStatus = status;
                                }
                            }));
                    }
                    catch
                    {
                        // Ignore UI races; the next tick will repaint.
                    }
                }
            }
            catch
            {
                // Keep sampling alive; the main process degrades gracefully on null GPU data.
            }
        }

        private SampleSnapshot CaptureSnapshot(DateTimeOffset now)
        {
            NetworkTotals networkTotals = CaptureNetworkTotals();
            long uploadBytesPerSecond = 0;
            long downloadBytesPerSecond = 0;
            if (previousNetworkTotals is not null && previousNetworkRecordedAt is not null)
            {
                double elapsedSeconds = Math.Max(0.001d, (now - previousNetworkRecordedAt.Value).TotalSeconds);
                uploadBytesPerSecond = (long)Math.Max(0d, (networkTotals.UploadBytesTotal - previousNetworkTotals.UploadBytesTotal) / elapsedSeconds);
                downloadBytesPerSecond = (long)Math.Max(0d, (networkTotals.DownloadBytesTotal - previousNetworkTotals.DownloadBytesTotal) / elapsedSeconds);
            }

            previousNetworkTotals = networkTotals;
            previousNetworkRecordedAt = now;
            int cpu = CaptureCpuUsage();
            int memory = CaptureMemoryUsage();
            int? gpu = config.GpuMode == "total" ? CaptureGpuUsage() : null;

            return new SampleSnapshot(
                now.ToString("O", CultureInfo.InvariantCulture),
                networkTotals.UploadBytesTotal,
                networkTotals.DownloadBytesTotal,
                uploadBytesPerSecond,
                downloadBytesPerSecond,
                cpu,
                memory,
                gpu);
        }

        private static NetworkTotals CaptureNetworkTotals()
        {
            long upload = 0;
            long download = 0;

            foreach (NetworkInterface networkInterface in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (networkInterface.OperationalStatus != OperationalStatus.Up)
                {
                    continue;
                }

                if (networkInterface.NetworkInterfaceType == NetworkInterfaceType.Loopback ||
                    networkInterface.NetworkInterfaceType == NetworkInterfaceType.Tunnel)
                {
                    continue;
                }

                try
                {
                    IPv4InterfaceStatistics statistics = networkInterface.GetIPv4Statistics();
                    upload += Math.Max(0L, statistics.BytesSent);
                    download += Math.Max(0L, statistics.BytesReceived);
                }
                catch
                {
                    // Ignore adapter-specific failures and continue aggregating the rest.
                }
            }

            return new NetworkTotals(upload, download);
        }

        private static PerformanceCounter? TryCreateCpuCounter()
        {
            try
            {
                return new PerformanceCounter("Processor", "% Processor Time", "_Total", true);
            }
            catch
            {
                return null;
            }
        }

        private static void PrimeCpuCounter(PerformanceCounter? counter)
        {
            try
            {
                counter?.NextValue();
            }
            catch
            {
                // Ignore priming failures; later reads fall back to zero.
            }
        }

        private void PrimeCpuCounter()
        {
            PrimeCpuCounter(cpuCounter);
        }

        private int CaptureCpuUsage()
        {
            try
            {
                float next = cpuCounter?.NextValue() ?? 0f;
                return ClampPercent(next);
            }
            catch
            {
                return 0;
            }
        }

        private static int CaptureMemoryUsage()
        {
            try
            {
                MemoryStatusEx memoryStatus = MemoryStatusEx.Create();
                if (NativeMethods.GlobalMemoryStatusEx(ref memoryStatus) && memoryStatus.TotalPhys > 0)
                {
                    double usedRatio = (memoryStatus.TotalPhys - memoryStatus.AvailPhys) / (double)memoryStatus.TotalPhys;
                    return ClampPercent((float)(usedRatio * 100d));
                }
            }
            catch
            {
                // Ignore and fall through.
            }

            return 0;
        }

        private static PerformanceCounterCategory? TryCreateGpuCategory()
        {
            try
            {
                return PerformanceCounterCategory.Exists("GPU Engine")
                    ? new PerformanceCounterCategory("GPU Engine")
                    : null;
            }
            catch
            {
                return null;
            }
        }

        private void RefreshGpuCounters()
        {
            foreach (GpuCounterHandle counter in gpuCounters)
            {
                counter.Dispose();
            }

            gpuCounters.Clear();
            if (config.GpuMode != "total" || gpuCategory is null)
            {
                return;
            }

            try
            {
                foreach (string instanceName in gpuCategory.GetInstanceNames())
                {
                    if (!instanceName.Contains("engtype_3D", StringComparison.OrdinalIgnoreCase) &&
                        !instanceName.Contains("engtype_VideoDecode", StringComparison.OrdinalIgnoreCase) &&
                        !instanceName.Contains("engtype_VideoProcessing", StringComparison.OrdinalIgnoreCase) &&
                        !instanceName.Contains("engtype_Compute", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    try
                    {
                        var counter = new PerformanceCounter("GPU Engine", "Utilization Percentage", instanceName, true);
                        _ = counter.NextValue();
                        gpuCounters.Add(new GpuCounterHandle(counter));
                    }
                    catch
                    {
                        // Ignore individual counter failures and keep the rest.
                    }
                }
            }
            catch
            {
                // If the category fails, GPU stays unavailable without affecting core metrics.
            }
        }

        private int? CaptureGpuUsage()
        {
            if (gpuCounters.Count == 0)
            {
                return null;
            }

            float peak = 0f;
            bool hasValue = false;
            foreach (GpuCounterHandle counter in gpuCounters)
            {
                try
                {
                    float value = counter.Counter.NextValue();
                    if (!float.IsFinite(value))
                    {
                        continue;
                    }

                    peak = Math.Max(peak, value);
                    hasValue = true;
                }
                catch
                {
                    // Ignore individual counter failure.
                }
            }

            return hasValue ? ClampPercent(peak) : null;
        }

        private void RunUiThread()
        {
            ApplicationConfiguration.Initialize();
            taskbarForm = new TaskbarMonitorForm();
            uiReady.Set();
            Application.Run(taskbarForm);
        }

        private TaskbarWidgetRuntimeStatus UpdateTaskbarVisibility()
        {
            if (taskbarForm?.IsHandleCreated != true)
            {
                return config.TaskbarWidgetEnabled
                    ? new TaskbarWidgetRuntimeStatus(true, false, false, null)
                    : TaskbarWidgetRuntimeStatus.Disabled;
            }

            try
            {
                if (taskbarForm.InvokeRequired)
                {
                    taskbarForm.BeginInvoke(
                        new Action(() =>
                        {
                            if (taskbarForm is null)
                            {
                                return;
                            }

                            TaskbarWidgetRuntimeStatus status = taskbarForm.ApplySnapshot(
                                GetLatestSnapshot(),
                                config.TaskbarWidgetEnabled,
                                config.TaskbarWidget);
                            lock (gate)
                            {
                                taskbarWidgetRuntimeStatus = status;
                            }
                        }));

                    return config.TaskbarWidgetEnabled
                        ? new TaskbarWidgetRuntimeStatus(true, false, false, null)
                        : TaskbarWidgetRuntimeStatus.Disabled;
                }

                return taskbarForm.ApplySnapshot(
                    GetLatestSnapshot(),
                    config.TaskbarWidgetEnabled,
                    config.TaskbarWidget);
            }
            catch
            {
                // Ignore UI races.
                return TaskbarWidgetRuntimeStatus.Failed("任务栏监控窗口更新失败。");
            }
        }

        private TaskbarWidgetRuntimeStatus GetTaskbarWidgetRuntimeStatus()
        {
            lock (gate)
            {
                return taskbarWidgetRuntimeStatus;
            }
        }

        private static int ClampPercent(float value)
        {
            if (float.IsNaN(value) || float.IsInfinity(value))
            {
                return 0;
            }

            return Math.Max(0, Math.Min(100, (int)Math.Round(value, MidpointRounding.AwayFromZero)));
        }
    }

    private sealed record HelperCommand(string Type, RuntimeConfig? Config);

    private sealed record RuntimeConfig
    {
        public string GpuMode { get; init; } = "off";

        public bool TaskbarWidgetEnabled { get; init; }

        public TaskbarWidgetConfig TaskbarWidget { get; init; } = new();
    }

    private sealed record ConfigurePayload(bool Configured, TaskbarWidgetRuntimeStatus TaskbarWidgetStatus);

    private sealed record SnapshotPayload(
        SampleSnapshot Snapshot,
        TaskbarWidgetRuntimeStatus TaskbarWidgetStatus);

    private sealed record NetworkTotals(long UploadBytesTotal, long DownloadBytesTotal);

    private sealed record HelperEnvelope(bool Ok, object? Result, string? Error, string? Detail);

    private sealed class GpuCounterHandle(PerformanceCounter counter) : IDisposable
    {
        public PerformanceCounter Counter { get; } = counter;

        public void Dispose()
        {
            Counter.Dispose();
        }
    }
}
