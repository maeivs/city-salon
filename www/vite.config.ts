import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { createHtmlPlugin } from "vite-plugin-html"; // vite-plugin-html 임포트
import tsconfigPaths from "vite-tsconfig-paths"; // tsconfig-paths 임포트
import { resolve } from "path";
import { writeFileSync } from "node:fs";
import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import tailwindcss from "@tailwindcss/vite";
import { compression } from "vite-plugin-compression2";
// import { visualizer } from "rollup-plugin-visualizer";
import {
    META_FAVICON_URL,
    META_OG_IMAGE_URL,
    META_AUTHOR,
    META_DESCRIPTION,
    META_KEYWORDS,
    SITE_URL,
    META_TITLE,
    SITE_NAME,
} from "./configs/site-info";
import { getAppServerTarget, PROXY_CONFIG } from "./configs/backend";
import sizeOf from "image-size";
import { existsSync, readFileSync } from "fs";
import { loadEnv } from "vite";

// OG 이미지 크기 가져오기
let ogImageWidth = 1200; // 기본값
let ogImageHeight = 630; // 기본값

// OG 이미지 파일 경로 (public 폴더 기준)
const ogImagePath = resolve(__dirname, "public" + META_OG_IMAGE_URL);
// console.log("OG 이미지 경로:", ogImagePath);
if (existsSync(ogImagePath)) {
    try {
        const imageBuffer = readFileSync(ogImagePath);
        const dimensions = sizeOf(imageBuffer);
        ogImageWidth = dimensions.width || 1200;
        ogImageHeight = dimensions.height || 630;
        // console.log(`OG 이미지 크기: ${ogImageWidth}x${ogImageHeight}`);
    } catch (error) {
        // console.warn("OG 이미지 크기를 읽을 수 없습니다:", error);
    }
}

// 파비콘 타입 설정
let faviconType = "image/svg+xml"; // 기본값
const faviconPath = resolve(__dirname, "public" + META_FAVICON_URL);
if (existsSync(faviconPath)) {
    const ext = faviconPath.split(".").pop()?.toLowerCase();
    switch (ext) {
        case "ico":
            faviconType = "image/x-icon";
            break;
        case "svg":
            faviconType = "image/svg+xml";
            break;
        default:
            faviconType = "image/" + ext; // PNG, JPG, JPEG, GIF 타입 설정
            break;
    }
}

// chunk 파일 분리
const manualChunks = (id: string) => {
    if (id.includes("node_modules")) {
        if (id.includes("react-icons")) {
            return "react-icons";
        } else if (
            // react 코어만 정밀 매칭한다. 예전 includes("react") 광역 매칭은 react-pdf,
            // react-native-svg 같은 대형 패키지까지 한 청크(2MB)로 뭉치고, 지연 로드
            // 청크가 쓰는 패키지를 초기 벤더 청크에 끌어들였다. 나머지는 rollup 기본
            // 분할(사용처 기준)에 맡긴다.
            /node_modules\/(react|react-dom|scheduler|react-is|react-router|react-router-dom|react-transition-group)\//.test(id) ||
            id.includes("babel")
        ) {
            return "react";
        } else if (id.includes("axios")) {
            return "axios";
        } else if (id.includes("eslint")) {
            return "eslint";
        } else if (id.includes("stylis")) {
            return "stylis";
        } else if (id.includes("lodash")) {
            return "lodash";
        } else if (id.includes("quill")) {
            return "quill";
        } else if (id.includes("d3-")) {
            return "d3";
        } else {
            //console.log(id.split("node_modules/").pop()!.split("/")[0]);
        }
    } else {
        if (id.includes("src/api")) {
            return "api";
        }
    }
};

//console.log(process.env);

const createKeepAliveAgent = (target: string) => {
    if (target.startsWith("https://")) {
        return new HttpsAgent({ keepAlive: true });
    }

    return new HttpAgent({ keepAlive: true });
};

/**
 * 빌드 출력 디렉터리를 결정한다.
 * ⚠️ 프로덕션 직접 `vite build`(BUILD_OUT_DIR 미지정)는 차단한다 — vite 가 실서비스 public/ 을
 * 시작하자마자 비우고(emptyOutDir) 수 분간 그 위에 쓰므로, 그동안 index.html 이 없어
 * 접속자 전원이 403(루트)/500(그 외)을 본다(2026-07-19 실제 사고). 프로덕션 배포는 반드시
 * `npm run build`(scripts/build-production.mjs, 임시 디렉터리 빌드 + 원자 교체)로만 한다.
 * test/analyze 같은 비프로덕션 빌드는 public 을 건드리지 않는 별도 디렉터리로 보낸다.
 */
function resolveBuildOutDir(command: string, mode: string, envOutDir: string | undefined): string {
    if (envOutDir) return envOutDir; // build-production.mjs 가 .build-public 을 지정한다
    if (command !== "build") return "public"; // dev 서버는 outDir 을 실제로 쓰지 않는다
    if (mode === "production") {
        throw new Error(
            "직접 `vite build` 는 금지입니다. 실서비스 public/ 을 비운 채 수 분간 빌드해 접속자가 403/500 을 봅니다. 반드시 `npm run build`(원자 교체)를 사용하세요."
        );
    }
    return `.build-${mode}`;
}

export default defineConfig(({ command, mode }) => {
    // mode: 'development' | 'test' | 'production'
    const isProduction = mode === "production";
    const env = loadEnv(mode, process.cwd(), "");
    const appServerTarget = env.ENTITY_APP_SERVER_URL || getAppServerTarget();
    const buildOutDir = resolveBuildOutDir(command, mode, env.BUILD_OUT_DIR);
    // 빌드마다 고유한 ID. version.json 으로 내보내고 앱에 __BUILD_ID__ 로 심어, 현황판이 새 빌드를 감지해 자동 리로드한다.
    const buildId = String(Date.now());
    const plugins = [
        react(),
        tsconfigPaths(),
        // 빌드 결과물 루트에 version.json({buildId}) 을 생성한다. (현황판 새 빌드 감지용)
        {
            name: "emit-build-version",
            apply: "build" as const,
            closeBundle() {
                try {
                    writeFileSync(resolve(buildOutDir, "version.json"), JSON.stringify({ buildId }));
                } catch {
                    // version.json 생성 실패는 빌드를 막지 않는다(자동 리로드만 비활성).
                }
            },
        },
        createHtmlPlugin({
            minify: true,
            inject: {
                data: {
                    siteName: SITE_NAME,
                    url: SITE_URL,
                    title: META_TITLE,
                    description: META_DESCRIPTION,
                    keywords: META_KEYWORDS,
                    author: META_AUTHOR,
                    favicon: (isProduction ? SITE_URL : "") + META_FAVICON_URL,
                    faviconType: faviconType,
                    ogImage: SITE_URL + META_OG_IMAGE_URL,
                    ogImageWidth: ogImageWidth,
                    ogImageHeight: ogImageHeight,
                },
            },
        }),
        tailwindcss(),
    ];

    // DEV_HOST 설정 시, 시작 배너에 실제 접속해야 할 호스트(dev.localhost 등)를 명확히 출력한다.
    // (vite 의 'Local:' 줄은 바인딩 주소라 항상 localhost 로 표시되므로 별도로 안내한다.)
    if (!isProduction && env.DEV_HOST) {
        const devUrl = `http://${env.DEV_HOST}${env.SERVER_PORT ? `:${env.SERVER_PORT}` : ""}/`;
        plugins.push({
            name: "dev-host-banner",
            configureServer(server) {
                const printUrls = server.printUrls.bind(server);
                server.printUrls = () => {
                    printUrls();
                    server.config.logger.info(
                        `\n  \x1b[32m➜\x1b[0m  \x1b[1mDEV_HOST:\x1b[0m \x1b[36m${devUrl}\x1b[0m  \x1b[2m(쿠키 격리용 — 이 주소로 접속하세요)\x1b[0m\n`
                    );
                };
            },
        });
    }

    if (isProduction) {
        plugins.push(
            compression({
                algorithms: ["gzip"],
            })
            // visualizer({
            //     filename: "public/report.html",
            //     template: "treemap",
            //     open: false,
            //     brotliSize: true,
            // })
        );
    }

    return {
        // base: "/dist",
        plugins,

        optimizeDeps: {
            force: !isProduction,
            exclude: [
                "@monaco-editor/react",
                "@ehfuse/mui-form-dialog",
                "@ehfuse/mui-form-controls",
                "@ehfuse/mui-dashboard-layout",
            ],
            include: [
                // exclude 된 @ehfuse 패키지들이 @mui/icons-material 를 배럴 import 한다.
                // 프리번들하지 않으면 dev 서버가 아이콘 2만여 파일을 개별 변환하다 EMFILE 이 난다.
                "@mui/icons-material",
                // react-pdf 가 pdfjs-dist 를 정확한 버전으로 핀해 중첩 설치되므로
                // 루트 bare specifier 로는 해석되지 않는다. 중첩 경로로 지정한다.
                "react-pdf > pdfjs-dist",
                "swr",
                "react",
                "react-dom",
                "react-is",
                "react/jsx-runtime",
                "react/jsx-dev-runtime",
                "prop-types",
                "hoist-non-react-statics",
            ],
            esbuildOptions: {
                target: "es2022",
            },
        },

        server: {
            // [임시] 대표 도메인 적용 전, 미니박스(현황판 키오스크) 테스트용 LAN 바인딩.
            //        PC IP(예: 192.168.0.21:5173)로 외부 기기 접근 허용. 도메인 적용 후 삭제 예정.
            host: true,
            // [임시] 미니박스(다른 출처) status.html 의 HEAD 체크가 응답코드를 읽으려면 ACAO 가 필요하다.
            //        없으면 정상 200 인데도 HEAD 가 CORS 로 거부되어 head=rej → "서버 연결 대기" 에 멈춘다.
            //        운영은 nginx `location /` 의 ACAO 로 처리. 로컬 vite 는 여기서 동일하게 부여한다.
            cors: true,
            headers: { "Access-Control-Allow-Origin": "*" },
            port: env.SERVER_PORT ? parseInt(env.SERVER_PORT) : undefined,
            // 같은 localhost 의 여러 dev 환경이 쿠키를 공유(포트 무관)해 서로 로그아웃되는 문제를
            // 막기 위해, .env 의 DEV_HOST 로 환경마다 다른 호스트(예: dev.localhost)로 접속한다.
            // *.localhost 는 브라우저가 자동으로 127.0.0.1 로 해석하므로 hosts 등록이 필요 없다.
            // 원격(SSH) 개발 환경에서는 서버가 PC 브라우저를 띄울 수 없으므로 자동 오픈(open)은
            // 켜지 않고, 위 dev-host-banner 플러그인이 시작 시 접속 URL 을 출력한다.
            open: false,
            proxy: (() => {
                return {
                    ...PROXY_CONFIG,
                    "/api": {
                        target: appServerTarget,
                        agent: createKeepAliveAgent(appServerTarget),
                        changeOrigin: true,
                        secure: false,
                        ws: true,
                        rewrite: (path: string) => path.replace(/^\/api/, ""),
                    },
                };
            })(),
            fs: {
                allow: [__dirname, resolve(__dirname, "..")],
            },
        },

        css: {
            devSourcemap: false,
        },
        publicDir: "static", // 정적 파일 디렉토리 설정
        esbuild: {
            drop: isProduction ? ["debugger"] : [], // debugger만 제거
            pure: isProduction
                ? ["console.log", "console.warn", "console.debug"] // console.info와 console.error는 유지
                : [],
        },
        build: {
            outDir: buildOutDir, // 빌드 결과물을 지정 디렉터리에 생성
            target: "es2022", // 빌드 타겟을 최신으로 설정하여 top-level await 지원
            minify: isProduction ? "terser" : "esbuild", // 프로덕션에서만 terser 사용
            // 지연 로드 벤더 청크(FileViewer ~790kB, react-apexcharts ~580kB, PDFButton
            // ~510kB)가 기본 한도(500kB)를 넘어 정보성 경고가 났다. 모두 사용 시점에
            // 로드되는 청크라 한도만 현실화한다.
            chunkSizeWarningLimit: 1024,
            rollupOptions: {
                input: {
                    main: resolve(__dirname, "index.html"), // index.html 파일을 입력으로 설정
                },
                output: {
                    manualChunks,
                    assetFileNames: (assetInfo) => {
                        let extType: string | undefined = assetInfo.name?.split(".").at(1);
                        if (extType && /png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType)) {
                            extType = "img.d";
                        }
                        if (assetInfo.name && /\.(woff|woff2|eot|ttf|otf)$/.test(assetInfo.name)) {
                            return `fonts/[name]-[hash][extname]`;
                        }
                        return `${extType}.d/[name]-[hash][extname]`;
                    },
                    chunkFileNames: "vendor.d/[name]-[hash].js",
                    entryFileNames: "js.d/[name]-[hash].js",
                    dir: buildOutDir, // 기본 출력 디렉토리를 지정 디렉터리로 설정
                },
            },
        },
        resolve: {
            alias: [
                {
                    find: "@",
                    replacement: "/src",
                },
                {
                    find: "@config",
                    replacement: "/config",
                },
                {
                    find: /^react-daum-postcode$/,
                    replacement: resolve(__dirname, "./node_modules/react-daum-postcode"),
                },
                {
                    find: /^react-router-dom$/,
                    replacement: resolve(__dirname, "./node_modules/react-router-dom"),
                },
                {
                    find: /^react-router$/,
                    replacement: resolve(__dirname, "./node_modules/react-router"),
                },
                // { find: "@ehfuse/tree-view", replacement: resolve(__dirname, "./node_modules/@ehfuse/tree-view") },
                // { find: "@ehfuse/mui-form-dialog", replacement: resolve(__dirname, "./node_modules/@ehfuse/mui-form-dialog") },
            ],
            dedupe: [
                "react",
                "react-dom",
                "react-router",
                "react-router-dom",
                "@emotion/react",
                "@emotion/styled",
                "swr",
                "@ehfuse/forma",
                "@ehfuse/mui-form-controls",
                "@ehfuse/mui-form-dialog",
                "react-daum-postcode",
            ],
        },
        define: {
            "process.env": {
                NODE_ENV: JSON.stringify(mode), // vite mode 사용 (development, test, production)
                HOME: process.env.HOME || "/home/default",
                USER: process.env.USER || "server", // 사용자 환경 변수 추가
            },
            // globalThis.process.env도 설정하여 @ehfuse/console-log-override 라이브러리가 올바르게 감지할 수 있도록
            "globalThis.process.env.NODE_ENV": JSON.stringify(mode),
            // 현재 빌드 ID(버전). 현황판이 version.json 과 비교해 새 빌드 감지 시 자동 리로드한다.
            __BUILD_ID__: JSON.stringify(buildId),
        },
    };
});
