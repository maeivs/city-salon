import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "@/modules/dashboard/layout/views/Layout";
import DashboardHome from "@/modules/dashboard/home/views/DashboardHome";
import PlaceholderPage from "@/modules/dashboard/components/PlaceholderPage";

/** 앱 전체 라우터 */
export default function AppRouter() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<AppLayout />}>
                    <Route index element={<DashboardHome />} />
                    {/* 초기 단계 — 홈 외 모든 메뉴는 준비중 페이지 */}
                    <Route path="*" element={<PlaceholderPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
