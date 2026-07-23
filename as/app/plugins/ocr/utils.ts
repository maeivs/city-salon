/**
 * OCR 모듈 유틸리티
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** CLI 도구 존재 여부 확인 */
export async function which(cmd: string): Promise<boolean> {
    try {
        await execFileAsync("which", [cmd]);
        return true;
    } catch {
        return false;
    }
}
