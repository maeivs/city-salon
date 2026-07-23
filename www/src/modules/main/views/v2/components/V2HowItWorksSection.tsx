import { Box, Typography } from "@mui/material";
import { HOW_IT_WORKS_STEPS, SERIF_FONT } from "../../configs/landingContent";
import SectionContainer from "../../components/SectionContainer";
import { V2_COLORS } from "../configs/v2Theme";

/** 2안 이용 방법 섹션 — 고스트 넘버 에디토리얼 컬럼 */
export default function V2HowItWorksSection() {
    return (
        <SectionContainer sx={{ py: { xs: 6, md: 10 } }}>
            {/* 아이브로우 + 헤딩 */}
            <Typography sx={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.35em", color: V2_COLORS.accent }}>
                HOW IT WORKS
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
                도시살롱 이용 방법
            </Typography>

            {/* 스텝 컬럼 4개 */}
            <Box
                sx={{
                    mt: { xs: 4, md: 6 },
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(4, 1fr)" },
                    gap: { xs: 3, md: 4 },
                }}
            >
                {HOW_IT_WORKS_STEPS.map((step, index) => {
                    const StepIcon = step.icon;
                    return (
                        <Box
                            key={step.title}
                            sx={{
                                pt: 2.5,
                                borderTop: `1px solid ${V2_COLORS.border}`,
                                display: "flex",
                                flexDirection: "column",
                                gap: 1.5,
                            }}
                        >
                            {/* 고스트 넘버 */}
                            <Typography
                                sx={{
                                    fontFamily: SERIF_FONT,
                                    fontSize: 40,
                                    fontWeight: 700,
                                    lineHeight: 1,
                                    color: V2_COLORS.accent,
                                    opacity: 0.4,
                                }}
                            >
                                {String(index + 1).padStart(2, "0")}
                            </Typography>
                            <StepIcon sx={{ fontSize: 26, color: V2_COLORS.accent }} />
                            <Box>
                                <Typography sx={{ fontSize: 16, fontWeight: 700, color: V2_COLORS.textPrimary }}>
                                    {step.title}
                                </Typography>
                                <Typography sx={{ mt: 0.75, fontSize: 13, color: "text.secondary", lineHeight: 1.7 }}>
                                    {step.description}
                                </Typography>
                            </Box>
                        </Box>
                    );
                })}
            </Box>
        </SectionContainer>
    );
}
