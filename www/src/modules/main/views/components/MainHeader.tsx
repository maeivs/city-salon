import { Box, Button, Divider, IconButton, Typography } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { SITE_NAME } from "@configs/site-info";
import type { MainController } from "../../controllers/mainController";
import { NAV_ITEMS, SERIF_FONT } from "../configs/landingContent";
import SectionContainer from "./SectionContainer";

/** MainHeader 컴포넌트 props */
interface MainHeaderProps {
    controller: MainController; // 메인 컨트롤러
}

/** 랜딩 상단 네비게이션 바(스크롤 시 상단 고정) */
export default function MainHeader({ controller }: MainHeaderProps) {
    const { state, goTo, goRecommend } = controller;

    return (
        <Box
            component="header"
            sx={{
                position: "sticky",
                top: 0,
                zIndex: 20,
                bgcolor: "rgba(250, 248, 242, 0.92)",
                backdropFilter: "blur(8px)",
                borderBottom: "1px solid #e8e3d3",
            }}
        >
            <SectionContainer
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    height: 68,
                    gap: 2,
                }}
            >
                {/* 로고 */}
                <Typography
                    onClick={() => goTo("/dashboard")}
                    sx={{
                        fontFamily: SERIF_FONT,
                        fontSize: 22,
                        fontWeight: 700,
                        color: "primary.dark",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                    }}
                >
                    {SITE_NAME}
                </Typography>

                {/* 데스크톱 메뉴 */}
                <Box sx={{ display: { xs: "none", lg: "flex" }, alignItems: "center", gap: 0.5 }}>
                    {NAV_ITEMS.map((item) => (
                        <Button
                            key={item.label}
                            onClick={() => (item.recommend ? goRecommend() : goTo(item.path ?? "/dashboard"))}
                            sx={{ color: "text.primary", fontSize: 14, fontWeight: 500, px: 1.75 }}
                        >
                            {item.label}
                        </Button>
                    ))}
                    <Divider orientation="vertical" flexItem sx={{ mx: 1, my: 1.5, borderColor: "#ddd8c8" }} />
                    <Button
                        onClick={() => goTo("/dashboard/login")}
                        sx={{ color: "text.primary", fontSize: 14, fontWeight: 500, px: 1.75 }}
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
                            bgcolor: "primary.dark",
                            "&:hover": { bgcolor: "primary.main" },
                        }}
                    >
                        나에게 맞는 모임 찾기
                    </Button>
                </Box>

                {/* 모바일 — 메뉴 드로어 열기 */}
                <IconButton
                    aria-label="메뉴 열기"
                    onClick={() => state.actions.setMobileMenuOpen(true)}
                    sx={{ display: { xs: "inline-flex", lg: "none" }, color: "primary.dark" }}
                >
                    <MenuIcon />
                </IconButton>
            </SectionContainer>
        </Box>
    );
}
