/**
 * NICE CheckPlus v2 본인인증 어댑터
 *
 * 인증 흐름:
 * 1. OAuth2 access_token 발급 (client_credentials)
 * 2. crypto token API → token_val (키 유도 재료)
 * 3. AES-128-CBC 암호화 + HMAC-SHA256 무결성 값 생성
 * 4. 팝업: https://nice.checkplus.co.kr/CheckPlusSafeModel/service.cb
 * 5. 콜백: token_val 기반 AES-128-CBC 복호화 → 결과 추출
 */

import type {
    IdentityProviderConfig,
    PrepareInput,
    PrepareOutput,
    VerificationResult,
    ProviderName,
} from "../types/index.ts";
import type { IdentityClient } from "./index.ts";
import {
    encryptAesCbc,
    decryptAesCbc,
    hmacSha256,
    deriveNiceKeyIV,
    deriveNiceHmacKey,
    hashCI,
} from "../crypto.ts";

/** OAuth2 토큰 캐시 */
interface TokenCache {
    accessToken: string;
    expiresAt: number;
}

/** NICE 크립토 토큰 응답 */
interface CryptoTokenResponse {
    dataHeader: { GW_RSLT_CD: string; GW_RSLT_MSG: string };
    dataBody: {
        rsp_cd: string;
        token_val: string;
        token_version_id: string;
        site_code: string;
        period: number;
    };
}

/** NICE CheckPlus v2 클라이언트 */
export class NiceClient implements IdentityClient {
    private cfg: IdentityProviderConfig;
    private tokenCache: TokenCache | null = null;

    /** NiceClient를 생성한다 */
    constructor(cfg: IdentityProviderConfig) {
        if (!cfg.clientId || !cfg.clientSecret) {
            throw new Error("nice: client_id and client_secret are required");
        }
        if (!cfg.apiUrl) cfg.apiUrl = "https://nice.checkplus.co.kr";
        if (!cfg.tokenUrl) {
            cfg.tokenUrl =
                "https://svc.niceapi.co.kr:22001/digital/niceid/oauth/oauth/token";
        }
        if (!cfg.cryptoUrl) {
            cfg.cryptoUrl =
                "https://svc.niceapi.co.kr:22001/digital/niceid/v1.0/common/crypto/token";
        }
        this.cfg = cfg;
    }

    /** 프로바이더 이름을 반환한다 */
    name(): ProviderName {
        return "nice";
    }

    /** OAuth2 access_token을 발급/캐시한다 */
    private async getAccessToken(): Promise<string> {
        if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
            return this.tokenCache.accessToken;
        }

        const credentials = Buffer.from(
            `${this.cfg.clientId}:${this.cfg.clientSecret}`,
        ).toString("base64");

        const resp = await fetch(this.cfg.tokenUrl!, {
            method: "POST",
            headers: {
                Authorization: `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials&scope=default",
        });

        if (!resp.ok) {
            throw new Error(
                `nice: token request failed: ${resp.status} ${resp.statusText}`,
            );
        }

        const data = (await resp.json()) as {
            access_token: string;
            token_type: string;
            expires_in: number;
        };
        const token = data.access_token;
        const expiresIn = data.expires_in ?? 3600;

        this.tokenCache = {
            accessToken: token,
            expiresAt: Date.now() + (expiresIn - 10) * 1000,
        };

        return token;
    }

    /** 크립토 토큰을 발급한다 */
    private async getCryptoToken(
        accessToken: string,
        requestId: string,
    ): Promise<{ tokenVal: string; tokenVersionId: string; siteCode: string }> {
        const now = Math.floor(Date.now() / 1000);
        const reqDtim = new Date(now * 1000)
            .toISOString()
            .replace(/[-T:.Z]/g, "")
            .slice(0, 14);

        const resp = await fetch(this.cfg.cryptoUrl!, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                ProductID: this.cfg.productId ?? "",
            },
            body: JSON.stringify({
                dataHeader: { CNTY_CD: "ko" },
                dataBody: {
                    req_dtim: reqDtim,
                    req_no: requestId.slice(0, 30),
                    enc_mode: "1",
                },
            }),
        });

        if (!resp.ok) {
            throw new Error(
                `nice: crypto token request failed: ${resp.status}`,
            );
        }

        const result = (await resp.json()) as CryptoTokenResponse;
        if (result.dataBody.rsp_cd !== "P000") {
            throw new Error(
                `nice: crypto token error: ${result.dataBody.rsp_cd}`,
            );
        }

        if (!result.dataBody.token_val) {
            throw new Error(
                `nice: empty token_val in crypto response (rsp_cd=${result.dataBody.rsp_cd})`,
            );
        }

        return {
            tokenVal: result.dataBody.token_val,
            tokenVersionId: result.dataBody.token_version_id,
            siteCode: result.dataBody.site_code,
        };
    }

    /** 인증 요청을 준비한다 */
    async prepareRequest(input: PrepareInput): Promise<PrepareOutput> {
        const accessToken = await this.getAccessToken();
        const { tokenVal, tokenVersionId, siteCode } =
            await this.getCryptoToken(accessToken, input.requestId);

        // 요청 데이터 구성
        const reqDataObj: Record<string, string> = {
            requestno: input.requestId,
            returnurl: input.returnUrl,
            sitecode: siteCode,
            methodtype: "get",
            popupyn: "Y",
            receivedata: input.requestId,
        };
        if (input.method === "pass") {
            reqDataObj.authtype = "P";
        }
        const reqData = JSON.stringify(reqDataObj);

        // AES-128-CBC 암호화
        const { key, iv } = deriveNiceKeyIV(tokenVal);
        const encData = encryptAesCbc(Buffer.from(reqData, "utf-8"), key, iv);

        // HMAC-SHA256 무결성 값 생성 (키 = sha256(tokenVal + "HMAC"))
        const hmacKey = deriveNiceHmacKey(tokenVal);
        const integrityValue = hmacSha256(
            Buffer.from(encData, "utf-8"),
            hmacKey,
        );

        return {
            popupUrl: `${this.cfg.apiUrl}/CheckPlusSafeModel/service.cb`,
            encData,
            tokenVersionId,
            integrityValue,
            tokenVal,
        };
    }

    /** 콜백 데이터를 파싱한다 (기본 키) */
    async parseCallback(encData: string): Promise<VerificationResult> {
        throw new Error(
            "nice: parseCallback requires token_val, use parseCallbackWithKey instead",
        );
    }

    /** token_val 기반으로 콜백 데이터를 복호화한다 */
    async parseCallbackWithKey(
        encData: string,
        tokenVal: string,
    ): Promise<VerificationResult> {
        const { key, iv } = deriveNiceKeyIV(tokenVal);
        const decrypted = decryptAesCbc(encData, key, iv);
        const text = decrypted.toString("utf-8");

        // URL 쿼리 또는 JSON 파싱
        let values: Record<string, string>;
        try {
            const params = new URLSearchParams(text);
            values = Object.fromEntries(params.entries());
        } catch {
            values = JSON.parse(text);
        }

        return {
            requestId: values.requestno ?? values.receivedata ?? "",
            ci: values.ci ?? "",
            di: values.di ?? "",
            name: values.utf8_name ?? values.name ?? "",
            birthDate: values.birthdate ?? "",
            gender: normalizeGender(values.gender ?? ""),
            carrier: normalizeCarrier(values.mobileco ?? ""),
            phone: values.mobileno ?? "",
            nationality: normalizeNationality(values.nationalinfo ?? ""),
            authType: values.authtype,
        };
    }

    /** 토큰 값과 버전 ID를 반환한다 (서비스에서 캐시용) */
    get tokenVersionId(): string | undefined {
        return undefined;
    }
}

/** 성별 코드를 정규화한다 */
function normalizeGender(code: string): string {
    switch (code) {
        case "0":
        case "M":
        case "m":
        case "male":
            return "M";
        case "1":
        case "F":
        case "f":
        case "female":
            return "F";
        default:
            return code;
    }
}

/** 통신사 코드를 정규화한다 */
function normalizeCarrier(code: string): string {
    const map: Record<string, string> = {
        "1": "SKT",
        "01": "SKT",
        "2": "KT",
        "02": "KT",
        "3": "LGU",
        "03": "LGU",
        "4": "MVNO_SKT",
        "04": "MVNO_SKT",
        "5": "MVNO_KT",
        "05": "MVNO_KT",
        "6": "MVNO_LGU",
        "06": "MVNO_LGU",
    };
    return map[code] ?? code;
}

/** 국적 코드를 정규화한다 */
function normalizeNationality(code: string): string {
    switch (code) {
        case "0":
        case "local":
        case "":
            return "local";
        case "1":
        case "foreign":
            return "foreign";
        default:
            return code;
    }
}
