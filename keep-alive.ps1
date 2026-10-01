# Keeps the Fleet Maintenance app (waitress on port 8001) running.
# Run every 2 minutes by the "Fleet Maintenance keep-alive" scheduled task
# (through keep-alive.vbs, so no window flashes). If the app isn't listening,
# or is listening but not answering, it is (re)started hidden. Every restart
# is written to backend\logs\keep-alive.log.

$ErrorActionPreference = 'SilentlyContinue'
$root = $PSScriptRoot
$port = 8001
$log = Join-Path $root 'backend\logs\keep-alive.log'
New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null

function Write-Log($message) {
    Add-Content -Path $log -Value ("{0:dd-MM-yyyy HH:mm:ss}  {1}" -f (Get-Date), $message)
}

# The server's own processes: the run_server.bat console and waitress.
function Get-ServerProcesses {
    Get-CimInstance Win32_Process | Where-Object {
        ($_.Name -eq 'cmd.exe' -and $_.CommandLine -match 'fleet-maintenance\\run_server\.bat') -or
        ($_.CommandLine -match "waitress-serve.*:$port")
    }
}

$listening = Get-NetTCPConnection -LocalPort $port -State Listen
if ($listening) {
    try {
        Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/api/version/" -TimeoutSec 20 | Out-Null
        exit 0
    } catch {
        # Any HTTP answer (e.g. 403 "not logged in") means the app is alive.
        if ($_.Exception.Response) { exit 0 }
    }
    Write-Log "Port $port open but the app is not answering: restarting it."
    foreach ($c in $listening) { Stop-Process -Id $c.OwningProcess -Force }
    Get-ServerProcesses | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Start-Sleep -Seconds 3
} else {
    $server = Get-ServerProcesses
    # Starting up (collectstatic runs before it listens): leave it alone.
    if ($server | Where-Object { ((Get-Date) - $_.CreationDate).TotalMinutes -lt 3 }) { exit 0 }
    $server | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Write-Log "App was not running: starting it."
}

Start-Process -FilePath (Join-Path $root 'run_server.bat') -WorkingDirectory $root -WindowStyle Hidden
