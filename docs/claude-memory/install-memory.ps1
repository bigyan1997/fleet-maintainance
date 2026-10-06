# Copies the Claude memory notes in this folder into this computer's Claude memory folder for the project.
# Run from the repo folder:  powershell -ExecutionPolicy Bypass -File docs\claude-memory\install-memory.ps1
# Existing files are kept unless -Overwrite is given. -Target picks another folder.
param([string]$Target = "", [switch]$Overwrite)

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if (-not $Target) {
    # Claude Code names a project's folder after its path, every other character turned into "-".
    $encoded = $repo -replace "[^A-Za-z0-9]", "-"
    $projects = Join-Path $env:USERPROFILE ".claude\projects"
    $found = Get-ChildItem $projects -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -ieq $encoded } | Select-Object -First 1
    $dir = if ($found) { $found.FullName } else { Join-Path $projects $encoded }
    $Target = Join-Path $dir "memory"
}
New-Item -ItemType Directory -Force $Target | Out-Null

$copied = 0
foreach ($file in Get-ChildItem $PSScriptRoot -Filter *.md | Where-Object { $_.Name -ne "README.md" }) {
    $to = Join-Path $Target $file.Name
    if ((Test-Path $to) -and -not $Overwrite) {
        Write-Host "kept your existing $($file.Name)"
        continue
    }
    Copy-Item $file.FullName $to -Force
    Write-Host "copied $($file.Name)"
    $copied++
}
Write-Host "Done: $copied file(s) copied to $Target"
