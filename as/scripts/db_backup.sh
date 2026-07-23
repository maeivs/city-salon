#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
BACKUP_DIR="$PROJECT_DIR/.backup"

DDL_ONLY_TABLES=()
DB_HOST=""
DB_PORT=""
DB_NAME=""
DB_USER=""
DB_PASSWORD=""
DB_CLIENT_CMD=""
DUMP_CMD=""
OUTPUT_FILE=""
IGNORE_TABLE_ARGS=()
DB_SSL_ARGS=("--skip-ssl")

cd "$PROJECT_DIR"

# 사용법을 출력합니다.
print_usage() {
    cat <<EOF
Usage:
    ./db_backup.sh
EOF
}

# 사용 가능한 명령을 찾습니다.
find_command() {
    local command_name=""

    for command_name in "$@"; do
        if command -v "$command_name" >/dev/null 2>&1; then
            echo "$command_name"
            return 0
        fi
    done

    return 1
}

# 무인자 실행만 허용합니다.
validate_args() {
    if [[ $# -ne 0 ]]; then
        print_usage >&2
        exit 1
    fi
}

# .env 파일이 있으면 현재 셸 환경으로 로드합니다.
load_environment() {
    if [[ -f "$ENV_FILE" ]]; then
        set -o allexport
        source "$ENV_FILE"
        set +o allexport
    fi
}

# .env 의 DB_* 값을 직접 읽어 실제 접속 설정을 구성합니다.
resolve_database_config() {
    local env_suffix="${NODE_ENV:-development}"
    local host_var=""
    local port_var=""
    local name_var=""
    local user_var=""
    local password_var=""

    env_suffix="${env_suffix^^}"
    host_var="DB_HOST_${env_suffix}"
    port_var="DB_PORT_${env_suffix}"
    name_var="DB_NAME_${env_suffix}"
    user_var="DB_USER_${env_suffix}"
    password_var="DB_PASSWORD_${env_suffix}"

    DB_HOST="${!host_var-}"
    DB_PORT="${!port_var-}"
    DB_NAME="${!name_var-}"
    DB_USER="${!user_var-}"
    DB_PASSWORD="${!password_var-}"

    if [[ -z "$DB_HOST" && "$env_suffix" != "DEVELOPMENT" ]]; then
        DB_HOST="${DB_HOST_DEVELOPMENT:-127.0.0.1}"
        DB_PORT="${DB_PORT_DEVELOPMENT:-3306}"
        DB_NAME="${DB_NAME_DEVELOPMENT:-}"
        DB_USER="${DB_USER_DEVELOPMENT:-}"
        DB_PASSWORD="${DB_PASSWORD_DEVELOPMENT:-}"
    fi

    DB_HOST="${DB_HOST:-127.0.0.1}"
    DB_PORT="${DB_PORT:-3306}"

    if [[ -z "$DB_NAME" || -z "$DB_USER" ]]; then
        echo "[db_backup.sh] DB_*_${env_suffix} values are required in .env." >&2
        exit 1
    fi
}

# DB 조회와 덤프에 사용할 CLI를 결정합니다.
resolve_db_commands() {
    DB_CLIENT_CMD="$(find_command mariadb mysql || true)"
    DUMP_CMD="$(find_command mariadb-dump mysqldump || true)"

    if [[ -z "$DB_CLIENT_CMD" ]]; then
        echo "[db_backup.sh] mariadb or mysql command is required." >&2
        exit 1
    fi

    if [[ -z "$DUMP_CMD" ]]; then
        echo "[db_backup.sh] mariadb-dump or mysqldump command is required." >&2
        exit 1
    fi
}

# `_log` 패턴 테이블을 조회해 DDL 전용 목록을 구성합니다.
collect_ddl_only_tables() {
    local query=""

    query=$(cat <<SQL
SELECT TABLE_NAME
FROM information_schema.tables
WHERE table_schema = '${DB_NAME//\'/\'\'}'
  AND table_type = 'BASE TABLE'
    AND RIGHT(table_name, 4) = '_log'
ORDER BY table_name;
SQL
)

    mapfile -t DDL_ONLY_TABLES < <(
        MYSQL_PWD="$DB_PASSWORD" "$DB_CLIENT_CMD" \
            "${DB_SSL_ARGS[@]}" \
            --batch \
            --skip-column-names \
            --host="$DB_HOST" \
            --port="$DB_PORT" \
            --user="$DB_USER" \
            "$DB_NAME" \
            --execute "$query"
    )
}

# 데이터 덤프에서 제외할 `_log` 테이블 인자를 만듭니다.
build_ignore_table_args() {
    local table_name=""

    IGNORE_TABLE_ARGS=()
    for table_name in "${DDL_ONLY_TABLES[@]}"; do
        [[ -n "$table_name" ]] || continue
        IGNORE_TABLE_ARGS+=("--ignore-table=${DB_NAME}.${table_name}")
    done
}

# 기본 출력 파일 경로를 결정합니다.
resolve_output_file() {
    mkdir -p "$BACKUP_DIR"
    OUTPUT_FILE="$BACKUP_DIR/$(date +%y%m%d)_${DB_NAME}.sql"
}

# 전체 스키마를 먼저 백업합니다.
dump_schema_only() {
    MYSQL_PWD="$DB_PASSWORD" "$DUMP_CMD" \
        "${DB_SSL_ARGS[@]}" \
        --host="$DB_HOST" \
        --port="$DB_PORT" \
        --user="$DB_USER" \
        --default-character-set=utf8mb4 \
        --single-transaction \
        --routines \
        --events \
        --triggers \
        --no-data \
        "$DB_NAME" > "$OUTPUT_FILE"
}

# `_log` 테이블을 제외한 나머지 데이터만 추가 백업합니다.
dump_data_only() {
    MYSQL_PWD="$DB_PASSWORD" "$DUMP_CMD" \
        "${DB_SSL_ARGS[@]}" \
        --host="$DB_HOST" \
        --port="$DB_PORT" \
        --user="$DB_USER" \
        --default-character-set=utf8mb4 \
        --single-transaction \
        --quick \
        --skip-triggers \
        --no-create-info \
        "$DB_NAME" \
        "${IGNORE_TABLE_ARGS[@]}" >> "$OUTPUT_FILE"
}

# 백업 대상 정보를 출력합니다.
print_summary() {
    local table_name=""

    echo "[db_backup.sh] backup file: $OUTPUT_FILE"
    echo "[db_backup.sh] database: $DB_NAME@$DB_HOST:$DB_PORT"
    echo "[db_backup.sh] ddl-only _log tables:"

    if [[ ${#DDL_ONLY_TABLES[@]} -eq 0 ]]; then
        echo "[db_backup.sh]   (none)"
        return
    fi

    for table_name in "${DDL_ONLY_TABLES[@]}"; do
        echo "[db_backup.sh]   - $table_name"
    done
}

# 전체 스키마와 `_log` 제외 데이터를 하나의 SQL 파일로 백업합니다.
main() {
    validate_args "$@"
    load_environment
    resolve_database_config
    resolve_db_commands
    collect_ddl_only_tables
    build_ignore_table_args
    resolve_output_file
    print_summary
    dump_schema_only
    dump_data_only
    echo "[db_backup.sh] backup completed."
}

main "$@"