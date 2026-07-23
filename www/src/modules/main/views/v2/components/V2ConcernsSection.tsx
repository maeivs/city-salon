import { Box, Typography } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { CONCERN_ITEMS, SERIF_FONT } from "../../configs/landingContent";
import SectionContainer from "../../components/SectionContainer";
import { V2_COLORS } from "../configs/v2Theme";

/** 2안 공감 포인트 섹션 — 다크 글래스 카드 */
export default function V2ConcernsSection() {
    return (
        <Box sx={{ borderTop: `1px solid ${V2_COLORS.border}`, bgcolor: V2_COLORS.bgElevated }}>
            <SectionContainer sx={{ py: { xs: 6, md: 10 } }}>
                <Typography
                    component="h2"
                    sx={{
                        fontFamily: SERIF_FONT,
                        fontSize: { xs: 23, md: 30 },
                        fontWeight: 700,
                        textAlign: "center",
                        lineHeight: 1.55,
                        whiteSpace: "pre-line",
                        wordBreak: "keep-all",
                        color: V2_COLORS.textPrimary,
                    }}
                >
                    {"사람을 만나고 싶지만,\n아무 모임에나 들어가고 싶지는 않으니까"}
                </Typography>

                {/* 고민 카드 4개 */}
                <Box
                    sx={{
                        mt: { xs: 4, md: 6 },
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
                        gap: { xs: 1.5, md: 2.5 },
                    }}
                >
                    {CONCERN_ITEMS.map((item) => {
                        const ItemIcon = item.icon;
                        return (
                            <Box
                                key={item.text}
                                sx={{
                                    borderRadius: 4,
                                    border: `1px solid ${V2_COLORS.border}`,
                                    bgcolor: "rgba(255,255,255,0.025)",
                                    px: 2,
                                    py: { xs: 3, md: 4 },
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: 1.75,
                                    transition: "border-color 0.25s ease, transform 0.25s ease",
                                    "&:hover": {
                                        borderColor: V2_COLORS.borderStrong,
                                        transform: "translateY(-3px)",
                                    },
                                }}
                            >
                                <Box
                                    sx={{
                                        width: 46,
                                        height: 46,
                                        borderRadius: "50%",
                                        border: `1px solid ${V2_COLORS.borderStrong}`,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: V2_COLORS.accent,
                                    }}
                                >
                                    <ItemIcon sx={{ fontSize: 22 }} />
                                </Box>
                                <Typography
                                    sx={{
                                        fontSize: { xs: 13, md: 14 },
                                        fontWeight: 600,
                                        textAlign: "center",
                                        lineHeight: 1.65,
                                        whiteSpace: "pre-line",
                                        color: V2_COLORS.textPrimary,
                                    }}
                                >
                                    {item.text}
                                </Typography>
                            </Box>
                        );
                    })}
                </Box>

                {/* 구분선 + 요약 문구 */}
                <Box sx={{ mt: { xs: 4, md: 6 }, display: "flex", alignItems: "center", gap: 2 }}>
                    <Box sx={{ flex: 1, borderTop: `1px solid ${V2_COLORS.border}` }} />
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                        <AutoAwesomeIcon sx={{ fontSize: 18, color: V2_COLORS.accent }} />
                        <Typography
                            sx={{
                                fontSize: { xs: 13, md: 14.5 },
                                fontWeight: 500,
                                textAlign: "center",
                                color: V2_COLORS.textPrimary,
                            }}
                        >
                            도시살롱은 취향, 지역, 관심사를 바탕으로 나에게 맞는 만남을 추천합니다.
                        </Typography>
                    </Box>
                    <Box sx={{ flex: 1, borderTop: `1px solid ${V2_COLORS.border}` }} />
                </Box>
            </SectionContainer>
        </Box>
    );
}
