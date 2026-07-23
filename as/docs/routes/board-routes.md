# Board Routes

기준 파일: `src/app/routes/board/`

게시판 기능 전체를 담당합니다. 카테고리·게시글·댓글·파일·좋아요·별점·태그·신고·멘션을 포함합니다.  
모든 경로의 prefix는 `/v1/board`입니다.

---

## 라우트 목록

### 카테고리

| Method | Path                            | 인증         | 설명          |
| ------ | ------------------------------- | ------------ | ------------- |
| GET    | `/v1/board/categories`      | —            | 카테고리 목록 |
| GET    | `/v1/board/categories/:seq` | —            | 카테고리 상세 |
| POST   | `/v1/board/categories`      | JWT (관리자) | 카테고리 생성 |
| PUT    | `/v1/board/categories/:seq` | JWT (관리자) | 카테고리 수정 |
| DELETE | `/v1/board/categories/:seq` | JWT (관리자) | 카테고리 삭제 |

### 게시글

| Method | Path                                   | 인증 | 설명                           |
| ------ | -------------------------------------- | ---- | ------------------------------ |
| GET    | `/v1/board/:category/list`         | —    | 게시글 목록                    |
| GET    | `/v1/board/posts/:seq`             | —    | 게시글 상세 (+ 태그·파일 포함) |
| POST   | `/v1/board/:category/submit`       | JWT  | 게시글 작성                    |
| PUT    | `/v1/board/posts/:seq`             | JWT  | 게시글 수정                    |
| DELETE | `/v1/board/posts/:seq`             | JWT  | 게시글 삭제                    |
| POST   | `/v1/board/:category/guest-submit` | —    | 비회원 게시글 작성             |
| POST   | `/v1/board/posts/:seq/guest-auth`  | —    | 비회원 본인확인 → 임시 토큰    |
| POST   | `/v1/board/posts/:seq/accept`      | JWT  | 답변 채택                      |
| POST   | `/v1/board/posts/:seq/read`        | JWT  | 읽음 표시                      |

### 댓글

| Method | Path                                           | 인증 | 설명      |
| ------ | ---------------------------------------------- | ---- | --------- |
| GET    | `/v1/board/posts/:postSeq/comments`        | —    | 댓글 목록 |
| POST   | `/v1/board/posts/:postSeq/comments/submit` | JWT  | 댓글 작성 |
| PUT    | `/v1/board/comments/:seq`                  | JWT  | 댓글 수정 |
| DELETE | `/v1/board/comments/:seq`                  | JWT  | 댓글 삭제 |

### 파일

| Method | Path                                 | 인증 | 설명             |
| ------ | ------------------------------------ | ---- | ---------------- |
| GET    | `/v1/board/posts/:postSeq/files` | —    | 파일 목록        |
| POST   | `/v1/board/posts/:postSeq/files` | JWT  | 파일 업로드      |
| GET    | `/v1/board/files/:uuid`          | —    | 파일 뷰/다운로드 |
| DELETE | `/v1/board/files/:uuid`          | JWT  | 파일 삭제        |

### 좋아요 · 별점 · 태그

| Method | Path                                 | 인증 | 설명                  |
| ------ | ------------------------------------ | ---- | --------------------- |
| POST   | `/v1/board/posts/:seq/like`      | JWT  | 좋아요 토글           |
| POST   | `/v1/board/posts/:seq/rating`    | JWT  | 게시글 별점 (1~5)     |
| POST   | `/v1/board/comments/:seq/rating` | JWT  | 댓글 별점 (1~5)       |
| GET    | `/v1/board/tags`                 | —    | 태그 검색 목록        |
| PUT    | `/v1/board/posts/:seq/tags`      | JWT  | 게시글 태그 일괄 설정 |

### 신고

| Method | Path                                 | 인증         | 설명           |
| ------ | ------------------------------------ | ------------ | -------------- |
| POST   | `/v1/board/posts/:seq/report`    | JWT          | 게시글 신고    |
| POST   | `/v1/board/comments/:seq/report` | JWT          | 댓글 신고      |
| GET    | `/v1/board/admin/reports`        | JWT (관리자) | 신고 목록      |
| PATCH  | `/v1/board/admin/reports/:seq`   | JWT (관리자) | 신고 상태 변경 |

### 멘션

| Method | Path                               | 인증 | 설명           |
| ------ | ---------------------------------- | ---- | -------------- |
| GET    | `/v1/board/mentions`           | JWT  | 내 멘션 목록   |
| PATCH  | `/v1/board/mentions/:seq/read` | JWT  | 멘션 읽음 처리 |

---

## 카테고리 상세

### GET /v1/board/categories

카테고리 목록을 반환합니다. 기본적으로 `status = active`인 항목만 반환합니다.

| 위치        | 필드               | 타입    | 필수 | 설명                              |
| ----------- | ------------------ | ------- | ---- | --------------------------------- |
| Querystring | `include_inactive` | boolean | —    | `true`이면 비활성 카테고리도 포함 |

```bash
curl "http://localhost:3000/v1/board/categories"
```

`200 OK`

```json
{
    "ok": true,
    "data": {
        "items": [
            {
                "seq": 1,
                "name": "notice",
                "label": "공지사항",
                "sort_order": 0,
                "view_count_mode": "daily",
                "anonymous_enabled": "N",
                "comment_enabled": "Y",
                "rating_enabled": "N",
                "file_enabled": "Y",
                "like_enabled": "Y",
                "guest_write_enabled": "N",
                "status": "active"
            }
        ],
        "total": 1
    }
}
```

---

### POST /v1/board/categories

관리자만 호출 가능합니다.

| 위치 | 필드                  | 타입   | 필수 | 설명                                   |
| ---- | --------------------- | ------ | ---- | -------------------------------------- |
| Body | `name`                | string | ✅   | 영문 식별자 (URL에서 사용)             |
| Body | `label`               | string | ✅   | 표시명                                 |
| Body | `sort_order`          | number | —    | 정렬 순서 (기본 0)                     |
| Body | `view_count_mode`     | string | —    | `always` `daily` `once` (기본 `daily`) |
| Body | `anonymous_enabled`   | string | —    | `Y`/`N` – 익명 게시판 여부 (기본 `N`)  |
| Body | `comment_enabled`     | string | —    | `Y`/`N` – 댓글 허용 (기본 `Y`)         |
| Body | `rating_enabled`      | string | —    | `Y`/`N` – 별점 허용 (기본 `N`)         |
| Body | `file_enabled`        | string | —    | `Y`/`N` – 파일 첨부 허용 (기본 `N`)    |
| Body | `like_enabled`        | string | —    | `Y`/`N` – 좋아요 허용 (기본 `N`)       |
| Body | `guest_write_enabled` | string | —    | `Y`/`N` – 비회원 작성 허용 (기본 `N`)  |
| Body | `status`              | string | —    | `active`/`inactive` (기본 `active`)    |

```bash
curl -X POST "http://localhost:3000/v1/board/categories" \
  -H "Authorization: Bearer {access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "qna",
    "label": "Q&A",
    "comment_enabled": "Y",
    "rating_enabled": "Y"
  }'
```

`201 Created`

```json
{ "ok": true, "data": { "seq": 3 } }
```

---

## 게시글 상세

### GET /v1/board/:category/list

| 위치        | 필드       | 타입            | 필수 | 설명                                    |
| ----------- | ---------- | --------------- | ---- | --------------------------------------- |
| Params      | `category` | string          | ✅   | 카테고리 name                           |
| Querystring | `page`     | number          | —    | 페이지 번호 (기본 1)                    |
| Querystring | `per_page` | number          | —    | 페이지당 건수 (기본 20)                 |
| Querystring | `search`   | string          | —    | 검색어                                  |
| Querystring | `sort`     | string          | —    | 정렬 필드 (기본 `created_time`)         |
| Querystring | `order`    | `asc` \| `desc` | —    | 정렬 방향 (기본 `desc`)                 |
| Querystring | `pinned`   | `Y` \| `N`      | —    | 고정글 필터                             |
| Querystring | `root_seq` | number          | —    | 특정 원글의 답글만 조회                 |
| Querystring | `depth`    | number          | —    | 답글 depth 필터                         |
| Querystring | `status`   | string          | —    | `draft` 지정 시 본인 임시저장 글만 조회 |

```bash
curl "http://localhost:3000/v1/board/notice/list?page=1&per_page=10"
```

`200 OK`

```json
{
  "ok": true,
  "data": {
    "items": [...],
    "total": 42,
    "page": 1,
    "limit": 10
  }
}
```

---

### GET /v1/board/posts/:seq

게시글 상세를 반환합니다. 태그 이름 배열(`tags`)과 첨부파일 목록(`files`)이 함께 포함됩니다.  
`anonymous_enabled = Y` 카테고리는 `user_seq`가 `null`로 마스킹됩니다.  
조회수는 카테고리의 `view_count_mode` 설정에 따라 자동 증가합니다.

`200 OK`

```json
{
    "ok": true,
    "data": {
        "seq": 1,
        "title": "공지입니다",
        "content": "...",
        "tags": ["이벤트", "공지"],
        "files": [{ "uuid": "...", "filename": "...", "size": 12345 }],
        "is_mine": true,
        "view_count": 10
    }
}
```

---

### POST /v1/board/:category/submit

| 위치   | 필드         | 타입     | 필수 | 설명                                   |
| ------ | ------------ | -------- | ---- | -------------------------------------- |
| Params | `category`   | string   | ✅   | 카테고리 name                          |
| Body   | `title`      | string   | ✅   | 제목                                   |
| Body   | `content`    | string   | ✅   | 본문                                   |
| Body   | `parent_seq` | number   | —    | 답글 작성 시 부모 게시글 seq           |
| Body   | `pinned`     | `Y`/`N`  | —    | 고정글 여부 (관리자만 가능)            |
| Body   | `status`     | string   | —    | `published`/`draft` (기본 `published`) |
| Body   | `tags`       | string[] | —    | 태그 이름 배열                         |

`201 Created`

```json
{ "ok": true, "data": { "seq": 10 } }
```

---

### POST /v1/board/:category/guest-submit

비회원이 게시글을 작성합니다. 카테고리의 `guest_write_enabled = Y` 여야 합니다.

| 위치   | 필드             | 타입   | 필수 | 설명                          |
| ------ | ---------------- | ------ | ---- | ----------------------------- |
| Params | `category`       | string | ✅   | 카테고리 name                 |
| Body   | `title`          | string | ✅   | 제목                          |
| Body   | `content`        | string | ✅   | 본문                          |
| Body   | `guest_name`     | string | ✅   | 작성자 이름                   |
| Body   | `guest_password` | string | ✅   | 비회원 비밀번호 (수정/삭제용) |

`201 Created`

```json
{ "ok": true, "data": { "seq": 11 } }
```

---

### POST /v1/board/posts/:seq/guest-auth

비회원이 비밀번호를 입력해 임시 JWT를 발급받습니다. 발급된 토큰을 `Authorization: Bearer`에 담아 수정/삭제 요청합니다. 토큰 유효기간은 30분입니다.

| 위치 | 필드             | 타입   | 필수 |
| ---- | ---------------- | ------ | ---- |
| Body | `guest_password` | string | ✅   |

`200 OK`

```json
{
    "ok": true,
    "data": {
        "token": "eyJ...",
        "note": "이 토큰을 Authorization: Bearer 헤더에 담아 수정/삭제 요청"
    }
}
```

---

### POST /v1/board/posts/:seq/accept

답글을 채택합니다. 원글 작성자 또는 관리자만 호출 가능합니다.  
기존 채택 답글이 있으면 자동으로 채택 해제 후 새로 채택합니다.

`200 OK`

```json
{ "ok": true, "data": null }
```

---

## 댓글 상세

### GET /v1/board/posts/:postSeq/comments

| 위치        | 필드       | 타입            | 필수 | 설명                    |
| ----------- | ---------- | --------------- | ---- | ----------------------- |
| Params      | `postSeq`  | number          | ✅   | 게시글 seq              |
| Querystring | `page`     | number          | —    | 페이지 번호 (기본 1)    |
| Querystring | `per_page` | number          | —    | 페이지당 건수 (기본 50) |
| Querystring | `sort`     | string          | —    | 정렬 필드               |
| Querystring | `order`    | `asc` \| `desc` | —    | 정렬 방향 (기본 `asc`)  |

`anonymous_enabled = Y` 카테고리는 `user_seq`가 `null`로 마스킹됩니다.

---

### POST /v1/board/posts/:postSeq/comments/submit

카테고리의 `comment_enabled = Y` 여야 합니다. 본문에 `@username` 멘션이 있으면 자동으로 `board_mention`에 기록됩니다.

| 위치 | 필드      | 타입   | 필수 |
| ---- | --------- | ------ | ---- |
| Body | `content` | string | ✅   |

`201 Created`

```json
{ "ok": true, "data": { "seq": 5 } }
```

---

## 파일 상세

### POST /v1/board/posts/:postSeq/files

`multipart/form-data`로 파일을 업로드합니다. 게시글 작성자 또는 관리자만 가능합니다.

```bash
curl -X POST "http://localhost:3000/v1/board/posts/10/files" \
  -H "Authorization: Bearer {access_token}" \
  -F "file=@/path/to/image.png"
```

`200 OK`

```json
{ "ok": true, "data": { "uuid": "550e8400-e29b-41d4-a716-446655440000" } }
```

---

## 좋아요 상세

### POST /v1/board/posts/:seq/like

좋아요가 없으면 추가, 있으면 취소(토글)합니다.

`200 OK`

```json
{ "ok": true, "data": { "liked": true } }
```

---

## 별점 상세

### POST /v1/board/posts/:seq/rating

### POST /v1/board/comments/:seq/rating

카테고리의 `rating_enabled = Y` 여야 합니다. 같은 대상에 이미 별점이 있으면 수정합니다.

| 위치 | 필드    | 타입   | 필수 | 설명     |
| ---- | ------- | ------ | ---- | -------- |
| Body | `score` | number | ✅   | 1~5 정수 |

`200 OK`

```json
{ "ok": true, "data": { "created": true } }
```

```json
{ "ok": true, "data": { "updated": true } }
```

---

## 태그 상세

### GET /v1/board/tags

사용 횟수(`use_count`) 내림차순으로 반환합니다.

| 위치        | 필드     | 타입   | 필수 | 설명                |
| ----------- | -------- | ------ | ---- | ------------------- |
| Querystring | `search` | string | —    | 태그 이름 검색      |
| Querystring | `limit`  | number | —    | 최대 건수 (기본 30) |

---

### PUT /v1/board/posts/:seq/tags

게시글에 연결된 태그를 일괄 교체합니다. 기존 태그 연결을 모두 삭제 후 새로 설정합니다.  
존재하지 않는 태그 이름은 자동 생성됩니다.

| 위치 | 필드   | 타입     | 필수 |
| ---- | ------ | -------- | ---- |
| Body | `tags` | string[] | ✅   |

`200 OK`

```json
{ "ok": true, "data": null }
```

---

## 신고 상세

### POST /v1/board/posts/:seq/report

### POST /v1/board/comments/:seq/report

동일 대상에 대한 중복 신고는 `400`을 반환합니다.

| 위치 | 필드     | 타입   | 필수 | 설명      |
| ---- | -------- | ------ | ---- | --------- |
| Body | `reason` | string | ✅   | 신고 사유 |
| Body | `detail` | string | —    | 상세 내용 |

`200 OK`

```json
{ "ok": true, "data": null }
```

---

### GET /v1/board/admin/reports

관리자 전용. 신고 목록을 조회합니다.

| 위치        | 필드       | 타입   | 필수 | 설명                                  |
| ----------- | ---------- | ------ | ---- | ------------------------------------- |
| Querystring | `status`   | string | —    | `pending` `resolved` `dismissed` 필터 |
| Querystring | `page`     | number | —    | 페이지 번호                           |
| Querystring | `per_page` | number | —    | 페이지당 건수                         |

---

### PATCH /v1/board/admin/reports/:seq

신고 처리 상태를 변경합니다. `hide_target = true`로 설정하면 신고 대상(게시글/댓글)의 `status`도 `hidden`으로 변경됩니다.

| 위치 | 필드          | 타입    | 필수 | 설명                         |
| ---- | ------------- | ------- | ---- | ---------------------------- |
| Body | `status`      | string  | ✅   | `resolved` \| `dismissed`    |
| Body | `hide_target` | boolean | —    | 대상 콘텐츠도 숨김 처리 여부 |

`200 OK`

```json
{ "ok": true, "data": null }
```

---

## 멘션 상세

### GET /v1/board/mentions

로그인한 사용자가 멘션된 목록을 조회합니다.

| 위치        | 필드       | 타입   | 필수 | 설명                    |
| ----------- | ---------- | ------ | ---- | ----------------------- |
| Querystring | `is_read`  | string | —    | `Y`/`N` 필터            |
| Querystring | `page`     | number | —    | 페이지 번호 (기본 1)    |
| Querystring | `per_page` | number | —    | 페이지당 건수 (기본 20) |

---

### PATCH /v1/board/mentions/:seq/read

본인 멘션만 처리 가능합니다.

`200 OK`

```json
{ "ok": true, "data": null }
```
