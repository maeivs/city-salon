#!/bin/bash
# run.sh — Entity App Server 실행 / 종료
#
# 사용법:
#   ./scripts/run.sh start   — 프로덕션 모드 백그라운드 실행 (system.js 또는 system.js)
#   ./scripts/run.sh stop    — 실행 중인 서버 종료
#   ./scripts/run.sh restart — 실행 중인 서버 재시작
#   ./scripts/run.sh dev     — 개발 모드 실행 (tsx watch)

set -e

# 심볼릭 링크 경로(/home/codeshop → /data/codeshop)로 실행돼도 systemd ExecStart 의 실경로와
# 매칭되도록 pwd -P 로 실경로로 정규화한다. (find_systemd_service 의 ExecStart 매칭에 필요)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# .env 로드 (.env 는 lsyncd 로 standby 서버에 복제됨 → 공통값만)
[ -f ".env" ] && set -o allexport && source .env && set +o allexport
# .env.local 로드 (lsyncd sync 제외 = 서버별 전용값; .env 를 override). 예: ALIMTALK_SERVER_ROLE=standby
[ -f ".env.local" ] && set -o allexport && source .env.local && set +o allexport

PID_FILE="$PROJECT_ROOT/.entity-app-server.pid"
LOG_FILE="$PROJECT_ROOT/logs/entity-app-server.log"
SERVER_NAME="Entity App Server"

# 명령 존재 여부를 확인합니다.
has_command() {
    command -v "$1" >/dev/null 2>&1
}

# 필수 외부 프로그램이 설치되어 있는지 확인한다.
ensure_required_commands() {
    local mode="${1:-all}"
    local missing=()

    if ! has_command node; then
        missing+=("node  — https://nodejs.org/ 에서 설치하거나 'nvm install --lts'")
    fi

    if [[ "$mode" == "start" ]] && ! has_command nohup; then
        missing+=("nohup — Git Bash 와 함께 설치되지만, BusyBox 환경이면 GNU coreutils 필요")
    fi

    if [[ "$mode" == "start" || "$mode" == "dev" ]] && ! has_command npm; then
        missing+=("npm   — Node.js 설치 시 함께 포함됩니다")
    fi

    if [[ "$(uname -o 2>/dev/null || true)" == "Msys" ]] && ! has_command powershell.exe; then
        missing+=("powershell.exe — Windows 프로세스 관리에 필요합니다 (기본 제공)")
    fi

    if [ "${#missing[@]}" -gt 0 ]; then
        echo "❌ 필수 프로그램이 설치되어 있지 않습니다:"
        for item in "${missing[@]}"; do
            echo "   • $item"
        done
        exit 1
    fi
}

# 주(primary) 서버(222.236.46.243)에서 재시작할 때 백업 서버(222.236.46.245)의 동일 서비스도 재시작한다.
# - 이 호스트가 222.236.46.243 IP 를 가질 때만 동작한다(245 에서는 no-op → 무한 루프 없음).
# - 245 접속 실패/타임아웃이어도 경고만 남기고 로컬 재시작 결과에는 영향을 주지 않는다.
# - lsyncd 와 동일한 root SSH 키/포트를 사용하므로 비-root 사용자면 sudo 로 감싼다.
propagate_restart_to_standby() {
    local remote_svc="$1"
    [ -n "$remote_svc" ] || return 0
    hostname -I 2>/dev/null | tr ' ' '\n' | grep -qx "222.236.46.243" || return 0
    local ssh_cmd="ssh -p 38371 -i /root/.ssh/id_ed25519 -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=10"
    [ "$(id -u)" -ne 0 ] && ssh_cmd="sudo $ssh_cmd"
    echo "→ 백업 서버(222.236.46.245) ${remote_svc} 재시작 전파…"
    if $ssh_cmd root@222.236.46.245 "systemctl restart ${remote_svc}" 2>/dev/null; then
        echo "   ✓ 백업 서버 ${remote_svc} 재시작 완료"
    else
        echo "   ⚠ 백업 서버 ${remote_svc} 재시작 실패(접속 불가/타임아웃) — 로컬 재시작은 정상 완료됨"
    fi
}

# 현재 프로젝트를 관리하는 systemd 서비스명을 반환한다 (상태 무관).
find_systemd_service() {
    has_command systemctl || return 1

    local namespace="${SERVER_NAMESPACE:-${NAMESPACE:-}}"
    if [ -z "$namespace" ] && [ -f "$PROJECT_ROOT/configs/server.json" ]; then
        namespace=$(sed -n 's/.*"namespace"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PROJECT_ROOT/configs/server.json" | head -n 1)
    fi
    namespace=$(echo "$namespace" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/-/g')

    local svc_name=""
    if [ -z "$namespace" ]; then
        svc_name="entity-app-server"
    elif [[ "$namespace" == "entity-app-server" ]] || [[ "$namespace" == *"-entity-app-server" ]]; then
        svc_name="$namespace"
    else
        svc_name="${namespace}-entity-app-server"
    fi
    svc_name="${svc_name}.service"

    # 유닛이 실제로 로드되어 있는지 먼저 확인한다.
    # (등록되지 않은 유닛은 LoadState=not-found 이며, 이 경우 systemd 서비스로 취급하지 않는다.)
    local load_state=""
    load_state=$(systemctl show -p LoadState --value "$svc_name" 2>/dev/null || true)
    if [ "$load_state" != "loaded" ]; then
        return 1
    fi

    local exec_start=""
    exec_start=$(systemctl show -p ExecStart --value "$svc_name" 2>/dev/null || true)
    if [[ "$exec_start" == *"$PROJECT_ROOT/scripts/run.sh"* ]] || [[ "$exec_start" == *"$PROJECT_ROOT/system.js"* ]]; then
        echo "$svc_name"
        return 0
    fi

    return 1
}

# PID 프로세스명을 읽는다.
get_pid_name() {
    local pid="$1"
    local result=""

    result=$(ps -p "$pid" -o comm= 2>/dev/null | awk '{print $1}' || true)
    if [ -n "$result" ]; then
        echo "$result" | tr '[:upper:]' '[:lower:]'
        return
    fi

    if command -v powershell.exe >/dev/null 2>&1; then
        powershell.exe -NonInteractive -NoProfile -Command \
            "(Get-Process -Id $pid -ErrorAction SilentlyContinue).ProcessName" \
            2>/dev/null | tr -d '\r' | tr '[:upper:]' '[:lower:]' || true
    fi
}

# PID 상태 문자열을 읽는다.
get_pid_state() {
    local pid="$1"

    ps -p "$pid" -o stat= 2>/dev/null | awk '{print $1}'
}

# PID가 실제 실행 상태인지 확인한다.
is_pid_running() {
    local pid="$1"
    local state=""

    if [ -z "$pid" ]; then
        return 1
    fi

    # 리눅스: /proc 로 먼저 확인한다. kill -0 은 다른 사용자(root) 프로세스에 대해
    # EPERM 으로 실패해 "없음"으로 오판하므로, 존재 확인에 의존하면 안 된다.
    if [ -d "/proc/$pid" ]; then
        return 0
    fi

    if kill -0 "$pid" 2>/dev/null; then
        state=$(get_pid_state "$pid")
        [[ "$state" == *Z* ]] && return 1
        return 0
    fi

    state=$(get_pid_state "$pid")
    if [ -n "$state" ]; then
        [[ "$state" == *Z* ]] && return 1
        return 0
    fi

    # Windows Git Bash: bash kill 이 네이티브 프로세스를 감지 못하는 경우 PowerShell 폴백
    if command -v powershell.exe >/dev/null 2>&1; then
        powershell.exe -NonInteractive -NoProfile -Command \
            "if (Get-Process -Id $pid -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" \
            2>/dev/null
        return $?
    fi

    return 1
}

# PID 명령행을 읽는다.
get_pid_cmdline() {
    local pid="$1"

    if [ -r "/proc/$pid/cmdline" ]; then
        tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true
        return
    fi

    local result
    result=$(ps -p "$pid" -o args= 2>/dev/null || true)
    if [ -n "$result" ]; then
        echo "$result"
        return
    fi

    # Windows Git Bash: 네이티브 프로세스는 /proc 미지원 → PowerShell WMI 폴백
    if command -v powershell.exe >/dev/null 2>&1; then
        powershell.exe -NonInteractive -NoProfile -Command \
            "(Get-WmiObject Win32_Process -Filter 'ProcessId = $pid').CommandLine" \
            2>/dev/null | tr -d '\r' | tr '\\' '/' || true
    fi
}

# PID 작업 디렉터리를 읽는다.
get_pid_cwd() {
    local pid="$1"

    readlink -f "/proc/$pid/cwd" 2>/dev/null || true
}

# 포트 점유 프로세스 상세 정보를 출력한다.
print_port_process_details() {
    local pid=""
    local process_name=""
    local cmdline=""

    while read -r pid; do
        pid=$(echo "$pid" | tr -d '[:space:]')
        [ -z "$pid" ] && continue

        process_name=$(get_pid_name "$pid")
        cmdline=$(get_pid_cmdline "$pid")
        [ -z "$process_name" ] && process_name="unknown"
        [ -z "$cmdline" ] && cmdline="(command line unavailable)"

        echo "   PID: $pid | NAME: $process_name"
        echo "   CMD: $cmdline"
    done < <(find_server_pids)
}

# PID가 현재 프로젝트의 AS 프로세스인지 확인한다.
is_managed_server_pid() {
    local pid="$1"
    local runtime_entry="${2:-}"
    local cmdline=""
    local process_name=""

    if ! is_pid_running "$pid"; then
        return 1
    fi

    process_name=$(get_pid_name "$pid")
    [[ "$process_name" == node* ]] || return 1

    cmdline=$(get_pid_cmdline "$pid")
    if [[ "$cmdline" != *"node"* && "$cmdline" != *"tsx"* ]]; then
        return 1
    fi

    if [ -n "$runtime_entry" ] && [[ "$cmdline" == *"$runtime_entry"* ]]; then
        return 0
    fi

    [[ "$cmdline" == *"$PROJECT_ROOT/system.js"* ]] && return 0
    [[ "$cmdline" == *"$PROJECT_ROOT/src/system/index.ts"* ]] && return 0

    # Windows: POSIX /d/foo 경로를 D:/foo 형식으로 변환해서 재비교
    if [[ "$PROJECT_ROOT" =~ ^/([a-zA-Z])/ ]]; then
        local win_root="${BASH_REMATCH[1]^^}:${PROJECT_ROOT:2}"
        [[ "$cmdline" == *"${win_root}/system.js"* ]] && return 0
        [[ "$cmdline" == *"${win_root}/src/system/index.ts"* ]] && return 0
    fi

    if [ -n "$runtime_entry" ] && [[ "$runtime_entry" =~ ^/([a-zA-Z])/ ]]; then
        local win_entry="${BASH_REMATCH[1]^^}:${runtime_entry:2}"
        [[ "$cmdline" == *"$win_entry"* ]] && return 0
    fi

    return 1
}

is_placeholder_value() {
    local value="$1"

    [[ "$value" =~ ^(your-|replace-with|change-this) ]] && return 0
    [[ "$value" = "shared-jwt-secret" ]] && return 0
    [[ "$value" = "your-jwt-secret" ]] && return 0
    [[ "$value" = "your-api-key" ]] && return 0
    [[ "$value" = "your-hmac-secret" ]] && return 0

    return 1
}

show_env_setup_error() {
    local reason="$1"

    echo "❌ .env 설정이 아직 완료되지 않았습니다."
    echo "   $reason"
    echo ""
    echo "   확인할 항목:"
    echo "   1. .env 의 ENTITY_SERVER_URL"
    echo "   2. .env 의 ENTITY_API_KEY"
    echo "   3. .env 의 ENTITY_HMAC_SECRET (32자 이상)"
    echo "   4. .env 의 JWT_SECRET (32자 이상, Entity Server와 동일)"
    echo ""
    echo "   예시 파일: .env.example"
    exit 1
}

ensure_env_ready() {
    if [ ! -f "$PROJECT_ROOT/.env" ]; then
        show_env_setup_error ".env 파일이 없습니다. .env.example 을 참고해 .env 를 생성하세요."
    fi

    local entity_server_url="${ENTITY_SERVER_URL:-}"
    local entity_api_key="${ENTITY_API_KEY:-}"
    local entity_hmac_secret="${ENTITY_HMAC_SECRET:-}"
    local jwt_secret="${JWT_SECRET:-}"

    if [ -z "$entity_server_url" ]; then
        show_env_setup_error "ENTITY_SERVER_URL 이 비어 있습니다."
    fi

    if [ -z "$entity_api_key" ]; then
        show_env_setup_error "ENTITY_API_KEY 가 비어 있습니다."
    fi

    if [ -z "$entity_hmac_secret" ]; then
        show_env_setup_error "ENTITY_HMAC_SECRET 이 비어 있습니다."
    fi

    if [ -z "$jwt_secret" ]; then
        show_env_setup_error "JWT_SECRET 이 비어 있습니다."
    fi

    if is_placeholder_value "$entity_api_key"; then
        show_env_setup_error "ENTITY_API_KEY 가 예시 값입니다. Entity Server에서 발급한 실제 키로 바꾸세요."
    fi

    if is_placeholder_value "$entity_hmac_secret"; then
        show_env_setup_error "ENTITY_HMAC_SECRET 이 예시 값입니다. Entity Server에서 발급한 실제 시크릿으로 바꾸세요."
    fi

    if is_placeholder_value "$jwt_secret"; then
        show_env_setup_error "JWT_SECRET 이 예시 값입니다. Entity Server와 동일한 실제 시크릿으로 바꾸세요."
    fi

    if [ "${#entity_hmac_secret}" -lt 32 ]; then
        show_env_setup_error "ENTITY_HMAC_SECRET 은 32자 이상이어야 합니다."
    fi

    if [ "${#jwt_secret}" -lt 32 ]; then
        show_env_setup_error "JWT_SECRET 은 32자 이상이어야 합니다."
    fi
}

verify_entity_server_credentials() {
    local result

    result=$(node <<'NODE'
const { createHmac, randomUUID } = require("node:crypto");

const baseUrl = String(process.env.ENTITY_SERVER_URL || "").replace(/\/$/, "");
const apiKey = String(process.env.ENTITY_API_KEY || "");
const hmacSecret = String(process.env.ENTITY_HMAC_SECRET || "");

async function main() {
  const healthUrl = `${baseUrl}/v1/health`;

  try {
    const health = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
    if (!health.ok) {
      console.log(`HEALTH_HTTP:${health.status}`);
      return;
    }
  } catch (error) {
    console.log(`HEALTH_ERROR:${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const method = "GET";
  const path = "/v1/admin/configs";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomUUID();
  const payload = Buffer.from(`${method}|${path}|${timestamp}|${nonce}|`, "utf8");
  const signature = createHmac("sha256", hmacSecret).update(payload).digest("hex");

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "X-API-Key": apiKey,
        "X-Timestamp": timestamp,
        "X-Nonce": nonce,
        "X-Signature": signature,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      console.log("OK");
      return;
    }

    const text = (await response.text().catch(() => "")).trim();
    console.log(`AUTH_HTTP:${response.status}:${text}`);
  } catch (error) {
    console.log(`AUTH_ERROR:${error instanceof Error ? error.message : String(error)}`);
  }
}

main();
NODE
)

    case "$result" in
        OK)
            return 0
            ;;
        HEALTH_HTTP:*)
            echo "❌ Entity Server에 연결했지만 헬스체크가 실패했습니다."
            echo "   주소: ${ENTITY_SERVER_URL}"
            echo "   응답: ${result#HEALTH_HTTP:}"
            exit 1
            ;;
        HEALTH_ERROR:*)
            echo "❌ Entity Server에 연결할 수 없습니다."
            echo "   주소: ${ENTITY_SERVER_URL}"
            echo "   원인: ${result#HEALTH_ERROR:}"
            echo "   Entity Server가 실행 중인지 먼저 확인하세요."
            exit 1
            ;;
        AUTH_HTTP:401:*|AUTH_HTTP:403:*)
            echo "❌ .env 의 Entity Server 인증 정보가 맞지 않습니다."
            echo "   ENTITY_API_KEY 또는 ENTITY_HMAC_SECRET 이 Entity Server 값과 다릅니다."
            echo "   Entity Server 관리자에서 발급된 API Key / HMAC Secret 을 다시 복사하세요."
            exit 1
            ;;
        AUTH_HTTP:404:*)
            echo "❌ Entity Server 관리자 API 점검 경로를 찾지 못했습니다."
            echo "   연결 대상: ${ENTITY_SERVER_URL}"
            echo "   /v1/admin/configs 가 없는 구버전 서버이거나 잘못된 주소일 수 있습니다."
            exit 1
            ;;
        AUTH_HTTP:*)
            echo "❌ Entity Server 인증 점검 중 오류가 발생했습니다."
            echo "   응답: ${result#AUTH_HTTP:}"
            exit 1
            ;;
        AUTH_ERROR:*)
            echo "❌ Entity Server 인증 점검 요청을 보내지 못했습니다."
            echo "   원인: ${result#AUTH_ERROR:}"
            exit 1
            ;;
        *)
            echo "❌ Entity Server 사전 점검 결과를 해석하지 못했습니다."
            echo "   응답: $result"
            exit 1
            ;;
    esac
}

ensure_runtime_dependencies_installed() {
    if [ -d "$PROJECT_ROOT/node_modules/tsx" ]; then
        return 0
    fi

    echo "❌ npm 의존성이 설치되지 않았습니다. 먼저 아래 명령을 실행하세요:"
    echo "   npm install"
    exit 1
}

get_log_line_count() {
    if [ -f "$LOG_FILE" ]; then
        wc -l < "$LOG_FILE"
        return
    fi

    echo "0"
}

print_startup_banner_from_log() {
    local start_line="$1"
    local banner=""

    for _ in $(seq 1 300); do
        if [ -f "$LOG_FILE" ]; then
            banner=$(sed -n "${start_line},\$p" "$LOG_FILE" | awk '
                BEGIN { capture = 0; banner = "" }
                {
                    plain = $0
                    gsub(/\033\[[0-9;]*m/, "", plain)
                }
                plain ~ /^┌/ {
                    if (capture == 0) {
                        capture = 1
                        banner = $0 ORS
                        next
                    }
                }
                capture == 1 {
                    banner = banner $0 ORS
                    if (plain ~ /^└/) {
                        printf "%s", banner
                        exit
                    }
                }
            ')
            if [ -n "$banner" ]; then
                echo ""
                inject_access_url_into_banner "$banner"
                echo ""
                return 0
            fi
        fi
        sleep 0.2
    done

    return 1
}

get_server_base_url() {
    local env_base_url=""
    local config_base_url=""
    local config_host=""

    env_base_url="${SERVER_BASE_URL:-${BASE_URL:-}}"
    env_base_url=$(echo "$env_base_url" | tr -d '[:space:]')
    if [ -n "$env_base_url" ]; then
        echo "${env_base_url%/}"
        return
    fi

    if [ -f "$PROJECT_ROOT/configs/server.json" ]; then
        config_base_url=$(sed -n 's/.*"baseUrl"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PROJECT_ROOT/configs/server.json" | head -n 1)
        config_base_url=$(echo "$config_base_url" | tr -d '[:space:]')
        if [ -n "$config_base_url" ]; then
            echo "${config_base_url%/}"
            return
        fi

        config_host=$(sed -n 's/.*"host"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PROJECT_ROOT/configs/server.json" | head -n 1)
        config_host=$(echo "$config_host" | tr -d '[:space:]')
    fi

    case "$config_host" in
        ""|0.0.0.0|::|::1)
            echo "http://127.0.0.1"
            ;;
        *)
            echo "http://$config_host"
            ;;
    esac
}

get_server_access_url() {
    local base_url
    local port

    base_url=$(get_server_base_url)
    port=$(get_server_port)

    node - "$base_url" "$port" <<'NODE'
const [, , rawBaseUrl, rawPort] = process.argv;

try {
  const url = new URL(rawBaseUrl);
  const normalizedPort = String(rawPort || "").trim();
  if (normalizedPort && !url.port) {
    url.port = normalizedPort;
  }
  console.log(url.toString().replace(/\/$/, ""));
} catch {
  const trimmedBaseUrl = String(rawBaseUrl || "").replace(/\/$/, "");
  const normalizedPort = String(rawPort || "").trim();
  if (!normalizedPort || /:[0-9]+$/.test(trimmedBaseUrl)) {
    console.log(trimmedBaseUrl);
    process.exit(0);
  }
  console.log(`${trimmedBaseUrl}:${normalizedPort}`);
}
NODE
}

inject_access_url_into_banner() {
    local banner="$1"
    local access_url=""

    access_url=$(get_server_access_url)
    if [ -z "$access_url" ]; then
        printf "%s" "$banner"
        return
    fi

    printf "%s" "$banner" | awk -v access_url="$access_url" '
        function box_line(text, width, total_padding, left_padding, right_padding) {
            width = 72
            total_padding = width - length(text)
            if (total_padding < 0) {
                total_padding = 0
            }
            left_padding = int(total_padding / 2)
            right_padding = total_padding - left_padding
            return "│" sprintf("%" left_padding "s", "") text sprintf("%" right_padding "s", "") "│"
        }
        {
            print
            if ($0 ~ /Entity App Server/ && inserted == 0) {
                print box_line(access_url)
                inserted = 1
            }
        }
    '
}

get_server_port() {
    local config_port
    local env_port

    env_port="${SERVER_PORT:-${PORT:-}}"
    env_port=$(echo "$env_port" | tr -d '[:space:]')
    if [[ "$env_port" =~ ^[0-9]+$ ]] && [ "$env_port" -gt 0 ]; then
        echo "$env_port"
        return
    fi

    if [ -f "$PROJECT_ROOT/configs/server.json" ]; then
        config_port=$(grep -E '"port"[[:space:]]*:' "$PROJECT_ROOT/configs/server.json" | head -n 1 | sed -E 's/.*:[[:space:]]*([0-9]+).*/\1/')
        config_port=$(echo "$config_port" | tr -d '[:space:]')
        if [[ "$config_port" =~ ^[0-9]+$ ]] && [ "$config_port" -gt 0 ]; then
            echo "$config_port"
            return
        fi
    fi

    echo "3000"
}

find_server_pids() {
    local port
    port=$(get_server_port)
    local pids=""

    if has_command ss; then
        pids=$(ss -ltnp 2>/dev/null | sed -n "s/.*:$port .*pid=\([0-9]\+\).*/\1/p" | sort -u)
        if [ -n "$pids" ]; then
            echo "$pids"
            return
        fi

        # ss 가 LISTEN 은 보이는데 PID 가 비어 있으면, 다른 사용자(root 등) 소유 소켓이라
        # 일반 권한으로 PID 가 안 보이는 경우다. sudo 로 한 번 더, 그 다음 lsof 로 보강한다.
        if ss -ltn 2>/dev/null | grep -q ":$port "; then
            pids=$(sudo -n ss -ltnp 2>/dev/null | sed -n "s/.*:$port .*pid=\([0-9]\+\).*/\1/p" | sort -u)
            if [ -n "$pids" ]; then
                echo "$pids"
                return
            fi
            if has_command lsof; then
                pids=$(sudo -n lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk '/^[0-9]+$/' | sort -u)
                if [ -n "$pids" ]; then
                    echo "$pids"
                    return
                fi
            fi
        fi
    fi

    if has_command powershell.exe; then
        pids=$(powershell.exe -NonInteractive -NoProfile -Command \
            "Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess" \
            2>/dev/null | tr -d '\r' | awk '/^[0-9]+$/ { print }' | sort -u)
        if [ -n "$pids" ]; then
            echo "$pids"
            return
        fi
    fi

    if has_command netstat; then
        netstat -ano 2>/dev/null | awk -v target=":$port" '
            $1 ~ /^TCP/ && index($2, target) && /LISTENING/ && $NF ~ /^[0-9]+$/ { print $NF }
        ' | sort -u
    fi
}

# 현재 프로젝트 런타임 엔트리를 실행 중인 node PID를 찾는다.
find_project_runtime_pids() {
    local pid=""
    local cmdline=""

    while read -r pid; do
        pid=$(echo "$pid" | tr -d '[:space:]')
        [ -z "$pid" ] && continue

        cmdline=$(get_pid_cmdline "$pid")
        [[ "$cmdline" == *"$PROJECT_ROOT/system.js"* ]] || [[ "$cmdline" == *"$PROJECT_ROOT/src/system/index.ts"* ]] || continue
        echo "$pid"
    done < <(ps -eo pid= 2>/dev/null || true)
}

get_status_pid() {
    local pid=""
    local port_pid=""

    if [ -f "$PID_FILE" ]; then
        pid=$(cat "$PID_FILE" 2>/dev/null || true)
        if is_managed_server_pid "$pid"; then
            echo "$pid"
            return 0
        fi

        rm -f "$PID_FILE"
    fi

    while read -r port_pid; do
        [ -z "$port_pid" ] && continue
        if is_managed_server_pid "$port_pid"; then
            echo "$port_pid"
            return 0
        fi
    done < <(find_server_pids)

    while read -r port_pid; do
        [ -z "$port_pid" ] && continue
        if is_managed_server_pid "$port_pid"; then
            echo "$port_pid"
            return 0
        fi
    done < <(find_project_runtime_pids)

    return 1
}

# pid 파일과 포트 기준으로 현재 서버 PID를 찾는다.
find_active_server_pid() {
    local pid=""
    local port_pid=""

    if [ -f "$PID_FILE" ]; then
        pid=$(tr -d '[:space:]' < "$PID_FILE" 2>/dev/null || true)
        if [ -n "$pid" ] && is_managed_server_pid "$pid"; then
            echo "$pid"
            return
        fi

        rm -f "$PID_FILE"
    fi

    while read -r port_pid; do
        port_pid=$(echo "$port_pid" | tr -d '[:space:]')
        [ -z "$port_pid" ] && continue
        if is_managed_server_pid "$port_pid"; then
            echo "$port_pid"
            return
        fi
    done < <(find_server_pids)

    while read -r port_pid; do
        port_pid=$(echo "$port_pid" | tr -d '[:space:]')
        [ -z "$port_pid" ] && continue
        if is_managed_server_pid "$port_pid"; then
            echo "$port_pid"
            return
        fi
    done < <(find_project_runtime_pids)
}

is_running() {
    [ -n "$(find_active_server_pid)" ]
}

show_status() {
    local svc=""
    svc=$(find_systemd_service || true)
    if [ -n "$svc" ]; then
        echo "ℹ️  systemd 서비스로 관리 중: $svc"
        local svc_state=""
        svc_state=$(systemctl is-active "$svc" 2>/dev/null || true)
        sudo systemctl status "$svc" --no-pager 2>/dev/null || true
        if [ "$svc_state" = "active" ] || [ "$svc_state" = "activating" ]; then
            return
        fi
        if [ -n "$(find_server_pids | head -n 1)" ]; then
            echo "⚠️  systemd 서비스는 $svc_state 상태지만 관리 대상 프로세스가 남아 있습니다."
        fi
    fi

    local pid=""
    local port

    port=$(get_server_port)
    pid=$(get_status_pid || true)

    if [ -n "$pid" ]; then
        echo "✅ ${SERVER_NAME}가 실행 중입니다"
        echo "포트: $port"
        echo "PID: $pid"
        echo "로그: $LOG_FILE"
        return 0
    fi

    echo "ℹ️  ${SERVER_NAME}가 실행 중이지 않습니다."
    echo "포트: $port"
    if [ -n "$(find_server_pids | head -n 1)" ]; then
        show_unmanaged_port_message
    fi
    return 1
}

show_port_in_use_error() {
    local port
    port=$(get_server_port)

    echo "❌ 포트 $port 는 이미 사용 중입니다. ${SERVER_NAME}를 시작하지 않습니다."

    echo "   먼저 종료하려면: $0 stop"
}

# start/dev 용 포트 충돌 안내를 출력한다.
show_start_port_in_use_message() {
    local port
    port=$(get_server_port)

    echo "❌ 포트 $port 는 이미 사용 중입니다. ${SERVER_NAME}를 먼저 중지하세요: ./run.sh stop"
    print_port_process_details
}

show_unmanaged_port_message() {
    local port
    port=$(get_server_port)

    echo "ℹ️  포트 $port 를 사용하는 프로세스가 있지만, 현재 프로젝트의 PID 파일로 시작한 서버가 아닙니다."
    echo "   안전을 위해 포트 일치만으로 종료하지 않습니다."
    print_port_process_details
}

stop_port_processes() {
    local stopped_any=false
    local pid

    while read -r pid; do
        [ -z "$pid" ] && continue
        if ! is_managed_server_pid "$pid"; then
            continue
        fi
        if stop_pid "$pid"; then
            echo "✅ ${SERVER_NAME} 종료 완료 (PID: $pid)"
            stopped_any=true
        fi
    done < <(find_server_pids)

    if [ "$stopped_any" = true ]; then
        return 0
    fi

    return 1
}

get_runtime_entry() {
    # 소스 리포지토리 모드: src/system/index.ts 를 tsx 로 직접 실행 (dist 무시)
    if [ -f "$PROJECT_ROOT/src/system/index.ts" ]; then
        echo "$PROJECT_ROOT/src/system/index.ts"
        return 0
    fi

    if [ -f "$PROJECT_ROOT/system.js" ]; then
        echo "$PROJECT_ROOT/system.js"
        return 0
    fi

    if [ -f "$PROJECT_ROOT/system.js" ]; then
        echo "$PROJECT_ROOT/system.js"
        return 0
    fi

    return 1
}

start_runtime_process() {
    local runtime_entry="$1"

    if [[ "$runtime_entry" == *.ts ]]; then
        node --import tsx/esm "$runtime_entry"
        return
    fi

    node "$PROJECT_ROOT/runtime-start.mjs" "$runtime_entry"
}

# systemd(ExecStart) 처럼 현재 프로세스를 그대로 서버로 대체해야 하는 경우 exec 로 실행한다.
# node 를 직접 exec 해야 systemd 가 서버 프로세스를 메인 PID 로 추적한다.
# (start_runtime_process 는 셸 함수라 'exec start_runtime_process' 는 동작하지 않는다.)
exec_runtime_process() {
    local runtime_entry="$1"

    if [[ "$runtime_entry" == *.ts ]]; then
        exec node --import tsx/esm "$runtime_entry"
    fi

    exec node "$PROJECT_ROOT/runtime-start.mjs" "$runtime_entry"
}

start_runtime_process_nohup() {
    local runtime_entry="$1"

    if [[ "$runtime_entry" == *.ts ]]; then
        nohup node --import tsx/esm "$runtime_entry" >> "$LOG_FILE" 2>&1 &
        return
    fi

    nohup node "$PROJECT_ROOT/runtime-start.mjs" "$runtime_entry" >> "$LOG_FILE" 2>&1 &
}

count_top_level_dirs() {
    local dir="$1"

    if [ ! -d "$dir" ]; then
        echo "0"
        return
    fi

    find "$dir" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d '[:space:]'
}

count_enabled_top_level_dirs() {
    local dir="$1"
    local count=0
    local entry_dir

    if [ ! -d "$dir" ]; then
        echo "0"
        return
    fi

    while IFS= read -r entry_dir; do
        [ -z "$entry_dir" ] && continue
        if ! is_entry_explicitly_disabled "$entry_dir/config.json"; then
            count=$((count + 1))
        fi
    done < <(find "$dir" -mindepth 1 -maxdepth 1 -type d | sort)

    echo "$count"
}

count_top_level_files() {
    local dir="$1"

    if [ ! -d "$dir" ]; then
        echo "0"
        return
    fi

    find "$dir" -mindepth 1 -maxdepth 1 -type f \( -name '*.ts' -o -name '*.js' \) | wc -l | tr -d '[:space:]'
}

print_discovered_app_counts() {
    local summary

    summary=$(PROJECT_ROOT="$PROJECT_ROOT" node --import tsx/esm --input-type=module <<'NODE'
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.env.PROJECT_ROOT;

function getAppRootDir() {
    const appRoot = path.join(projectRoot, "app");
    if (fs.existsSync(appRoot)) return appRoot;
    return path.join(projectRoot, "src", "app");
}

function resolveModulePath(dir, baseName) {
    const tsPath = path.join(dir, `${baseName}.ts`);
    if (fs.existsSync(tsPath)) return tsPath;
    const jsPath = path.join(dir, `${baseName}.js`);
    if (fs.existsSync(jsPath)) return jsPath;
    return null;
}

function substituteEnvVars(raw) {
    return raw.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, name) => process.env[name] ?? "");
}

function isEnabled(configPath) {
    if (!fs.existsSync(configPath)) return true;
    try {
        const raw = substituteEnvVars(fs.readFileSync(configPath, "utf8"));
        const parsed = JSON.parse(raw);
        return parsed?.enabled !== false;
    } catch {
        return true;
    }
}

function formatList(items) {
    return items.length > 0 ? items.join(", ") : "-";
}

function formatIndentedList(items, indent = "          ", width = 74) {
    const text = formatList(items);
    if (text === "-") return `${indent}-`;

    const parts = text.split(", ");
    const lines = [];
    let current = indent;

    for (const part of parts) {
        const token = current === indent ? part : `, ${part}`;
        if ((current + token).length <= width) {
            current += token;
            continue;
        }

        if (current !== indent) {
            lines.push(current);
            current = indent + part;
            continue;
        }

        lines.push(indent + part);
        current = indent;
    }

    if (current !== indent) {
        lines.push(current);
    }

    return lines.join("\n");
}

async function collectHooks(appRoot) {
    const hookIndexPath = resolveModulePath(path.join(appRoot, "hooks"), "index");
    if (!hookIndexPath) return [];
    try {
        const mod = await import(pathToFileURL(hookIndexPath).href);
        if (!mod?.hookRegistry || typeof mod.hookRegistry !== "object") return [];
        return Object.keys(mod.hookRegistry);
    } catch {
        return [];
    }
}

function collectPlugins(appRoot) {
    const pluginsDir = path.join(appRoot, "plugins");
    if (!fs.existsSync(pluginsDir)) return [];
    return fs.readdirSync(pluginsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .filter((entry) => isEnabled(path.join(pluginsDir, entry.name, "config.json")))
        .filter((entry) => resolveModulePath(path.join(pluginsDir, entry.name), "index"))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((entry) => entry.name);
}

function collectRoutes(appRoot) {
    const extensionRoutes = [];
    const standaloneRoutes = [];
    const registered = new Set();
    const pluginsDir = path.join(appRoot, "plugins");

    if (fs.existsSync(pluginsDir)) {
        for (const mod of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
            if (!mod.isDirectory()) continue;
            const modDir = path.join(pluginsDir, mod.name);
            if (!isEnabled(path.join(modDir, "config.json"))) continue;

            for (const routeDir of [modDir, path.join(modDir, "routes")]) {
                if (!fs.existsSync(routeDir)) continue;

                if (!registered.has(mod.name) && resolveModulePath(routeDir, "routes")) {
                    registered.add(mod.name);
                    extensionRoutes.push(mod.name);
                }

                for (const file of fs.readdirSync(routeDir)) {
                    const match = file.match(/^(.+)-routes\.(ts|js)$/);
                    if (!match) continue;
                    const domain = match[1];
                    if (registered.has(domain)) continue;
                    registered.add(domain);
                    extensionRoutes.push(domain);
                }
            }
        }
    }

    const routesDir = path.join(appRoot, "routes");
    if (fs.existsSync(routesDir)) {
        for (const entry of fs.readdirSync(routesDir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            if (registered.has(entry.name)) continue;
            const routeDir = path.join(routesDir, entry.name);
            if (!isEnabled(path.join(routeDir, "config.json"))) continue;
            if (!resolveModulePath(routeDir, "routes")) continue;
            registered.add(entry.name);
            standaloneRoutes.push(entry.name);
        }
    }

    return {
        extensionRoutes,
        standaloneRoutes,
    };
}

function collectSchedules(appRoot) {
    const schedulesDir = path.join(appRoot, "schedules");
    if (!fs.existsSync(schedulesDir)) return [];
    return fs.readdirSync(schedulesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .filter((entry) => isEnabled(path.join(schedulesDir, entry.name, "config.json")))
        .filter((entry) => resolveModulePath(path.join(schedulesDir, entry.name), "index"))
        .map((entry) => entry.name);
}

const appRoot = getAppRootDir();
const hooks = await collectHooks(appRoot);
const plugins = collectPlugins(appRoot);
const routes = collectRoutes(appRoot);
const schedules = collectSchedules(appRoot);

console.log("  app 스캔 결과:");
console.log(`      Hooks (${hooks.length})`);
console.log(formatIndentedList(hooks));
console.log(`      Plugins (${plugins.length})`);
console.log(formatIndentedList(plugins));
console.log(`      Routes (${routes.standaloneRoutes.length})`);
console.log(formatIndentedList(routes.standaloneRoutes));
console.log(`      Schedules (${schedules.length})`);
console.log(formatIndentedList(schedules));
NODE
)

    printf '%s\n' "$summary"
}

is_entry_explicitly_disabled() {
    local config_path="$1"

    if [ ! -f "$config_path" ]; then
        return 1
    fi

    node - "$config_path" <<'NODE' >/dev/null 2>&1
const fs = require("node:fs");

const configPath = process.argv[2];

try {
  const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
  process.exit(parsed && parsed.enabled === false ? 0 : 1);
} catch {
  process.exit(1);
}
NODE
}

resolve_enabled_failed_route_targets() {
    local name="$1"
    local app_root
    local plugin_dir
    local route_dir
    local found=false

    app_root=$(get_app_root_dir)
    plugin_dir="$app_root/plugins/$name"
    route_dir="$app_root/routes/$name"

    if [ -d "$plugin_dir" ] && ! is_entry_explicitly_disabled "$plugin_dir/config.json"; then
        echo "plugin:$name"
        found=true
    fi

    if [ -d "$route_dir" ] && ! is_entry_explicitly_disabled "$route_dir/config.json"; then
        echo "route:$name"
        found=true
    fi

    if [ "$found" = false ] && [ ! -d "$plugin_dir" ] && [ ! -d "$route_dir" ]; then
        echo "route:$name"
    fi
}

print_enabled_load_failures_from_log() {
    local start_line="$1"
    local raw_line=""
    local plain_line=""
    local entry_name=""
    local resolved_entry=""
    local report_key=""
    local kind=""
    local name=""
    local printed_header=false
    declare -A reported_entries=()

    if [ ! -f "$LOG_FILE" ]; then
        return 0
    fi

    while IFS= read -r raw_line || [ -n "$raw_line" ]; do
        plain_line=$(printf '%s\n' "$raw_line" | sed -E 's/\x1B\[[0-9;]*m//g')

        if [[ "$plain_line" =~ Failed\ to\ load\ route:\ ([^[:space:]]+) ]]; then
            entry_name="${BASH_REMATCH[1]}"
            while IFS= read -r resolved_entry; do
                [ -z "$resolved_entry" ] && continue
                report_key="$resolved_entry"
                if [ -z "${reported_entries[$report_key]+x}" ]; then
                    if [ "$printed_header" = false ]; then
                        echo "  enabled=true 인 항목 로딩 실패:"
                        printed_header=true
                    fi
                    kind="${resolved_entry%%:*}"
                    name="${resolved_entry#*:}"
                    echo "    - $kind: $name"
                    reported_entries["$report_key"]=1
                fi
            done < <(resolve_enabled_failed_route_targets "$entry_name")
        elif [[ "$plain_line" =~ Failed\ to\ load\ hook\ registry ]]; then
            report_key="hook-registry"
            if [ -z "${reported_entries[$report_key]+x}" ]; then
                if [ "$printed_header" = false ]; then
                    echo "  enabled=true 인 항목 로딩 실패:"
                    printed_header=true
                fi
                echo "    - hook registry"
                reported_entries["$report_key"]=1
            fi
        fi
    done < <(sed -n "${start_line},\$p" "$LOG_FILE")
}

monitor_enabled_load_failures_from_stream() {
    local raw_line=""
    local plain_line=""
    local entry_name=""
    local resolved_entry=""
    local report_key=""
    local kind=""
    local name=""
    local printed_header=false
    declare -A reported_entries=()

    while IFS= read -r raw_line || [ -n "$raw_line" ]; do
        printf '%s\n' "$raw_line"
        plain_line=$(printf '%s\n' "$raw_line" | sed -E 's/\x1B\[[0-9;]*m//g')

        if [[ "$plain_line" =~ Failed\ to\ load\ route:\ ([^[:space:]]+) ]]; then
            entry_name="${BASH_REMATCH[1]}"
            while IFS= read -r resolved_entry; do
                [ -z "$resolved_entry" ] && continue
                report_key="$resolved_entry"
                if [ -z "${reported_entries[$report_key]+x}" ]; then
                    if [ "$printed_header" = false ]; then
                        echo "  enabled=true 인 항목 로딩 실패:"
                        printed_header=true
                    fi
                    kind="${resolved_entry%%:*}"
                    name="${resolved_entry#*:}"
                    echo "    - $kind: $name"
                    reported_entries["$report_key"]=1
                fi
            done < <(resolve_enabled_failed_route_targets "$entry_name")
        elif [[ "$plain_line" =~ Failed\ to\ load\ hook\ registry ]]; then
            report_key="hook-registry"
            if [ -z "${reported_entries[$report_key]+x}" ]; then
                if [ "$printed_header" = false ]; then
                    echo "  enabled=true 인 항목 로딩 실패:"
                    printed_header=true
                fi
                echo "    - hook registry"
                reported_entries["$report_key"]=1
            fi
        fi
    done
}

ensure_port_available() {
    local running_pid=""

    running_pid=$(find_active_server_pid)
    if [ -n "$running_pid" ]; then
        echo "❌ ${SERVER_NAME}가 이미 실행 중입니다 (PID: $running_pid). 먼저 중지하세요: ./run.sh stop"
        exit 1
    fi

    mapfile -t PORT_PIDS < <(find_server_pids)
    if [ "${#PORT_PIDS[@]}" -gt 0 ]; then
        show_start_port_in_use_message
        exit 1
    fi
}

# PID 에 시그널을 보낸다. 권한이 부족하면(다른 사용자/root 소유) sudo 로 재시도한다.
kill_pid_signal() {
    local sig="$1"
    local pid="$2"

    if kill "$sig" "$pid" 2>/dev/null; then
        return 0
    fi
    sudo -n kill "$sig" "$pid" 2>/dev/null || true
}

stop_pid() {
    local pid="$1"
    local used_taskkill=false
    local is_msys=false

    if [ -z "$pid" ]; then
        return 1
    fi

    if ! is_pid_running "$pid"; then
        return 1
    fi

    if [[ "$(uname -o 2>/dev/null || true)" == "Msys" ]] && has_command taskkill; then
        is_msys=true
    fi

    # 프로세스 종료를 시도한다.
    if [ "$is_msys" = true ]; then
        MSYS_NO_PATHCONV=1 taskkill /PID "$pid" >/dev/null 2>&1 || true
        used_taskkill=true
    else
        kill_pid_signal -TERM "$pid"
    fi

    # Windows Git Bash: bash kill 이 네이티브 프로세스를 종료하지 못하면 taskkill 폴백
    if [ "$used_taskkill" = false ] && is_pid_running "$pid" && has_command taskkill; then
        MSYS_NO_PATHCONV=1 taskkill /PID "$pid" >/dev/null 2>&1 || true
        used_taskkill=true
    fi

    if [ "$used_taskkill" = true ]; then
        if has_command powershell.exe; then
            if powershell.exe -NonInteractive -NoProfile -Command \
                "\$p = Get-Process -Id $pid -ErrorAction SilentlyContinue; if (\$p) { \$p | Wait-Process -Timeout 2 -ErrorAction SilentlyContinue }; if (Get-Process -Id $pid -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }" \
                >/dev/null 2>&1; then
                return 0
            fi
        fi

        for _ in $(seq 1 5); do
            if ! is_pid_running "$pid"; then
                return 0
            fi
            sleep 0.1
        done

        MSYS_NO_PATHCONV=1 taskkill /F /PID "$pid" >/dev/null 2>&1 || true

        if has_command powershell.exe; then
            if powershell.exe -NonInteractive -NoProfile -Command \
                "\$p = Get-Process -Id $pid -ErrorAction SilentlyContinue; if (\$p) { \$p | Wait-Process -Timeout 1 -ErrorAction SilentlyContinue }; if (Get-Process -Id $pid -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }" \
                >/dev/null 2>&1; then
                return 0
            fi
        fi

        for _ in $(seq 1 5); do
            if ! is_pid_running "$pid"; then
                return 0
            fi
            sleep 0.1
        done

        return 1
    fi

    for _ in $(seq 1 50); do
        if ! is_pid_running "$pid"; then
            return 0
        fi
        sleep 0.1
    done

    # 강제 종료를 시도한다.
    kill_pid_signal -KILL "$pid"
    if is_pid_running "$pid" && has_command taskkill; then
        MSYS_NO_PATHCONV=1 taskkill /F /PID "$pid" >/dev/null 2>&1 || true
    fi

    for _ in $(seq 1 20); do
        if ! is_pid_running "$pid"; then
            return 0
        fi
        sleep 0.1
    done

    return 1
}

# stop 공통 흐름을 처리한다.
# 설정 포트를 점유한 모든 PID 를 프로세스명과 무관하게 종료한다 (--force 전용).
# systemd 서비스면 먼저 'systemctl stop' 으로 완전히 중지한다.
#   - systemctl stop 은 명시적 중지라 Restart 정책을 트리거하지 않는다.
#   - 반대로, 서비스를 stop 하지 않고 PID 만 kill 하면 systemd 가 비정상 종료로 보고 재기동한다.
# stop 이후에도 포트를 쥔 잔여(고아) 프로세스가 있으면 그때 kill 한다(이미 unit 이 멈춰 재기동 안 됨).
force_stop_by_port() {
    local port
    port=$(get_server_port)

    local svc=""
    svc=$(find_systemd_service || true)
    if [ -n "$svc" ]; then
        local svc_state=""
        svc_state=$(systemctl is-active "$svc" 2>/dev/null || true)
        if [ "$svc_state" = "active" ] || [ "$svc_state" = "activating" ] || [ "$svc_state" = "failed" ]; then
            echo "ℹ️  systemd 서비스 완전 중지: $svc"
            sudo systemctl stop "$svc"
            local i=0
            while [ "$i" -lt 30 ]; do
                if [ -z "$(find_server_pids | head -n 1)" ]; then
                    break
                fi
                sleep 0.1
                i=$((i + 1))
            done
        fi
    fi

    rm -f "$PID_FILE"

    local killed_any=false
    local pid=""
    while read -r pid; do
        pid=$(echo "$pid" | tr -d '[:space:]')
        [ -z "$pid" ] && continue
        local name=""
        name=$(get_pid_name "$pid")
        echo "⚠️  --force: 포트 $port 점유 PID $pid (${name:-unknown}) 강제 종료"
        if stop_pid "$pid"; then
            killed_any=true
        else
            echo "❌ PID $pid 종료 실패"
            return 1
        fi
    done < <(find_server_pids)

    if [ "$killed_any" = true ]; then
        echo "✅ ${SERVER_NAME} 강제 종료 완료 (포트 $port)"
        return 0
    fi

    if [ -n "$svc" ]; then
        echo "✅ ${SERVER_NAME} systemd 로 중지됨 (포트 $port 해제)"
        return 0
    fi

    echo "ℹ️  포트 $port 를 점유한 프로세스가 없습니다."
    return 0
}

stop_server() {
    # --force: 프로세스명을 따지지 않고 포트 점유 PID 를 무조건 종료한다.
    if [ "${FORCE_STOP:-0}" -eq 1 ]; then
        force_stop_by_port
        return $?
    fi

    local svc=""
    svc=$(find_systemd_service || true)
    if [ -n "$svc" ]; then
        local svc_state=""
        svc_state=$(systemctl is-active "$svc" 2>/dev/null || true)
        if [ "$svc_state" = "active" ] || [ "$svc_state" = "activating" ]; then
            echo "ℹ️  systemd 서비스 중지: $svc"
            sudo systemctl stop "$svc"
            rm -f "$PID_FILE"
            echo "✅ ${SERVER_NAME} 종료 완료 (systemd)"
            if [ -z "$(find_server_pids | head -n 1)" ]; then
                return 0
            fi
            echo "⚠️  systemd 중지 후에도 관리 대상 프로세스가 남아 있어 추가 정리를 진행합니다."
        else
            echo "ℹ️  ${SERVER_NAME}가 실행 중이 아닙니다 (systemd: $svc_state)."
            rm -f "$PID_FILE"
        fi
    fi

    local stopped_any=false
    local pid=""

    pid=$(find_active_server_pid)
    rm -f "$PID_FILE"

    if [ -n "$pid" ]; then
        if stop_pid "$pid"; then
            echo "✅ ${SERVER_NAME} 종료 완료 (PID: $pid)"
            stopped_any=true
        else
            echo "❌ PID $pid 를 종료하지 못했습니다. 수동으로 종료하세요."
            return 1
        fi
    fi

    if [ "$stopped_any" = false ]; then
        if [ -n "$(find_server_pids | head -n 1)" ]; then
            show_unmanaged_port_message
            return 1
        fi

        if stop_port_processes; then
            rm -f "$PID_FILE"
            return 0
        fi

        echo "ℹ️  ${SERVER_NAME}가 실행 중이지 않습니다."
    fi

    return 0
}

_print_help() {
    echo ""
    echo "  Entity App Server 실행"
    echo "  ================"
    echo ""
    echo "  사용법: $0 <명령>"
    echo ""
    echo "  명령:"
    echo "    start   프로덕션 모드로 백그라운드 실행 (system.js 또는 system.js)"
    echo "    stop    실행 중인 서버 종료"
    echo "    restart 실행 중인 서버 재시작"
    echo "    status  실행 상태 확인"
    echo "    dev     개발 모드 실행 (tsx watch)"
    echo ""
    echo "  예제:"
    echo "    $0 start       # 서버 시작"
    echo "    $0 stop        # 서버 종료"
    echo "    $0 restart     # 서버 재시작"
    echo "    $0 status      # 실행 상태 확인"
    echo "    $0 dev         # 개발 모드"
    echo ""
}

if [ $# -eq 0 ]; then
    _print_help
    echo ""
    echo "현재 상태:"
    show_status || true
    exit 0
fi

# --force: 프로세스명을 따지지 않고, 설정 포트를 점유한 PID 면 무조건 종료한다.
FORCE_STOP=0
for arg in "$@"; do
    case "$arg" in
        --force | -f)
            FORCE_STOP=1
            ;;
    esac
done

case "$1" in
    start)
        ensure_required_commands start
        runtime_entry=""
        log_start_line=""

        # systemd 에서 ExecStart 로 호출된 경우 바이너리를 직접 exec 한다.
        if [ -n "${INVOCATION_ID:-}" ]; then
            if ! runtime_entry="$(get_runtime_entry)"; then
                echo "❌ 실행할 엔트리를 찾지 못했습니다."
                exit 1
            fi
            exec_runtime_process "$runtime_entry"
        fi

        # systemd 서비스가 등록되어 있으면 systemctl 로 관리한다.
        svc=$(find_systemd_service || true)
        if [ -n "$svc" ]; then
            svc_state=$(systemctl is-active "$svc" 2>/dev/null || true)
            if [ "$svc_state" = "active" ]; then
                echo "ℹ️  ${SERVER_NAME}가 systemd 서비스로 이미 실행 중입니다: $svc"
                echo "   재시작: sudo systemctl restart $svc"
                exit 0
            fi
            # 부팅 시 자동 시작되도록 enable 까지 함께 켠다 (이미 enabled 면 멱등).
            if [ "$(systemctl is-enabled "$svc" 2>/dev/null || true)" != "enabled" ]; then
                echo "ℹ️  systemd 서비스 자동시작 등록(enable): $svc"
                sudo systemctl enable "$svc" 2>/dev/null || true
            fi
            echo "ℹ️  systemd 서비스 시작: $svc"
            sudo systemctl start "$svc"
            echo "✅ ${SERVER_NAME} 시작 완료 (systemd)"
            exit 0
        fi

        echo "  [1/5] 포트 사용 상태 확인 중..."
        ensure_port_available

        echo "  [2/5] .env 설정 확인 중..."
        ensure_env_ready

        echo "  [3/5] npm 의존성 확인 중..."
        ensure_runtime_dependencies_installed

        echo "  [4/5] Entity Server 연결 및 인증 확인 중..."
        verify_entity_server_credentials

        if ! runtime_entry="$(get_runtime_entry)"; then
            echo "❌ 실행할 엔트리를 찾지 못했습니다."
            echo "   src/system/index.ts, system.js, system.js 중 하나가 있어야 합니다."
            echo "   패키지가 손상됐다면 ./scripts/update-server.sh latest 를 다시 실행하세요."
            exit 1
        fi

        # 이미 실행 중인지 확인
        if [ -f "$PID_FILE" ]; then
            PID=$(cat "$PID_FILE" 2>/dev/null || true)
            if is_managed_server_pid "$PID" "$runtime_entry"; then
                echo "  ⚠️  이미 실행 중입니다 (PID $PID)"
                echo "  종료하려면: $0 stop"
                exit 0
            fi
            rm -f "$PID_FILE"
        fi

        mkdir -p "$(dirname "$LOG_FILE")"
        log_start_line=$(( $(get_log_line_count) + 1 ))
        echo "  [5/5] 서버 기동 중..."
        print_discovered_app_counts
        start_runtime_process_nohup "$runtime_entry"
        echo $! > "$PID_FILE"
        PID=$(cat "$PID_FILE")

        for _ in $(seq 1 50); do
            if is_managed_server_pid "$PID" "$runtime_entry"; then
                break
            fi

            managed_pid=$(find_active_server_pid || true)
            if [ -n "$managed_pid" ] && is_managed_server_pid "$managed_pid" "$runtime_entry"; then
                PID="$managed_pid"
                echo "$PID" > "$PID_FILE"
                break
            fi

            sleep 0.1
        done

        printf '\n  startup banner 대기 중...\n'

        if is_managed_server_pid "$PID" "$runtime_entry"; then
            print_startup_banner_from_log "$log_start_line" || true
            print_enabled_load_failures_from_log "$log_start_line"
            echo "✅ ${SERVER_NAME}가 백그라운드에서 시작되었습니다 (PID: $PID)"
            echo "상태: ./run.sh status"
            echo "중지: ./run.sh stop"
        else
            rm -f "$PID_FILE"
            echo "❌ ${SERVER_NAME} 백그라운드 시작에 실패했습니다"
            echo "로그 확인: $LOG_FILE"
            exit 1
        fi
        ;;

    stop)
        ensure_required_commands stop
        # 명시적 stop 은 부팅 자동시작도 끈다(disable). restart 는 이 경로를 타지 않으므로
        # enable 상태가 유지된다. (start=enable 과 대칭)
        stop_svc=$(find_systemd_service || true)
        if [ -n "$stop_svc" ] && [ "$(systemctl is-enabled "$stop_svc" 2>/dev/null || true)" = "enabled" ]; then
            echo "ℹ️  systemd 서비스 자동시작 해제(disable): $stop_svc"
            sudo systemctl disable "$stop_svc" 2>/dev/null || true
        fi
        stop_server
        ;;

    restart)
        ensure_required_commands start
        # 백업 서버 전파용 서비스명(상태 무관). 모든 재시작 경로에서 동일하게 사용한다.
        restart_svc=$(find_systemd_service || true)
        # systemd 서비스면 systemctl restart 로 직행한다(enable 유지, disable 하지 않음).
        # --force 일 때만 포트 기준 강제 종료 후 재기동한다.
        if [ "$FORCE_STOP" -ne 1 ]; then
            if [ -n "$restart_svc" ]; then
                svc_state=$(systemctl is-active "$restart_svc" 2>/dev/null || true)
                if [ "$svc_state" = "active" ] || [ "$svc_state" = "activating" ]; then
                    echo "ℹ️  systemd 서비스 재시작: $restart_svc"
                    sudo systemctl restart "$restart_svc"
                    propagate_restart_to_standby "$restart_svc"
                    echo "✅ ${SERVER_NAME} 재시작 완료 (systemd)"
                    exit 0
                fi
            fi
        fi
        stop_server
        propagate_restart_to_standby "$restart_svc"
        exec "$SCRIPT_DIR/run.sh" start
        ;;

    status)
        show_status
        ;;

    dev)
        ensure_required_commands dev
        # systemd 서비스로 등록된 환경에서는 dev 직접 실행을 막고 안내만 한다.
        dev_svc=$(find_systemd_service || true)
        if [ -n "$dev_svc" ]; then
            echo "ℹ️  '$dev_svc' 가 systemd 서비스로 등록되어 있어 dev 모드 실행을 막습니다."
            echo "   사용: sudo systemctl start/stop/restart $dev_svc  (또는 ./run.sh start|stop|restart)"
            echo "   dev 모드로 실행하려면 먼저 서비스를 제거하세요: sudo ./scripts/service-remove.sh"
            exit 0
        fi

        echo "  [1/5] 포트 사용 상태 확인 중..."
        ensure_port_available

        echo "  [2/5] .env 설정 확인 중..."
        ensure_env_ready

        echo "  [3/5] npm 의존성 확인 중..."
        ensure_runtime_dependencies_installed

        echo "  [4/5] Entity Server 연결 및 인증 확인 중..."
        verify_entity_server_credentials

        echo "  [5/5] 개발 서버 시작 중..."
    print_discovered_app_counts
    set -o pipefail
    npm run dev 2>&1 | monitor_enabled_load_failures_from_stream
        ;;

    *)
        echo "❌ 알 수 없는 명령: $1"
        _print_help
        exit 1
        ;;
esac
