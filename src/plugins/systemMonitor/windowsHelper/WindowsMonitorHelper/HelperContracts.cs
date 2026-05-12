namespace WindowsMonitorHelper;

internal sealed record SampleSnapshot(
    string RecordedAt,
    long UploadBytesTotal,
    long DownloadBytesTotal,
    long UploadBytesPerSecond,
    long DownloadBytesPerSecond,
    int CpuUsagePercent,
    int MemoryUsagePercent,
    int? GpuUsagePercent);
