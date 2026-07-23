import { Fragment } from "react";
import { Box, Typography } from "@mui/material";
import EastOutlinedIcon from "@mui/icons-material/EastOutlined";
import { HOW_IT_WORKS_STEPS, SERIF_FONT } from "../configs/landingContent";
import SectionContainer from "./SectionContainer";

/** 이용 방법 섹션 — 4단계 스텝 카드 */
export default function HowItWorksSection() {
    return (
        <SectionContainer sx={{ py: { xs: 6, md: 9 } }}>
            <Typography
                component="h2"
                sx={{ fontFamily: SERIF_FONT, fontSize: { xs: 22, md: 26 }, fontWeight: 700 }}
            >
                도시살롱 이용 방법
            </Typography>

            {/* 스텝 카드 4개 + 사이 화살표 */}
            <Box
                sx={{
                    mt: { xs: 3, md: 4.5 },
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr auto 1fr auto 1fr auto 1fr" },
                    gap: { xs: 1.5, md: 1 },
                    alignItems: "center",
                }}
            >
                {HOW_IT_WORKS_STEPS.map((step, index) => {
                    const StepIcon = step.icon;
                    return (
                        <Fragment key={step.title}>
                            {index > 0 ? (
                                <EastOutlinedIcon
                                    sx={{
                                        display: { xs: "none", md: "block" },
                                        color: "#c9c3ad",
                                        fontSize: 20,
                                        mx: 0.5,
                                    }}
                                />
                            ) : null}
                            <Box
                                sx={{
                                    bgcolor: "#fffdf8",
                                    border: "1px solid #e8e2cf",
                                    borderRadius: 3,
                                    p: { xs: 2.5, md: 3 },
                                    height: "100%",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 1.5,
                                }}
                            >
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                    {/* 스텝 번호 배지 */}
                                    <Box
                                        sx={{
                                            width: 26,
                                            height: 26,
                                            borderRadius: "50%",
                                            bgcolor: "primary.dark",
                                            color: "#fff",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 13,
                                            fontWeight: 700,
                                            flexShrink: 0,
                                        }}
                                    >
                                        {index + 1}
                                    </Box>
                                    <StepIcon sx={{ fontSize: 26, color: "secondary.main" }} />
                                </Box>
                                <Box>
                                    <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{step.title}</Typography>
                                    <Typography
                                        sx={{ mt: 0.75, fontSize: 12.5, color: "text.secondary", lineHeight: 1.65 }}
                                    >
                                        {step.description}
                                    </Typography>
                                </Box>
                            </Box>
                        </Fragment>
                    );
                })}
            </Box>
        </SectionContainer>
    );
}
