import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "@/modules/main/views/MainLayout";
import MainPage from "@/modules/main/views/MainPage";
import ComingSoonPage from "@/modules/main/views/ComingSoonPage";

// 서브 경로 배포(GitHub Pages 등) 시 라우터 기준 경로 — 루트 배포에서는 "" 가 되어 동작 불변.
const ROUTER_BASENAME = import.meta.env.BASE_URL.replace(/\/$/, "");

/** 앱 전체 라우터 */
export default function AppRouter() {
    return (
        <BrowserRouter basename={ROUTER_BASENAME}>
            <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<MainLayout />}>
                    <Route index element={<MainPage />} />
                    {/* 초기 단계 — 메인 외 모든 메뉴는 준비중 페이지 */}
                    <Route path="*" element={<ComingSoonPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
