import { randomBytes } from "node:crypto";
import { hmacSha256Hex } from "@system/api";

export type SolapiAuthHeader = {
    authorization: string;
    date: string;
    salt: string;
    signature: string;
};

/** Solapi HMAC-SHA256 Authorization 헤더를 생성한다. */
export function buildSolapiAuthorization(
    apiKey: string,
    apiSecret: string,
): SolapiAuthHeader {
    const date = new Date().toISOString();
    const salt = randomBytes(16).toString("hex");
    const signature = hmacSha256Hex(date + salt, apiSecret);

    return {
        authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
        date,
        salt,
        signature,
    };
}
