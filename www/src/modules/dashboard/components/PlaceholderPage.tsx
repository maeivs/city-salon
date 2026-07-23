import { Box, Paper, Typography } from "@mui/material";
import ConstructionOutlinedIcon from "@mui/icons-material/ConstructionOutlined";

/** 아직 구현되지 않은 메뉴의 임시 페이지 */
export default function PlaceholderPage() {
    return (
        <Paper
            variant="outlined"
            sx={{
                borderRadius: 2,
                p: 6,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1.5,
            }}
        >
            <Box
                sx={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#f1f4f7",
                    color: "text.secondary",
                }}
            >
                <ConstructionOutlinedIcon />
            </Box>
            <Typography sx={{ fontSize: 16, fontWeight: 700 }}>준비중인 화면입니다</Typography>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                아직 구현되지 않은 메뉴입니다.
            </Typography>
        </Paper>
    );
}
