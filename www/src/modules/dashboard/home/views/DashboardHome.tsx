import { Box, Paper, Typography } from "@mui/material";
import { SITE_NAME } from "@configs/site-info";

/** 대시보드 홈 — 템플릿 기본 화면 (프로젝트 진행에 따라 교체) */
export default function DashboardHome() {
    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Box>
                <Typography sx={{ fontSize: 20, fontWeight: 800 }}>대시보드</Typography>
                <Typography sx={{ fontSize: 13, color: "text.secondary" }}>{SITE_NAME} 프로젝트 템플릿</Typography>
            </Box>
            <Paper variant="outlined" sx={{ borderRadius: 2, p: 4 }}>
                <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
                    기본 템플릿 화면입니다. 도메인이 정해지면 이 홈부터 채워 나가세요.
                </Typography>
            </Paper>
        </Box>
    );
}
