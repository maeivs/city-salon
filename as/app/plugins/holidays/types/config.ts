/** 플러그인 디렉토리의 config.json 스키마 */
export interface HolidaysConfig {
    enabled: boolean; // 공휴일 동기화 활성화 여부
    cron: string; // 실행 주기 — 5-필드 crontab 형식 (분 시 일 월 요일)
    yearsAhead: number; // 현재 연도 기준 몇 년 앞까지 미리 동기화할지
    entity: string; // 공휴일 데이터를 저장할 엔티티 이름
    apiKey?: string; // data.go.kr API 키 (디코딩된 값). ${DATAGOKR_API_KEY} 형식으로 환경변수 참조 가능
}
