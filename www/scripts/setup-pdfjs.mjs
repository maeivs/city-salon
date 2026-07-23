/**
 * PDF.js 뷰어 자산 자동 세팅 (npm postinstall 로 자동 실행, 크로스플랫폼 node).
 *
 * 목적: FileViewer 의 PDF 미리보기가 쓰는 worker/cmaps/표준폰트/wasm 을
 *       설치된 pdfjs-dist 버전 그대로 static/pdfjs/ 에 복사한다.
 *       CDN 고정 버전을 쓰면 pdfjs-dist 업그레이드 시 API/Worker 버전이 어긋나
 *       "PDF 파일을 불러올 수 없습니다." 로 조용히 깨진다(CDN 차단 환경도 대비).
 *
 * 자산은 .gitignore 대상이라 커밋되지 않고, 이 스크립트가 매 설치 때 재생성한다.
 * vite publicDir=static 이라 런타임 경로는 개발/운영 모두 `/pdfjs/...` 다.
 */
import { existsSync, mkdirSync, copyFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WWW = join(HERE, "..");
const DST = join(WWW, "static", "pdfjs");

/**
 * FileViewer 는 `import { pdfjs } from "react-pdf"` 로 pdfjs API 를 쓰므로,
 * worker 는 **react-pdf 가 실제로 해석하는** pdfjs-dist 여야 한다.
 * react-pdf 는 pdfjs-dist 를 정확한 버전으로 고정(핀)하기 때문에, www 가 pdfjs-dist 를
 * 직접 의존하면 최상위(다른 버전)와 react-pdf 하위(핀 버전) 두 벌이 설치될 수 있다.
 * 최상위를 복사하면 API/Worker 버전이 또 어긋나므로 반드시 react-pdf 기준으로 해석한다.
 */
function resolvePdfjsRoot() {
    const req = createRequire(join(WWW, "package.json"));
    try {
        const fromReactPdf = createRequire(req.resolve("react-pdf/package.json"));
        return dirname(fromReactPdf.resolve("pdfjs-dist/package.json"));
    } catch {
        // react-pdf 미설치 등 예외 상황에서만 최상위 pdfjs-dist 로 폴백한다.
        try {
            return dirname(req.resolve("pdfjs-dist/package.json"));
        } catch {
            return "";
        }
    }
}

const SRC = resolvePdfjsRoot();

// 복사 대상 디렉터리(cmaps=CJK 폰트 매핑, standard_fonts=내장폰트 없는 PDF, wasm=이미지 디코더).
const DIRS = ["cmaps", "standard_fonts", "wasm"];
// 복사 대상 단일 파일(worker 는 pdfjs API 와 버전이 반드시 같아야 한다).
const FILES = [["build", "pdf.worker.min.mjs"]];

/** 디렉터리를 재귀 복사한다. */
function copyDir(src, dst) {
    mkdirSync(dst, { recursive: true });
    for (const entry of readdirSync(src, { withFileTypes: true })) {
        const from = join(src, entry.name);
        const to = join(dst, entry.name);
        if (entry.isDirectory()) copyDir(from, to);
        else copyFileSync(from, to);
    }
}

/** pdfjs-dist 자산을 static/pdfjs 로 복사한다(항상 — 설치 버전과 자동 일치). */
function copyAssets() {
    if (!SRC || !existsSync(SRC)) {
        console.warn("[pdfjs] pdfjs-dist 미설치 — 자산 복사 건너뜀");
        return;
    }
    const version = createRequire(join(SRC, "package.json"))("./package.json").version;
    rmSync(DST, { recursive: true, force: true }); // 구버전 잔재 제거
    mkdirSync(DST, { recursive: true });

    for (const dir of DIRS) {
        const from = join(SRC, dir);
        if (!existsSync(from)) {
            console.warn(`[pdfjs] ${dir} 없음 — 건너뜀`);
            continue;
        }
        copyDir(from, join(DST, dir));
    }

    for (const parts of FILES) {
        const from = join(SRC, ...parts);
        if (!existsSync(from)) {
            console.warn(`[pdfjs] ${parts.join("/")} 없음 — 건너뜀`);
            continue;
        }
        copyFileSync(from, join(DST, parts[parts.length - 1]));
    }

    console.log(`[pdfjs] v${version} worker/cmaps/standard_fonts/wasm 복사 → static/pdfjs`);
}

copyAssets();
