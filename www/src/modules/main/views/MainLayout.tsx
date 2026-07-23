import { Outlet } from "react-router-dom";
import { Box } from "@mui/material";
import { OverlayScrollbar } from "@ehfuse/overlay-scrollbar";
import { useMainController } from "../controllers/mainController";
import MainFooter from "./components/MainFooter";
import MainHeader from "./components/MainHeader";
import MobileMenuDrawer from "./components/MobileMenuDrawer";

/** 랜딩 공통 레이아웃 — 상단 네비 + 콘텐츠(Outlet) + 푸터, 컨트롤러 owner */
export default function MainLayout() {
    const controller = useMainController();

    return (
        <OverlayScrollbar style={{ height: "100dvh" }}>
            <Box sx={{ minHeight: "100dvh", bgcolor: "#faf8f2", display: "flex", flexDirection: "column" }}>
                <MainHeader controller={controller} />
                <Box component="main" sx={{ flex: 1 }}>
                    <Outlet context={controller} />
                </Box>
                <MainFooter controller={controller} />
                <MobileMenuDrawer controller={controller} />
            </Box>
        </OverlayScrollbar>
    );
}
