#!/bin/bash
# update-server.sh — Entity App Server 코어 업데이트
#
# 사용법:
#   ./scripts/update-server.sh             # 도움말 + 현재/최신 버전 확인
#   ./scripts/update-server.sh latest      # 최신 태그로 업데이트
#   ./scripts/update-server.sh 0.0.8       # 특정 버전으로 업데이트
#   ./scripts/update-server.sh v0.0.8

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PACKAGE_NAME="create-entity-app-server"
VERSION_FILE="$PROJECT_ROOT/.entity-app-server-version"
PID_FILE="$PROJECT_ROOT/.entity-app-server.pid"
MANAGED_SCRIPTS=("run.sh" "entity.sh" "update-server.sh" "service-install.sh" "service-remove.sh")
MANAGED_FILES=("system.js" "system-api.js" "system-api.d.ts" "tsconfig.json" ".env.example" ".entity-app-server-build.json" ".entity-app-server-version")

cd "$PROJECT_ROOT"

if [ ! -f "$PROJECT_ROOT/system.js" ]; then
    echo "❌ 이 스크립트는 create-entity-app-server 로 생성된 프로젝트 루트에서 실행해야 합니다."
    echo "   현재 위치: $PROJECT_ROOT"
    exit 1
fi

trim() {
    echo "$1" | tr -d '[:space:]'
}

normalize_version() {
    local raw="$1"
    raw="${raw#v}"
    echo "$raw"
}

is_semver() {
    [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

compare_versions() {
    local left="$1"
    local right="$2"

    if [ "$left" = "$right" ]; then
        echo 0
        return
    fi

    local smallest
    smallest=$(printf '%s\n%s\n' "$left" "$right" | sort -V | head -n 1)
    if [ "$smallest" = "$left" ]; then
        echo -1
    else
        echo 1
    fi
}

current_core_version() {
    if [ -f "$VERSION_FILE" ]; then
        local value
        value=$(trim "$(cat "$VERSION_FILE" 2>/dev/null || true)")
        value=$(normalize_version "$value")
        if [[ "$value" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            echo "$value"
            return
        fi
    fi
    echo "(알 수 없음)"
}

fetch_text() {
    local url="$1"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$url"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO- "$url"
    else
        echo "❌ curl 또는 wget 이 필요합니다." >&2
        exit 1
    fi
}

download_file() {
    local url="$1"
    local dest="$2"
    local tmp="${dest}.tmp"

    if command -v curl >/dev/null 2>&1; then
        curl -fsSL --retry 3 -o "$tmp" "$url"
    elif command -v wget >/dev/null 2>&1; then
        wget -q -O "$tmp" "$url"
    else
        echo "❌ curl 또는 wget 이 필요합니다." >&2
        exit 1
    fi

    mv "$tmp" "$dest"
}

latest_core_version() {
    local latest
    latest=$(fetch_text "https://registry.npmjs.org/${PACKAGE_NAME}/latest" | node -e 'const fs = require("fs"); const data = JSON.parse(fs.readFileSync(0, "utf8")); process.stdout.write(data.version || "");')

    if [ -z "$latest" ]; then
        echo "❌ 최신 패키지 버전을 가져오지 못했습니다." >&2
        exit 1
    fi

    echo "$latest"
}

print_version_status() {
    local current
    local latest

    echo "🔍 버전 확인 중..."
    current="$(current_core_version)"
    latest="$(latest_core_version)"

    echo ""
    echo "  현재 코어 버전: v${current}"
    echo "  최신 패키지 버전: v${latest}"
    echo ""

    if [ "$current" = "$latest" ]; then
        echo "✅ 최신 버전입니다."
    elif is_semver "$current" && [ "$(compare_versions "$current" "$latest")" = "1" ]; then
        echo "ℹ️  현재 코어가 npm 최신 버전보다 더 새롭습니다."
    else
        echo "💡 업데이트 가능: ./scripts/update-server.sh latest"
    fi
}

package_tarball_url() {
    local version="$1"
    local tarball
    tarball=$(fetch_text "https://registry.npmjs.org/${PACKAGE_NAME}/${version}" | node -e 'const fs = require("fs"); const data = JSON.parse(fs.readFileSync(0, "utf8")); process.stdout.write(data.dist?.tarball || "");')

    if [ -z "$tarball" ]; then
        echo "❌ ${PACKAGE_NAME}@${version} 패키지 tarball URL을 찾지 못했습니다." >&2
        exit 1
    fi

    echo "$tarball"
}

get_server_port() {
    local config_port
    local env_port=""

    if [ -f ".env" ]; then
        env_port=$(grep '^SERVER_PORT=' .env | tail -n 1 | cut -d '=' -f2-)
        if [ -z "$env_port" ]; then
            env_port=$(grep '^PORT=' .env | tail -n 1 | cut -d '=' -f2-)
        fi
    fi

    env_port=$(trim "$env_port")
    if [[ "$env_port" =~ ^[0-9]+$ ]] && [ "$env_port" -gt 0 ]; then
        echo "$env_port"
        return
    fi

    if [ -f "$PROJECT_ROOT/configs/server.json" ]; then
        config_port=$(grep -E '"port"[[:space:]]*:' "$PROJECT_ROOT/configs/server.json" | head -n 1 | sed -E 's/.*:[[:space:]]*([0-9]+).*/\1/')
        config_port=$(trim "$config_port")
        if [[ "$config_port" =~ ^[0-9]+$ ]] && [ "$config_port" -gt 0 ]; then
            echo "$config_port"
            return
        fi
    fi

    echo "3000"
}

find_running_pids() {
    local pid_list=()

    if [ -f "$PID_FILE" ]; then
        local pid
        pid=$(trim "$(cat "$PID_FILE" 2>/dev/null || true)")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            pid_list+=("$pid")
        fi
    fi

    local port
    port=$(get_server_port)
    while IFS= read -r pid; do
        [ -n "$pid" ] && pid_list+=("$pid")
    done < <(ss -ltnp 2>/dev/null | sed -n "s/.*:${port} .*pid=\([0-9]\+\).*/\1/p" | sort -u)

    printf '%s\n' "${pid_list[@]}" | awk 'NF && !seen[$0]++'
}

ensure_server_stopped() {
    mapfile -t running_pids < <(find_running_pids)
    if [ "${#running_pids[@]}" -eq 0 ]; then
        return 0
    fi

    echo ""
    echo "⚠️  현재 Entity App Server가 실행 중입니다."
    ps -p "${running_pids[0]}" -o pid,etime,cmd --no-headers 2>/dev/null || true
    echo ""
    read -r -p "업데이트를 위해 서버를 중지할까요? [y/N]: " input
    input=$(echo "$input" | tr '[:upper:]' '[:lower:]')

    if [ "$input" != "y" ] && [ "$input" != "yes" ]; then
        echo "❌ 업데이트를 취소했습니다."
        exit 1
    fi

    if [ -x "$PROJECT_ROOT/scripts/run.sh" ]; then
        "$PROJECT_ROOT/scripts/run.sh" stop || true
    else
        for pid in "${running_pids[@]}"; do
            kill "$pid" 2>/dev/null || true
        done
    fi

    sleep 0.2
    mapfile -t running_pids < <(find_running_pids)
    if [ "${#running_pids[@]}" -gt 0 ]; then
        echo "❌ 서버 중지에 실패했습니다. 업데이트를 중단합니다."
        exit 1
    fi

    rm -f "$PID_FILE"
    echo "✅ 서버 중지 완료"
}

sync_package_json() {
    local upstream_pkg="$1"
    local target_pkg="$PROJECT_ROOT/package.json"

    [ -f "$target_pkg" ] || return 0
    [ -f "$upstream_pkg" ] || return 0

    node - "$target_pkg" "$upstream_pkg" <<'NODE'
const fs = require("fs");

const [targetPath, upstreamPath] = process.argv.slice(2);
const target = JSON.parse(fs.readFileSync(targetPath, "utf8"));
const upstream = JSON.parse(fs.readFileSync(upstreamPath, "utf8"));

const preserved = [
  "name",
  "version",
  "private",
  "description",
  "keywords",
  "author",
  "license",
  "repository",
  "bugs",
  "homepage"
];

const synced = [
  "type",
  "dependencies",
  "optionalDependencies",
  "devDependencies",
  "engines",
  "os",
  "cpu"
];

const managedScriptKeys = new Set([
    "dev",
    "start",
    "build",
    "pack:npm",
    "test"
]);

const next = { ...target };

for (const key of synced) {
  if (Object.prototype.hasOwnProperty.call(upstream, key)) {
    next[key] = upstream[key];
  }
}

for (const key of preserved) {
  if (Object.prototype.hasOwnProperty.call(target, key)) {
    next[key] = target[key];
  }
}

const targetScripts =
    target.scripts && typeof target.scripts === "object" ? target.scripts : {};
const preservedScripts = Object.fromEntries(
    Object.entries(targetScripts).filter(([key]) => {
        return !managedScriptKeys.has(key) && !key.startsWith("build:");
    })
);

next.scripts = {
    ...preservedScripts,
    dev: "tsx watch system.js",
    start: "node system.js"
};

fs.writeFileSync(targetPath, `${JSON.stringify(next, null, 2)}\n`);
NODE
}

repair_known_script_regressions() {
    local run_script="$PROJECT_ROOT/scripts/run.sh"

    [ -f "$run_script" ] || return 0

    if grep -q 'local_runtime_entry=""' "$run_script"; then
        perl -0pi -e 's/local_runtime_entry=""/runtime_entry=""/g; s/local log_start_line=""/log_start_line=""/g; s/local_runtime_entry="\$\(get_runtime_entry\)"/runtime_entry="\$\(get_runtime_entry\)"/g; s/\$local_runtime_entry/\$runtime_entry/g' "$run_script"
        chmod +x "$run_script"
        echo "    ↺ scripts/run.sh 회귀 보정 적용"
    fi
}

install_version() {
    local target_ver
    target_ver=$(normalize_version "$1")
    local current_ver
    current_ver=$(current_core_version)

    ensure_server_stopped

    local url
    url=$(package_tarball_url "$target_ver")
    local tmp_tar="/tmp/entity-app-server-${target_ver}.tar.gz"
    local tmp_dir="/tmp/entity-app-server-${target_ver}"

    echo ""
    echo "📦 ${PACKAGE_NAME}@${target_ver} 다운로드 중..."
    download_file "$url" "$tmp_tar"

    rm -rf "$tmp_dir"
    mkdir -p "$tmp_dir"
    tar -xzf "$tmp_tar" -C "$tmp_dir"

    local src_root
    src_root=$(find "$tmp_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)
    if [ -z "$src_root" ]; then
        echo "❌ 다운로드한 아카이브를 해제하지 못했습니다."
        rm -rf "$tmp_dir" "$tmp_tar"
        exit 1
    fi

    local template_root="$src_root/dist"
    if [ ! -d "$template_root" ]; then
        echo "❌ ${PACKAGE_NAME}@${target_ver} 패키지에 dist 가 없습니다."
        rm -rf "$tmp_dir" "$tmp_tar"
        exit 1
    fi

    echo ""
    echo "  코어 파일 동기화:"
    for file in "${MANAGED_FILES[@]}"; do
        if [ -e "$template_root/$file" ]; then
            cp -R "$template_root/$file" "$PROJECT_ROOT/$file"
            printf '    ✔ %s\n' "$file"
        fi
    done

    mkdir -p "$PROJECT_ROOT/scripts"
    for script in "${MANAGED_SCRIPTS[@]}"; do
        if [ -f "$template_root/scripts/$script" ]; then
            cp "$template_root/scripts/$script" "$PROJECT_ROOT/scripts/$script"
            chmod +x "$PROJECT_ROOT/scripts/$script"
            printf '    ✔ scripts/%s\n' "$script"
        fi
    done

    if [ -d "$template_root/docs" ]; then
        mkdir -p "$PROJECT_ROOT/docs"
        cp -R "$template_root/docs/." "$PROJECT_ROOT/docs/"
        echo "    ✔ docs/"
    fi

    repair_known_script_regressions

    sync_package_json "$src_root/package.json"
    if [ -f "$PROJECT_ROOT/package.json" ]; then
        echo ""
        echo "  npm install 실행 중..."
        npm install
    fi

    rm -rf "$tmp_dir" "$tmp_tar"

    echo ""
    echo "✅ 업데이트 완료: v${current_ver} → v${target_ver}"
    echo "   필요하면 다시 실행: ./scripts/run.sh dev"
}

ARG="${1:-}"

case "$ARG" in
    "")
        echo "update-server.sh — Entity App Server 코어 업데이트"
        echo ""
        echo "사용법:"
        echo "  ./scripts/update-server.sh latest"
        echo "  ./scripts/update-server.sh <버전>"
        echo ""
        echo "업데이트 대상: system.js / system-api.js / scripts(run/entity/update/service) / docs / tsconfig.json / .env.example / package.json(deps)"
        echo "보존 대상: app/ / configs/ / .env / package.json의 name/version/private"
        echo ""
        print_version_status
        ;;

    "latest")
        echo "🔍 최신 버전 확인 중..."
        CURRENT="$(current_core_version)"
        LATEST="$(latest_core_version)"
        if is_semver "$CURRENT" && [ "$(compare_versions "$CURRENT" "$LATEST")" = "1" ]; then
            echo "ℹ️  현재 코어(v${CURRENT})가 npm 최신 버전(v${LATEST})보다 더 새롭습니다. 다운그레이드하지 않습니다."
            exit 0
        fi
        install_version "$LATEST"
        ;;

    *)
        install_version "$ARG"
        ;;
esac