import { Box, Button, Divider, Drawer, IconButton, List, ListItemButton, ListItemText, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { SITE_NAME } from "@configs/site-info";
import type { MainController } from "../../../controllers/mainController";
import { NAV_ITEMS, SERIF_FONT } from "../../configs/landingContent";
import { V2_COLORS } from "../configs/v2Theme";

/** V2MobileMenuDrawer 컴포넌트 props */
interface V2MobileMenuDrawerProps {
    controller: MainController; // 메인 컨트롤러
}

/** 2안 모바일 전용 메뉴 드로어(다크) */
export default function V2MobileMenuDrawer({ controller }: V2MobileMenuDrawerProps) {
    const { state, goTo, goRecommend } = controller;
    const open = state.useValue("mobileMenuOpen") as boolean;

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={() => state.actions.setMobileMenuOpen(false)}
            slotProps={{ paper: { sx: { width: 280, bgcolor: V2_COLORS.bgElevated, backgroundImage: "none" } } }}
        >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2.5, py: 2 }}>
                <Typography
                    sx={{ fontFamily: SERIF_FONT, fontSize: 20, fontWeight: 700, color: V2_COLORS.textPrimary }}
                >
                    {SITE_NAME}
                </Typography>
                <IconButton aria-label="메뉴 닫기" onClick={() => state.actions.setMobileMenuOpen(false)}>
                    <CloseIcon />
                </IconButton>
            </Box>
            <Divider />
            <List sx={{ px: 1 }}>
                {NAV_ITEMS.map((item) => (
                    <ListItemButton
                        key={item.label}
                        onClick={() => (item.recommend ? goRecommend() : goTo(item.path ?? "/v2"))}
                        sx={{ borderRadius: 2 }}
                    >
                        <ListItemText
                            primary={item.label}
                            slotProps={{ primary: { sx: { fontSize: 15, fontWeight: 500 } } }}
                        />
                    </ListItemButton>
                ))}
                <ListItemButton onClick={() => goTo("/dashboard/login")} sx={{ borderRadius: 2 }}>
                    <ListItemText primary="로그인" slotProps={{ primary: { sx: { fontSize: 15, fontWeight: 500 } } }} />
                </ListItemButton>
            </List>
            <Box sx={{ px: 2.5, mt: 1 }}>
                <Button
                    fullWidth
                    variant="contained"
                    onClick={goRecommend}
                    sx={{ borderRadius: 999, py: 1.25, fontWeight: 700 }}
                >
                    나에게 맞는 모임 찾기
                </Button>
            </Box>
        </Drawer>
    );
}
