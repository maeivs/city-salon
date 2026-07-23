# Example 플러그인 (개발 템플릿)

새 플러그인을 개발할 때 참고하는 템플릿입니다. 기본 CRUD 구조, 엔티티 등록, 서비스 패턴이 포함되어 있습니다.

> 프로덕션에서는 `enabled: false`로 유지하거나 해당 폴더를 복사해 새 플러그인을 만드세요.

---

## 플러그인 생성 절차

1. `src/app/plugins/example/` 폴더를 복사해 새 폴더 이름으로 변경
2. `config.json`에서 `enabled: true` 설정
3. `types/` — 플러그인 설정 타입 및 데이터 타입 정의
4. `entities/` — 테이블 스키마 JSON 추가
5. `service.ts` — 비즈니스 로직 구현
6. `entity-adapter.ts` — DB 쿼리 어댑터 구현
7. `handlers.ts` — 요청 핸들러 구현
8. `routes.ts` — 라우트 등록
9. `index.ts` — 플러그인 초기화 (엔티티 등록, 서비스 시작, 데코레이션)

---

## 기본 파일 구조

```
example/
├── config.json          # 플러그인 설정
├── config.ts            # 설정 로드 헬퍼
├── index.ts             # 플러그인 진입점 (초기화)
├── routes.ts            # HTTP 라우트 등록
├── service.ts           # 비즈니스 로직
├── entity-adapter.ts    # DB 쿼리 어댑터
├── handlers.ts          # 요청 핸들러
├── types/
│   └── index.ts         # 타입 정의
└── entities/
    └── example.json     # 엔티티 스키마
```

---

## 기본 CRUD 엔드포인트 패턴

| 메서드   | 경로    | 설명      |
| -------- | ------- | --------- |
| `GET`    | `/`     | 목록 조회 |
| `GET`    | `/:seq` | 단건 조회 |
| `POST`   | `/`     | 생성      |
| `PUT`    | `/:seq` | 수정      |
| `DELETE` | `/:seq` | 삭제      |

---

## config.json

```json
{
    "enabled": false,
    "deploy": true,
    "minify": false
}
```

> 새 플러그인 개발 시 `enabled: true`로 변경하고, 프로덕션에서 사용하지 않을 경우 `deploy: false`로 빌드에서 제외하세요.
