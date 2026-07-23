/**
 * KMC 한국모바일인증 어댑터
 *
 * 인증 흐름:
 * 1. CP코드 + URL코드 + certNum 결합 → 3DES-CBC 암호화
 * 2. 팝업: https://www.kmcert.com/kmcis/web/kmcisReq.jsp
 * 3. 콜백: rec_cert 파라미터 복호화 → CI/DI 추출
 */

import type {
    IdentityProviderConfig,
    PrepareInput,
    PrepareOutput,
    VerificationResult,
    ProviderName,
} from "../types/index.ts";
import type { IdentityClient } from "./index.ts";
import { encrypt3DesCbc, decrypt3DesCbc, deriveKmcKey } from "../crypto.ts";

/** KMC 한국모바일인증 클라이언트 */
export class KmcClient implements IdentityClient {
    private cfg: IdentityProviderConfig;

    /** KmcClient를 생성한다 */
    constructor(cfg: IdentityProviderConfig) {
        if (!cfg.cpCd || !cfg.certKey) {
            throw new Error("kmc: cp_cd and cert_key are required");
        }
        if (!cfg.apiUrl) cfg.apiUrl = "https://www.kmcert.com";
        this.cfg = cfg;
    }

    /** 프로바이더 이름을 반환한다 */
    name(): ProviderName {
        return "kmc";
    }

    /** 인증 요청을 준비한다 */
    async prepareRequest(input: PrepareInput): Promise<PrepareOutput> {
        const certNum = `${input.requestId.slice(0, 16)}${Date.now() % 100000}`;

        const reqData = JSON.stringify({
            cp_cd: this.cfg.cpCd,
            url_cd: this.cfg.urlCd,
            cert_num: certNum,
            req_no: input.requestId,
            tr_url: input.returnUrl,
            tr_add: input.requestId,
        });

        // 3DES-CBC 암호화
        const { key, iv } = deriveKmcKey(this.cfg.certKey!);
        const encData = encrypt3DesCbc(Buffer.from(reqData, "utf-8"), key, iv);

        return {
            popupUrl: `${this.cfg.apiUrl}/kmcis/web/kmcisReq.jsp`,
            encData,
        };
    }

    /** 콜백 데이터를 복호화하여 결과를 파싱한다 */
    async parseCallback(encData: string): Promise<VerificationResult> {
        const { key, iv } = deriveKmcKey(this.cfg.certKey!);
        const decrypted = decrypt3DesCbc(encData, key, iv);
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
            requestId: values.tr_add ?? "",
            ci: values.ci ?? "",
            di: values.di ?? "",
            name: values.name ?? "",
            birthDate: values.birth_day ?? "",
            gender: normalizeGender(values.gender ?? ""),
            carrier: normalizeCarrier(values.tel_com_cd ?? ""),
            phone: values.hp_no ?? "",
            nationality: normalizeNationality(values.nation ?? ""),
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
