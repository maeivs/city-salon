import { access, cp, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const buildDirName = ".build-public";
const backupDirName = ".build-public-backup";
const require = createRequire(import.meta.url);

/** 임시 빌드 디렉터리를 깨끗하게 준비한다. */
async function prepareBuildDirectory(buildDirPath) {
    await rm(buildDirPath, { recursive: true, force: true });
}

/** 경로가 존재하는지 확인한다. */
async function pathExists(targetPath) {
    try {
        await access(targetPath);
        return true;
    } catch {
        return false;
    }
}

/** 로컬 설치된 Vite CLI 진입 파일 경로를 구한다. */
function resolveViteCliPath() {
    const vitePackageJsonPath = require.resolve("vite/package.json", { paths: [projectRoot] });
    const vitePackageRoot = dirname(vitePackageJsonPath);

    return resolve(vitePackageRoot, "bin", "vite.js");
}

/** Vite 프로덕션 빌드를 임시 디렉터리로 실행한다. */
async function runViteBuild() {
    const viteCliPath = resolveViteCliPath();

    await new Promise((resolvePromise, rejectPromise) => {
        // DEP0205: Vite 7 이 Node 22+ 에서 module.register() 를 내부 사용해 나는
        // 디프리케이션 경고(앱 코드 무관, Vite 8 업그레이드 전까지 해당 코드만 억제).
        const child = spawn(process.execPath, ["--disable-warning=DEP0205", viteCliPath, "build"], {
            cwd: projectRoot,
            stdio: "inherit",
            env: {
                ...process.env,
                BUILD_OUT_DIR: buildDirName,
            },
        });

        child.on("exit", (code) => {
            if (code === 0) {
                resolvePromise();
                return;
            }

            rejectPromise(new Error(`vite build failed with exit code ${code ?? -1}`));
        });

        child.on("error", rejectPromise);
    });
}

/** 임시 빌드 산출물을 public 디렉터리와 원자적으로 교체한다. */
async function swapBuildDirectory(buildDirPath, publicDirPath, backupDirPath) {
    const hasPublicDir = await pathExists(publicDirPath);

    await rm(backupDirPath, { recursive: true, force: true });

    if (hasPublicDir) {
        await rename(publicDirPath, backupDirPath);
    }

    try {
        await rename(buildDirPath, publicDirPath);
        await rm(backupDirPath, { recursive: true, force: true });
    } catch (error) {
        try {
            if (await pathExists(publicDirPath)) {
                await rm(publicDirPath, { recursive: true, force: true });
            }

            await cp(buildDirPath, publicDirPath, { recursive: true, force: true });
            await rm(buildDirPath, { recursive: true, force: true });
            await rm(backupDirPath, { recursive: true, force: true });
            return;
        } catch {
            // 복사 폴백도 실패하면 아래에서 원본 public 복구를 시도한다.
        }

        if (await pathExists(backupDirPath)) {
            await rename(backupDirPath, publicDirPath);
        }

        throw error;
    }
}

/**
 * 스왑 전 산출물 무결성 검사 — vite publicDir(static/) 복사가 조용히 누락된 채
 * 스왑되면 프로덕션 정적 자산이 통째로 404 가 된다. 대표 파일 몇 개로 검증한다.
 */
async function assertStaticAssetsCopied(buildDirPath) {
    const mustExist = ["robots.txt", "app/favicon.svg"];
    for (const rel of mustExist) {
        if (!(await pathExists(resolve(buildDirPath, rel)))) {
            throw new Error(
                `빌드 산출물에 정적 자산이 없습니다: ${rel} — vite publicDir(static/) 복사 누락. 스왑을 중단합니다.`,
            );
        }
    }
}

/** 이전 빌드 해시 자산을 보존하는 유예기간(ms). 이 기간 안의 옛 청크는 새 산출물에 합쳐 준다. */
const PREVIOUS_ASSET_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** 파일명에 내용 해시가 붙는 산출물 디렉터리들(vite.config.ts 의 output 설정과 일치해야 한다). */
const HASHED_ASSET_DIRS = ["js.d", "vendor.d", "css.d", "fonts", "img.d.d", "assets"];

/**
 * 이전 배포의 해시 자산을 새 빌드 산출물에 합쳐 준다(유예기간 내 파일만).
 *
 * 배포가 public/ 을 통째로 교체하면 이전 해시 청크가 전부 사라져, 배포 시점에 열려 있던
 * SPA 탭이 lazy 라우트로 이동하는 순간 옛 청크 404 → "화면 에러, 새로고침해야 정상" 이 된다.
 * 파일명에 내용 해시가 있어 이름 충돌이 없으므로, 옛 청크를 한동안 같이 서빙하면
 * 열린 탭은 옛 코드로 계속 동작하고 다음 전체 로드에서 자연히 새 빌드를 받는다.
 * 유예기간이 지난 파일은 이 합치기에서 빠져 자연 소멸한다(무한 누적 방지).
 */
async function mergePreviousHashedAssets(buildDirPath, publicDirPath) {
    const now = Date.now();
    let kept = 0;
    let expired = 0;

    for (const dirName of HASHED_ASSET_DIRS) {
        const oldDirPath = resolve(publicDirPath, dirName);
        if (!(await pathExists(oldDirPath))) continue;

        const newDirPath = resolve(buildDirPath, dirName);
        await mkdir(newDirPath, { recursive: true });

        for (const entry of await readdir(oldDirPath, { withFileTypes: true })) {
            if (!entry.isFile()) continue;

            const newFilePath = resolve(newDirPath, entry.name);
            if (await pathExists(newFilePath)) continue; // 새 빌드에 같은 해시가 있으면 그대로 둔다

            const oldFilePath = resolve(oldDirPath, entry.name);
            try {
                const info = await stat(oldFilePath);
                if (now - info.mtimeMs > PREVIOUS_ASSET_GRACE_MS) {
                    expired += 1;
                    continue;
                }
                // mtime 보존 — 다음 배포에서 유예기간 판정이 최초 배포 시점 기준으로 이어진다.
                await cp(oldFilePath, newFilePath, { preserveTimestamps: true });
                kept += 1;
            } catch {
                // 개별 파일 실패(경합 삭제 등)는 배포를 막지 않는다 — 그 파일만 건너뛴다.
            }
        }
    }

    console.log(`[build] 이전 해시 자산 보존: ${kept}개 유지, ${expired}개 유예기간 만료로 제외`);
}

/** 프로덕션 정적 산출물을 무중단 방식으로 교체한다. */
async function main() {
    const buildDirPath = resolve(projectRoot, buildDirName);
    const publicDirPath = resolve(projectRoot, "public");
    const backupDirPath = resolve(projectRoot, backupDirName);

    await mkdir(projectRoot, { recursive: true });
    await prepareBuildDirectory(buildDirPath);
    await runViteBuild();
    await assertStaticAssetsCopied(buildDirPath);
    await mergePreviousHashedAssets(buildDirPath, publicDirPath);
    await swapBuildDirectory(buildDirPath, publicDirPath, backupDirPath);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
