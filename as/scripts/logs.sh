#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_ROOT/logs"
CONFIG_FILE="$PROJECT_ROOT/configs/server.json"
TODAY="$(date +%F)"

AVAILABLE_CHANNELS=(access error app out all)

# 사용법을 출력합니다.
print_usage() {
    cat <<EOF
Usage:
    ./logs.sh <channel>

Channels:
    access
    error
    app
    out
    all
EOF
}

# 채널명이 유효한지 확인합니다.
is_valid_channel() {
    local target="$1"
    local channel=""

    for channel in "${AVAILABLE_CHANNELS[@]}"; do
        if [[ "$channel" == "$target" ]]; then
            return 0
        fi
    done

    return 1
}

# 서버 설정에서 로그 디렉터리를 읽습니다.
load_log_dir() {
    if [[ ! -f "$CONFIG_FILE" ]]; then
        return 0
    fi

    python3 - "$CONFIG_FILE" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)
print((data.get('logging') or {}).get('logDir', './logs'))
PY
}

# 서버 설정에서 채널 파일 기본명을 읽습니다.
get_channel_filename() {
    local channel="$1"

    if [[ ! -f "$CONFIG_FILE" ]]; then
        return 0
    fi

    python3 - "$CONFIG_FILE" "$channel" <<'PY'
import json, sys
path, channel = sys.argv[1], sys.argv[2]
with open(path, 'r', encoding='utf-8') as f:
    data = json.load(f)
logging = data.get('logging') or {}
block = logging.get(channel) or {}
if block.get('enabled', True):
    print(block.get('filename', channel))
PY
}

# 오늘 날짜 기준 채널 로그 경로를 추가합니다.
append_channel_log() {
    local channel="$1"
    local filename=""

    filename="$(get_channel_filename "$channel")"
    if [[ -n "$filename" ]]; then
        LOG_FILES+=("$LOG_DIR/${TODAY}.${filename}.log")
    fi
}

CONFIGURED_LOG_DIR="$(load_log_dir)"
if [[ -n "$CONFIGURED_LOG_DIR" ]]; then
    case "$CONFIGURED_LOG_DIR" in
        /*) LOG_DIR="$CONFIGURED_LOG_DIR" ;;
        *) LOG_DIR="$PROJECT_ROOT/${CONFIGURED_LOG_DIR#./}" ;;
    esac
fi

mkdir -p "$LOG_DIR"

if [[ $# -eq 0 ]]; then
    print_usage
    exit 0
fi

CHANNEL="$1"
if ! is_valid_channel "$CHANNEL"; then
    echo "Unknown log channel: $CHANNEL" >&2
    echo >&2
    print_usage >&2
    exit 1
fi

LOG_FILES=()
case "$CHANNEL" in
    access|error|app)
        append_channel_log "$CHANNEL"
        ;;
    out)
        LOG_FILES+=("$LOG_DIR/entity-app-server.log")
        ;;
    all)
        append_channel_log "access"
        append_channel_log "error"
        append_channel_log "app"
        LOG_FILES+=("$LOG_DIR/entity-app-server.log")
        ;;
esac

mapfile -t LOG_FILES < <(printf '%s\n' "${LOG_FILES[@]}" | awk '!seen[$0]++')

if [[ ${#LOG_FILES[@]} -eq 0 ]]; then
    echo "No log files configured." >&2
    exit 1
fi

echo "Monitoring Entity App Server logs for $TODAY ($CHANNEL)"
printf ' - %s\n' "${LOG_FILES[@]}"
echo

exec tail -F "${LOG_FILES[@]}"
