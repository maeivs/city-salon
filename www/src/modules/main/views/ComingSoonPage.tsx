import { useOutletContext } from "react-router-dom";
import { Box, Button, Typography } from "@mui/material";
import ConstructionOutlinedIcon from "@mui/icons-material/ConstructionOutlined";
import type { MainController } from "../controllers/mainController";
import { SERIF_FONT } from "./configs/landingContent";
import SectionContainer from "./components/SectionContainer";

/** 아직 준비되지 않은 메뉴의 임시 페이지(랜딩 톤) */
export default function ComingSoonPage() {
    const controller = useOutletContext<MainController>();

    return (
        <SectionContainer
            sx={{
                py: { xs: 10, md: 14 },
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                textAlign: "center",
            }}
        >
            <Box
                sx={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    bgcolor: "#f1ecdd",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "primary.dark",
                }}
            >
                <ConstructionOutlinedIcon />
            </Box>
            <Typography sx={{ fontFamily: SERIF_FONT, fontSize: 22, fontWeight: 700 }}>준비중인 화면입니다</Typography>
            <Typography sx={{ fontSize: 13.5, color: "text.secondary" }}>
                도시살롱이 열심히 만들고 있어요. 조금만 기다려주세요.
            </Typography>
            <Button
                variant="outlined"
                onClick={() => controller.goTo("/dashboard")}
                sx={{
                    mt: 1,
                    borderRadius: 999,
                    px: 3,
                    py: 1,
                    fontWeight: 600,
                    color: "text.primary",
                    borderColor: "#cfc9b6",
                    "&:hover": { borderColor: "primary.dark", bgcolor: "transparent" },
                }}
            >
                메인으로 돌아가기
            </Button>
        </SectionContainer>
    );
}
