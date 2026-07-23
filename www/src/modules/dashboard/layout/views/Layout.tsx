import { useEffect, useRef } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { DashboardLayout, DashboardSidebar, useDashboardState, type MenuItem } from "@ehfuse/mui-dashboard-layout";
import { GlobalStyles, useMediaQuery, useTheme } from "@mui/material";
import { getSidebarMenuItems } from "./configs/sidebarMenu";
import { DashboardHeader } from "./Header";

/** 사이드바 메뉴 선택 여부를 하위 경로까지 포함해 판단한다. */
function isSidebarItemSelected(item: MenuItem, location: { pathname: string }): boolean {
    if (!item.path) {
        return false;
    }
    if (item.path === "/dashboard") {
        return location.pathname === item.path;
    }
    return location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
}

/** 대시보드 공통 레이아웃 — 사이드바 + 헤더 + 콘텐츠 영역 */
export default function AppLayout() {
    const navigate = useNavigate();
    const dashboardState = useDashboardState();
    const theme = useTheme();
    const lgDown = useMediaQuery(theme.breakpoints.down("lg"));
    const hasAppliedInitialCompactSidebarRef = useRef(false);
    const wasCompactSidebarRef = useRef(lgDown);

    /** 작은 화면 첫 진입/전환 시에만 사이드바를 접힌 상태로 맞춘다. */
    useEffect(() => {
        if (!hasAppliedInitialCompactSidebarRef.current) {
            hasAppliedInitialCompactSidebarRef.current = true;
            wasCompactSidebarRef.current = lgDown;
            if (lgDown && dashboardState.getValue("sidebarCollapsed") !== true) {
                dashboardState.setValue("sidebarCollapsed", true);
            }
            return;
        }

        const wasCompact = wasCompactSidebarRef.current;
        wasCompactSidebarRef.current = lgDown;
        if (!wasCompact && lgDown && dashboardState.getValue("sidebarCollapsed") !== true) {
            dashboardState.setValue("sidebarCollapsed", true);
        }
    }, [dashboardState, lgDown]);

    /** 대시보드에서는 문서(body) 스크롤을 잠근다 — 모바일 주소창 변동으로 헤더가 밀리는 것을 막는다. */
    useEffect(() => {
        if (typeof document === "undefined") {
            return;
        }
        const html = document.documentElement;
        const body = document.body;
        const prevHtmlOverflow = html.style.overflow;
        const prevBodyOverflow = body.style.overflow;
        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
        return () => {
            html.style.overflow = prevHtmlOverflow;
            body.style.overflow = prevBodyOverflow;
        };
    }, []);

    /** 사이드바 메뉴 클릭 — leaf 메뉴만 이동한다. */
    const handleMenuClick = (item: MenuItem) => {
        if (item.children && item.children.length > 0) {
            return;
        }
        if (item.path) {
            navigate(item.path);
        }
    };

    return (
        <>
            {/* 모바일: 100vh 루트를 실제 보이는 높이(100dvh)로 덮어 주소창 뒤 잘림을 막는다. */}
            <GlobalStyles
                styles={{
                    'div[style*="height: 100vh"]': {
                        height: "100dvh !important",
                        maxHeight: "100dvh !important",
                    },
                }}
            />
            <DashboardLayout
                sidebar={
                    <DashboardSidebar
                        items={getSidebarMenuItems()}
                        onMenuClick={handleMenuClick}
                        isSelected={isSidebarItemSelected}
                    />
                }
                header={<DashboardHeader />}
                headerPosition="top"
                theme="classic"
                styles={{
                    contentPadding: lgDown ? 2 : 3,
                }}
            >
                <Outlet />
            </DashboardLayout>
        </>
    );
}
