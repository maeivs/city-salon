import { Box, Typography } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { CONCERN_ITEMS, SERIF_FONT } from "../configs/landingContent";
import SectionContainer from "./SectionContainer";

/** 공감 포인트 섹션 — 만남에 대한 고민 카드 */
export default function ConcernsSection() {
    return (
        <Box sx={{ bgcolor: "#fffdf8", borderTop: "1px solid #efeadb", borderBottom: "1px solid #efeadb" }}>
            <SectionContainer sx={{ py: { xs: 6, md: 9 } }}>
                <Typography
                    component="h2"
                    sx={{
                        fontFamily: SERIF_FONT,
                        fontSize: { xs: 22, md: 28 },
                        fontWeight: 700,
                        textAlign: "center",
                        lineHeight: 1.5,
                        whiteSpace: "pre-line",
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
                                    bgcolor: "#f6f2e4",
                                    borderRadius: 3,
                                    px: 2,
                                    py: { xs: 3, md: 4 },
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: 1.75,
                                }}
                            >
                                <Box
                                    sx={{
                                        width: 44,
                                        height: 44,
                                        borderRadius: "50%",
                                        bgcolor: "#eae3cd",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: "primary.dark",
                                    }}
                                >
                                    <ItemIcon sx={{ fontSize: 22 }} />
                                </Box>
                                <Typography
                                    sx={{
                                        fontSize: { xs: 13, md: 14 },
                                        fontWeight: 600,
                                        textAlign: "center",
                                        lineHeight: 1.6,
                                        whiteSpace: "pre-line",
                                    }}
                                >
                                    {item.text}
                                </Typography>
                            </Box>
                        );
                    })}
                </Box>

                {/* 구분선 + 요약 문구 */}
                <Box
                    sx={{
                        mt: { xs: 4, md: 6 },
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                    }}
                >
                    <Box sx={{ flex: 1, borderTop: "1px solid #ddd6c2" }} />
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                        <AutoAwesomeIcon sx={{ fontSize: 18, color: "secondary.main" }} />
                        <Typography sx={{ fontSize: { xs: 13, md: 14.5 }, fontWeight: 600, textAlign: "center" }}>
                            도시살롱은 취향, 지역, 관심사를 바탕으로 나에게 맞는 만남을 추천합니다.
                        </Typography>
                    </Box>
                    <Box sx={{ flex: 1, borderTop: "1px solid #ddd6c2" }} />
                </Box>
            </SectionContainer>
        </Box>
    );
}
