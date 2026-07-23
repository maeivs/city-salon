# 휴면 정책 스케줄러 (Dormancy)

> **위치**: `app/schedules/dormancy/`  
> **유형**: 크론 스케줄 (기본 매일 02:00)  
> **분산 락**: `privacy_cron_lock` 엔티티 (job: `privacy:dormancy`)

---

## 개요

장기 미접속 계정에 경고 이메일을 발송하고, 설정된 기간이 지나면 자동으로
휴면 상태(`dormant`)로 전환하는 배치 스케줄러입니다.

Go 엔티티서버의 `internal/privacy/service.go` (`dormancyLoop` /
`runDormancyCycle`)에서 게이트웨이로 이관되었습니다.

---

## 동작 흐름

```
매일 02:00 (cron)
  ├─ 분산 락 획득 (privacy:dormancy, slot = now/86400)
  │
  ├─ active 계정 페이징 조회 (500건씩)
  │    ├─ admin 건너뛰기 (rbac_role == "admin")
  │    ├─ resolveLastActivityTime: last_login_time → updated_time → created_time
  │    │
  │    ├─ [A] 마지막 활동 < cutoff (now - dormancy_days)
  │    │    ├─ status = "dormant" 전환
  │    │    └─ (send_completed_email = true 이면) 휴면 완료 안내 이메일 발송
  │    │
  │    └─ [B] 경고 이메일
  │         ├─ warningDays [30, 7] 내림차순 대조
  │         ├─ daysUntilDormancy ≤ warnDay AND lastWarned ≠ warnDay
  │         ├─ dormancy_warned_days 업데이트 (중복 방지)
  │         └─ 이메일 발송
  │
  └─ 분산 락 해제
```

---

## 설정 (`config.json`)

| 필드                       | 타입     | 기본값                         | 설명                                     |
| -------------------------- | -------- | ------------------------------ | ---------------------------------------- |
| `enabled`                  | boolean  | `false`                        | 스케줄러 활성화 여부                     |
| `dormancy_days`            | number   | `365`                          | 휴면 전환 기준 일수 (마지막 활동 기준)   |
| `warning_days`             | number[] | `[30, 7]`                      | 경고 발송 기준 일수 (휴면까지 남은 일수) |
| `cron`                     | string   | `"0 2 * * *"`                  | 크론 표현식                              |
| `email_subject`            | string   | `"계정 휴면 예정 안내"`        | 경고 이메일 제목 접두어                  |
| `email_template`           | string   | `"account/dormancy_warning"`   | 경고 이메일 템플릿 경로                  |
| `login_url`                | string   | `""`                           | 로그인 페이지 URL (템플릿 변수)          |
| `send_completed_email`     | boolean  | `false`                        | 휴면 전환 완료 시 안내 이메일 발송 여부  |
| `completed_email_subject`  | string   | `"계정이 휴면 처리되었습니다"` | 완료 이메일 제목                         |
| `completed_email_template` | string   | `"account/dormancy_completed"` | 완료 이메일 템플릿 경로                  |

---

## 이메일 템플릿

### 경고 이메일: `templates/email/account/dormancy_warning.html`

| 변수           | 설명               |
| -------------- | ------------------ |
| `${email}`     | 사용자 이메일      |
| `${days_left}` | 휴면까지 남은 일수 |
| `${login_url}` | 로그인 페이지 URL  |

### 완료 이메일: `templates/email/account/dormancy_completed.html`

`send_completed_email = true` 일 때 계정이 실제로 휴면 전환된 직후 발송된다.

| 변수           | 설명              |
| -------------- | ----------------- |
| `${email}`     | 사용자 이메일     |
| `${login_url}` | 로그인 페이지 URL |

---

# 데이터 보유기간 스케줄러 (Data Retention)

> **위치**: `app/schedules/data-retention/`  
> **유형**: 크론 스케줄 (기본 매일 02:30)  
> **분산 락**: `privacy_cron_lock` 엔티티 (job: `privacy:retention`)

---

## 개요

휴면(`dormant`) 상태로 전환된 후 보유기간(`retention_days`)이 경과한 계정을
자동으로 익명화 또는 삭제하는 배치 스케줄러입니다.

---

## 동작 흐름

```
매일 02:30 (cron)
  ├─ 분산 락 획득 (privacy:retention)
  │
  ├─ dormant 계정 페이징 조회 (500건씩)
  │    ├─ updated_time (= 휴면 전환 시점) + retention_days < 현재 시각
  │    │
  │    ├─ action == "delete"
  │    │    └─ hard delete (account)
  │    │
  │    └─ action == "anonymize" (기본)
  │         ├─ email → "withdrawn_{seq}@anonymized.local"
  │         ├─ status → "inactive"
  │         └─ passwd → ""
  │
  │    └─ 후처리 (공통)
  │         ├─ account_oauth 레코드 삭제
  │         ├─ user 엔티티 익명화 (name → "탈퇴회원_{user.seq}")
  │         └─ password_history 삭제
  │
  └─ 분산 락 해제
```

---

## 설정 (`config.json`)

| 필드             | 타입    | 기본값         | 설명                                 |
| ---------------- | ------- | -------------- | ------------------------------------ |
| `enabled`        | boolean | `false`        | 스케줄러 활성화 여부                 |
| `retention_days` | number  | `1095`         | 보유기간 (일, 기본 약 3년)           |
| `action`         | string  | `"anonymize"`  | 처리 방식: `anonymize` 또는 `delete` |
| `cron`           | string  | `"30 2 * * *"` | 크론 표현식                          |

---

## 관련 엔티티

| 엔티티             | 용도                                   |
| ------------------ | -------------------------------------- |
| `account`          | 대상 계정 (status: dormant → inactive) |
| `account_oauth`    | OAuth 연동 레코드 (삭제)               |
| `user`             | 사용자 프로필 (익명화)                 |
| `password_history` | 비밀번호 이력 (삭제)                   |

---

## Go 서버와의 차이점

| 항목          | Go 서버                  | Entity App Server (TS)     |
| ------------- | ------------------------ | -------------------------- |
| 스케줄링      | ticker 기반              | croner 기반 고정 시각 cron |
| 설정          | `privacy_policy.json`    | 스케줄 전용 `config.json`  |
| login_url     | 미전달 (템플릿 기본값 #) | 설정 가능                  |
| email_subject | 하드코딩                 | 설정 가능                  |
| 에러 처리     | panic 시 락 미해제       | `try/finally` 락 해제 보장 |

---

## 관련 문서

- [스케줄 추가 가이드](how-to-create.md)
