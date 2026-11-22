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
$AppDataDir = if ($env:APPDATA) { $env:APPDATA } else { Join-Path $HOME 'AppData\Roaming' }

$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
    Write-Error "Node.js not found in PATH. Install Node.js >= 22 first."
}
$NodeExe = $NodeCmd.Source
$NodeVersionFull = (& $NodeExe -p "process.versions.node").Trim()
$NodeMajor = [int](($NodeVersionFull -split '\.')[0])
if ($NodeMajor -lt 22) {
    Write-Error "Node.js >= 22 is required (found v$NodeVersionFull at $NodeExe). Please upgrade Node.js to >= 22."
}

Write-Host "[install-win] Building fresh dist/theme_payload.js via Node.js..."
$PayloadBuilt = $false
try {
    & $NodeExe $BuildNode
    if (($LASTEXITCODE -eq 0) -and (Test-Path -LiteralPath $PayloadJs)) {
        $PayloadBuilt = $true
    }
} catch {
    $PayloadBuilt = $false
}
if (-not $PayloadBuilt) {
    $PyCmd = Get-Command python -ErrorAction SilentlyContinue | Where-Object { $_.Source -notmatch 'WindowsApps' } | Select-Object -First 1
    if (-not $PyCmd) {
        $PyCmd = Get-Command python3 -ErrorAction SilentlyContinue | Where-Object { $_.Source -notmatch 'WindowsApps' } | Select-Object -First 1
    }
    if ($PyCmd) {
        Write-Host "[install-win] Node build failed, falling back to Python builder..."
        try {
            & $PyCmd.Source -B $BuildPy
            if (($LASTEXITCODE -eq 0) -and (Test-Path -LiteralPath $PayloadJs)) {
                $PayloadBuilt = $true
            }
        } catch {
            $PayloadBuilt = $false
        }
    }
}
if (-not $PayloadBuilt) {
    Write-Error "Failed to build dist/theme_payload.js."
}

function Test-VerifiedDaemonPid([int]$TargetPid) {
    if ($TargetPid -le 0 -or $TargetPid -eq $PID) { return $false }
    try {
        $CimProc = Get-CimInstance Win32_Process -Filter "ProcessId = $TargetPid" -ErrorAction Stop
        if ($CimProc -and ($CimProc.Name -imatch '^node(?:js|\d+)?(?:\.exe)?$') -and $CimProc.CommandLine -and ($CimProc.CommandLine -imatch 'theme_daemon\.js')) {
            return $true
        }
        return $false
    } catch {
        try {
            $WmicText = (& wmic.exe process where "ProcessId=$TargetPid" get Name,CommandLine /FORMAT:LIST 2>$null | Out-String)
            if ($WmicText -and ($WmicText -imatch '\bnode(?:js|\d+)?(?:\.exe)?\b') -and ($WmicText -imatch 'theme_daemon\.js')) {
                return $true
            }
        } catch {}
        return $false
    }
}

$StoppedPids = @{}

if (Test-Path -LiteralPath $PidFile) {
    $OldPidText = (Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    $OldPid = 0
    if ([int]::TryParse(($OldPidText -as [string]), [ref]$OldPid) -and $OldPid -gt 0) {
        if (Test-VerifiedDaemonPid $OldPid) {
            Write-Host "[install-win] Stopping existing daemon (PID $OldPid)..."
            Stop-Process -Id $OldPid -Force -ErrorAction SilentlyContinue
            $StoppedPids[$OldPid] = $true
            Start-Sleep -Milliseconds 350
        }
    }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

# Also sweep orphan node processes running this exact $DaemonJs path if daemon.pid was lost
try {
    $NodeProcs = Get-CimInstance Win32_Process -Filter "Name LIKE 'node%'" -ErrorAction Stop
    foreach ($Proc in $NodeProcs) {
        $CandPid = [int]$Proc.ProcessId
        if ($CandPid -gt 0 -and $CandPid -ne $PID -and (-not $StoppedPids.ContainsKey($CandPid)) -and $Proc.CommandLine) {
            if ($Proc.CommandLine.IndexOf($DaemonJs, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
                Write-Host "[install-win] Stopping orphan daemon process (PID $CandPid)..."
                Stop-Process -Id $CandPid -Force -ErrorAction SilentlyContinue
                $StoppedPids[$CandPid] = $true
                Start-Sleep -Milliseconds 250
            }
        }
    }
} catch {
    # Fail-closed: never blindly terminate user node.exe processes if WMI/CIM is unavailable
}

# Generate silent-start.vbs using UTF-16LE with BOM ([System.Text.Encoding]::Unicode)
# so wscript.exe preserves Unicode / Vietnamese diacritics in user profile paths cleanly.
$EscapedRepo = $RepoRoot.Replace('"', '""')
$EscapedNode = $NodeExe.Replace('"', '""')
$EscapedDaemon = $DaemonJs.Replace('"', '""')
$VbsContent = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "$EscapedRepo"
WshShell.Run """$EscapedNode"" ""$EscapedDaemon""", 0, False
"@
[System.IO.File]::WriteAllText($VbsPath, $VbsContent, [System.Text.Encoding]::Unicode)

$WshShell = New-Object -ComObject WScript.Shell

# Ensure Antigravity shortcuts include --remote-debugging-port=0 (required on Antigravity v2.33.0+)
$ShortcutSearchDirs = @(
    [Environment]::GetFolderPath('DesktopDirectory'),
    [Environment]::GetFolderPath('Programs'),
    [Environment]::GetFolderPath('Startup'),
    (Join-Path $AppDataDir 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

foreach ($SearchDir in $ShortcutSearchDirs) {
    Get-ChildItem -LiteralPath $SearchDir -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            $Sc = $WshShell.CreateShortcut($_.FullName)
            if ($Sc.TargetPath -and ($Sc.TargetPath -imatch '\\Antigravity\.exe$') -and (Test-Path -LiteralPath $Sc.TargetPath)) {
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
    $Shortcut.Arguments = "`"$($VbsPath.Replace('"', '""'))`""
    $Shortcut.WorkingDirectory = $RepoRoot
    $Shortcut.WindowStyle = 7
    $Shortcut.Description = 'Antigravity Custom Theme Daemon'
    $Shortcut.Save()
    Write-Host "[install-win] Startup shortcut created: $ShortcutPath"
}

Write-Host "[install-win] Launching daemon via detached Win32_Process (survives terminal/agent exit)..."
$launchedDetached = $false
try {
    $cmdLine = "wscript.exe `"$VbsPath`""
    $cimRes = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
        CommandLine = $cmdLine
        CurrentDirectory = $RepoRoot
    } -ErrorAction Stop
    if ($cimRes.ReturnValue -eq 0) {
        $launchedDetached = $true
    }
} catch {
    $launchedDetached = $false
}
if (-not $launchedDetached) {
    Start-Process -FilePath 'wscript.exe' -ArgumentList """$VbsPath""" -WorkingDirectory $RepoRoot
}

for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Milliseconds 250
    if (Test-Path -LiteralPath $PidFile) {
        $NewPidText = (Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
        $NewPid = 0
        if ([int]::TryParse(($NewPidText -as [string]), [ref]$NewPid) -and $NewPid -gt 0) {
            if (Get-Process -Id $NewPid -ErrorAction SilentlyContinue) {
                Write-Host "[install-win] Daemon running silently (PID $NewPid)."
                $PortFileUpper = Join-Path $AppDataDir 'Antigravity\DevToolsActivePort'
                $PortFileLower = Join-Path $AppDataDir 'antigravity\DevToolsActivePort'
                if ((-not (Test-Path -LiteralPath $PortFileUpper)) -and (-not (Test-Path -LiteralPath $PortFileLower))) {
                    Write-Host "[install-win] Note: DevToolsActivePort not found yet. Quit Antigravity completely (System Tray -> Quit) and reopen it from Start Menu (if using a Taskbar pin, unpin and re-pin from Start Menu)."
                }
                exit 0
            }
        }
    }
}

Write-Warning "[install-win] Daemon did not write daemon.pid in time. Check $RepoRoot\daemon.log."
exit 1
