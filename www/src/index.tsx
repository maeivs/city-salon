// globalThis.process.env polyfill - 반드시 다른 import보다 먼저 실행
import "./polyfill-process";

import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@mui/material";
import { GlobalFormaProvider } from "@ehfuse/forma";
import { AlertProvider } from "@ehfuse/alerts";
import { entityAppServer } from "entity-client";
import { API_URL } from "@configs/backend";

import "./index.css";

import CustomMuiTheme from "./MuiTheme";
import AppRouter from "./routes/appRoutes";

// index.html 인라인 부팅 가드에 "main 번들 JS 실행됨" 신호를 보낸다.
// 이 플래그가 안 서면(빌드 교체 순간 번들 404 등) 인라인 가드가 캐시 우회 강제 새로고침한다.
(window as unknown as Record<string, unknown>).__appMainLoaded = true;

const queryClient = new QueryClient();

// 프런트는 AS만 바라보도록 entityAppServer 하나만 초기화한다.
entityAppServer.configure({
    baseUrl: API_URL,
    // 패킷 암호화는 health 응답(X-Packet-Encryption)에 위임한다.
    // false로 두면 checkHealth()가 AS의 PACKET_ENCRYPT_ENABLED 설정을 추종해
    // 서버가 켜져 있을 때만 자동으로 암호화를 켠다(서버 OFF면 평문 유지).
    encryptRequests: false,
    keepSession: false,
    realtime: {
        // 목업 단계 — AS 가 아직 없어 연결 시도가 프록시 500/재접속 루프만 만든다. AS 연동 시 켠다.
        enabled: false,
        autoReconnect: true,
        reconnectDelayMs: 3000,
    },
});

/** index.html 의 초기 부트 스피너를 제거한다. */
function removeInitialLoader(): void {
    document.getElementById("initial-loader")?.remove();
}

const rootElement = document.getElementById("root");

if (!rootElement) {
    throw new Error("루트 엘리먼트를 찾을 수 없습니다.");
}

createRoot(rootElement).render(
    <QueryClientProvider client={queryClient}>
        <GlobalFormaProvider storagePrefix="city-salon">
            <ThemeProvider theme={CustomMuiTheme}>
                <AlertProvider>
                    <AppRouter />
                </AlertProvider>
            </ThemeProvider>
        </GlobalFormaProvider>
    </QueryClientProvider>,
);

removeInitialLoader();
