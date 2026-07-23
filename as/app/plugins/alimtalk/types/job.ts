export interface AlimtalkJob {
    provider: string;
    templateCode: string;
    templateName: string;
    receiver: string;
    variables: Record<string, string>;
    buttons: AlimtalkButton[];
    refEntity: string;
    refSeq: number;
    msgSeq: number;
}

export interface PendingAlimtalkLog {
    logSeq: number;
    provider: string;
    templateCode: string;
    templateName: string;
    receiver: string;
    variablesJSON: string;
    retryCount: number;
    msgSeq: number;
}

export interface AlimtalkButton {
    type: string; // "WL" (web link), "AL" (app link), "DS" (delivery), "BK" (bot keyword)
    name: string;
    ordering: number;
    url_web: string;
    url_app: string;
    scheme: string;
    link_mobile: string;
    link_pc: string;
    scheme_ios: string;
    scheme_android: string;
}

export interface AlimtalkRequest {
    senderKey: string;
    templateCode: string;
    receiver: string;
    variables: Record<string, string>;
    buttons: AlimtalkButton[];
}

export interface AlimtalkResult {
    providerMsgId: string;
    statusCode: string;
    requestId: string;
}

export interface AlimtalkTemplate {
    templateCode: string;
    templateName: string;
    content: string;
    variables: string[];
}
