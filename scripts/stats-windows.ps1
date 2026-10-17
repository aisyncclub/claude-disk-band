# disk-band: one reading on Windows, printed as one line of JSON.
# Each part is tried on its own, so one that fails is null and the rest still show.
# Uses .NET and CIM classes, not command output, so a Korean or other language
# Windows reads the same.

$ErrorActionPreference = 'Stop'
$out = [ordered]@{}

try {
  $d = New-Object System.IO.DriveInfo ($env:SystemDrive)
  $out.disk = @{ free = [double]$d.AvailableFreeSpace; total = [double]$d.TotalSize }
} catch { $out.disk = $null }

try {
  $os = Get-CimInstance Win32_OperatingSystem
  $out.mem = @{ total = [double]$os.TotalVisibleMemorySize * 1024; free = [double]$os.FreePhysicalMemory * 1024 }
} catch { $out.mem = $null }

# Claude Code sessions: claude.exe, but not the desktop app's own claude.exe
# (an Electron app: helpers carry --type=, the main one sits beside resources\app.asar).
try {
  $n = 0
  foreach ($p in @(Get-CimInstance Win32_Process -Filter "Name='claude.exe'")) {
    if ($p.CommandLine -match '--type=') { continue }
    $exe = $p.ExecutablePath
    if ($exe -and (Test-Path -LiteralPath (Join-Path (Split-Path $exe) 'resources\app.asar'))) { continue }
    $n++
  }
  $out.sessions = $n
} catch { $out.sessions = $null }

try {
  $dev = '^(node|bun|deno|python|ruby|php|vite|next|esbuild|remotion)'
  $names = @{}
  foreach ($p in Get-Process) { $names[[int]$p.Id] = $p.ProcessName }
  $listen = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue
  $out.ports = @($listen |
    Where-Object { $names[[int]$_.OwningProcess] -match $dev } |
    ForEach-Object { [int]$_.LocalPort } |
    Sort-Object -Unique)
} catch { $out.ports = $null }

try {
  $r = (New-Object System.Net.NetworkInformation.Ping).Send('1.1.1.1', 1500)
  $out.online = ($r.Status -eq 'Success')
  $out.pingMs = [double]$r.RoundtripTime
} catch { $out.online = $false; $out.pingMs = 0 }

# Bytes through the adapters that are up and have a gateway (the ones that reach the internet).
try {
  $rx = 0; $tx = 0
  foreach ($nic in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ($nic.OperationalStatus -ne 'Up') { continue }
    if (@($nic.GetIPProperties().GatewayAddresses).Count -eq 0) { continue }
    $s = $nic.GetIPStatistics()
    $rx += $s.BytesReceived; $tx += $s.BytesSent
  }
  $out.bytes = @{ rx = [double]$rx; tx = [double]$tx }
} catch { $out.bytes = $null }

# CPU last: busy share over one quiet second, from two samples of the raw counter
# (as top -s 1 does on a Mac), so the work above does not count as load.
# Win32_Processor's LoadPercentage takes about 4 seconds, so it is only the fallback.
try {
  $cpu0 = Get-CimInstance Win32_PerfRawData_PerfOS_Processor -Filter "Name='_Total'"
  Start-Sleep -Milliseconds 1000
  $cpu1 = Get-CimInstance Win32_PerfRawData_PerfOS_Processor -Filter "Name='_Total'"
  $span = [double]($cpu1.Timestamp_Sys100NS - $cpu0.Timestamp_Sys100NS)
  if ($span -le 0) { throw 'no time between samples' }
  $idle = [double]($cpu1.PercentProcessorTime - $cpu0.PercentProcessorTime) / $span
  $out.cpu = [math]::Max(0, [math]::Min(100, 100 * (1 - $idle)))
} catch {
  try {
    $load = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
    if ($null -eq $load) { $out.cpu = $null } else { $out.cpu = [double]$load }
  } catch { $out.cpu = $null }
}

$out | ConvertTo-Json -Compress -Depth 4
