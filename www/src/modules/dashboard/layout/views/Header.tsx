import { Box, IconButton, Typography, useMediaQuery, useTheme } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { SimpleHeader, useDashboardState } from "@ehfuse/mui-dashboard-layout";
import { SITE_NAME } from "@configs/site-info";

/** 상단 헤더 — 로고 + 모바일 햄버거 */
export function DashboardHeader() {
    const dashboardState = useDashboardState();
    const theme = useTheme();
    const lgDown = useMediaQuery(theme.breakpoints.down("lg"));

    return (
        <SimpleHeader
            showToggleButton={!lgDown}
            buttons={{
                notification: { show: false },
                avatar: { show: false },
            }}
            logo={
                <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, whiteSpace: "nowrap", pl: 2 }}>
                    <Typography sx={{ fontSize: 18, fontWeight: 800, color: "primary.main", letterSpacing: 0.5 }}>
                        {SITE_NAME}
                    </Typography>
                </Box>
            }
            right={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, pr: { xs: 0.5, md: 1 } }}>
                    {/* 모바일 — 사이드바 drawer 열기 */}
                    {lgDown ? (
                        <IconButton
                            aria-label="메뉴 열기"
                            onClick={() => dashboardState.setValue("mobileDrawerOpen", true)}
                        >
                            <MenuIcon />
                        </IconButton>
                    ) : null}
                </Box>
            }
        />
    );
}
