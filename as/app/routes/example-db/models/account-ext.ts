/**
 * account-ext.ts 예제 — 기존 테이블에 플러그인 필드를 추가하는 방법
 *
 * Go 서버가 관리하는 account 테이블의 data JSON blob에
 * 플러그인이 자체 필드를 저장할 때, 타입 안전성을 위해
 * 아래처럼 AccountExtensions를 확장합니다.
 *
 * 실제로 DB를 직접 쓰는 경우에만 필요합니다.
 * Go API를 통해 account를 읽고 쓴다면 필요하지 않습니다.
 */

// AccountExtensions 확장 예제
// declare module "@system/api" {
//     interface AccountExtensions {
//         my_plugin_enabled?: boolean;   // 플러그인 활성화 여부
//         my_plugin_data?: string;       // 플러그인 저장 데이터
//     }
// }
// export {};

// AccountTable 자체를 확장하는 예제 (인덱스 컬럼 추가 시)
// declare module "@system/api" {
//     interface Database {
//         account: import("kysely").Selectable<{
//             seq: number;
//             email: string;
//             my_index_column: string | null;
//         }>;
//     }
// }
// export {};

export {};
