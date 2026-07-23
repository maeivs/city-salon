/**
 * 다날 본인인증 어댑터
 *
 * 인증 흐름:
 * 1. AES-256-CBC 암호화 (client_secret/client_id 기반 키 유도)
 * 2. 팝업: https://uas.danal.co.kr/ipin/authCheck
 * 3. 콜백: AES 복호화 → 결과 추출
 */

import type {
    IdentityProviderConfig,
    PrepareInput,
    PrepareOutput,
    VerificationResult,
    ProviderName,
} from "../types/index.ts";
import type { IdentityClient } from "./index.ts";
import { encryptAesCbc, decryptAesCbc, deriveDanalKey } from "../crypto.ts";

/** 다날 본인인증 클라이언트 */
export class DanalClient implements IdentityClient {
    private cfg: IdentityProviderConfig;

    /** DanalClient를 생성한다 */
    constructor(cfg: IdentityProviderConfig) {
        if (!cfg.clientId || !cfg.clientSecret) {
            throw new Error("danal: client_id and client_secret are required");
        }
        if (!cfg.apiUrl) cfg.apiUrl = "https://uas.danal.co.kr";
        this.cfg = cfg;
    }

    /** 프로바이더 이름을 반환한다 */
    name(): ProviderName {
        return "danal";
    }

    /** 인증 요청을 준비한다 */
    async prepareRequest(input: PrepareInput): Promise<PrepareOutput> {
        const now = new Date();
        const ts = now
            .toISOString()
            .replace(/[-T:.Z]/g, "")
            .slice(0, 14);
        const transId = `DN${ts}${input.requestId.slice(0, 16)}`;

        const reqData = JSON.stringify({
            cp_id: this.cfg.clientId,
            trans_id: transId,
            req_no: input.requestId,
            rtn_url: input.returnUrl,
            cust_ip: input.ip,
        });

        // AES-256-CBC 암호화
        const { key, iv } = deriveDanalKey(
            this.cfg.clientSecret!,
            this.cfg.clientId!,
        );
        const encData = encryptAesCbc(Buffer.from(reqData, "utf-8"), key, iv);

        return {
            popupUrl: `${this.cfg.apiUrl}/ipin/authCheck`,
            encData,
        };
    }

    /** 콜백 데이터를 복호화하여 결과를 파싱한다 */
    async parseCallback(encData: string): Promise<VerificationResult> {
        const { key, iv } = deriveDanalKey(
            this.cfg.clientSecret!,
            this.cfg.clientId!,
        );
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
            requestId: values.req_no ?? "",
            ci: values.ci ?? "",
            di: values.di ?? "",
            name: values.name ?? "",
            birthDate: values.birth_date ?? "",
            gender: normalizeGender(values.gender ?? ""),
            carrier: normalizeCarrier(values.carrier ?? ""),
            phone: values.phone ?? "",
            nationality: normalizeNationality(values.nationality ?? ""),
        };
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
