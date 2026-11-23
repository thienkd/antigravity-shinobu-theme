param(
    [switch]$Revert
)

$ErrorActionPreference = 'Stop'

$RustDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $RustDir
$BinRelPosix = 'rust/target/release/agy-theme.exe'
$BinAbs = Join-Path $RepoRoot 'rust\target\release\agy-theme.exe'

if ((-not $Revert) -and (-not (Test-Path -LiteralPath $BinAbs))) {
    Write-Error "Rust release binary not found at $BinAbs. Run 'cargo build --release' inside rust/ first."
}

$HooksPath = Join-Path $RepoRoot 'hooks.json'
$McpPath = Join-Path $RepoRoot 'mcp_config.json'

if ($Revert) {
    $HooksJson = @"
{
  "antigravity-shinobu-theme": {
    "SessionStart": [
      {
        "type": "command",
        "command": "node ./scripts/session_start_hook.js",
        "timeout": 8
      }
    ],
    "PreInvocation": [
      {
        "type": "command",
        "command": "node ./scripts/pre_invocation_hook.js",
        "timeout": 5
      }
    ]
  }
}
"@
    $McpJson = @"
{
  "mcpServers": {
    "controller": {
      "command": "node",
      "args": [
        "`${PLUGIN_ROOT}/daemon/mcp_theme_server.js"
      ]
    }
  }
}
"@
    [System.IO.File]::WriteAllText($HooksPath, ($HooksJson -replace "`r`n", "`n") + "`n", (New-Object System.Text.UTF8Encoding($false)))
    [System.IO.File]::WriteAllText($McpPath, ($McpJson -replace "`r`n", "`n") + "`n", (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "[cutover] Reverted hooks.json and mcp_config.json back to Node.js reference scripts."
    exit 0
}

$HooksRustJson = @"
{
  "antigravity-shinobu-theme": {
    "SessionStart": [
      {
        "type": "command",
        "command": "./$BinRelPosix session-start-hook",
        "timeout": 8
      }
    ],
    "PreInvocation": [
      {
        "type": "command",
        "command": "./$BinRelPosix pre-invocation-hook",
        "timeout": 5
      }
    ]
  }
}
"@

$McpRustJson = @"
{
  "mcpServers": {
    "controller": {
      "command": "`${PLUGIN_ROOT}/$BinRelPosix",
      "args": [
        "mcp-server"
      ]
    }
  }
}
"@

[System.IO.File]::WriteAllText($HooksPath, ($HooksRustJson -replace "`r`n", "`n") + "`n", (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText($McpPath, ($McpRustJson -replace "`r`n", "`n") + "`n", (New-Object System.Text.UTF8Encoding($false)))
Write-Host "[cutover] Switched hooks.json and mcp_config.json to pure Rust binary ($BinRelPosix)."
