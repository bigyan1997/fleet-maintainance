# Auto-deploy: keeps the running app in step with GitHub.
# Run every 5 minutes by the scheduled task "Fleet Maintenance Auto Deploy"
# (via auto_deploy.vbs, so no window flashes up). Log:
# backend\logs\auto_deploy.log
#
# When main on GitHub has new commits, it:
#   1. fast-forwards this folder to them (never merges or overwrites local
#      work — if there are uncommitted changes here, it skips and logs why);
#   2. installs new Python/npm packages if their lists changed;
#   3. runs the backend tests and builds the frontend into a side folder,
#      while the live app keeps running untouched;
#   4. only if all of that passes: applies migrations, swaps in the new
#      frontend, collects static files and restarts the server;
#   5. checks the app answers; if not, rolls back to the previous commit.
# Any failure before step 4 puts the previous commit back and leaves the
# live app alone.

param(
    [string]$Remote = 'origin',
    [string]$Branch = 'main'
)

$root = $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$python = Join-Path $backend '.venv\Scripts\python.exe'
$logDir = Join-Path $backend 'logs'
$log = Join-Path $logDir 'auto_deploy.log'
$lock = Join-Path $logDir 'auto_deploy.lock'
$healthUrl = 'http://127.0.0.1:8002/api/auth/csrf/'
$runServer = [regex]::Escape((Join-Path $root 'run_server.bat'))

New-Item -ItemType Directory -Force $logDir | Out-Null
# The scheduled task starts in C:\Windows\System32 — the plain `git` calls
# below must run inside the repo.
Set-Location $root

function Write-Log($message) {
    Add-Content -Path $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $message" -Encoding utf8
}

# Runs a command through cmd so stderr is captured as plain text (Windows
# PowerShell turns native stderr into error records). Returns the exit code;
# output goes to the log only if the command fails.
function Invoke-Step($label, $command, $workdir = $root) {
    Push-Location $workdir
    try {
        $output = cmd /c "$command 2>&1"
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    if ($code -ne 0) {
        Write-Log "  FAILED: $label (exit $code)"
        $output | Select-Object -Last 40 | ForEach-Object { Write-Log "    $_" }
    }
    return $code
}

function Test-App {
    try { (Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 10).StatusCode -eq 200 } catch { $false }
}

function Restart-Server {
    Get-CimInstance Win32_Process |
        Where-Object { $_.CommandLine -match $runServer -or $_.CommandLine -match 'listen=0\.0\.0\.0:8002' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 3
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "`"$root\run_server.bat`"" -WorkingDirectory $root -WindowStyle Minimized
    foreach ($i in 1..30) {
        Start-Sleep -Seconds 2
        if (Test-App) { return $true }
    }
    return $false
}

function Build-Frontend($changedFiles) {
    if ($changedFiles -match '^frontend/package(-lock)?\.json$') {
        if ((Invoke-Step 'npm ci' 'npm.cmd ci --no-audit --no-fund' $frontend) -ne 0) { return $false }
    }
    $next = Join-Path $frontend 'dist-next'
    if (Test-Path $next) { Remove-Item -Recurse -Force $next }
    return (Invoke-Step 'frontend build' 'npm.cmd run build -- --outDir dist-next --emptyOutDir' $frontend) -eq 0
}

function Publish-Frontend {
    $dist = Join-Path $frontend 'dist'
    $next = Join-Path $frontend 'dist-next'
    if (Test-Path $dist) { Remove-Item -Recurse -Force $dist }
    Rename-Item $next 'dist'
    return (Invoke-Step 'collectstatic' "`"$python`" manage.py collectstatic --noinput" $backend) -eq 0
}

# --- one run at a time (a stale lock from a crashed run expires) ----------
if ((Test-Path $lock) -and ((Get-Date) - (Get-Item $lock).LastWriteTime).TotalMinutes -lt 30) { exit 0 }
Set-Content -Path $lock -Value $PID

try {
    if ((Invoke-Step 'git fetch' "git fetch --quiet $Remote $Branch") -ne 0) { exit 1 }
    $old = (git rev-parse HEAD).Trim()
    $new = (git rev-parse FETCH_HEAD).Trim()
    if ($old -eq $new) { exit 0 }

    # Only ever fast-forward: never clobber work done on this PC.
    if (git status --porcelain --untracked-files=no) {
        Write-Log "Skipped $($new.Substring(0,7)): this folder has uncommitted changes. Commit or discard them to resume auto-deploy."
        exit 0
    }
    & git merge-base --is-ancestor $old $new
    if ($LASTEXITCODE -ne 0) {
        Write-Log "Skipped $($new.Substring(0,7)): this PC has commits that aren't on GitHub. Push them to resume auto-deploy."
        exit 0
    }

    $summary = (git log --format='%h %s' "$old..$new") -join ' | '
    Write-Log "Deploying $($old.Substring(0,7)) -> $($new.Substring(0,7)): $summary"
    $changed = git diff --name-only $old $new

    function Undo-Update($reason) {
        Write-Log "  Rolling back to $($old.Substring(0,7)) ($reason). The live app was not changed."
        & git reset --quiet --hard $old
        $next = Join-Path $frontend 'dist-next'
        if (Test-Path $next) { Remove-Item -Recurse -Force $next }
        if ($changed -match '^backend/requirements\.txt$') {
            Invoke-Step 'restore python packages' "`"$python`" -m pip install -q -r requirements.txt" $backend | Out-Null
        }
    }

    if ((Invoke-Step 'git merge' "git merge --ff-only --quiet $new") -ne 0) { exit 1 }

    if ($changed -match '^backend/requirements\.txt$') {
        if ((Invoke-Step 'pip install' "`"$python`" -m pip install -q -r requirements.txt" $backend) -ne 0) {
            Undo-Update 'package install failed'; exit 1
        }
    }

    # Tests run on a throwaway SQLite database (the app's Postgres role
    # can't create test databases); they never touch the real Sheet.
    $testDir = Join-Path $env:TEMP 'fleet_auto_deploy'
    New-Item -ItemType Directory -Force $testDir | Out-Null
    Set-Content -Path (Join-Path $testDir 'deploy_test_settings.py') -Encoding ascii -Value @(
        'from fleet_maintenance.settings import *  # noqa',
        'DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}'
    )
    $testCmd = "set `"PYTHONPATH=$testDir;.`" && set `"DJANGO_SETTINGS_MODULE=deploy_test_settings`" && `"$python`" manage.py test --noinput"
    if ((Invoke-Step 'tests' $testCmd $backend) -ne 0) { Undo-Update 'tests failed'; exit 1 }

    $frontendChanged = [bool]($changed -match '^frontend/')
    if ($frontendChanged -and -not (Build-Frontend $changed)) { Undo-Update 'frontend build failed'; exit 1 }

    # --- point of no return: change the live app -----------------------------
    if ((Invoke-Step 'migrate' "`"$python`" manage.py migrate --noinput" $backend) -ne 0) {
        Undo-Update 'database migration failed'; exit 1
    }
    if ($frontendChanged -and -not (Publish-Frontend)) { Write-Log '  WARNING: collectstatic failed after publishing the new frontend.' }

    if (Restart-Server) {
        Write-Log "  Deployed $($new.Substring(0,7)) - app is up."
        exit 0
    }

    Write-Log '  App did not come back after the restart - rolling back.'
    & git reset --quiet --hard $old
    if ($frontendChanged -and (Build-Frontend $changed)) { Publish-Frontend | Out-Null }
    if (Restart-Server) {
        Write-Log "  Rolled back to $($old.Substring(0,7)) - app is up. (Any database migration from the failed version is still applied.)"
    } else {
        Write-Log '  ERROR: app still not responding after rollback - needs a person to look at it.'
    }
    exit 1
} catch {
    # Never fail silently — a run that dies here must say why in the log.
    Write-Log "ERROR: auto-deploy stopped unexpectedly: $_"
    exit 1
} finally {
    Remove-Item -Path $lock -Force -ErrorAction SilentlyContinue
}
