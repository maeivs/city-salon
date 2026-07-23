export interface AlimtalkConfig {
    enabled?: boolean;
    default: string;
    sender_key: string;
    workers: number;
    dispatch_interval_sec: number;
    queue_size: number;
    max_retries: number;
    providers: Record<string, AlimtalkProviderConfig>;
    templates?: AlimtalkTemplateMapping[]; // 알림톡 사전 등록 템플릿 목록 — templates/notification/alimtalk.json에서 별도 로드
    rate_limit?: AlimtalkRateLimitConfig;
    friendtalk?: FriendTalkConfig;
}

export interface FriendTalkConfig {
    enabled?: boolean;
    workers: number;
    ad_prefix: string;
    default_ad: boolean;
    templates?: FriendTalkTemplate[]; // 친구톡 자유 형식 본문 패턴 — templates/notification/friendtalk.json에서 별도 로드
}

/** 친구톡 자유 형식 본문 템플릿 (알림톡의 templateCode 방식과 무관) */
export interface FriendTalkTemplate {
    code: string;
    description: string;
    msgType: string; // 메시지 유형: "text" | "image" | "wide_image" | "wide_item_list" | "carousel"
    content: string;
    variables: string[];
}

export interface AlimtalkProviderConfig {
    driver: string; // "aligo" | "solapi" | "ppurio" | "nhn_cloud"
    api_key: string;
    api_secret: string;
    user_id: string;
    account: string;
    sender_key: string;
    pf_id: string;
    app_key: string;
    secret_key: string;
}

export interface AlimtalkTemplateMapping {
    code: string;
    description: string;
    variables: string[];
}

export interface AlimtalkRateLimitConfig {
    per_minute: number;
    per_hour: number;
}
