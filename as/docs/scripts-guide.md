# Entity App Server 스크립트 사용 가이드

> `packages/entity-app-server/scripts/` 디렉터리의 스크립트 전체 사용법

---

## 목차

| 스크립트                                   | 용도                                  |
| ------------------------------------------ | ------------------------------------- |
| [run.sh](#1-runsh)                         | 서버 실행 (개발/프로덕션)             |
| [build.sh](#2-buildsh)                     | 소스 리포지토리 빌드 + 템플릿 패키징  |
| [push.sh](#3-pushsh)                       | 버전 관리 + Git push                  |
| [release.sh](#4-releasesh)                 | 빌드 + 버전업 + push (원스텝)         |
| [update-server.sh](#5-update-serversh)     | 최신 서버 코어 업데이트               |
| [service-install.sh](#6-service-installsh) | systemd 서비스 등록                   |
| [service-remove.sh](#7-service-removesh)   | systemd 서비스 제거                   |
| [entity.sh](#8-entitysh)                   | 앱 전용 엔티티 테이블 생성            |
| [gen-table-type.sh](#9-gen-table-typesh)   | 엔티티 → Kysely 테이블 타입 자동 생성 |

---

## 공통 사항

### dry-run / --apply

엔티티 관련 스크립트는 **기본값이 dry-run** 입니다. 실제로 실행하려면 `--apply`를 붙이세요.

```bash
./scripts/entity.sh              # 미리보기 (실행 안 함)
./scripts/entity.sh --apply      # 실제 실행
```

### HTTP API 의존성

`entity.sh`는 **entity-server HTTP API**를 직접 호출합니다. `curl` 또는 `wget`이 필요하며, `.env`의 `ENTITY_SERVER_URL` + `ENTITY_API_KEY`를 사용합니다.

### 경로 별칭 규칙

스크립트가 복사하는 `tsconfig.json`의 별칭은 아래 기준으로 구분합니다.

| 별칭          | 의미                            | 사용 위치                    |
| ------------- | ------------------------------- | ---------------------------- |
| `@system/api` | app 코드가 쓰는 공개 시스템 API | 라우트, 플러그인, 훅, 스케줄 |
| `@system/*`   | system 코어 내부 모듈 경로      | `src/system/**` 내부 구현    |
| `@app/*`      | app 소스 경로                   | system/app 공통 참조         |

다른 개발자가 코드를 볼 때 `@system/api`는 "공개 계약", `@system/*`는 "내부 구현"이라고 바로 구분되도록 유지합니다.

---

## 1) run.sh

Entity App Server를 실행합니다.

```bash
./scripts/run.sh        # 프로덕션 모드 (생성된 프로젝트: system.js, 소스 리포지토리: dist/system.js)
./scripts/run.sh dev    # 개발 모드 (tsx watch)
```

| 모드     | 실행 방법                                   | 사전 조건                                      |
| -------- | ------------------------------------------- | ---------------------------------------------- |
| 프로덕션 | `node system.js` 또는 `node dist/system.js` | 생성된 프로젝트 또는 소스 리포지토리 빌드 완료 |
| 개발     | `npm run dev` (tsx watch)                   | `npm install` 완료 후                          |

- `.env` 파일이 있으면 자동으로 환경변수를 로드합니다.
- 생성된 프로젝트는 루트의 `system.js`를 직접 사용합니다.
- 소스 리포지토리에서는 `dist/system.js`를 우선 사용합니다.

---

## 2) build.sh

TypeScript를 컴파일하고 소스 리포지토리용 `dist/` 배포 산출물을 패키징합니다.

```bash
./scripts/build.sh           # 프로덕션 빌드 + dist/ 패키징 + dist.tar.gz 생성
./scripts/build.sh --no-tar  # tar.gz 없이 빌드만
npm run pack:npm             # npm 패키지(.cache/npm-pack/*.tgz) 생성
```

`dist.tar.gz`는 배포용 아카이브이고, `npm run pack:npm`으로 만드는 `.tgz`는 `create-entity-app-server` npm 패키지 아카이브입니다. 생성기와 업데이트 스크립트도 동일한 `dist/`를 기준으로 사용합니다.

### 단계별 동작

| 단계            | 내용                                                                         |
| --------------- | ---------------------------------------------------------------------------- |
| [1/4] Build     | `npm run build` → TypeScript 컴파일 → `dist/system.js`, `dist/system-api.js` |
| [2/4] Package   | `src/app/` 복사, 플러그인 `config.json` ← `config.example.json` 으로 교체    |
| [3/4] Resources | `configs/`, `entities/`, `templates/`, `scripts/`, `docs/`, `.env` 복사      |
| [4/4] Archive   | `dist.tar.gz` 생성 (`--no-tar` 시 생략)                                      |

- 플러그인 배포용 `config.example.json` 에는 `deploy`, `minify` 를 넣지 않습니다.
- build 시 플러그인은 `config.example.json` 내용이 그대로 `dist/app/plugins/*/config.json` 으로 복사됩니다.
- `routes/`, `schedules/` 는 source `config.json` 을 그대로 사용하므로, 배포 산출물에서는 이들만 `deploy`, `minify` 필드를 제거합니다.

### dist/ 포함 항목

```
dist/
├── system.js         — 난독화 번들 (서버 코어, 수정 불가)
├── system-api.js     — 공개 API 번들 (ok/fail/logger/entityServer 등)
├── tsconfig.json     — @system/api, @system/*, @app/* 경로 별칭
├── app/              — 사용자 편집 가능한 TypeScript 소스
│   ├── plugins/      — 플러그인 (config.json = config.example.json 내용, deploy/minify 없음)
│   └── routes/       — 비즈니스 라우트 (config.json 원본 유지, 배포 시 deploy/minify 제거)
├── configs/          — 서버·DB·CORS 설정 파일
├── entities/         — 엔티티 스키마 JSON
├── templates/        — 확장 템플릿
├── scripts/          — 운영 스크립트 (build.sh 제외)
├── docs/             — 문서 (design/ 제외)
└── .env              — .env.example 복사본 (초기값)
```

---

## 3) push.sh

버전 번호를 올리고 현재 작업 트리 변경을 함께 commit/push합니다. `package.json`의 `version` 필드를 기준으로 태그를 만듭니다.

```bash
./scripts/push.sh                    # 현재 버전 확인 + 사용법 출력
./scripts/push.sh bump patch         # 로컬 버전만 증가
./scripts/push.sh version            # 현재 버전 확인
./scripts/push.sh patch              # x.y.Z+1 — 버그 수정
./scripts/push.sh minor              # x.Y+1.0 — 기능 추가
./scripts/push.sh major              # X+1.0.0 — 호환성 변경
./scripts/push.sh push-current       # 현재 버전 commit + tag + push
./scripts/push.sh tag                # 현재 버전으로 git tag만 생성 + push
```

### 동작 순서

1. `./scripts/push.sh bump <type>`: `package.json` 버전만 로컬에서 증가
2. `./scripts/push.sh patch|minor|major`: 버전 증가 + 현재 작업 트리 전체 commit + tag + push + upstream 연결
3. `./scripts/push.sh push-current`: 현재 버전 기준으로 작업 트리 전체 commit + tag + push
4. `./scripts/push.sh tag`: 현재 버전으로 태그만 push

> 태그는 `v` 접두어를 사용합니다. 예: `v0.1.8`

---

## 4) release.sh

GitHub PR 기반으로 `현재 브랜치 -> main -> release` 승격을 진행합니다.

```bash
./scripts/release.sh           # 사용법 출력
./scripts/release.sh start     # 현재 브랜치 -> main -> release PR 생성/머지
```

### 동작 순서

1. 현재 브랜치에 커밋 안 된 변경과 push 안 된 커밋이 없는지 검사
2. 현재 브랜치가 `main` 이 아니면 `현재 브랜치 -> main` PR 생성/머지
3. `main -> release` PR 생성/머지
4. `release` 브랜치 push 이벤트에서 GitHub Actions 가 `v<version>` 태그 생성
5. 태그 push 이벤트에서 GitHub Actions 가 GitHub Release 생성
6. 같은 태그 이벤트에서 `build.sh` 실행 후 npm publish 수행

> 실제 릴리즈는 `./scripts/release.sh start` 로 실행합니다. `./scripts/release.sh` 는 사용법만 출력합니다.

### 사전 조건

- `./scripts/build.sh` 로 빌드 검증이 끝나 있어야 합니다.
- `./scripts/push.sh` 로 현재 브랜치 변경 사항이 원격에 push 되어 있어야 합니다. 이 스크립트는 origin/<현재브랜치> upstream 도 함께 연결합니다.
- `gh auth status` 가 정상이어야 합니다.
- GitHub 저장소에 `release` 브랜치가 있어야 합니다.
- GitHub Secrets 에 `NPM_TOKEN` 이 설정되어 있어야 태그 생성 후 npm publish 가 성공합니다.

> GitHub Releases 페이지에 버전이 보이려면 태그만으로는 부족하고, 태그 push 시 GitHub Release 객체도 생성되어야 합니다. 현재 워크플로는 이 단계까지 자동 처리합니다.

> `release.sh` 는 로컬 커밋, Git push, npm publish 를 직접 하지 않습니다. 릴리즈 승격만 담당합니다.

---

## 5) update-server.sh

생성된 Entity App Server 프로젝트의 코어 파일을 최신 npm 패키지 버전으로 업데이트합니다.

```bash
./scripts/update-server.sh              # 도움말 + 현재 코어 버전 + 최신 버전 확인
./scripts/update-server.sh latest       # 최신 버전으로 업데이트
./scripts/update-server.sh 0.0.8        # 특정 버전으로 업데이트
```

### 동작

1. npm registry 에서 `create-entity-app-server` 최신 버전을 조회
2. 해당 패키지 tarball 을 내려받아 `dist/` 기준으로 코어 파일 추출
3. 아래 항목만 업데이트

- `system.js`
- `system-api.js`
- `scripts/run.sh`, `scripts/entity.sh`, `scripts/update-server.sh`, `scripts/service-install.sh`, `scripts/service-remove.sh`
- `docs/`
- `tsconfig.json`
- `.env.example`
- `.entity-app-server-version`
- `package.json`의 런타임 스크립트(`dev`, `start`)와 `dependencies`, `optionalDependencies`, `devDependencies`, `engines`, `os`, `cpu`

### 보존 대상

- `app/`
- `configs/`
- `.env`
- `package.json`의 `name`, `version`, `private` 등 앱 고유 메타데이터

> 업데이트 후에는 `npm install` 이 자동 실행됩니다.

---

## 6) service-install.sh

Entity App Server 프로젝트를 systemd 서비스로 등록합니다.

```bash
sudo ./scripts/service-install.sh
sudo ./scripts/service-install.sh --no-start
```

- 서비스명은 `configs/server.json`의 `namespace`를 기준으로 자동 계산됩니다.
- 기본값이 `entity-app-server`면 서비스명도 그대로 `entity-app-server`입니다.
- 실제 실행은 `./scripts/run.sh start`를 사용합니다.

---

## 7) service-remove.sh

등록된 systemd 서비스를 중지하고 제거합니다.

```bash
sudo ./scripts/service-remove.sh
```

- 등록된 서비스가 없으면 안내만 출력하고 종료합니다.
- 다시 등록할 때는 `sudo ./scripts/service-install.sh`를 사용합니다.

---

## 8) entity.sh

`entities/` 폴더의 JSON 스키마를 entity-server에 등록(테이블 생성)합니다.

```bash
./scripts/entity.sh                    # 전체 엔티티 dry-run
./scripts/entity.sh --apply            # 전체 엔티티 생성 실행
./scripts/entity.sh --entity=llm       # llm 모듈만 dry-run
./scripts/entity.sh --entity=llm --apply   # llm 모듈만 실행
./scripts/entity.sh --entity=ocr --apply   # ocr 모듈만
./scripts/entity.sh --entity=pg --apply    # pg 모듈만
```

### 옵션

| 옵션              | 설명                                  |
| ----------------- | ------------------------------------- |
| `--apply`         | 실제 등록 실행 (생략 시 dry-run)      |
| `--dry-run`       | 대상 파일 목록만 출력 (기본값)        |
| `--entity=<이름>` | 특정 모듈 폴더만 대상 (대소문자 무시) |

### 플러그인 enabled 체크

`entities/{plugin}/` 서브폴더는 `src/app/plugins/{plugin}/config.json`의 `enabled` 값과 자동 매핑됩니다.

- `enabled: false` 이면 해당 플러그인의 모든 엔티티를 로그 없이 스킵
- `config.json` 파일이 없으면 활성화 간주 (항상 등록)
- dry-run에서는 스킵 대상을 `⏭`로 표시
- apply 완료 시 성공 / 실패 / 스킵 카운트를 출력

### 동작

1. `entities/` 재귀 탐색 → `.json` 파일 목록 수집
2. 플러그인 `config.json` `enabled` 확인 → disabled 플러그인 스킵
3. `POST /v1/admin/{name}/create`로 각 스키마 등록
4. 성공/실패/스킵 카운트 출력

---

## 9) gen-table-type.sh

엔티티 JSON을 기준으로 Kysely 타입 정의를 생성합니다.

```bash
./scripts/gen-table-type.sh
```

---

## 자주 쓰는 워크플로

### 첫 설치 후 초기화

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
# 생성된 .env에서 ENTITY_SERVER_URL, ENTITY_API_KEY 등 설정

# 3. 앱 전용 엔티티 테이블 생성
./scripts/entity.sh --apply

# 4. 개발 모드 실행
./scripts/run.sh dev
```

### 개발 중 배포

```bash
./scripts/build.sh            # 소스 리포지토리 빌드 확인
./scripts/release.sh patch    # 빌드 + 버전업 + push
```

### 엔티티 스키마 변경 후 재적용

```bash
# 특정 모듈만
./scripts/entity.sh --entity=llm --dry-run   # 확인
./scripts/entity.sh --entity=llm --apply     # 적용
```

---

## 7) gen-table-type.sh

엔티티서버 메타 API를 조회하여 **Kysely 테이블 타입 정의**(TypeScript 인터페이스)를 자동 생성합니다.

```bash
./scripts/gen-table-type.sh --list                              # 엔티티 목록만 출력
./scripts/gen-table-type.sh --entity=user                       # user 타입 생성
./scripts/gen-table-type.sh --entity=user --dry-run             # stdout에만 출력
./scripts/gen-table-type.sh --entity=user --entity=account      # 복수 지정
./scripts/gen-table-type.sh --entity=user --force               # 기존 파일 덮어쓰기
./scripts/gen-table-type.sh --all --dry-run                     # 전체 엔티티 미리보기
```

### 옵션

| 옵션              | 설명                                          |
| ----------------- | --------------------------------------------- |
| `--list`          | 엔티티 목록만 출력 (파일 생성 안 함)          |
| `--entity=<이름>` | 대상 엔티티 (복수 지정 가능)                  |
| `--all`           | 전체 엔티티 대상                              |
| `--dry-run`       | stdout에만 출력 (파일 쓰기 안 함)             |
| `--force`         | 기존 파일 덮어쓰기 (기본: 파일 있으면 건너뜀) |

### 생성 파일

`src/app/database/tables/{entity}.ts` 에 아래 3개 인터페이스를 생성합니다:

| 인터페이스      | 용도                                         |
| --------------- | -------------------------------------------- |
| `{Entity}Table` | Kysely 테이블 정의 (공통 컬럼 + 인덱스 필드) |
| `{Entity}Data`  | data JSON blob 내 필드 타입                  |
| `{Entity}Row`   | 전체 행 타입 (API 응답용)                    |

### 필요 환경변수

`.env` 파일에 아래 변수가 설정되어 있어야 합니다:

| 변수                 | 설명                                  |
| -------------------- | ------------------------------------- |
| `ENTITY_SERVER_URL`  | 엔티티서버 주소                       |
| `ENTITY_API_KEY`     | 엔티티서버 API 키                     |
| `ENTITY_HMAC_SECRET` | HMAC-SHA256 서명용 시크릿 (32자 이상) |

### 인증 방식

엔티티서버의 HMAC 서명 인증을 사용합니다. 요청마다 `X-API-Key`, `X-Timestamp`, `X-Nonce`, `X-Signature` 헤더를 자동 생성합니다.

### 사용 예

```bash
# 1. 엔티티 목록 확인
./scripts/gen-table-type.sh --list

# 2. 미리보기
./scripts/gen-table-type.sh --entity=user --dry-run

# 3. 파일 생성
./scripts/gen-table-type.sh --entity=user --entity=account --force

# 4. 생성된 타입을 Database 인터페이스에 수동 등록
#    → src/app/database/index.ts 에 import 추가
```

> 생성된 타입 파일은 `src/app/database/index.ts`의 `Database` 인터페이스에 수동으로 import해야 합니다.
