/** plugins/smtp/config.json 스키마 */
export interface SmtpPluginConfig {
    enabled: boolean; // 라우트 활성화 여부 (false면 routes.ts 등록 안 됨)

    deploy?: boolean; // 빌드 시 dist에서 제외 여부

    minify?: boolean; // 빌드 시 난독화 여부
}
