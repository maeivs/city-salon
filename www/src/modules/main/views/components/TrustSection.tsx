import { Box, Typography } from "@mui/material";
import { SERIF_FONT, TRUST_ITEMS } from "../configs/landingContent";
import SectionContainer from "./SectionContainer";

/** 신뢰 기준 섹션 — 만남의 기준 카드 6개 */
export default function TrustSection() {
    return (
        <SectionContainer sx={{ pb: { xs: 6, md: 9 } }}>
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "1fr 1.7fr" },
                    gap: { xs: 3, md: 6 },
                    alignItems: "center",
                }}
            >
                <Typography
                    component="h2"
                    sx={{
                        fontFamily: SERIF_FONT,
                        fontSize: { xs: 22, md: 26 },
                        fontWeight: 700,
                        lineHeight: 1.55,
                        whiteSpace: "pre-line",
                    }}
                >
                    {"부담 없이 참여할 수 있도록\n도시살롱이 만남의 기준을 만듭니다"}
                </Typography>

                {/* 기준 카드 6개 */}
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", md: "repeat(6, 1fr)" },
                        gap: 1.5,
                    }}
                >
                    {TRUST_ITEMS.map((item) => {
                        const ItemIcon = item.icon;
                        return (
                            <Box
                                key={item.title}
                                sx={{
                                    bgcolor: "#fffdf8",
                                    border: "1px solid #e8e2cf",
                                    borderRadius: 3,
                                    px: 1.25,
                                    py: 2,
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: 1,
                                    textAlign: "center",
                                }}
                            >
                                <ItemIcon sx={{ fontSize: 24, color: "primary.dark" }} />
                                <Typography sx={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.4 }}>
                                    {item.title}
                                </Typography>
                                <Typography sx={{ fontSize: 11, color: "text.secondary", lineHeight: 1.55 }}>
                                    {item.description}
                                </Typography>
                            </Box>
                        );
                    })}
                </Box>
            </Box>
        </SectionContainer>
    );
}
