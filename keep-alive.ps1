# Keeps Fleet Maintenance up. Run every 5 minutes by the scheduled task
# "Fleet Maintenance Keep Alive" (via keep-alive.vbs, so no window flashes up).
# If the app doesn't answer twice in a row, any stuck server is stopped and
# run_server.bat is started again, minimised. Restarts are logged to
# backend\logs\keep-alive.log.

$root = $PSScriptRoot
Set-Location $root  # scheduled tasks start in C:\Windows\System32
$port = 8002
$url = "http://127.0.0.1:$port/api/auth/csrf/"
$logDir = Join-Path $root 'backend\logs'
$log = Join-Path $logDir 'keep-alive.log'
$runServer = [regex]::Escape((Join-Path $root 'run_server.bat'))

function Test-App {
    try {
        (Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 15).StatusCode -eq 200
    } catch {
        $false
    }
}

function Write-Log($message) {
    New-Item -ItemType Directory -Force $logDir | Out-Null
    Add-Content -Path $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $message" -Encoding utf8
}

if (Test-App) { exit 0 }
# A deploy in progress restarts the server itself (auto_deploy.ps1).
$deployLock = Join-Path $logDir 'auto_deploy.lock'
if ((Test-Path $deployLock) -and ((Get-Date) - (Get-Item $deployLock).LastWriteTime).TotalMinutes -lt 30) { exit 0 }
Start-Sleep -Seconds 20  # might just be starting up / momentarily busy
if (Test-App) { exit 0 }

Write-Log 'App not responding - restarting server.'
Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -match $runServer -or $_.CommandLine -match "listen=0\.0\.0\.0:$port" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 3
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$root\run_server.bat`"" -WorkingDirectory $root -WindowStyle Minimized

Start-Sleep -Seconds 30
if (Test-App) { Write-Log 'Server is back up.' } else { Write-Log 'Server still not responding after restart.' }
