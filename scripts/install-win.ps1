param(
    [switch]$NoStartup
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$DaemonJs = Join-Path $RepoRoot 'daemon\theme_daemon.js'
$PayloadJs = Join-Path $RepoRoot 'dist\theme_payload.js'
$BuildPy = Join-Path $RepoRoot 'scripts\build_payload.py'
$BuildNode = Join-Path $RepoRoot 'scripts\build_payload.js'
$PidFile = Join-Path $RepoRoot 'daemon.pid'
$VbsPath = Join-Path $RepoRoot 'silent-start.vbs'

$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
    Write-Error "Node.js not found in PATH. Install Node.js >= 22 first."
}
$NodeExe = $NodeCmd.Source
$NodeMajor = [int]((& $NodeExe -p "process.versions.node.split('.')[0]").Trim())
if ($NodeMajor -lt 22) {
    Write-Error "Node.js >= 22 is required (found v$NodeMajor at $NodeExe)."
}

if (-not (Test-Path $PayloadJs)) {
    $PyCmd = Get-Command python -ErrorAction SilentlyContinue
    if (-not $PyCmd) {
        $PyCmd = Get-Command python3 -ErrorAction SilentlyContinue
    }
    if ($PyCmd) {
        Write-Host "[install-win] Building dist/theme_payload.js via Python..."
        & $PyCmd.Source $BuildPy
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[install-win] Python build failed, falling back to Node builder..."
            & $NodeExe $BuildNode
        }
    } else {
        Write-Host "[install-win] Building dist/theme_payload.js via Node.js..."
        & $NodeExe $BuildNode
    }
    if (-not (Test-Path $PayloadJs)) {
        Write-Error "Failed to build dist/theme_payload.js."
    }
}

if (Test-Path $PidFile) {
    $OldPidText = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    $OldPid = 0
    if ([int]::TryParse(($OldPidText -as [string]), [ref]$OldPid) -and $OldPid -gt 0) {
        $ExistingProc = Get-Process -Id $OldPid -ErrorAction SilentlyContinue
        if ($ExistingProc -and $ExistingProc.ProcessName -eq 'node') {
            Write-Host "[install-win] Stopping existing daemon (PID $OldPid)..."
            Stop-Process -Id $OldPid -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 350
        }
    }
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

# Generate silent-start.vbs dynamically without hardcoding user or Node paths.
$EscapedNode = $NodeExe.Replace('"', '""')
$EscapedDaemon = $DaemonJs.Replace('"', '""')
$VbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "$($RepoRoot.Replace('"', '""'))"
WshShell.Run """$EscapedNode"" ""$EscapedDaemon""", 0, False
"@
Set-Content -Path $VbsPath -Value $VbsContent -Encoding ASCII

$WshShell = New-Object -ComObject WScript.Shell

# Ensure Antigravity shortcuts include --remote-debugging-port=0 (required on Antigravity v2.33.0+)
$ShortcutSearchDirs = @(
    [Environment]::GetFolderPath('DesktopDirectory'),
    [Environment]::GetFolderPath('Programs'),
    [Environment]::GetFolderPath('Startup'),
    (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar')
) | Where-Object { $_ -and (Test-Path $_) }

foreach ($SearchDir in $ShortcutSearchDirs) {
    Get-ChildItem -Path $SearchDir -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            $Sc = $WshShell.CreateShortcut($_.FullName)
            if ($Sc.TargetPath -and ($Sc.TargetPath -imatch '\\Antigravity\.exe$')) {
                if ($Sc.Arguments -notmatch '--remote-debugging-port') {
                    $Sc.Arguments = ("$($Sc.Arguments) --remote-debugging-port=0").Trim()
                    $Sc.Save()
                    Write-Host "[install-win] Patched CDP flag on shortcut: $($_.FullName)"
                }
            }
        } catch {
            # Ignore unreadable or protected shortcuts
        }
    }
}

if (-not $NoStartup) {
    $StartupDir = [Environment]::GetFolderPath('Startup')
    $ShortcutPath = Join-Path $StartupDir 'AntigravityCustomTheme.lnk'
    $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = 'wscript.exe'
    $Shortcut.Arguments = """$VbsPath"""
    $Shortcut.WorkingDirectory = $RepoRoot
    $Shortcut.WindowStyle = 7
    $Shortcut.Description = 'Antigravity Custom Theme Daemon'
    $Shortcut.Save()
    Write-Host "[install-win] Startup shortcut created: $ShortcutPath"
}

Write-Host "[install-win] Launching daemon via wscript.exe..."
Start-Process -FilePath 'wscript.exe' -ArgumentList """$VbsPath""" -WorkingDirectory $RepoRoot

for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Milliseconds 250
    if (Test-Path $PidFile) {
        $NewPidText = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
        $NewPid = 0
        if ([int]::TryParse(($NewPidText -as [string]), [ref]$NewPid) -and $NewPid -gt 0) {
            if (Get-Process -Id $NewPid -ErrorAction SilentlyContinue) {
                Write-Host "[install-win] Daemon running silently (PID $NewPid)."
                $PortFile = Join-Path $env:APPDATA 'Antigravity\DevToolsActivePort'
                if (-not (Test-Path $PortFile)) {
                    Write-Host "[install-win] Note: DevToolsActivePort not found yet. Quit Antigravity completely (System Tray -> Quit) and reopen it from Start Menu (if using a Taskbar pin, unpin and re-pin from Start Menu)."
                }
                exit 0
            }
        }
    }
}

Write-Warning "[install-win] Daemon did not write daemon.pid in time. Check $RepoRoot\daemon.log."
exit 1
