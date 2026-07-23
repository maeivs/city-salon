import { Box, Button, Divider, Drawer, IconButton, List, ListItemButton, ListItemText, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { SITE_NAME } from "@configs/site-info";
import type { MainController } from "../../controllers/mainController";
import { NAV_ITEMS, SERIF_FONT } from "../configs/landingContent";

/** MobileMenuDrawer 컴포넌트 props */
interface MobileMenuDrawerProps {
    controller: MainController; // 메인 컨트롤러
}

/** 모바일 전용 메뉴 드로어 */
export default function MobileMenuDrawer({ controller }: MobileMenuDrawerProps) {
    const { state, goTo, goRecommend } = controller;
    const open = state.useValue("mobileMenuOpen") as boolean;

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={() => state.actions.setMobileMenuOpen(false)}
            slotProps={{ paper: { sx: { width: 280, bgcolor: "#faf8f2" } } }}
        >
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2.5, py: 2 }}>
                <Typography sx={{ fontFamily: SERIF_FONT, fontSize: 20, fontWeight: 700, color: "primary.dark" }}>
                    {SITE_NAME}
                </Typography>
                <IconButton aria-label="메뉴 닫기" onClick={() => state.actions.setMobileMenuOpen(false)}>
                    <CloseIcon />
                </IconButton>
            </Box>
            <Divider sx={{ borderColor: "#e8e3d3" }} />
            <List sx={{ px: 1 }}>
                {NAV_ITEMS.map((item) => (
                    <ListItemButton
                        key={item.label}
                        onClick={() => (item.recommend ? goRecommend() : goTo(item.path ?? "/dashboard"))}
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
                    sx={{
                        borderRadius: 999,
                        py: 1.25,
                        fontWeight: 700,
                        bgcolor: "primary.dark",
                        "&:hover": { bgcolor: "primary.main" },
                    }}
                >
                    나에게 맞는 모임 찾기
                </Button>
            </Box>
        </Drawer>
    );
}
