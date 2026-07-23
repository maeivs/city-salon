import { Box, Button, Typography } from "@mui/material";
import EastOutlinedIcon from "@mui/icons-material/EastOutlined";
import type { MainController } from "../../../controllers/mainController";
import { SERIF_FONT } from "../../configs/landingContent";
import SectionContainer from "../../components/SectionContainer";
import { V2_COLORS } from "../configs/v2Theme";
import V2SalonCard from "./V2SalonCard";

/** V2WeeklySalonsSection 컴포넌트 props */
interface V2WeeklySalonsSectionProps {
    controller: MainController; // 메인 컨트롤러
}

/** 2안 이번 주 살롱 섹션 — 목록 길이만 구독하고 카드가 각자 슬라이스를 구독한다 */
export default function V2WeeklySalonsSection({ controller }: V2WeeklySalonsSectionProps) {
    const { state, goTo } = controller;
    const countRaw = state.useValue("weeklySalons.length");
    const count = (countRaw as number | undefined) ?? 0;

    return (
        <SectionContainer sx={{ pb: { xs: 6, md: 10 } }}>
            <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 2 }}>
                <Box>
                    <Typography
                        sx={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.35em", color: V2_COLORS.accent }}
                    >
                        THIS WEEK
                    </Typography>
                    <Typography
                        component="h2"
                        sx={{
                            mt: 1.5,
                            fontFamily: SERIF_FONT,
                            fontSize: { xs: 23, md: 28 },
                            fontWeight: 700,
                            color: V2_COLORS.textPrimary,
                        }}
                    >
                        이번 주, 도시에서 열리는 살롱
                    </Typography>
                </Box>
                <Button
                    onClick={() => goTo("/dashboard/salons")}
                    endIcon={<EastOutlinedIcon sx={{ fontSize: 16 }} />}
                    sx={{
                        color: V2_COLORS.textSecondary,
                        fontSize: 13.5,
                        fontWeight: 600,
                        flexShrink: 0,
                        "&:hover": { color: V2_COLORS.accent, bgcolor: "transparent" },
                    }}
                >
                    전체 보기
                </Button>
            </Box>

            {/* 살롱 카드 목록 */}
            <Box
                sx={{
                    mt: { xs: 3, md: 4.5 },
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(3, 1fr)" },
                    gap: { xs: 2.5, md: 3 },
                }}
            >
                {Array.from({ length: count }, (_, index) => (
                    <V2SalonCard key={index} controller={controller} index={index} />
                ))}
            </Box>
        </SectionContainer>
    );
}
