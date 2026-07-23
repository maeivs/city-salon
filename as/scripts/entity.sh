#!/bin/bash
# entity.sh — Entity App Server 엔티티 테이블 관리
#
# entities/ 폴더의 JSON 스키마를 entity-server HTTP API로 생성/초기화/비우기합니다.
# (.env의 ENTITY_SERVER_URL + ENTITY_API_KEY 사용)
#
# 사용법:
#   ./scripts/entity.sh --entity=<name> [--reset|--truncate] [--apply]
#
# 옵션:
#   --entity=<name>  엔티티명 (생략 시 전체 대상)
#   --reset          테이블 드롭 후 재생성
#   --truncate       데이터 전체 삭제 + AUTO_INCREMENT 초기화
#   --apply          실제 실행 (기본은 dry-run)
#
# 예제:
#   ./scripts/entity.sh --entity=llm_conversation --apply
#   ./scripts/entity.sh --entity=llm_conversation --reset --apply
#   ./scripts/entity.sh --entity=llm_conversation --truncate --apply
#   ./scripts/entity.sh --apply   (전체 엔티티 생성)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# .env 로드
[ -f ".env" ] && set -o allexport && source .env && set +o allexport

# ── 도움말 ────────────────────────────────────────────────────────────────────
_show_help() {
    echo ""
    echo "  Entity App Server 엔티티 테이블 관리"
    echo "  ==================================="
    echo ""
    echo "  사용법: $0 --entity=<name> [--reset|--truncate] [--apply]"
    echo ""
    echo "  옵션:"
    echo "    --entity=<name>   엔티티명 (생략 시 전체 대상)"
    echo "    --reset           테이블 드롭 후 재생성"
    echo "    --truncate        데이터 전체 삭제 + AUTO_INCREMENT 초기화"
    echo "    --apply           실제 실행 (기본은 dry-run)"
    echo ""
    echo "  예제:"
    echo "    $0 --entity=llm_conversation --apply          # 테이블 생성"
    echo "    $0 --entity=llm_conversation --reset --apply  # 드롭 후 재생성"
    echo "    $0 --entity=llm_conversation --truncate --apply  # 데이터 비우기"
    echo "    $0 --apply                                    # 전체 엔티티 생성"
    echo ""
}

if [ $# -eq 0 ]; then
    _show_help
    exit 0
fi

# ── 인자 파싱 ─────────────────────────────────────────────────────────────────
ENTITY_NAME=""
ACTION="create"   # create | reset | truncate
DRY_RUN=true

for arg in "$@"; do
    case "$arg" in
        --entity=*) ENTITY_NAME="${arg#--entity=}" ;;
        --reset)    ACTION="reset" ;;
        --truncate) ACTION="truncate" ;;
        --apply)    DRY_RUN=false ;;
        --dry-run)  DRY_RUN=true ;;
        *)
            echo "❌ 알 수 없는 옵션: $arg"
            _show_help
            exit 1
            ;;
    esac
done

# ── 환경변수 확인 ─────────────────────────────────────────────────────────────
if [ -z "${ENTITY_SERVER_URL:-}" ]; then
    echo "❌ ENTITY_SERVER_URL이 설정되지 않았습니다 (.env 확인)"
    exit 1
fi
if [ -z "${ENTITY_API_KEY:-}" ]; then
    echo "❌ ENTITY_API_KEY가 설정되지 않았습니다 (.env 확인)"
    exit 1
fi

# ── HTTP 헬퍼 ────────────────────────────────────────────────────────────────
if command -v curl &>/dev/null; then
    _post_json() { curl -sS -X POST -H "Authorization: Bearer $ENTITY_API_KEY" -H "Content-Type: application/json" --data-binary @"$1" "$2" 2>&1; }
    _post()      { curl -sS -X POST -H "Authorization: Bearer $ENTITY_API_KEY" "$1" 2>&1; }
elif command -v wget &>/dev/null; then
    _post_json() { wget -qO- --method=POST --header="Authorization: Bearer $ENTITY_API_KEY" --header="Content-Type: application/json" --body-file="$1" "$2" 2>&1; }
    _post()      { wget -qO- --method=POST --header="Authorization: Bearer $ENTITY_API_KEY" "$1" 2>&1; }
else
    echo "❌ curl 또는 wget이 필요합니다."
    exit 1
fi

# ── 단일 엔티티 작업 ─────────────────────────────────────────────────────────
_run_entity() {
    local name="$1"
    local schema_file
    schema_file=$(find "$PROJECT_ROOT/entities" -iname "${name}.json" | head -1)

    case "$ACTION" in
        create)
            if [ -z "$schema_file" ]; then
                echo "  ✗ $name — 스키마 파일 없음 (entities/${name}.json)"
                return 1
            fi
            if [ "$DRY_RUN" = true ]; then
                echo "  [dry-run] create: $name  (${schema_file#$PROJECT_ROOT/})"
                return 0
            fi
            response=$(_post_json "$schema_file" "${ENTITY_SERVER_URL}/v1/admin/${name}/create" 2>&1)
            ;;
        reset)
            if [ "$DRY_RUN" = true ]; then
                echo "  [dry-run] reset: $name"
                return 0
            fi
            response=$(_post "${ENTITY_SERVER_URL}/v1/admin/${name}/reset?confirm=RESET_${name}" 2>&1)
            ;;
        truncate)
            if [ "$DRY_RUN" = true ]; then
                echo "  [dry-run] truncate: $name"
                return 0
            fi
            response=$(_post "${ENTITY_SERVER_URL}/v1/admin/${name}/truncate?confirm=TRUNCATE_${name}" 2>&1)
            ;;
    esac

    if echo "$response" | grep -q '"ok":true'; then
        echo "  ✓ ${ACTION}: $name"
    else
        echo "  ✗ ${ACTION}: $name"
        echo "    $(echo "$response" | head -3)"
        return 1
    fi
}

# ── 플러그인 활성화 여부 확인 ─────────────────────────────────────────────────
# entities/{plugin}/ 서브폴더에 대응하는 src/app/plugins/{plugin}/config.json 의
# enabled 값을 확인한다. config.json 이 없거나 enabled 가 true(기본값)이면 0 반환.
_plugin_enabled() {
    local plugin="$1"
    local config="$PROJECT_ROOT/src/app/plugins/${plugin}/config.json"
    [ -f "$config" ] || return 0  # config 없으면 활성화 간주
    python3 -c "
import json, sys
try:
    d = json.load(open('$config'))
except Exception:
    sys.exit(0)
sys.exit(0 if d.get('enabled', True) else 1)
" 2>/dev/null
}

# ── 실행 ─────────────────────────────────────────────────────────────────────
ENTITIES_DIR="$PROJECT_ROOT/entities"
if [ ! -d "$ENTITIES_DIR" ]; then
    echo "❌ entities/ 폴더가 없습니다: $ENTITIES_DIR"
    exit 1
fi

echo ""
echo "  entity ${ACTION}  |  서버: ${ENTITY_SERVER_URL}"
echo ""

if [ -n "$ENTITY_NAME" ]; then
    # 단일 엔티티
    _run_entity "$ENTITY_NAME"
else
    # --entity 없이 --reset / --truncate 는 안내 후 종료
    if [ "$ACTION" != "create" ]; then
        echo "  ⚠️  --reset / --truncate 는 --entity=<name> 이 필요합니다."
        echo ""
        exit 1
    fi

    # 전체 엔티티 create
    SCHEMA_FILES=$(find "$ENTITIES_DIR" -name "*.json" | sort)
    if [ -z "$SCHEMA_FILES" ]; then
        echo "  등록할 엔티티 스키마 파일이 없습니다."
        exit 0
    fi

    if [ "$DRY_RUN" = true ]; then
        echo "  [dry-run] 생성 대상:"
        while IFS= read -r f; do
            parent="$(dirname "$f")"
            plugin="$(basename "$parent")"
            if [ "$parent" != "$ENTITIES_DIR" ] && ! _plugin_enabled "$plugin"; then
                echo "    ⏭  ${f#$PROJECT_ROOT/}  (plugin '$plugin' disabled)"
            else
                echo "    - ${f#$PROJECT_ROOT/}"
            fi
        done <<< "$SCHEMA_FILES"
        echo ""
        echo "  실제 실행: $0 --apply"
        echo ""
        exit 0
    fi

    SUCCESS=0; FAIL=0; SKIP=0
    while IFS= read -r schema_file; do
        parent="$(dirname "$schema_file")"
        plugin="$(basename "$parent")"
        if [ "$parent" != "$ENTITIES_DIR" ] && ! _plugin_enabled "$plugin"; then
            echo "  ⏭  skip: $(basename "$schema_file" .json)  (plugin '$plugin' disabled)"
            SKIP=$((SKIP+1))
            continue
        fi
        name=$(basename "$schema_file" .json)
        _run_entity "$name" && SUCCESS=$((SUCCESS+1)) || FAIL=$((FAIL+1))
    done <<< "$SCHEMA_FILES"
    echo ""
    echo "  완료: 성공 ${SUCCESS}, 실패 ${FAIL}, 스킵 ${SKIP}"
fi

echo ""
