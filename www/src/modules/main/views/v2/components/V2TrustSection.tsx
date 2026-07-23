import { Box, Typography } from "@mui/material";
import { SERIF_FONT, TRUST_ITEMS } from "../../configs/landingContent";
import SectionContainer from "../../components/SectionContainer";
import { V2_COLORS } from "../configs/v2Theme";

/** 2안 신뢰 기준 섹션 — 얇은 상단 보더의 에디토리얼 컬럼 */
export default function V2TrustSection() {
    return (
        <SectionContainer sx={{ pb: { xs: 6, md: 10 } }}>
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "1fr 1.7fr" },
                    gap: { xs: 3, md: 7 },
                    alignItems: "start",
                }}
            >
                <Box>
                    <Typography
                        sx={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.35em", color: V2_COLORS.accent }}
                    >
                        TRUST
                    </Typography>
                    <Typography
                        component="h2"
                        sx={{
                            mt: 1.5,
                            fontFamily: SERIF_FONT,
                            fontSize: { xs: 23, md: 28 },
                            fontWeight: 700,
                            lineHeight: 1.55,
                            whiteSpace: "pre-line",
                            wordBreak: "keep-all",
                            color: V2_COLORS.textPrimary,
                        }}
                    >
                        {"부담 없이 참여할 수 있도록\n도시살롱이 만남의 기준을 만듭니다"}
                    </Typography>
                </Box>

                {/* 기준 컬럼 6개 */}
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" },
                        columnGap: 3,
                        rowGap: 3.5,
                    }}
                >
                    {TRUST_ITEMS.map((item) => {
                        const ItemIcon = item.icon;
                        return (
                            <Box
                                key={item.title}
                                sx={{
                                    pt: 2,
                                    borderTop: `1px solid ${V2_COLORS.border}`,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 1,
                                }}
                            >
                                <ItemIcon sx={{ fontSize: 22, color: V2_COLORS.accent }} />
                                <Typography sx={{ fontSize: 14, fontWeight: 700, color: V2_COLORS.textPrimary }}>
                                    {item.title}
                                </Typography>
                                <Typography sx={{ fontSize: 12, color: "text.secondary", lineHeight: 1.65 }}>
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
