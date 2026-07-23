# gl-accounts — 표준 계정과목 플러그인

대차대조표(재무상태표)·손익계산서 표준 계정과목과 거래항목별 매핑을 제공하는
정적 참조 데이터 플러그인입니다. 외부 동기화 없이 부팅 시 entities/ 기본값으로 적재됩니다.

데이터 출처: klkorea.net 계정과목표 (대차대조표 자산/부채/자본, 손익계산서
매출액/매출원가/판매비와관리비/영업외수익/영업외비용, 거래항목별 계정과목).

## 엔티티

`index_table_only` 마스터 엔티티이며, 사이드카 기본값(`reset_defaults`)으로 자동 적재됩니다.

### gl_accounts (230건)
| 필드 | 설명 |
|---|---|
| code | 계정과목 코드 (uint, unique) 예: 10100 |
| account_name | 계정과목명 예: 현금 |
| std_name | 기업회계기준 제출용 명칭 예: 현금및현금등가물 |
| statement | 재무제표 구분: 재무상태표 / 손익계산서 |
| sub_category | 하위 구분: 자산/부채/자본/매출액/매출원가/판매비와관리비/영업외수익/영업외비용 |
| classification | 회계 분류 예: 당좌자산, 유동부채, 유형자산 (손익계산서는 비어 있을 수 있음) |
| account_level | 계층: 1=대분류(헤더), 2=세부 |

### gl_account_items (264건)
| 필드 | 설명 |
|---|---|
| tran_item | 거래항목명 예: 가계수표, 가로등 |
| account_name | 매핑 계정과목명 예: 현금 |
| account_code | 매핑 계정과목 코드 (gl_accounts.code 참조) |

## API (`/v1/gl-accounts`)

읽기 전용. 응답은 `{ items, total, page, limit }` 형태(단건은 객체).

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/v1/gl-accounts` | 계정과목 목록. 쿼리: `statement`, `sub_category`, `classification`, `level`(1/2), `q`(명칭검색), `page`, `limit` |
| GET | `/v1/gl-accounts/:code` | 코드 단건 조회 예: `/v1/gl-accounts/10100` |
| GET | `/v1/gl-accounts/items` | 거래항목별 매핑. 쿼리: `account_code`, `q`, `page`, `limit` |
| GET | `/v1/gl-accounts/items/lookup?q=가계수표` | 거래항목명 부분일치 검색(자동완성용) |
| GET | `/v1/gl-accounts/items/by-tran?name=검사비(수입시)` | 거래항목명 완전일치 → 매핑 계정과목 목록. 1:N이면 `accounts` 배열로 반환 |

### 예시
```
GET /v1/gl-accounts?statement=재무상태표&sub_category=자산&level=1
GET /v1/gl-accounts?q=예금
GET /v1/gl-accounts/10100
GET /v1/gl-accounts/items?account_code=10100
GET /v1/gl-accounts/items/lookup?q=가계수표
GET /v1/gl-accounts/items/by-tran?name=검사비(수입시)
```

## 검색 (n-gram)

`gl_accounts.account_name`/`std_name`, `gl_account_items.tran_item`/`account_name` 필드는
엔티티 스키마에서 `search: true` 로 선언되어 **n-gram(기본 2글자) 부분검색**을 지원합니다.
별도 검색 토큰 테이블(`entity_search_<entity>`)에 토큰이 적재됩니다.

API의 `q` 파라미터는 검색어가 2글자 이상이면 엔티티 서버 n-gram 검색에 위임하고,
1글자면 소규모 마스터 특성상 JS 부분일치로 폴백합니다. 따라서 별도 설정 없이
`?q=예금`, `?q=검사` 같은 부분검색이 동작합니다.

## 데이터 갱신

기본값을 수정하려면 `entities/defaults/*.defaults.json` 을 편집하세요.
`reset_defaults_quiet: true` 이므로 부팅 시 기본값 기준으로 재적재됩니다.
