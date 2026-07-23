import { Box, Button, Divider, IconButton, Typography } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { SITE_NAME } from "@configs/site-info";
import type { MainController } from "../../../controllers/mainController";
import { NAV_ITEMS, SERIF_FONT } from "../../configs/landingContent";
import SectionContainer from "../../components/SectionContainer";
import { V2_COLORS } from "../configs/v2Theme";

/** V2Header 컴포넌트 props */
interface V2HeaderProps {
    controller: MainController; // 메인 컨트롤러
}

/** 2안 상단 네비게이션 — 다크 글래스 고정 바 */
export default function V2Header({ controller }: V2HeaderProps) {
    const { state, goTo, goRecommend } = controller;

    return (
        <Box
            component="header"
            sx={{
                position: "sticky",
                top: 0,
                zIndex: 20,
                bgcolor: "rgba(18, 17, 14, 0.82)",
                backdropFilter: "blur(12px)",
                borderBottom: `1px solid ${V2_COLORS.border}`,
            }}
        >
            <SectionContainer
                sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 70, gap: 2 }}
            >
                {/* 로고 */}
                <Typography
                    onClick={() => goTo("/v2")}
                    sx={{
                        fontFamily: SERIF_FONT,
                        fontSize: 22,
                        fontWeight: 700,
                        color: V2_COLORS.textPrimary,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        letterSpacing: 0.5,
                    }}
                >
                    {SITE_NAME}
                </Typography>

                {/* 데스크톱 메뉴 */}
                <Box sx={{ display: { xs: "none", lg: "flex" }, alignItems: "center", gap: 0.5 }}>
                    {NAV_ITEMS.map((item) => (
                        <Button
                            key={item.label}
                            onClick={() => (item.recommend ? goRecommend() : goTo(item.path ?? "/v2"))}
                            sx={{
                                color: V2_COLORS.textSecondary,
                                fontSize: 14,
                                fontWeight: 500,
                                px: 1.75,
                                "&:hover": { color: V2_COLORS.textPrimary, bgcolor: "transparent" },
                            }}
                        >
                            {item.label}
                        </Button>
                    ))}
                    <Divider orientation="vertical" flexItem sx={{ mx: 1, my: 1.5 }} />
                    <Button
                        onClick={() => goTo("/dashboard/login")}
                        sx={{
                            color: V2_COLORS.textSecondary,
                            fontSize: 14,
                            fontWeight: 500,
                            px: 1.75,
                            "&:hover": { color: V2_COLORS.textPrimary, bgcolor: "transparent" },
                        }}
                    >
                        로그인
                    </Button>
                    <Button
                        variant="contained"
                        onClick={goRecommend}
                        sx={{
                            ml: 1.5,
                            borderRadius: 999,
                            px: 2.75,
                            py: 1,
                            fontSize: 14,
                            fontWeight: 700,
                        }}
                    >
                        나에게 맞는 모임 찾기
                    </Button>
                </Box>

                {/* 모바일 — 메뉴 드로어 열기 */}
                <IconButton
                    aria-label="메뉴 열기"
                    onClick={() => state.actions.setMobileMenuOpen(true)}
                    sx={{ display: { xs: "inline-flex", lg: "none" }, color: V2_COLORS.textPrimary }}
                >
                    <MenuIcon />
                </IconButton>
            </SectionContainer>
        </Box>
    );
}
