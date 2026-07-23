# 개발 지침

이 프로젝트(city-salon)는 ehfuse/project-template(codeshop 과 동일한 Entity 스택 ES/AS/www)을 기반으로 시작한 저장소다.
스택 공통 규칙은 이 문서가 소유하고, city-salon 도메인 규칙은 작업이 진행되며 여기에 누적한다.

## 기억해야 할 규칙 저장

- 대화중 기억해야 할 것들은 tmp 에만 저장하지 말고 다음 채팅세션에서도 이용할 수 있도록 이 문서에 기록할것.
- 이후에도 반복해서 써야 할 작업 규칙이나 구조 규칙은 요청 처리 후 AGENTS.md 에 바로 추가할것.
- 새 작업을 시작하기 전에 항상 AGENTS.md 규칙부터 다시 확인할것.
- 새 유틸 함수를 만들기 전에는 반드시 기존 공용 유틸을 먼저 검색할것.

## 프로젝트 구조

| 약어 | 전체 이름         | 경로 | 상태                                             |
| ---- | ----------------- | ---- | ------------------------------------------------ |
| www  | 사용자 웹 (React) | www/ | 초기 세팅 완료                                   |
| as   | Entity App Server | as/  | 초기 세팅 완료 (`create-entity-app-server` 생성) |
| es   | Entity Server     | es/  | (예정 — codeshop 구조와 동일)                    |

- `www` → `as`: `entity-client` 패키지로 통신한다.
- `as` → `es`: apikey + hmac 인증으로 통신한다.
- `es`의 모든 라우트는 `as`가 proxy로 bypass한다. `www`는 `as`를 통해 `es` 라우트를 직접 사용할 수 있다.
- 참조 구현이 필요하면 codeshop 레포(`d:\project\codeshop`)의 동일 계층을 기준으로 삼되, codeshop 도메인(장례/POS/e-iris) 전용 로직은 가져오지 않는다.

### www 기본 규칙

> **www 작업 후에는 반드시 타입체크까지 완료해라.**
> ⚠️ www 타입체크는 `npx tsc --noEmit` 을 쓰지 마라 — 루트 `tsconfig.json` 이 `"files": []` + references 구조라 **아무 파일도 검사하지 않고 조용히 통과**한다. 반드시 `npx tsc -p tsconfig.app.json --noEmit` 으로 검사한다.

- www 의 정적 원본 자산은 `static/city-salon/...` 아래에 두고, 빌드 시 `public/city-salon/...` 로 복사되며, 브라우저 런타임 경로는 개발/운영 모두 `/city-salon/...` 를 사용한다. (vite `publicDir=static`, 프로젝트 슬러그는 `city-salon`)
- www 의 API base path 는 개발/운영 모두 항상 `/api` 로 고정한다. 개발은 Vite proxy, 운영은 nginx proxy 가 `/api` 를 AS 로 전달하고, `BASE_URL` 은 정적 자산 URL 용도로만 사용한다.
- www 가 상대 경로 `/api` 를 baseUrl 로 써서 realtime WebSocket도 dev 서버를 거칠 때는 Vite `/api` proxy 에 반드시 `ws: true` 를 켠다.
- ⚠️ **www 프로덕션 빌드는 오직 `npm run build`(`scripts/build-production.mjs`, 임시 디렉터리 빌드 + 원자 교체)로만 실행한다. 직접 `vite build`/`npx vite build` 는 절대 금지다.** vite 는 `BUILD_OUT_DIR` 미지정 시 실서비스 `public/` 을 시작 즉시 비우고 수 분간 그 위에 써서 접속자 전원이 403/500 을 본다. vite.config 의 `resolveBuildOutDir` 가드가 이를 throw 로 차단하고 있으니 **가드를 제거·우회하거나 `BUILD_OUT_DIR=public` 을 수동 지정하는 것도 금지다.**
- 로컬 dev 는 `.env` 의 `DEV_HOST=city-salon.localhost`, `SERVER_PORT=5174` 로 codeshop dev(dev.localhost:5173)와 쿠키/포트를 분리한다.
- MediaPipe/pdfjs 정적 자산은 `postinstall` 스크립트(`scripts/setup-mediapipe.mjs`, `setup-pdfjs.mjs`)가 `npm install` 때 자동으로 `static/` 에 채운다. 수동 실행이 필요 없고, 커밋 대상이 아니다.

---

## 역할

너는 이 프로젝트의 수석 풀스택 개발자다.

- 변경 요청 시 반드시 기존 코드 패턴을 먼저 파악한 뒤 일관성을 유지하며 구현하라.
- 요청 범위를 벗어난 리팩터링, 기능 추가, 주석 삽입은 하지 말라.

---

## DATABASE

- 접속정보는 `.env` 파일에 있다.
- PK는 `seq`로 사용해라.
- 시간 필드는 `_time` 패턴으로 해라. (예: `created_time`)
- 테이블이 변경되면 DDL 문서를 만들고, 실제 DB에도 `ALTER TABLE`로 수정해라.
- 테이블 설명은 반드시 한글로 추가하고, 모든 필드에도 한글 코멘트를 추가해라.
- 실제 DB에 코멘트가 없는 필드가 있으면 추가해라.

---

## Entity 설정 (.json)

- 시간필드는 `_time` 패턴으로 해라.
- 날짜/일시 컬럼은 ES 원본 기준으로 `date`, `*_date` 는 DATE, `time`, `datetime`, `*_time`, `*_at` 은 DATETIME 으로 자동 추론된다.
- 전역에서 사용되는 데이터 엔티티는 license_scope: false 로 하고 history: false 로 해라.
- hash: true 면 index: true 필요없다. 무조건 idx 에 hash 로 들어간다.
- unique: true 면 같은 필드에 index: true 를 다시 쓰지 않는다. 유니크 인덱스가 함께 생성되기 때문이다.
- hash: true 와 unique: true 는 별개다. 평문 유니크면 unique: true 만 쓰고, 해시 저장 + 유니크가 필요하면 hash: true 와 unique: true 를 함께 선언한다.
- 검색이 필요한 정보만 index 설정을 해라.
- insert 만 하는 로그성 엔티티라서 idx 테이블의 `updated_time` 이 필요 없으면 `index_updated_time: false` 를 사용해라.
- 기초데이터나 외부 수집 스냅샷처럼 `updated_time` 이 의미 없는 엔티티도 `index_updated_time: false` 를 우선 적용해라.
- `index_table_only: true` 엔티티는 `fields` 에 선언한 모든 top-level 필드를 idx 컬럼으로 생성하는 것이 기준이다. 별도 data 테이블이 없으므로 보존할 값은 모두 `fields` 에 선언한다.
- `index_table_only: true` 엔티티는 각 필드에 `index: true` 를 반복해서 쓰지 않는다.
- `index_table_only: true` 엔티티에는 `compress: true` 가 효과가 없다. `compress: true` 는 data/history 테이블에만 적용되므로 긴 text/json 원문을 저장하는 일반 엔티티에 우선 적용한다.
- 주소, 공휴일 같은 보호할 data blob 이 없는 공용 마스터 데이터는 `index_table_only: true` 로 둬도 된다.

### 엔티티 fields 최소화 원칙

- 폼 전체를 fields 에 펼칠 필요가 없다. **검색·정렬·조건 조회에 실제로 쓰이는 필드만** `"index": true` 와 함께 선언한다.
- 중첩 폼 값을 목록/검색 인덱스로 써야 할 때는 payload 를 평탄화하지 말고, 엔티티 fields 의 `path` 로 필요한 중첩 경로를 직접 선언해 idx 컬럼을 잡아라.
- `_time`, `_date` 처럼 ES 가 패턴으로 타입을 자동 추론하는 필드는 `fields` 에 타입을 명시하지 않아도 된다.
- 타입 추론이 불가능한 필드 중 타입이 반드시 고정되어야 하는 경우(예: `int`, `boolean`)에만 추가로 fields 에 선언한다.
- 폼 데이터 대부분은 data blob 에 저장하고, 목록·검색에 필요한 핵심 필드만 idx 컬럼으로 뺀다.
- 엔티티 파일을 새로 만들 때는 이 원칙을 먼저 적용하고, 실제 조회 요건이 확인된 뒤에 필드를 추가한다.

### 엔티티 FK 규칙

- `_seq` 패턴 필드는 ES 가 접두어를 엔티티명으로 추론해 `entity_data_<name>` 테이블 존재 여부를 확인하여 자동으로 FK 를 건다. (`user_seq` → `entity_data_user`)
- 필드명이 참조 엔티티명과 일치하지 않는 경우에는 자동 추론이 실패한다. 이럴 때는 엔티티 JSON 최상위에 `"fk"` 블록을 추가해 명시한다.
    ```json
    "fk": {
        "room_seq": "some_entity"
    }
    ```
- `onDelete`/`onUpdate` 동작을 변경하려면 `"field_seq": { "ref": "some_entity", "onDelete": "SET NULL" }` 형태를 쓴다.
- FK 를 명시적으로 비활성화하려면 `"fk": { "field_seq": false }` 로 설정한다.
- `seq`, `license_seq`, `account_seq` 는 시스템 의미가 고정된 필드다. 다른 의미의 FK로 재사용하지 말고, 별도 관계는 `login_account_seq`, `owner_account_seq`처럼 목적이 드러나는 전용 필드명을 쓸것.

### AS -> ES 사용자 컨텍스트 규칙

- 로그인 요청이면 AS 는 req.account 를 기준으로 요청 전용 HMAC 클라이언트를 만들고 X-Account-Seq, X-License-Seq 헤더를 ES 로 자동 전달한다.
- Bearer JWT 는 AS 에서만 해석하고, ES 에는 직접 전달하지 않는다.
- created_by, updated_by 는 X-Account-Seq 를 기본 감사값으로 사용하되, submit/update payload 에 명시된 값이 있으면 그 값을 우선한다.
- license_scope 엔티티는 account_seq, license_seq, created_by, updated_by 가 payload 에 없으면 ES 가 X-Account-Seq, X-License-Seq 헤더 기준으로 기본 채움을 적용한다.
- account_seq, user_seq 같은 비즈니스 필드는 ES 가 자동 주입하지 않으므로 AS 라우트가 payload 에 명시적으로 넣어야 한다.
- license_scope 엔티티를 로그인 사용자가 AS 경유로 호출하는 경우에는 X-License-Seq 로 license scope 가 잡히므로, 라우트에서 license_seq 를 기본값처럼 중복 주입하지 않는다.
- 스케줄러, 배치, 내부 system 호출, guest 요청처럼 req.account.seq 가 없는 경우에는 X-License-Seq 가 자동으로 붙지 않으므로 license_seq 를 직접 넣어야 한다.

### AS 설계 규칙

- AS 라우트는 처음부터 관심사별 폴더 구조로 만든다. `handlers.ts` 같은 단일 대형 파일에 누적하지 말고 `handlers/` 아래에는 라우트 핸들러만, 비즈니스 로직은 `services/` 아래에 관심사별 파일로 분리한다. `index.ts` 를 다시 감싸기만 하는 래퍼 파일은 만들지 않는다.
- 단건 상세 응답을 만들기 위해 AS가 같은 엔티티 주변 데이터를 다시 여러 번 ES에 조회하지 않는다.
- AS 상세 라우트는 가능하면 ES `get` 또는 `find` 한 번만 호출하고, 인증 문맥 처리나 비동기 부가 작업처럼 **요청 문맥이 필요한 일**만 맡긴다.
- 목록 API는 프런트 쿼리 파라미터를 AS가 읽어서, ES `list` API의 JSON body 안 `conditions` 객체로 번역해 보낸다.
- ES 엔티티 목록 API의 `conditions`는 **기본 결합이 AND** 다. OR 조건이 필요하면 `conditions.or = [...]` 형태로 OR 그룹을 명시적으로 추가한다. `or` 배열 안의 조건들만 OR로 묶이고, 바깥 조건들과는 다시 AND로 합쳐진다.
- 자유 검색도 ES generic `search` 파라미터에 의미를 밀어 넣지 않고, AS가 `title like` 같은 조건으로 풀어서 `conditions.or`에 넣는다.
- 여러 라우트에서 반복되는 목록 조건 조합은 공용 유틸로 올리고, 각 라우트는 입력 파라미터를 그 유틸에 전달하는 역할만 맡긴다.
- 조회수 증가처럼 응답을 막을 필요가 없는 작업은 AS에서 비동기로 처리한다.
- 한 요청에서 ES 에 여러 건을 저장해야 하면 직렬 `entityServer.submit` 반복 대신 `entityServer.transactionSubmit(ops)` 로 1요청 1트랜잭션 처리한다(`"$tx.{i}"` 로 부모-자식 FK 치환 가능). 단, submit 들 사이에 비-ES 작업이 끼거나 각 건 독립 처리(부분 실패 허용)가 설계 의도인 경우는 직렬을 유지한다.
- `entityServer.list` 단일 요청 limit 상한은 1000 이다. 대량 조회는 `page` 를 1씩 늘리며 끝까지 순회한다.
- `entityServer.list` 의 `fields` 는 인덱스 필드명만 지정 가능하고 잘못된 필드명은 ES 500 을 낸다. seq 와 다른 인덱스 필드를 같이 읽어야 하면 `["*"]` 를 쓰고 결과 키를 직접 검증한다.
- AS 에서 `_time`/`_date`/`_at` 같은 ES datetime 컬럼에 값을 저장할 때는 항상 DB 벽시계 포맷(`"YYYY-MM-DD HH:MM:SS"`)을 쓰고 `toISOString()` 을 직접 저장하지 않는다(MySQL 1292 로 idx insert 실패).

---

## 코딩 규칙

- 작업 후에는 반드시 타입 오류 및 파일이 깨지지 않았는지 확인해라.
- 모든 함수와 타입에는 반드시 한글로 한 줄 주석을 추가해라. 내부 헬퍼 함수도 예외 없다.
- 타입의 필드 주석은 필드 오른쪽에 한 줄 주석으로 추가해라.
- 타입 파일명은 컴포넌트를 제외하고 소문자 시작 lowerCamelCase로 작성해라. (예: `authState.ts`, `loginForm.ts`)
- AS app/hooks 의 엔티티 훅 파일명은 엔티티명과 동일하게 맞춰라.
- 아이콘은 `icons/` 폴더에 각각의 파일로 만들어라.
- 재사용 가능한 utils 함수는 파일 안에서 만들지 말고 `utils/` 폴더에 관심사별로 분리해라.
- 유틸함수를 만들어야 하면 이미 만들어진 함수가 있는지 검토부터 한 뒤에 없으면 만들어라.
- 각 파일은 단일책임원칙(SRP)을 지켜라.
- index.ts 에 여러 관심사를 모아두지 말아라. 파일을 관심사별로 분리해서 만들어라.
- www 뷰 파일이 길어지면 섹션 파일은 상태 조립만 남기고, 툴바·카드·다이얼로그 같은 UI는 기능별 컴포넌트로 바로 분리해라.

---

## frontend modules 규칙

### 폴더 구조

```
modules/
    domain/
        controllers/
            domainController.ts # 컨트롤러 (state, form, mutation 선언)
            domainActions.ts    # 액션 함수들 (1개일 때)
            actions/            # 액션이 많아 관심사별로 분리할 때
                domainActions.ts
        apis/                   # API 함수와 useMutation 훅을 관심사별로 분리
            index.ts            # 필요할 때만 re-export 배럴
            domainApi.ts        # 조회/요청 함수
            useDomainMutations.ts # mutation 훅
            domainRealtime.ts   # 실시간/이벤트 처리
        models/
            defaults.ts         # State 초기값 (타입·초기값 외 로직 금지)
            types/
                index.ts        # 타입 export 배럴
                domainState.ts  # 상태 타입
                domainForm.ts   # 폼 타입
                domainTable.ts  # 테이블 타입
        utils/                  # 유틸 함수(스토리지 입출력, 포맷터 등 — models 에 두지 않는다)
        components/             # 모듈 공용 컴포넌트(여러 뷰가 함께 쓰는 것)
        views/
            DomainPage.tsx
            components/         # 이 도메인 뷰 전용 공용 컴포넌트
            configs/
                table.tsx       # 테이블 컬럼 설정
                filters.ts      # ListLayout 필터 설정
                sections.ts     # FormDialog 섹션 병합 및 반환
            forms/              # FormDialog 섹션 컴포넌트
            dialogs/
                DomainFormDialog.tsx
```

### 레이어링 규칙

- 의존 방향은 **view → controller → actions** 단방향이다. 뷰는 컨트롤러가 내려준 `state`/`handlers` 를 렌더에 연결만 하고, 흐름 로직(자동 제출, API 호출, 화면 이동)은 컨트롤러가, 상태 변이는 actions 가 소유한다.
- 이때 오가는 타입은 전부 `models/types/` 에 선언한다(타입 전용 — 함수/상수 로직을 두지 않는다).
- 유틸 함수(localStorage 입출력, 포맷터 등)는 `utils/` 에 둔다. `models/` 나 뷰 파일 안에 유틸을 정의하지 않는다.
- 모듈 공용 컴포넌트는 `components/`, 특정 뷰 전용 컴포넌트는 `views/components/`, 다이얼로그는 `views/dialogs/` 에 둔다.

### 상태 관리 (forma)

- www 작업 전에는 forma 상태 모델과 `watch`/`actions` 패턴을 먼저 숙지하고, 리렌더 문제를 React `memo`나 참조 재사용으로 덮지 말고 상태 소유권과 구독 슬라이스를 forma 기준으로 다시 설계하는 쪽을 우선한다.
- 모듈은 상태관리를 위한 `State` 타입이 1개는 반드시 있어야 한다.
- `State`의 초기값은 `models/defaults.ts`에서 정의한다.
- 컨트롤러에서는 `const state = useGlobalFormaState<DomainState>({...})` 형태로 상태를 관리한다.
- **컨트롤러는 `state` 자체를 반환한다.** 컨트롤러 내부에서 `state.useValue()`로 구독해서 반환하지 않는다.
- 값 구독은 필요한 컴포넌트에서 `state.useValue()`로 개별 구독한다.
- `state.watch`를 활용해 상태 변경 시 `useEffect` 대신 반응한다.
- API 응답 데이터는 react-query 캐시가 아닌 forma 글로벌 상태(`useGlobalFormaState`)에 저장한다. 액션 안에서 `context.setValue("key", data)` 로 설정한다.
- API 호출은 `controllers/*Actions.ts` 의 액션 함수에서 수행한다. 컴포넌트나 뷰에서 직접 API 를 호출하지 않는다.
- 액션 함수는 `(deps) => (context: ActionContext<State>, ...args) => void | Promise<...>` 팩토리 패턴으로 만들고, 컨트롤러의 `useGlobalFormaState` 초기화 시 `actions` 옵션에 등록한다.
- 로직에서 직접 상태를 조작하지 말고 `state.actions.xxx()`로 호출한다.
- 소비 컴포넌트는 컨트롤러에서 내려준 `state`, `form` 인스턴스에서 `state.useValue("path")`, `form.useFormValue("path")` 로 자신이 필요한 경로만 직접 구독한다. props drilling 으로 큰 객체를 전달하지 말고, 필요한 값이 한 번만 필요하면 `state.getValue()`, `form.getFormValue()` 로 읽는다.
- `state.useValue()` 나 `form.useFormValue()` 호출식 바로 뒤에 `||`, `??` 같은 fallback 을 직접 붙이지 않는다. 먼저 raw 구독값을 별도 변수에 담고, 다음 줄에서 fallback 을 적용한다.
- forma 의 `setValue("a.b.c", v)` 는 정확히 같은 path 구독자, 그리고 그 **부모 path** (`a.b`, `a`) 구독자에게만 알림을 보낸다. **형제 슬라이스** 구독자에게는 알림이 가지 않는다.
- 컴포넌트가 객체 전체를 구독하면 그 안의 어떤 자식 슬라이스가 바뀌어도 모두 깨어난다. 객체/배열 슬라이스를 그대로 구독하지 말고, 실제로 사용하는 leaf 필드들만 쪼개서 `useValue` 한다.
- 컨테이너에서 배열 전체를 구독해 자식에게 prop 으로 넘기지 말고, 컨테이너는 `list.length` 같은 최소 경로만 구독해 렌더 트리를 만들고 각 자식이 자기 인덱스의 leaf 슬라이스를 직접 `useValue` 하도록 둔다.
- 같은 `stateId` 를 가진 `useGlobalFormaState` 호출은 어느 컴포넌트에서든 동일한 상태 인스턴스를 반환한다.
- 같은 `stateId` 의 owner는 한 곳만 둔다. `initialValues`, `actions`, `watch` 를 등록하는 owner controller 외 다른 모듈은 `useGlobalFormaState<T>({ stateId: "..." })` 로 기존 인스턴스만 읽는다.
- 파생 인덱스 배열을 갱신하는 watch 는 결과 배열이 이전과 동일하면 setValue 를 건너뛰어 reference 변경을 막는다.
- 낙관적(optimistic) 업데이트가 필요한 mutation 훅은 `useGlobalFormaState` 로 같은 상태 인스턴스를 가져와서 `state.getValue()` / `state.setValue()` 로 직접 갱신·롤백한다. `queryClient.setQueryData` 를 쓰지 않는다.
- realtime(WebSocket) 이벤트 수신 시에는 react-query invalidation 대신 등록된 액션의 refetch 콜백을 호출해 forma 상태를 갱신한다.
- `useQuery` 는 사용하지 않는다. 데이터 조회는 forma 액션에서 수행하고 결과를 forma 상태에 저장한다.
- `useMutation` 은 쓰기(CUD) 전용 래퍼로 사용한다. 읽기(R)에는 사용하지 않는다.
- 프런트 도메인은 1개의 controller 와 1개의 `useGlobalFormaState` 기반 state 를 중심으로 상태를 관리한다. 화면 간 전달 상태도 별도 파일로 분리하지 말고 해당 도메인 controller 가 반환하는 state 에 둔다.
- controller 의 state 타입은 controller 파일에 직접 선언하지 말고 `models/types` 폴더에 분리한다. state 초기값과 form 초기값 같은 기본값은 `models/defaults.ts` 에 둔다.

### 폼 (form)

- 폼이 필요할 경우 controller 에서 `const form = useGlobalForm<DomainForm>({...})` 형식으로 선언한다.
- `state`는 `useValue` / `setValue`, `form`은 `useFormValue` / `handleFormChange`를 사용한다.
- 뷰 컴포넌트에서는 `form.useFormValue("fieldName")`으로 구독하고, `onChange={form.handleFormChange}`로 연결한다.
- 대형 폼 타입은 섹션별 그룹 객체로 구성하고, 폼 필드 경로도 `basicInfo.some_field` 같은 dot path 로 맞춘다.
- 폼 검증은 `useGlobalForm`의 `onValidate`에서 구현하고, 실패하면 `false`를 반환해 제출을 막는다.
- 폼 제출은 `useGlobalForm`의 `onSubmit`에서 구현하고, 뷰에서는 `onSubmit={form.submit}`으로 연결한다. 별도 `handleSubmit` 함수를 만들지 않는다.
- 저장, 디바운스 저장, 다른 필드 동기화 같은 폼 부수 효과는 가능하면 `form.watch` 로 처리한다.
- textarea 자동저장처럼 입력 중 값 변화에만 반응하면 되는 경우에는 상위가 해당 필드를 직접 구독하지 말고 `watch` 또는 필드 전용 하위 컴포넌트 내부 구독으로 처리해 불필요한 부모 리렌더를 막는다.

### 다이얼로그 (dialog)

- controller 에서 `useModal()`로 선언하고 `views/dialogs/` 폴더에 컴포넌트를 만든다.
- 저장 성공 후 다이얼로그를 닫을 때는 폼 데이터를 즉시 비우지 않는다. 다이얼로그 컴포넌트 안에서 닫힘을 감지한 뒤 최소 500ms 지난 다음 `form.resetForm()`을 호출한다(지연 reset 책임은 다이얼로그 컴포넌트가 가진다).
- 저장 성공 `SuccessAlert` 는 닫힘 애니메이션과 겹치지 않도록 `delay: 500` 으로 띄운다.
- 새 작성/등록용 다이얼로그는 백드롭 클릭으로 닫히지 않게 한다. `FormDialog` 는 `backdropClick={false}` 를 쓰고, MUI `Dialog` 는 `onClose` 의 `reason === "backdropClick"` 을 무시한다.
- 다이얼로그는 닫힘 애니메이션이 필요한 경우 `open=false` 시점에 폼/상태를 즉시 비우지 말고, `onExited` 이후에 정리한다.

### 뮤테이션 (mutation)

- `@tanstack/react-query`의 `useMutation`을 사용한다. (`swr`의 `useSWRMutation` 사용 안 함)
- `apis/` 는 `controllers/` 나 `actions/` 의 하위가 아니라, 모듈 바로 아래에 두는 독립 계층이다.
- `useMutation`은 React Hook이므로 반드시 **apis/ 아래 커스텀 훅 파일 안에서만** 선언한다.
- 기본은 `apis/domainApi.ts`(순수 함수), `apis/useDomainMutations.ts`(mutation 훅) 2파일로 나누고, 관심사가 많아지면 `apis/` 안에서 추가 분리한다.
- `onSuccess` / `onError` 등 콜백 로직도 뮤테이션 파일 내부에 구현한다. 컨트롤러는 필요한 의존성(함수)만 주입한다.
- 컨트롤러 내부에서는 `const mutations = useDomainMutations(...)` 처럼 뮤테이션을 객체로 묶어 관리하고, 로딩 상태는 `const loading = { save: mutations.save.isPending }` 처럼 loading 객체로 반환한다.

### 인증 / 로그인 흐름

- 세션 복원은 `useMutation` 기반 `checkSession` 으로 처리한다. `useQuery` 를 쓰지 않는다.
- 저장된 토큰이 있으면 entity-client 에 주입한 뒤 `/me` 를 호출해 계정 정보를 복원한다.
- 세션 복원 실패(401 등)하면 토큰을 지우고 로그인 상태를 조용히 초기화한다. 세션 만료 다이얼로그를 띄우지 않는다.
- 이미 로그인된 상태의 리다이렉트는 로그인 페이지에서만 처리한다. 공용 `state.watch` 에 로그인 성공 네비게이션을 넣지 않는다.
- 로그아웃 이동은 `logout` mutation 성공 후 컨트롤러에서 처리한다.
- 세션 keepalive 는 별도 `setInterval` 을 만들지 말고 entity-client 의 `startHealthTick`/`stopHealthTick` 으로 관리한다.

### 로컬스토리지

- `@ehfuse/forma`의 `useLocalStorage`를 사용한다. (`const { value, setValue } = useLocalStorage<T>("key", defaultValue)`)
- 컴포넌트/훅 안에서는 `window.localStorage` 를 직접 호출하지 않는다. 값 삭제는 `useLocalStorage`가 반환하는 `remove`를 사용한다.
- 앱 루트에서 `GlobalFormaProvider`에 `storagePrefix`를 설정해야 한다. (이 프로젝트는 `storagePrefix="city-salon"`)
- 인증 토큰은 로컬스토리지에 저장하지 않는다. 로컬스토리지는 `rememberId` 같은 비민감 UI 상태에만 사용한다.

---

## UI 규칙

| 용도           | 패키지                                        |
| -------------- | --------------------------------------------- |
| 입력 컴포넌트  | `@ehfuse/mui-form-controls`                   |
| 목록 레이아웃  | `@ehfuse/mui-dashboard-layout` → `ListLayout` |
| 가상 테이블    | `@ehfuse/mui-virtual-data-table`              |
| 날짜/시간 선택 | `@ehfuse/mui-datetime-picker`                 |
| 색상 선택      | `@ehfuse/mui-color-picker`                    |
| 카카오맵       | `@ehfuse/kakao-map`                           |
| Select         | `@ehfuse/mui-label-select`                    |
| Alert          | `@ehfuse/alerts`                              |
| 트리뷰         | `@ehfuse/tree-view`                           |
| 단축키         | `@ehfuse/keyboard-state`                      |
| 스크롤         | `@ehfuse/overlay-scrollbar`                   |

### 주요 사용법

- `@ehfuse/mui-form-controls` 컴포넌트들은 `form` prop이 있다. `name`을 지정하고 컨트롤러에서 만든 `form`을 넣으면 자동 상태관리된다.
- 텍스트 입력은 `TextField` 대신 `ClearTextField`를 사용한다. 이메일은 `EmailTextField`, 비밀번호는 `PasswordTextField`, 전화번호는 `PhoneTextField`.
- 스크롤: `<OverlayScrollbar><Box>내용</Box></OverlayScrollbar>` 형태로 사용한다.
- grid: MUI `Box`에 `display: "grid"`로 만든다.
- `TextField`에 `inputProps` 같은 속성은 하위호환 속성이다. 최신 `slotProps`를 사용해라.
- MUI 컴포넌트에서 `PaperProps`, `TransitionProps` 같은 deprecated prop 경고가 보이면 `slotProps.paper`, `slotProps.transition` 같은 slot API로 옮긴다.
- 브라우저 자동완성(`-webkit-autofill`) 스타일은 MuiTheme 의 `MuiOutlinedInput.styleOverrides.root`에서 전역으로 맞춘다.
- `ListLayout` 헤더 설정은 `Layout.tsx` 안에 직접 두지 말고 같은 `views` 폴더의 `Header.tsx` 로 분리해 `useHeaderConfig` 형태로 관리한다.
- `ListLayout` 헤더 검색은 `searchValue` 로 검색어를 계속 controlled 주입하지 말것. 검색 입력은 `ListLayout` 이 내부에서 관리하고, `onSearch`(필요하면 `onSearchSubmit`)로 넘어온 값으로 검색 액션만 실행한다.

### views/configs 파일 규칙

| 파일                             | 역할                          |
| -------------------------------- | ----------------------------- |
| `views/configs/table.tsx`        | 테이블 컬럼 설정              |
| `views/configs/filters.ts`       | ListLayout header.filter 설정 |
| `views/configs/form-sections.ts` | FormDialog 섹션 병합 및 반환  |
| `views/forms/*.tsx`              | FormDialog 섹션 컴포넌트      |

---

## entity-client

`entity-client` 패키지는 `www`에서 `as`(Entity App Server)와 통신하는 공식 클라이언트다.
기본 클라이언트는 싱글톤 `entityAppServer` 이며, 별도로 `new EntityServerClient()`를 생성하지 않는다.
www API 래퍼는 별도 shared wrapper 대신 `entityAppServer`를 직접 사용한다. 파일명은 실제 AS 라우트/도메인 이름에 맞춘다.

### 초기화

앱 루트(`src/index.tsx`)에서 `entityAppServer.configure()`로 딱 한 번 설정한다. (현재 구현 참고)

### 인증 (Auth)

`entityAppServer.checkHealth()` → `entityAppServer.login()` 순서로 호출한다.
`checkHealth()`는 패킷 암호화 활성 여부를 자동 감지하므로 로그인 전에 반드시 호출한다.

```typescript
// apis/authApi.ts — 순수 함수 래퍼
import { entityAppServer } from "entity-client";

/** 로그인 API */
export const authApi = {
    login: (email: string, password: string) => entityAppServer.login(email, password),
    logout: () => entityAppServer.logout(),
    me: <T = Record<string, unknown>>() => entityAppServer.me<T>(),
};
```

### Entity CRUD

엔티티 조회는 `entityAppServer`를 직접 호출하는 순수 함수로 `apis/domainApi.ts` 같은 파일에 작성한다.
CUD(생성/수정/삭제)는 `useMutation`을 `apis/useDomainMutations.ts` 같은 파일에서 선언한다.

```typescript
// 조회
entityAppServer.list("order", {
    page: 1,
    limit: 20,
    orderBy: "created_time",
    orderDir: "DESC",
    fields: ["seq", "status", "amount"], // 미지정: 인덱스 필드만(가장 빠름), ["*"]: 전체
    conditions: { status: "pending" },
});
entityAppServer.get("order", seq);
entityAppServer.find("order", conditions);

// 저장/삭제 (seq 없으면 INSERT, 있으면 UPDATE)
entityAppServer.submit("order", data);
entityAppServer.delete("order", seq); // 기본: 소프트 삭제
```

### 트랜잭션

```typescript
const txId = await entityAppServer.transStart();
try {
    await entityAppServer.submit("order", { ...orderData }, { transactionId: txId });
    await entityAppServer.submit("order_item", { ...itemData }, { transactionId: txId });
    await entityAppServer.transCommit(txId);
} catch (err) {
    await entityAppServer.transRollback(txId);
    throw err;
}
```

### 참고 문서

| 문서                                 | URL                                                                  |
| ------------------------------------ | -------------------------------------------------------------------- |
| Entity Server 전체 문서              | https://ehfuse.github.io/entity-server/                              |
| API 라우트 개요                      | https://ehfuse.github.io/entity-server/api-routes/api-routes.html    |
| 엔티티 라우트 (`/v1/entity/:entity`) | https://ehfuse.github.io/entity-server/api-routes/entity-routes.html |
| 인증 라우트 (`/v1/auth/*`)           | https://ehfuse.github.io/entity-server/api-routes/auth-routes.html   |
| 파일 라우트 (`/v1/files/:entity`)    | https://ehfuse.github.io/entity-server/api-routes/files-routes.html  |
| 훅 가이드                            | https://ehfuse.github.io/entity-server/api-routes/hooks.html         |
| 인증 가이드                          | https://ehfuse.github.io/entity-server/security/auth-guide.html      |
| 엔티티 설정                          | https://ehfuse.github.io/entity-server/data/entity-config-guide.html |

---

## Git 규칙

- 원격은 아직 없다(TODO: city-salon 전용 원격 저장소 확정 시 origin 추가). 기본 브랜치는 `main` 이다.
- 일상 작업은 `maeiv` 브랜치에서 커밋/푸시하고, `main` 에는 직접 커밋하지 않는다(병합용).

## 진행 메모

- 2026-07-23: ehfuse/project-template 을 클론해 city-salon 프로젝트로 초기 세팅했다. 슬러그 `app` → `city-salon` 교체(static 경로/storagePrefix/DEV_HOST/site-info), www 패키지명 `city-salon-www`, AS URL 을 as/configs/server.json 의 48200 으로 통일, www/as `.env` 생성(.env.example 복사본 — ES 키/시크릿은 미설정). 프로덕션 도메인·브랜드 문구는 TODO 플레이스홀더 상태다.
- www 는 codeshop www 를 템플릿으로 초기 세팅했다(2026-07-21). configs/site-info, backend/settings, .env 의 도메인·AS 포트는 TODO 플레이스홀더 상태다.
- package.json 의존성은 codeshop 전체를 그대로 가져온 상태다. 서비스 방향이 잡히면 안 쓰는 패키지(mediapipe/photo-editor/pdf/xlsx 등)를 다이어트할 예정 — 다이어트 시 `postinstall` 의 setup-mediapipe/setup-pdfjs 스크립트도 함께 정리할 것.
- ⚠️ `npm install` 이 중간에 강제 종료되면 npm 이 이를 감지하지 못해 **일부 패키지가 부분 압축해제 상태로 남는다**(잘린 네이티브 `.node` 바이너리 → "not a valid Win32 application", 누락된 `.d.ts` → 타입체크 실패 등, 2026-07-21 실제 발생). 증상이 패키지별로 산발적으로 나타나면 개별 복구를 시도하지 말고 **`node_modules` 를 통째로 지우고 재설치**하는 것이 가장 확실하다.
