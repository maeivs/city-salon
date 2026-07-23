import { Box, Button, Typography } from "@mui/material";
import EastOutlinedIcon from "@mui/icons-material/EastOutlined";
import type { MainController } from "../../controllers/mainController";
import { SERIF_FONT } from "../configs/landingContent";
import SalonCard from "./SalonCard";
import SectionContainer from "./SectionContainer";

/** WeeklySalonsSection 컴포넌트 props */
interface WeeklySalonsSectionProps {
    controller: MainController; // 메인 컨트롤러
}

/** 이번 주 살롱 섹션 — 목록 길이만 구독하고 카드가 각자 슬라이스를 구독한다 */
export default function WeeklySalonsSection({ controller }: WeeklySalonsSectionProps) {
    const { state, goTo } = controller;
    const countRaw = state.useValue("weeklySalons.length");
    const count = (countRaw as number | undefined) ?? 0;

    return (
        <SectionContainer sx={{ pb: { xs: 6, md: 9 } }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                <Typography
                    component="h2"
                    sx={{ fontFamily: SERIF_FONT, fontSize: { xs: 22, md: 26 }, fontWeight: 700 }}
                >
                    이번 주, 도시에서 열리는 살롱
                </Typography>
                <Button
                    onClick={() => goTo("/dashboard/salons")}
                    endIcon={<EastOutlinedIcon sx={{ fontSize: 16 }} />}
                    sx={{ color: "text.primary", fontSize: 13.5, fontWeight: 600, flexShrink: 0 }}
                >
                    전체 보기
                </Button>
            </Box>

            {/* 살롱 카드 목록 */}
            <Box
                sx={{
                    mt: { xs: 3, md: 4 },
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(3, 1fr)" },
                    gap: { xs: 4, md: 3.5 },
                }}
            >
                {Array.from({ length: count }, (_, index) => (
                    <SalonCard key={index} controller={controller} index={index} />
                ))}
            </Box>
        </SectionContainer>
    );
}
