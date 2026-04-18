param(
  [switch]$GpuMonitoringEnabled
)

$ErrorActionPreference = 'Stop'

$netStats = Get-NetAdapterStatistics -ErrorAction Stop |
  Select-Object InterfaceAlias, ReceivedBytes, SentBytes

$gpuValue = $null
if ($GpuMonitoringEnabled.IsPresent) {
  try {
    # GPU counter collection is noticeably heavier than NIC counters, so the caller
    # must opt in explicitly. This keeps the default sampling path lightweight.
    $gpuCounters = Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction Stop
    $gpuTotals = @{}
    foreach ($sample in $gpuCounters.CounterSamples) {
      if (-not $sample.Path) {
        continue
      }

      $instance = $sample.InstanceName
      if (-not $instance) {
        continue
      }

      $parts = $instance -split '_'
      $bucket = $parts[$parts.Length - 1]
      if (-not $gpuTotals.ContainsKey($bucket)) {
        $gpuTotals[$bucket] = 0.0
      }
      $gpuTotals[$bucket] += [double]$sample.CookedValue
    }

    if ($gpuTotals.Count -gt 0) {
      $gpuValue = [Math]::Round(($gpuTotals.Values | Measure-Object -Maximum).Maximum)
      if ($gpuValue -lt 0) {
        $gpuValue = 0
      } elseif ($gpuValue -gt 100) {
        $gpuValue = 100
      }
    }
  } catch {
    $gpuValue = $null
  }
}

$result = @{
  ok = $true
  result = @{
    network = $netStats
    gpuUsagePercent = $gpuValue
  }
}

$result | ConvertTo-Json -Depth 6 -Compress
