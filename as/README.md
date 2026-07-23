# Entity App Server

**Entity Server** 위에서 동작하는 Fastify 기반 애플리케이션 서버입니다.  
인증·엔티티 CRUD·파일 스토리지 등 서버 코어는 숨겨진 번들(`system.js`)로 제공되며,  
비즈니스 로직(라우트·훅·확장모듈)은 TypeScript 소스로 직접 수정할 수 있습니다.

```
system.js       — 서버 코어
system-api.js   — 공개 API (ok / fail / logger / entityServer)
app/            — 여기를 자유롭게 수정하세요
  plugins/      — 결제·LLM·알림 등 확장모듈
  routes/       — 커스텀 API 엔드포인트
  hooks/        — 엔티티 이벤트 훅
  schedules/    — 백그라운드 작업
configs/        — JSON 설정 파일
scripts/        — 실행/업데이트/엔티티 관리 스크립트
```

## 시작하기

```bash
npm create entity-app-server@latest my-app
cd my-app
npm install
npm run dev
```

자세한 설치 절차: https://github.com/ehfuse/entity-app-server/blob/main/docs/getting-started.md

## 이 패키지가 하는 일

- 이 npm 패키지는 `npm create entity-app-server`용 스캐폴딩 템플릿을 배포합니다.
- 실행하면 새 프로젝트 폴더에 `system.js`, `system-api.js`, `app/`, `configs/`, `scripts/`, `.env` 등을 생성합니다.
- 생성된 프로젝트는 루트의 `system.js`를 직접 실행합니다.

플러그인은 `config.example.json`이 배포용 `config.json`의 원본이며, 이 예제 파일에는 `deploy`, `minify` 같은 빌드 제어 필드를 넣지 않습니다. 반대로 `routes/`, `schedules/`는 source `config.json`을 그대로 사용하므로 build 단계에서만 해당 필드를 제거합니다.

## 경로 별칭 규칙

다른 개발자도 바로 이해할 수 있도록 경로 별칭은 아래 기준으로 구분합니다.

| 별칭          | 의미                         | 어디서 사용하나                           |
| ------------- | ---------------------------- | ----------------------------------------- |
| `@system/api` | app 코드에 공개된 시스템 API | `src/app/**`, 문서 예제                   |
| `@system/*`   | system 코어 내부 모듈 경로   | `src/system/**` 내부 구현                 |
| `@app/*`      | app 소스 경로                | system 또는 app 코드에서 app 모듈 참조 시 |

`src/app/**`에서는 `@system/*` 내부 구현을 직접 가져오지 말고, 공개된 기능만 `@system/api`로 사용합니다.

## 문서

| 문서                                                                                                | 설명                |
| --------------------------------------------------------------------------------------------------- | ------------------- |
| [getting-started.md](https://github.com/ehfuse/entity-app-server/blob/main/docs/getting-started.md) | 설치 및 첫 실행     |
| [docs/README.md](https://github.com/ehfuse/entity-app-server/blob/main/docs/README.md)              | 커스터마이징 가이드 |
| [docs/evaluation.md](https://github.com/ehfuse/entity-app-server/blob/main/docs/evaluation.md)      | 프로젝트 평가       |
| [docs/plugins/](https://github.com/ehfuse/entity-app-server/tree/main/docs/plugins)                 | 확장모듈 상세       |
| [docs/routes/](https://github.com/ehfuse/entity-app-server/tree/main/docs/routes)                   | API 라우트 레퍼런스 |
