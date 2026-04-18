using Microsoft.Win32;
using System.Drawing;
using System.Windows.Forms;

namespace WindowsMonitorHelper;

internal sealed class TaskbarMonitorForm : Form
{
    private const int MinSingleRowWidth = 160;
    private const int ColumnGap = 14;
    private const int HorizontalPadding = 8;
    private const int VerticalPadding = 4;
    private const int RowGap = 1;
    private const int LabelValueGap = 4;
    private const int DefaultHeight = 30;

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
    private TaskbarWidgetConfig widgetConfig = new();
    private TaskbarVisualStyle visualStyle = TaskbarVisualStyle.Create(isLightTheme: true);
    private TaskbarLayout? currentLayout;

    public TaskbarMonitorForm()
    {
        TopLevel = false;
        ShowInTaskbar = false;
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        AutoScaleMode = AutoScaleMode.None;
        Padding = new Padding(0);
        DoubleBuffered = true;
        SetStyle(
            ControlStyles.OptimizedDoubleBuffer |
            ControlStyles.AllPaintingInWmPaint |
            ControlStyles.UserPaint |
            ControlStyles.ResizeRedraw,
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
            Text = "OpenCove 系统监控",
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
        BackColor = visualStyle.BackgroundColor;
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
            createParams.ExStyle |= (int)(NativeMethods.WsExToolWindow | NativeMethods.WsExNoActivate);
            createParams.ExStyle &= unchecked((int)~NativeMethods.WsExAppWindow);
            return createParams;
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            embeddingHost.Detach(this);
            notifyIcon.Visible = false;
            notifyIcon.Dispose();
            notifyMenu.Dispose();
        }

        base.Dispose(disposing);
    }

    protected override void OnPaint(PaintEventArgs eventArgs)
    {
        base.OnPaint(eventArgs);
        Graphics graphics = eventArgs.Graphics;
        graphics.Clear(visualStyle.BackgroundColor);
        if (currentLayout is null)
        {
            return;
        }

        TextFormatFlags leftTextFlags = TextFormatFlags.NoPadding | TextFormatFlags.EndEllipsis;
        TextFormatFlags rightTextFlags = leftTextFlags | TextFormatFlags.Right;

        foreach (TaskbarLayoutCell cell in currentLayout.Cells)
        {
            TextRenderer.DrawText(
                graphics,
                cell.Label,
                cell.Font,
                cell.LabelBounds,
                visualStyle.GetLabelColor(cell.ItemKey),
                leftTextFlags);
            TextRenderer.DrawText(
                graphics,
                cell.Value,
                cell.Font,
                cell.ValueBounds,
                visualStyle.GetValueColor(cell.ItemKey),
                rightTextFlags);
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
        BackColor = visualStyle.BackgroundColor;
        ForeColor = visualStyle.DefaultValueColor;
        UpdateNotifyIcon();
        if (!requestedWidgetEnabled || latestSnapshot is null || sessionHidden)
        {
            currentLayout = null;
            lastRuntimeError = null;
            embeddingHost.Detach(this);
            return;
        }

        using Font layoutFont = new("Segoe UI", widgetConfig.FontSize, FontStyle.Regular, GraphicsUnit.Point);
        currentLayout = BuildLayout(latestSnapshot, widgetConfig, layoutFont, visualStyle);
        Size widgetSize = currentLayout.Size;
        TaskbarEmbeddingResult embeddingResult = embeddingHost.AttachOrUpdate(this, widgetSize);
        lastRuntimeError = embeddingResult.Error;
        if (!embeddingResult.IsEmbedded)
        {
            currentLayout = null;
            return;
        }

        if (Size != widgetSize)
        {
            Size = widgetSize;
        }

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
        bool canDisplay = requestedWidgetEnabled && !sessionHidden;
        return new TaskbarWidgetRuntimeStatus(
            requestedWidgetEnabled,
            canDisplay,
            canDisplay && lastRuntimeError is null,
            lastRuntimeError);
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
        Font font,
        TaskbarVisualStyle style)
    {
        List<TaskbarMetric> metrics = BuildMetrics(snapshot, config);
        bool useTwoRows = ShouldUseTwoRowLayout(config);
        return useTwoRows
            ? BuildTwoRowLayout(metrics, font, style)
            : BuildSingleRowLayout(metrics, font, style);
    }

    private static TaskbarLayout BuildSingleRowLayout(
        IReadOnlyList<TaskbarMetric> metrics,
        Font font,
        TaskbarVisualStyle style)
    {
        List<TaskbarLayoutCell> cells = [];
        int x = HorizontalPadding;
        int contentHeight = 0;
        foreach (TaskbarMetric metric in metrics)
        {
            Size labelSize = MeasureText(metric.Label, font);
            Size valueSize = MeasureText(metric.Value, font);
            int rowHeight = Math.Max(labelSize.Height, valueSize.Height);
            int columnWidth = labelSize.Width + LabelValueGap + valueSize.Width;
            Rectangle rowBounds = new(x, VerticalPadding, columnWidth, rowHeight);
            cells.Add(CreateCell(metric, font, rowBounds, labelSize.Width));
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
        TaskbarVisualStyle style)
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

            int columnWidth = topLabelSize.Width + LabelValueGap + topValueSize.Width;

            if (bottomMetric is not null)
            {
                Size bottomLabelSize = MeasureText(bottomMetric.Label, font);
                Size bottomValueSize = MeasureText(bottomMetric.Value, font);
                rowHeight = Math.Max(rowHeight, Math.Max(bottomLabelSize.Height, bottomValueSize.Height));
                columnWidth = Math.Max(
                    columnWidth,
                    bottomLabelSize.Width + LabelValueGap + bottomValueSize.Width);
            }

            Rectangle topRowBounds = new(x, VerticalPadding, columnWidth, rowHeight);
            cells.Add(CreateCell(topMetric, font, topRowBounds, Math.Max(topLabelSize.Width, 1)));

            if (bottomMetric is not null)
            {
                Size bottomLabelSize = MeasureText(bottomMetric.Label, font);
                Rectangle bottomRowBounds = new(
                    x,
                    VerticalPadding + rowHeight + RowGap,
                    columnWidth,
                    rowHeight);
                cells.Add(CreateCell(bottomMetric, font, bottomRowBounds, Math.Max(bottomLabelSize.Width, 1)));
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
        int labelWidth)
    {
        Rectangle labelBounds = new(rowBounds.X, rowBounds.Y, labelWidth, rowBounds.Height);
        Rectangle valueBounds = new(
            labelBounds.Right + LabelValueGap,
            rowBounds.Y,
            Math.Max(1, rowBounds.Width - labelWidth - LabelValueGap),
            rowBounds.Height);
        return new TaskbarLayoutCell(metric.ItemKey, metric.Label, metric.Value, labelBounds, valueBounds, font);
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
            return TaskbarVisualStyle.Create(isLightTheme: true);
        }

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

        return TaskbarVisualStyle.Create(isLightTheme);
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
            return $"OpenCove 系统监控：{runtimeError}";
        }

        if (snapshot is null)
        {
            return "OpenCove 系统监控";
        }

        TaskbarWidgetConfig notifyConfig = new()
        {
            SeparateValueUnitWithSpace = true,
            UseByteUnit = true,
        };

        return
            $"下载 {FormatSpeed(snapshot.DownloadBytesPerSecond, notifyConfig)}/s / 上传 {FormatSpeed(snapshot.UploadBytesPerSecond, notifyConfig)}/s / CPU {snapshot.CpuUsagePercent}%";
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

        return result;
    }

    private static string FormatPercent(int value, TaskbarWidgetConfig config)
    {
        if (config.HidePercent)
        {
            return value.ToString();
        }

        return config.SeparateValueUnitWithSpace ? $"{value} %" : $"{value}%";
    }

    private sealed record TaskbarMetric(string ItemKey, string Label, string Value);

    private sealed record TaskbarLayout(Size Size, IReadOnlyList<TaskbarLayoutCell> Cells);

    private sealed record TaskbarLayoutCell(
        string ItemKey,
        string Label,
        string Value,
        Rectangle LabelBounds,
        Rectangle ValueBounds,
        Font Font);

    private sealed record TaskbarVisualStyle(
        Color BackgroundColor,
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
                    Color.FromArgb(210, 210, 211),
                    Color.Black,
                    Color.Black,
                    new Dictionary<string, Color>(),
                    new Dictionary<string, Color>());
            }

            return new TaskbarVisualStyle(
                Color.FromArgb(0, 0, 1),
                Color.White,
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
