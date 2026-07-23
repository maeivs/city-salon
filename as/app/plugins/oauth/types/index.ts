/**
 * OAuth 2.0 타입 정의
 */

export interface OAuthProviderConfig {
    driver: string;
    client_id: string;
    client_secret: string;
    redirect_url?: string;
    scopes?: string[];
    auth_url?: string;
    token_url?: string;
    user_info_url?: string;
    email_field?: string;
    name_field?: string;
    pkce?: boolean;
    /** Apple Sign-In 전용 */
    apple_team_id?: string;
    apple_key_id?: string;
    apple_private_key?: string;
}

export interface OAuthConfig {
    enabled: boolean;
    state_secret?: string;
    state_ttl_sec?: number;
    success_redirect_url?: string;
    failure_redirect_url?: string;
    providers: OAuthProviderConfig[];
}

export interface OAuthUserInfo {
    provider: string;
    provider_id: string;
    email: string;
    name: string;
    profile_image: string;
    access_token: string;
    refresh_token: string;
    token_expires_at: string;
}

export interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
    id_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
}
