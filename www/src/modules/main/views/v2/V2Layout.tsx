import { Outlet } from "react-router-dom";
import { Box, ThemeProvider } from "@mui/material";
import { OverlayScrollbar } from "@ehfuse/overlay-scrollbar";
import { useMainController } from "../../controllers/mainController";
import V2Footer from "./components/V2Footer";
import V2Header from "./components/V2Header";
import V2MobileMenuDrawer from "./components/V2MobileMenuDrawer";
import { v2Theme, V2_COLORS } from "./configs/v2Theme";

/** 2안 랜딩 공통 레이아웃 — 다크 테마 스코프 + 상단 네비 + 콘텐츠(Outlet) + 푸터 */
export default function V2Layout() {
    const controller = useMainController();

    return (
        <ThemeProvider theme={v2Theme}>
            <OverlayScrollbar style={{ height: "100dvh", background: V2_COLORS.bg }}>
                <Box
                    sx={{
                        minHeight: "100dvh",
                        bgcolor: V2_COLORS.bg,
                        color: V2_COLORS.textPrimary,
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <V2Header controller={controller} />
                    <Box component="main" sx={{ flex: 1 }}>
                        <Outlet context={controller} />
                    </Box>
                    <V2Footer controller={controller} />
                    <V2MobileMenuDrawer controller={controller} />
                </Box>
            </OverlayScrollbar>
        </ThemeProvider>
    );
}
