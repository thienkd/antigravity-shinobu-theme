#!/usr/bin/env bash
set -euo pipefail
shopt -u patsub_replacement 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DAEMON_JS="$REPO_ROOT/daemon/theme_daemon.js"
PAYLOAD_JS="$REPO_ROOT/dist/theme_payload.js"
BUILD_NODE="$REPO_ROOT/scripts/build_payload.js"
BUILD_PY="$REPO_ROOT/scripts/build_payload.py"
PID_FILE="$REPO_ROOT/daemon.pid"
LOG_FILE="$REPO_ROOT/daemon.log"

SERVICE_LABEL="io.antigravity.custom-theme"
SYSTEMD_UNIT="antigravity-custom-theme.service"

xml_escape() {
    local s="$1" amp='&amp;' lt='&lt;' gt='&gt;' quot='&quot;' apos='&apos;' dq='"' sq="'"
    s="${s//&/$amp}"
    s="${s//</$lt}"
    s="${s//>/$gt}"
    s="${s//$dq/$quot}"
    s="${s//$sq/$apos}"
    printf '%s' "$s"
}

systemd_escape_dq() {
    local s="$1" bs='\' dq='"' pct='%' dlr='$' e_bs='\\' e_dq='\"' e_pct='%%' e_dlr='$$'
    s="${s//$bs/$e_bs}"
    s="${s//$dq/$e_dq}"
    s="${s//$pct/$e_pct}"
    s="${s//$dlr/$e_dlr}"
    printf '%s' "$s"
}

systemd_escape_wd() {
    local s="$1" bs='\' pct='%' dlr='$' sp=' ' e_bs='\\' e_pct='%%' e_dlr='$$' e_sp='\x20'
    s="${s//$bs/$e_bs}"
    s="${s//$pct/$e_pct}"
    s="${s//$dlr/$e_dlr}"
    s="${s//$sp/$e_sp}"
    printf '%s' "$s"
}

ensure_private_log() {
    touch "$LOG_FILE"
    chmod 600 "$LOG_FILE"
}

find_node() {
    if ! command -v node >/dev/null 2>&1; then
        echo "[install-unix] Error: Node.js not found in PATH. Install Node.js >= 22 (e.g., 'nvm install 22' or 'brew install node')." >&2
        exit 1
    fi
    local node_bin full_ver major real_node
    node_bin="$(command -v node)"
    full_ver="$("$node_bin" -p "process.versions.node")"
    major="${full_ver%%.*}"
    if [ "$major" -lt 22 ]; then
        echo "[install-unix] Error: Node.js >= 22 is required (found v$full_ver at $node_bin)." >&2
        echo "[install-unix] Upgrade via: nvm install 22  (or on macOS: brew install node)" >&2
        exit 1
    fi
    real_node="$("$node_bin" -p "require('fs').realpathSync(process.execPath)")"
    printf '%s\n' "$real_node"
}

ensure_payload() {
    local node_bin="$1"
    echo "[install-unix] Building fresh dist/theme_payload.js via Node.js..."
    if "$node_bin" "$BUILD_NODE"; then
        return 0
    fi
    if command -v python3 >/dev/null 2>&1 && [ -f "$BUILD_PY" ]; then
        echo "[install-unix] Node build failed; falling back to python3 scripts/build_payload.py..."
        if python3 "$BUILD_PY"; then
            return 0
        fi
    fi
    echo "[install-unix] Error: Failed to build dist/theme_payload.js." >&2
    exit 1
}

is_theme_daemon_pid() {
    local p="$1"
    if [ -r "/proc/$p/cmdline" ]; then
        tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null | grep -q "theme_daemon.js"
        return $?
    fi
    ps -ww -p "$p" -o command= 2>/dev/null | grep -q "theme_daemon.js"
}

stop_existing_pid() {
    if [ -f "$PID_FILE" ]; then
        local old_pid
        old_pid="$(tr -d '[:space:]' < "$PID_FILE" 2>/dev/null || true)"
        if [[ "$old_pid" =~ ^[0-9]+$ ]] && kill -0 "$old_pid" 2>/dev/null; then
            if is_theme_daemon_pid "$old_pid"; then
                echo "[install-unix] Stopping existing daemon (PID $old_pid)..."
                kill "$old_pid" 2>/dev/null || true
                local i=0
                while [ "$i" -lt 8 ] && kill -0 "$old_pid" 2>/dev/null; do
                    LC_ALL=C sleep 0.1
                    i=$((i + 1))
                done
            fi
        fi
        rm -f "$PID_FILE"
    fi
}

patch_linux_desktop_launcher() {
    local node_bin="$1"
    local user_apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
    local search_dir src_file base_name target_file

    for search_dir in "$user_apps" /usr/local/share/applications /usr/share/applications; do
        [ -d "$search_dir" ] || continue
        for src_file in "$search_dir"/antigravity*.desktop "$search_dir"/Antigravity*.desktop; do
            [ -f "$src_file" ] || continue
            base_name="$(basename "$src_file")"
            target_file="$user_apps/$base_name"
            if [ "$src_file" != "$target_file" ] && [ ! -f "$target_file" ]; then
                mkdir -p "$user_apps"
                cp "$src_file" "$target_file" 2>/dev/null || continue
            fi
        done
    done

    [ -d "$user_apps" ] || return 0
    local patched_any=0
    for target_file in "$user_apps"/antigravity*.desktop "$user_apps"/Antigravity*.desktop; do
        [ -f "$target_file" ] || continue
        if "$node_bin" -e '
            const fs = require("fs");
            const p = process.argv[1];
            const src = fs.readFileSync(p, "utf8");
            let changed = false;
            const out = src.replace(/^Exec=(.*)$/gm, (full, cmd) => {
                if (/--remote-debugging-port(?:=|\s|$)/.test(cmd)) return full;
                changed = true;
                if (/\s+%[fFuU]\b/.test(cmd)) {
                    return "Exec=" + cmd.replace(/(\s+%[fFuU]\b)/, " --remote-debugging-port=0$1");
                }
                return "Exec=" + cmd.trimEnd() + " --remote-debugging-port=0";
            });
            if (!changed) process.exit(2);
            fs.writeFileSync(p, out, "utf8");
        ' "$target_file" 2>/dev/null; then
            echo "[install-unix] Patched CDP flag in XDG desktop launcher: $target_file"
            patched_any=1
        fi
    done

    if [ "$patched_any" -eq 1 ] && command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "$user_apps" >/dev/null 2>&1 || true
    fi
}

install_macos() {
    local node_bin="$1"
    local uid_num
    uid_num="$(id -u)"
    local plist_dir="$HOME/Library/LaunchAgents"
    local plist_path="$plist_dir/$SERVICE_LABEL.plist"
    mkdir -p "$plist_dir"

    launchctl bootout "gui/$uid_num/$SERVICE_LABEL" 2>/dev/null || true
    launchctl unload "$plist_path" 2>/dev/null || true
    stop_existing_pid
    ensure_private_log

    local esc_label esc_node esc_daemon esc_repo esc_log
    esc_label="$(xml_escape "$SERVICE_LABEL")"
    esc_node="$(xml_escape "$node_bin")"
    esc_daemon="$(xml_escape "$DAEMON_JS")"
    esc_repo="$(xml_escape "$REPO_ROOT")"
    esc_log="$(xml_escape "$LOG_FILE")"

    (
        umask 022
        cat > "$plist_path" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$esc_label</string>
    <key>ProgramArguments</key>
    <array>
        <string>$esc_node</string>
        <string>$esc_daemon</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$esc_repo</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>5</integer>
    <key>StandardOutPath</key>
    <string>$esc_log</string>
    <key>StandardErrorPath</key>
    <string>$esc_log</string>
</dict>
</plist>
EOF
    )
    chmod 644 "$plist_path"

    LC_ALL=C sleep 0.3
    launchctl enable "gui/$uid_num/$SERVICE_LABEL" 2>/dev/null || true
    if launchctl bootstrap "gui/$uid_num" "$plist_path" 2>/dev/null; then
        echo "[install-unix] LaunchAgent loaded via bootstrap: $plist_path"
    else
        LC_ALL=C sleep 0.4
        if launchctl bootstrap "gui/$uid_num" "$plist_path" 2>/dev/null; then
            echo "[install-unix] LaunchAgent loaded via bootstrap (retry): $plist_path"
        else
            launchctl load -w "$plist_path" 2>/dev/null || true
            launchctl kickstart -kp "gui/$uid_num/$SERVICE_LABEL" 2>/dev/null || true
            echo "[install-unix] LaunchAgent registered (fallback kickstart): $plist_path"
        fi
    fi

    local port_upper="$HOME/Library/Application Support/Antigravity/DevToolsActivePort"
    local port_lower="$HOME/Library/Application Support/antigravity/DevToolsActivePort"
    if [ ! -f "$port_upper" ] && [ ! -f "$port_lower" ]; then
        echo "[install-unix] Note: DevToolsActivePort not found yet."
        echo "[install-unix] Quit Antigravity completely first with Cmd + Q from the Dock (or run: osascript -e 'quit app \"Antigravity\"'), then launch:"
        echo "  open -a Antigravity --args --remote-debugging-port=0"
    fi
}

start_nohup_daemon() {
    local node_bin="$1"
    ensure_private_log
    nohup "$node_bin" "$DAEMON_JS" </dev/null >> "$LOG_FILE" 2>&1 &
    local bg_pid=$!
    disown 2>/dev/null || true
    local waited=0
    while [ "$waited" -lt 5 ]; do
        LC_ALL=C sleep 0.1
        waited=$((waited + 1))
        if [ -f "$PID_FILE" ] && kill -0 "$bg_pid" 2>/dev/null; then
            break
        fi
    done
    if kill -0 "$bg_pid" 2>/dev/null; then
        echo "[install-unix] Daemon started (PID $bg_pid). Logs: $LOG_FILE"
    else
        echo "[install-unix] Error: Background daemon (PID $bg_pid) exited unexpectedly. Check $LOG_FILE" >&2
        exit 1
    fi
}

install_linux() {
    local node_bin="$1"
    if command -v systemctl >/dev/null 2>&1; then
        systemctl --user stop "$SYSTEMD_UNIT" 2>/dev/null || true
    fi
    stop_existing_pid
    ensure_private_log
    patch_linux_desktop_launcher "$node_bin"

    if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
        local unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
        local unit_path="$unit_dir/$SYSTEMD_UNIT"
        mkdir -p "$unit_dir"

        local esc_wd esc_node esc_daemon
        esc_wd="$(systemd_escape_wd "$REPO_ROOT")"
        esc_node="$(systemd_escape_dq "$node_bin")"
        esc_daemon="$(systemd_escape_dq "$DAEMON_JS")"

        (
            umask 077
            cat > "$unit_path" <<EOF
[Unit]
Description=Antigravity Custom Theme Daemon
After=graphical-session.target

[Service]
Type=simple
WorkingDirectory=-$esc_wd
ExecStart="$esc_node" "$esc_daemon"
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF
        )
        chmod 600 "$unit_path"

        systemctl --user daemon-reload
        systemctl --user enable "$SYSTEMD_UNIT"
        systemctl --user restart "$SYSTEMD_UNIT"
        echo "[install-unix] systemd user service active: $unit_path"
    else
        echo "[install-unix] systemd --user unavailable; starting background process with nohup."
        start_nohup_daemon "$node_bin"
    fi
}

cmd="${1:-install}"
case "$cmd" in
    --foreground|foreground|run)
        NODE_BIN="$(find_node)"
        ensure_payload "$NODE_BIN"
        if [ "$(uname -s)" = "Linux" ] && command -v systemctl >/dev/null 2>&1; then
            systemctl --user stop "$SYSTEMD_UNIT" 2>/dev/null || true
        fi
        stop_existing_pid
        ensure_private_log
        exec "$NODE_BIN" "$DAEMON_JS"
        ;;
    stop)
        if [ "$(uname -s)" = "Darwin" ]; then
            launchctl bootout "gui/$(id -u)/$SERVICE_LABEL" 2>/dev/null || true
            launchctl unload "$HOME/Library/LaunchAgents/$SERVICE_LABEL.plist" 2>/dev/null || true
        elif command -v systemctl >/dev/null 2>&1; then
            systemctl --user stop "$SYSTEMD_UNIT" 2>/dev/null || true
        fi
        stop_existing_pid
        echo "[install-unix] Stopped."
        ;;
    status)
        if [ -f "$PID_FILE" ]; then
            pid="$(tr -d '[:space:]' < "$PID_FILE" 2>/dev/null || true)"
            if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
                if is_theme_daemon_pid "$pid"; then
                    echo "[install-unix] Running (PID $pid)"
                    exit 0
                fi
            fi
        fi
        echo "[install-unix] Not running."
        exit 1
        ;;
    install)
        NODE_BIN="$(find_node)"
        ensure_payload "$NODE_BIN"
        OS_NAME="$(uname -s)"
        case "$OS_NAME" in
            Darwin) install_macos "$NODE_BIN" ;;
            Linux)  install_linux "$NODE_BIN" ;;
            *)
                echo "[install-unix] Unsupported OS '$OS_NAME' for auto-start; running in background."
                stop_existing_pid
                start_nohup_daemon "$NODE_BIN"
                ;;
        esac
        ;;
    *)
        echo "Usage: $0 [install|--foreground|stop|status]" >&2
        exit 2
        ;;
esac
