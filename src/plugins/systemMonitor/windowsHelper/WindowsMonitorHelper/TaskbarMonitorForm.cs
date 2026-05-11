using Microsoft.Win32;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.Windows.Forms;
using System.Globalization;

namespace WindowsMonitorHelper;

internal sealed class TaskbarMonitorForm : Form
{
    private const int MinSingleRowWidth = 160;
    private const int ColumnGap = 10;
    private const int HorizontalPadding = 8;
    private const int VerticalPadding = 4;
    private const int RowGap = 1;
    private const int LabelValueGap = 4;
    private const int DefaultHeight = 30;
    private const int WmSettingChange = 0x001A;
    private const int WmThemeChanged = 0x031A;
    private const int WmDwmColorizationColorChanged = 0x0320;
    private const int WmDwmCompositionChanged = 0x031E;
    private static readonly Color TransparentKeyColor = Color.FromArgb(1, 2, 3);

    private readonly NotifyIcon notifyIcon;
    private readonly ContextMenuStrip notifyMenu;
    private readonly ToolStripMenuItem toggleWindowMenuItem;
    private readonly ToolStripMenuItem refreshMenuItem;
    private readonly ToolStripMenuItem settingsMenuItem;
    private readonly ToolStripMenuItem hideMenuItem;
    private readonly TaskbarEmbeddingHost embeddingHost = new();
    private SampleSnapshot? latestSnapshot;
    private bool requestedWidgetEnabled;
    private bool sessionHidden;
    private string? lastRuntimeError;
    private string lastRuntimeStage = "idle";
    private string? lastParentWindowClass;
    private Rectangle? lastEmbeddedBounds;
    private TaskbarWidgetConfig widgetConfig = new();
    private TaskbarVisualStyle visualStyle = TaskbarVisualStyle.Create(isLightTheme: true);
    private TaskbarLayout? currentLayout;
    private Font? currentLayoutFont;
    private Bitmap? renderBitmap;
    private string? lastRenderSignature;
    private bool layeredFrameCommitted;

    public TaskbarMonitorForm()
    {
        ShowInTaskbar = false;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        AutoScaleMode = AutoScaleMode.None;
        AutoScaleDimensions = new SizeF(96F, 96F);
        Padding = new Padding(0);
        DoubleBuffered = true;
        ResizeRedraw = false;
        SetStyle(
            ControlStyles.OptimizedDoubleBuffer |
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.UserPaint |
            ControlStyles.SupportsTransparentBackColor,
            true);

        notifyMenu = new ContextMenuStrip();
        toggleWindowMenuItem = new ToolStripMenuItem("隐藏任务栏监测");
        refreshMenuItem = new ToolStripMenuItem("立即刷新显示");
        settingsMenuItem = new ToolStripMenuItem("查看当前显示设置");
        hideMenuItem = new ToolStripMenuItem("本次会话隐藏");

        toggleWindowMenuItem.Click += (_, _) =>
        {
            if (!requestedWidgetEnabled)
            {
                return;
            }

            sessionHidden = !sessionHidden;
            UpdateView();
        };
        refreshMenuItem.Click += (_, _) =>
        {
            UpdateView();
        };
        settingsMenuItem.Click += (_, _) =>
        {
            string currentItems = string.Join(" / ", widgetConfig.DisplayItems);
            string content =
                $"显示项：{currentItems}\n字体大小：{widgetConfig.FontSize}\n布局：{(ShouldUseTwoRowLayout(widgetConfig) ? "双行" : "单行")}\n最近状态：{(lastRuntimeError ?? "任务栏嵌入正常")}";
            MessageBox.Show(
                this,
                content,
                "系统监控任务栏设置",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        };
        hideMenuItem.Click += (_, _) =>
        {
            if (!requestedWidgetEnabled)
            {
                return;
            }

            sessionHidden = true;
            UpdateView();
        };
        notifyMenu.Items.AddRange([toggleWindowMenuItem, refreshMenuItem, settingsMenuItem, hideMenuItem]);

        notifyIcon = new NotifyIcon
        {
            Text = "FreeCli 系统监控",
            Visible = false,
            ContextMenuStrip = notifyMenu,
            Icon = SystemIcons.Application,
        };
        notifyIcon.DoubleClick += (_, _) =>
        {
            if (!requestedWidgetEnabled)
            {
                return;
            }

            sessionHidden = !sessionHidden;
            UpdateView();
        };

        MouseUp += OnMouseUp;
        SystemEvents.UserPreferenceChanged += OnUserPreferenceChanged;
        BackColor = TransparentKeyColor;
        ForeColor = visualStyle.DefaultValueColor;
        Visible = false;
    }

    protected override bool ShowWithoutActivation => true;

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams createParams = base.CreateParams;
            createParams.Style |= (int)(
                NativeMethods.WsChild |
                NativeMethods.WsClipChildren |
                NativeMethods.WsClipSiblings);
            createParams.Style &= unchecked((int)~NativeMethods.WsPopup);
            createParams.ExStyle |= (int)(
                NativeMethods.WsExToolWindow |
                NativeMethods.WsExNoActivate);
            createParams.ExStyle &= unchecked((int)~NativeMethods.WsExAppWindow);
            return createParams;
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            SystemEvents.UserPreferenceChanged -= OnUserPreferenceChanged;
            embeddingHost.Detach(this);
            currentLayoutFont?.Dispose();
            currentLayoutFont = null;
            renderBitmap?.Dispose();
            renderBitmap = null;
            notifyIcon.Visible = false;
            notifyIcon.Dispose();
            notifyMenu.Dispose();
        }

        base.Dispose(disposing);
    }

    protected override void OnPaintBackground(PaintEventArgs eventArgs)
    {
        using SolidBrush brush = new(TransparentKeyColor);
        eventArgs.Graphics.FillRectangle(brush, ClientRectangle);
    }

    protected override void OnPaint(PaintEventArgs eventArgs)
    {
        base.OnPaint(eventArgs);
        Graphics graphics = eventArgs.Graphics;
        if (currentLayout is null)
        {
            return;
        }

        EnsureRenderBitmap();
        if (renderBitmap is null)
        {
            return;
        }

        using (Graphics bitmapGraphics = Graphics.FromImage(renderBitmap))
        {
            bitmapGraphics.Clear(embeddingHost.IsOverlayMode ? Color.Transparent : TransparentKeyColor);
            if (embeddingHost.IsOverlayMode)
            {
                bitmapGraphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
            }
            foreach (TaskbarLayoutCell cell in currentLayout.Cells)
            {
                if (embeddingHost.IsOverlayMode)
                {
                    DrawAlphaText(
                        bitmapGraphics,
                        cell.Label,
                        currentLayoutFont ?? Font,
                        cell.LabelBounds,
                        visualStyle.GetLabelColor(cell.ItemKey),
                        false);
                    DrawAlphaText(
                        bitmapGraphics,
                        GetValueTextForLayout(cell.Value, widgetConfig),
                        currentLayoutFont ?? Font,
                        cell.ValueBounds,
                        visualStyle.GetValueColor(cell.ItemKey),
                        cell.ValueRightAligned);
                    continue;
                }

                TextRenderer.DrawText(
                    bitmapGraphics,
                    cell.Label,
                    currentLayoutFont ?? Font,
                    cell.LabelBounds,
                    visualStyle.GetLabelColor(cell.ItemKey),
                    embeddingHost.IsOverlayMode ? Color.Transparent : TransparentKeyColor,
                    TextFormatFlags.NoPadding |
                    TextFormatFlags.SingleLine |
                    TextFormatFlags.VerticalCenter |
                    TextFormatFlags.Left |
                    TextFormatFlags.NoClipping |
                    TextFormatFlags.PreserveGraphicsClipping);
                TextRenderer.DrawText(
                    bitmapGraphics,
                    GetValueTextForLayout(cell.Value, widgetConfig),
                    currentLayoutFont ?? Font,
                    cell.ValueBounds,
                    visualStyle.GetValueColor(cell.ItemKey),
                    embeddingHost.IsOverlayMode ? Color.Transparent : TransparentKeyColor,
                    TextFormatFlags.NoPadding |
                    TextFormatFlags.SingleLine |
                    TextFormatFlags.VerticalCenter |
                    (cell.ValueRightAligned ? TextFormatFlags.Right : TextFormatFlags.Left) |
                    TextFormatFlags.NoClipping |
                    TextFormatFlags.PreserveGraphicsClipping);
            }
        }

        if (embeddingHost.IsOverlayMode)
        {
            CommitLayeredBitmap(renderBitmap);
            layeredFrameCommitted = true;
            return;
        }

        graphics.DrawImageUnscaled(renderBitmap, Point.Empty);
    }

    protected override void WndProc(ref Message message)
    {
        base.WndProc(ref message);

        if (message.Msg is WmSettingChange or WmThemeChanged or WmDwmColorizationColorChanged or WmDwmCompositionChanged)
        {
            QueueThemeRefresh();
        }
    }

    public TaskbarWidgetRuntimeStatus ApplySnapshot(
        SampleSnapshot snapshot,
        bool enabled,
        TaskbarWidgetConfig config)
    {
        bool wasRequested = requestedWidgetEnabled;
        latestSnapshot = snapshot;
        requestedWidgetEnabled = enabled;
        widgetConfig = NormalizeWidgetConfig(config);
        if (!requestedWidgetEnabled)
        {
            sessionHidden = false;
        }
        else if (!wasRequested)
        {
            sessionHidden = false;
        }

        UpdateView();
        return BuildRuntimeStatus();
    }

    private void UpdateView()
    {
        visualStyle = ResolveVisualStyle(widgetConfig);
        BackColor = TransparentKeyColor;
        ForeColor = visualStyle.DefaultValueColor;
        ApplyLayeredTransparency();
        UpdateNotifyIcon();
        if (!requestedWidgetEnabled || latestSnapshot is null || sessionHidden)
        {
            currentLayout = null;
            currentLayoutFont?.Dispose();
            currentLayoutFont = null;
            renderBitmap?.Dispose();
            renderBitmap = null;
            lastRenderSignature = null;
            layeredFrameCommitted = false;
            lastRuntimeError = null;
            lastRuntimeStage = !requestedWidgetEnabled
                ? "disabled"
                : latestSnapshot is null
                    ? "waiting_snapshot"
                    : "session_hidden";
            lastParentWindowClass = null;
            lastEmbeddedBounds = null;
            embeddingHost.Detach(this);
            return;
        }

        if (currentLayoutFont is null || Math.Abs(currentLayoutFont.Size - widgetConfig.FontSize) > 0.1f)
        {
            currentLayoutFont?.Dispose();
            currentLayoutFont = new("Segoe UI", widgetConfig.FontSize, FontStyle.Regular, GraphicsUnit.Point);
        }
        currentLayout = BuildLayout(latestSnapshot, widgetConfig, currentLayoutFont);
        string renderSignature = BuildRenderSignature(currentLayout, visualStyle, widgetConfig);
        Size widgetSize = currentLayout.Size;
        TaskbarEmbeddingResult embeddingResult = embeddingHost.AttachOrUpdate(this, widgetSize);
        lastRuntimeError = embeddingResult.Error;
        lastRuntimeStage = embeddingResult.Stage ?? "attach_or_update";
        lastParentWindowClass = embeddingResult.ParentWindowClass;
        lastEmbeddedBounds = embeddingResult.Bounds;
        if (!embeddingResult.IsEmbedded)
        {
            currentLayout = null;
            return;
        }

        if (widgetSize.Width <= HorizontalPadding * 2 || widgetSize.Height <= VerticalPadding * 2)
        {
            lastRuntimeError = $"任务栏窗口尺寸异常：{widgetSize.Width}x{widgetSize.Height}";
            lastRuntimeStage = "invalid_widget_size";
            currentLayout = null;
            return;
        }

        if (Size != widgetSize)
        {
            Size = widgetSize;
            renderBitmap?.Dispose();
            renderBitmap = null;
            layeredFrameCommitted = false;
        }

        if (renderSignature != lastRenderSignature || (embeddingHost.IsOverlayMode && !layeredFrameCommitted))
        {
            lastRenderSignature = renderSignature;
            Invalidate();
        }
    }

    private void OnUserPreferenceChanged(object? sender, UserPreferenceChangedEventArgs eventArgs)
    {
        if (eventArgs.Category is UserPreferenceCategory.General or
            UserPreferenceCategory.Color or
            UserPreferenceCategory.VisualStyle)
        {
            QueueThemeRefresh();
        }
    }

    private void QueueThemeRefresh()
    {
        if (!widgetConfig.FollowSystemTheme)
        {
            return;
        }

        if (!IsHandleCreated)
        {
            visualStyle = ResolveVisualStyle(widgetConfig);
            return;
        }

        try
        {
            BeginInvoke(new Action(RefreshThemeOnly));
        }
        catch
        {
            // 任务栏正在重建时可能丢句柄，下一次采样或主题事件会再次刷新。
        }
    }

    private void RefreshThemeOnly()
    {
        if (!widgetConfig.FollowSystemTheme)
        {
            return;
        }

        TaskbarVisualStyle nextStyle = ResolveVisualStyle(widgetConfig);
        if (nextStyle == visualStyle)
        {
            return;
        }

        visualStyle = nextStyle;
        BackColor = TransparentKeyColor;
        ForeColor = visualStyle.DefaultValueColor;
        lastRenderSignature = null;
        layeredFrameCommitted = false;
        ApplyLayeredTransparency();
        Invalidate();
    }

    private void UpdateNotifyIcon()
    {
        notifyIcon.Visible = widgetConfig.NotifyIconEnabled;
        toggleWindowMenuItem.Enabled = requestedWidgetEnabled;
        hideMenuItem.Enabled = requestedWidgetEnabled;
        toggleWindowMenuItem.Text = sessionHidden ? "显示任务栏监测" : "隐藏任务栏监测";
        notifyIcon.Text = BuildNotifyText(latestSnapshot, lastRuntimeError);
    }

    private TaskbarWidgetRuntimeStatus BuildRuntimeStatus()
    {
        bool visible = requestedWidgetEnabled && !sessionHidden;
        bool embedded = visible && lastRuntimeError is null && lastEmbeddedBounds is not null;
        TaskbarVisualStyle nextStyle = visualStyle;
        TaskbarWidgetDebugInfo hostDebugInfo = embeddingHost.BuildDebugInfo();
        return new TaskbarWidgetRuntimeStatus(
            requestedWidgetEnabled,
            visible,
            embedded,
            lastRuntimeError,
            new TaskbarWidgetDebugInfo(
                sessionHidden,
                latestSnapshot is not null,
                currentLayout is not null,
                IsHandleCreated,
                lastRuntimeStage ?? hostDebugInfo.Stage,
                lastParentWindowClass ?? hostDebugInfo.ParentWindowClass,
                FormatBounds(lastEmbeddedBounds) ?? hostDebugInfo.Bounds,
                "transparent",
                ColorToHex(nextStyle.DefaultValueColor),
                hostDebugInfo.AnchorRect,
                hostDebugInfo.NotifyRect,
                hostDebugInfo.TaskbarRect));
    }

    private static string? FormatBounds(Rectangle? bounds)
    {
        return bounds is { } rect ? $"{rect.X},{rect.Y},{rect.Width},{rect.Height}" : null;
    }

    private static string ColorToHex(Color color)
    {
        return $"#{color.R:X2}{color.G:X2}{color.B:X2}";
    }

    private void OnMouseUp(object? sender, MouseEventArgs eventArgs)
    {
        if (eventArgs.Button != MouseButtons.Right)
        {
            return;
        }

        notifyMenu.Show(Cursor.Position);
    }

    private static TaskbarLayout BuildLayout(
        SampleSnapshot snapshot,
        TaskbarWidgetConfig config,
        Font font)
    {
        List<TaskbarMetric> metrics = BuildMetrics(snapshot, config);
        bool useTwoRows = ShouldUseTwoRowLayout(config);
        return useTwoRows
            ? BuildTwoRowLayout(metrics, font, config)
            : BuildSingleRowLayout(metrics, font, config);
    }

    private static TaskbarLayout BuildSingleRowLayout(
        IReadOnlyList<TaskbarMetric> metrics,
        Font font,
        TaskbarWidgetConfig config)
    {
        List<TaskbarLayoutCell> cells = [];
        int x = HorizontalPadding;
        int contentHeight = 0;
        foreach (TaskbarMetric metric in metrics)
        {
            Size labelSize = MeasureText(metric.Label, font);
            Size valueSize = MeasureText(metric.Value, font);
            int rowHeight = Math.Max(labelSize.Height, valueSize.Height);
            int columnWidth = GetColumnWidth(metric, font, config);
            Rectangle rowBounds = new(x, VerticalPadding, columnWidth, rowHeight);
            cells.Add(CreateCell(metric, font, rowBounds, config));
            x += columnWidth + ColumnGap;
            contentHeight = Math.Max(contentHeight, rowHeight);
        }

        int width = Math.Max(MinSingleRowWidth, x - ColumnGap + HorizontalPadding);
        int height = Math.Max(DefaultHeight, contentHeight + VerticalPadding * 2);
        return new TaskbarLayout(new Size(width, height), cells);
    }

    private static TaskbarLayout BuildTwoRowLayout(
        IReadOnlyList<TaskbarMetric> metrics,
        Font font,
        TaskbarWidgetConfig config)
    {
        List<TaskbarLayoutCell> cells = [];
        int columnCount = (int)Math.Ceiling(metrics.Count / 2d);
        int rowHeight = 0;
        int x = HorizontalPadding;

        for (int columnIndex = 0; columnIndex < columnCount; columnIndex++)
        {
            int topIndex = columnIndex * 2;
            int bottomIndex = topIndex + 1;

            TaskbarMetric topMetric = metrics[topIndex];
            TaskbarMetric? bottomMetric = bottomIndex < metrics.Count ? metrics[bottomIndex] : null;

            Size topLabelSize = MeasureText(topMetric.Label, font);
            Size topValueSize = MeasureText(topMetric.Value, font);
            rowHeight = Math.Max(rowHeight, Math.Max(topLabelSize.Height, topValueSize.Height));

            int columnWidth = GetColumnWidth(topMetric, font, config);

            if (bottomMetric is not null)
            {
                Size bottomLabelSize = MeasureText(bottomMetric.Label, font);
                Size bottomValueSize = MeasureText(bottomMetric.Value, font);
                rowHeight = Math.Max(rowHeight, Math.Max(bottomLabelSize.Height, bottomValueSize.Height));
                columnWidth = Math.Max(columnWidth, GetColumnWidth(bottomMetric, font, config));
            }

            Rectangle topRowBounds = new(x, VerticalPadding, columnWidth, rowHeight);
            cells.Add(CreateCell(topMetric, font, topRowBounds, config));

            if (bottomMetric is not null)
            {
                Rectangle bottomRowBounds = new(
                    x,
                    VerticalPadding + rowHeight + RowGap,
                    columnWidth,
                    rowHeight);
                cells.Add(CreateCell(bottomMetric, font, bottomRowBounds, config));
            }

            x += columnWidth + ColumnGap;
        }

        int width = x - ColumnGap + HorizontalPadding;
        int height = rowHeight * 2 + VerticalPadding * 2 + RowGap;
        return new TaskbarLayout(new Size(width, Math.Max(DefaultHeight, height)), cells);
    }

    private static TaskbarLayoutCell CreateCell(
        TaskbarMetric metric,
        Font font,
        Rectangle rowBounds,
        TaskbarWidgetConfig config)
    {
        Size labelSize = MeasureText(metric.Label, font);
        int labelWidth = Math.Max(labelSize.Width, 1);
        Rectangle labelBounds = new(rowBounds.X, rowBounds.Y, labelWidth, rowBounds.Height);
        int valueWidth = Math.Max(1, rowBounds.Width - labelWidth - LabelValueGap);
        Rectangle valueBounds = new(
            labelBounds.Right + LabelValueGap,
            rowBounds.Y,
            valueWidth,
            rowBounds.Height);

        return new TaskbarLayoutCell(
            metric.ItemKey,
            metric.Label,
            metric.Value,
            labelBounds,
            valueBounds,
            config.ValueRightAligned);
    }

    private static int GetColumnWidth(TaskbarMetric metric, Font font, TaskbarWidgetConfig config)
    {
        Size labelSize = MeasureText(metric.Label, font);
        Size valueSize = MeasureText(metric.Value, font);
        int valueWidth = MeasureText(GetValueTextForLayout(metric.Value, config), font).Width;
        int templateWidth = MeasureText(GetMetricMeasurementTemplate(metric.ItemKey, config), font).Width;
        return labelSize.Width + LabelValueGap + Math.Max(Math.Max(valueSize.Width, valueWidth), templateWidth);
    }

    private static string GetValueTextForLayout(string value, TaskbarWidgetConfig config)
    {
        if (!config.ValueRightAligned || config.DigitsNumber <= 0 || value.Length >= config.DigitsNumber)
        {
            return value;
        }

        return value.PadLeft(config.DigitsNumber);
    }

    private static List<TaskbarMetric> BuildMetrics(SampleSnapshot snapshot, TaskbarWidgetConfig config)
    {
        List<TaskbarMetric> metrics = [];
        foreach (string item in config.DisplayItems)
        {
            switch (item)
            {
                case "download":
                    metrics.Add(new TaskbarMetric("download", "↓:", FormatSpeed(snapshot.DownloadBytesPerSecond, config)));
                    break;
                case "upload":
                    metrics.Add(new TaskbarMetric("upload", "↑:", FormatSpeed(snapshot.UploadBytesPerSecond, config)));
                    break;
                case "cpu":
                    metrics.Add(new TaskbarMetric("cpu", "CPU:", FormatPercent(snapshot.CpuUsagePercent, config)));
                    break;
                case "memory":
                    metrics.Add(new TaskbarMetric("memory", "内存:", FormatPercent(snapshot.MemoryUsagePercent, config)));
                    break;
                case "gpu":
                    metrics.Add(new TaskbarMetric(
                        "gpu",
                        "GPU:",
                        snapshot.GpuUsagePercent.HasValue
                            ? FormatPercent(snapshot.GpuUsagePercent.Value, config)
                            : "--"));
                    break;
            }
        }

        return metrics;
    }

    private TaskbarVisualStyle ResolveVisualStyle(TaskbarWidgetConfig config)
    {
        if (!config.FollowSystemTheme)
        {
            return TaskbarVisualStyle.Create(isLightTheme: DetectSystemLightTheme());
        }

        return TaskbarVisualStyle.Create(DetectSystemLightTheme());
    }

    private static bool DetectSystemLightTheme()
    {
        bool isLightTheme = true;
        try
        {
            using RegistryKey? personalizeKey = Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
                false);
            object? rawValue = personalizeKey?.GetValue("SystemUsesLightTheme");
            if (rawValue is int lightThemeValue)
            {
                isLightTheme = lightThemeValue != 0;
            }
        }
        catch
        {
            // 读取系统主题失败时保守退回浅色样式，避免出现纯黑背景造成更明显的悬浮窗感。
        }

        return isLightTheme;
    }

    private static bool ShouldUseTwoRowLayout(TaskbarWidgetConfig config)
    {
        return !config.CompactModeEnabled || config.DisplayItems.Length > 2;
    }

    private static Size MeasureText(string text, Font font)
    {
        return TextRenderer.MeasureText(
            text,
            font,
            new Size(int.MaxValue, int.MaxValue),
            TextFormatFlags.NoPadding | TextFormatFlags.SingleLine);
    }

    private static TaskbarWidgetConfig NormalizeWidgetConfig(TaskbarWidgetConfig config)
    {
        string[] displayItems = config.DisplayItems
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Select(item => item.Trim().ToLowerInvariant())
            .Distinct()
            .ToArray();

        if (displayItems.Length == 0)
        {
            displayItems = ["download", "upload", "cpu"];
        }

        return config with
        {
            FontSize = Math.Max(8, Math.Min(18, config.FontSize)),
            DigitsNumber = Math.Max(3, Math.Min(6, config.DigitsNumber)),
            DisplayItems = displayItems,
        };
    }

    private static string BuildNotifyText(SampleSnapshot? snapshot, string? runtimeError)
    {
        if (!string.IsNullOrWhiteSpace(runtimeError))
        {
            return $"FreeCli 系统监控：{runtimeError}";
        }

        if (snapshot is null)
        {
            return "FreeCli 系统监控";
        }

        TaskbarWidgetConfig notifyConfig = new()
        {
            SeparateValueUnitWithSpace = true,
            UseByteUnit = true,
            ValueRightAligned = false,
        };

        return
            $"下载 {FormatSpeed(snapshot.DownloadBytesPerSecond, notifyConfig)} / 上传 {FormatSpeed(snapshot.UploadBytesPerSecond, notifyConfig)} / CPU {snapshot.CpuUsagePercent}%";
    }

    private static string FormatSpeed(long bytesPerSecond, TaskbarWidgetConfig config)
    {
        double size = Math.Max(0, bytesPerSecond);
        if (!config.UseByteUnit)
        {
            size *= 8d;
        }

        string valueText;
        string unitText;

        if (config.SpeedShortModeEnabled)
        {
            if (size < 1024d * 10d)
            {
                valueText = $"{size / 1024d:0.0}";
                unitText = "K";
            }
            else if (size < 1024d * 1000d)
            {
                valueText = $"{size / 1024d:0}";
                unitText = "K";
            }
            else if (size < 1024d * 1024d * 1000d)
            {
                valueText = $"{size / 1024d / 1024d:0.0}";
                unitText = "M";
            }
            else
            {
                valueText = $"{size / 1024d / 1024d / 1024d:0.00}";
                unitText = "G";
            }
        }
        else
        {
            if (size < 1024d * 10d)
            {
                valueText = $"{size / 1024d:0.00}";
                unitText = "KB";
            }
            else if (size < 1024d * 1000d)
            {
                valueText = $"{size / 1024d:0.0}";
                unitText = "KB";
            }
            else if (size < 1024d * 1024d * 1000d)
            {
                valueText = $"{size / 1024d / 1024d:0.00}";
                unitText = "MB";
            }
            else
            {
                valueText = $"{size / 1024d / 1024d / 1024d:0.00}";
                unitText = "GB";
            }
        }

        string result;
        bool hideUnit = config.HideUnit;
        if (config.SeparateValueUnitWithSpace && !hideUnit)
        {
            result = $"{valueText} {unitText}";
        }
        else
        {
            result = $"{valueText}{(hideUnit ? string.Empty : unitText)}";
        }

        if (!config.UseByteUnit)
        {
            if (config.SpeedShortModeEnabled && !hideUnit)
            {
                result += "b";
            }
            else
            {
                result = result.Replace('B', 'b');
            }
        }

        if (!hideUnit)
        {
            result += "/s";
        }

        return PadDigits(result, config);
    }

    private static string FormatPercent(int value, TaskbarWidgetConfig config)
    {
        string result = config.HidePercent
            ? value.ToString(CultureInfo.InvariantCulture)
            : config.SeparateValueUnitWithSpace
                ? $"{value} %"
                : $"{value}%";
        return PadDigits(result, config);
    }

    private static string PadDigits(string value, TaskbarWidgetConfig config)
    {
        if (!config.ValueRightAligned || value.Length >= config.DigitsNumber)
        {
            return value;
        }

        return value.PadLeft(config.DigitsNumber);
    }

    private static string GetMetricMeasurementTemplate(string itemKey, TaskbarWidgetConfig config)
    {
        return itemKey switch
        {
            "download" or "upload" => BuildSpeedMeasurementTemplate(config),
            "cpu" or "memory" or "gpu" => BuildPercentMeasurementTemplate(config),
            _ => string.Empty,
        };
    }

    private static string BuildSpeedMeasurementTemplate(TaskbarWidgetConfig config)
    {
        string valueText = config.SpeedShortModeEnabled ? "8888.8" : "8888.88";
        string unitText = config.HideUnit
            ? string.Empty
            : config.SpeedShortModeEnabled
                ? (config.UseByteUnit ? "K/s" : "Kb/s")
                : (config.UseByteUnit ? "KB/s" : "Kb/s");

        string result = config.SeparateValueUnitWithSpace && unitText.Length > 0
            ? $"{valueText} {unitText}"
            : $"{valueText}{unitText}";

        return PadDigits(result, config);
    }

    private static string BuildPercentMeasurementTemplate(TaskbarWidgetConfig config)
    {
        string result = config.HidePercent
            ? "100"
            : config.SeparateValueUnitWithSpace
                ? "100 %"
                : "100%";
        return PadDigits(result, config);
    }

    private void EnsureRenderBitmap()
    {
        if (ClientSize.Width <= 0 || ClientSize.Height <= 0)
        {
            renderBitmap?.Dispose();
            renderBitmap = null;
            return;
        }

        if (renderBitmap is not null &&
            renderBitmap.Width == ClientSize.Width &&
            renderBitmap.Height == ClientSize.Height)
        {
            return;
        }

        renderBitmap?.Dispose();
        renderBitmap = new Bitmap(ClientSize.Width, ClientSize.Height, PixelFormat.Format32bppArgb);
    }

    private static string BuildRenderSignature(
        TaskbarLayout layout,
        TaskbarVisualStyle style,
        TaskbarWidgetConfig config)
    {
        return string.Join(
            "|",
            layout.Cells.Select(cell =>
                $"{cell.ItemKey}:{cell.Label}:{GetValueTextForLayout(cell.Value, config)}:{style.GetLabelColor(cell.ItemKey).ToArgb()}:{style.GetValueColor(cell.ItemKey).ToArgb()}"));
    }

    private static void DrawAlphaText(
        Graphics graphics,
        string text,
        Font font,
        Rectangle bounds,
        Color color,
        bool rightAligned)
    {
        using StringFormat stringFormat = new(StringFormat.GenericTypographic)
        {
            FormatFlags = StringFormatFlags.NoClip,
            Trimming = StringTrimming.None,
            LineAlignment = StringAlignment.Center,
            Alignment = rightAligned ? StringAlignment.Far : StringAlignment.Near,
        };
        using SolidBrush brush = new(Color.FromArgb(255, color));
        RectangleF layoutRect = new(bounds.X, bounds.Y, bounds.Width, bounds.Height);
        graphics.DrawString(text, font, brush, layoutRect, stringFormat);
    }

    private void ApplyLayeredTransparency()
    {
        if (!IsHandleCreated)
        {
            return;
        }

        if (!embeddingHost.IsOverlayMode)
        {
            return;
        }
    }

    private void CommitLayeredBitmap(Bitmap bitmap)
    {
        if (!IsHandleCreated || !embeddingHost.IsOverlayMode)
        {
            return;
        }

        IntPtr screenDc = NativeMethods.GetDC(IntPtr.Zero);
        if (screenDc == IntPtr.Zero)
        {
            return;
        }

        IntPtr memoryDc = IntPtr.Zero;
        IntPtr hBitmap = IntPtr.Zero;
        IntPtr oldBitmap = IntPtr.Zero;
        try
        {
            memoryDc = NativeMethods.CreateCompatibleDC(screenDc);
            if (memoryDc == IntPtr.Zero)
            {
                return;
            }

            hBitmap = bitmap.GetHbitmap(Color.FromArgb(0));
            oldBitmap = NativeMethods.SelectObject(memoryDc, hBitmap);

            Point destinationPoint = new(Left, Top);
            Size layerSize = new(bitmap.Width, bitmap.Height);
            Point sourcePoint = Point.Empty;
            BlendFunction blend = new()
            {
                BlendOp = NativeMethods.AcSrcOver,
                BlendFlags = 0,
                SourceConstantAlpha = 255,
                AlphaFormat = NativeMethods.AcSrcAlpha,
            };

            _ = NativeMethods.UpdateLayeredWindow(
                Handle,
                screenDc,
                ref destinationPoint,
                ref layerSize,
                memoryDc,
                ref sourcePoint,
                0,
                ref blend,
                NativeMethods.UlwAlpha);
        }
        finally
        {
            if (oldBitmap != IntPtr.Zero && memoryDc != IntPtr.Zero)
            {
                _ = NativeMethods.SelectObject(memoryDc, oldBitmap);
            }

            if (hBitmap != IntPtr.Zero)
            {
                _ = NativeMethods.DeleteObject(hBitmap);
            }

            if (memoryDc != IntPtr.Zero)
            {
                _ = NativeMethods.DeleteDC(memoryDc);
            }

            _ = NativeMethods.ReleaseDC(IntPtr.Zero, screenDc);
        }
    }

    private sealed record TaskbarMetric(string ItemKey, string Label, string Value);

    private sealed record TaskbarLayout(Size Size, IReadOnlyList<TaskbarLayoutCell> Cells);

    private sealed record TaskbarLayoutCell(
        string ItemKey,
        string Label,
        string Value,
        Rectangle LabelBounds,
        Rectangle ValueBounds,
        bool ValueRightAligned);

    private sealed record TaskbarVisualStyle(
        Color DefaultLabelColor,
        Color DefaultValueColor,
        IReadOnlyDictionary<string, Color> LabelColors,
        IReadOnlyDictionary<string, Color> ValueColors)
    {
        public static TaskbarVisualStyle Create(bool isLightTheme)
        {
            if (isLightTheme)
            {
                return new TaskbarVisualStyle(
                    Color.FromArgb(32, 32, 32),
                    Color.FromArgb(16, 16, 16),
                    new Dictionary<string, Color>(),
                    new Dictionary<string, Color>());
            }

            return new TaskbarVisualStyle(
                Color.FromArgb(248, 248, 248),
                Color.White,
                new Dictionary<string, Color>(),
                new Dictionary<string, Color>());
        }

        public Color GetLabelColor(string itemKey)
        {
            return LabelColors.TryGetValue(itemKey, out Color color) ? color : DefaultLabelColor;
        }

        public Color GetValueColor(string itemKey)
        {
            return ValueColors.TryGetValue(itemKey, out Color color) ? color : DefaultValueColor;
        }
    }
}
