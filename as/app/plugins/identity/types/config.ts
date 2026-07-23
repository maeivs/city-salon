/** 프로바이더별 설정 */
export interface IdentityProviderConfig {
    driver: string;
    siteCode?: string;
    sitePassword?: string;
    clientId?: string;
    clientSecret?: string;
    productId?: string;
    cpCd?: string;
    urlCd?: string;
    certKey?: string;
    apiUrl?: string;
    tokenUrl?: string;
    cryptoUrl?: string;
}

/** 요청 제한 설정 */
export interface IdentityRateLimitConfig {
    perIpPerHour: number;
    perAccountPerDay: number;
}

/** 본인인증 전체 설정 */
export interface IdentityConfig {
    enabled?: boolean;
    default: string;
    requestTtlSec: number;
    resultTtlSec: number;
    returnUrl: string;
    successRedirectUrl?: string;
    failureRedirectUrl?: string;
    duplicateCiCheck: boolean;
    providers: Record<string, IdentityProviderConfig>;
    rateLimit: IdentityRateLimitConfig;
}
