namespace WindowsMonitorHelper;

internal sealed record TaskbarWidgetConfig
{
    public bool NotifyIconEnabled { get; init; }

    public bool CompactModeEnabled { get; init; } = true;

    public int FontSize { get; init; } = 9;

    public string[] DisplayItems { get; init; } = ["download", "upload", "cpu"];

    public bool FollowSystemTheme { get; init; } = true;

    public bool SpeedShortModeEnabled { get; init; }

    public bool SeparateValueUnitWithSpace { get; init; } = true;

    public bool UseByteUnit { get; init; } = true;

    public bool HideUnit { get; init; }

    public bool HidePercent { get; init; }

    public bool ValueRightAligned { get; init; } = true;

    public int DigitsNumber { get; init; } = 4;
}

internal sealed record SampleSnapshot(
    string RecordedAt,
    long UploadBytesTotal,
    long DownloadBytesTotal,
    long UploadBytesPerSecond,
    long DownloadBytesPerSecond,
    int CpuUsagePercent,
    int MemoryUsagePercent,
    int? GpuUsagePercent);

internal sealed record TaskbarWidgetRuntimeStatus(
    bool RequestedEnabled,
    bool Visible,
    bool Embedded,
    string? Error,
    TaskbarWidgetDebugInfo? Debug)
{
    public static TaskbarWidgetRuntimeStatus Disabled =>
        new(false, false, false, null, null);

    public static TaskbarWidgetRuntimeStatus Failed(string error) =>
        new(true, false, false, error, null);
}

internal sealed record TaskbarWidgetDebugInfo(
    bool? SessionHidden,
    bool? HasLatestSnapshot,
    bool? HasLayout,
    bool? HandleCreated,
    string? Stage,
    string? ParentWindowClass,
    string? Bounds,
    string? BackgroundColor,
    string? ForegroundColor,
    string? AnchorRect,
    string? NotifyRect,
    string? TaskbarRect);
