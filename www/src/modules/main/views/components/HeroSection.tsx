import { Box, Button, Typography } from "@mui/material";
import type { MainController } from "../../controllers/mainController";
import { HERO_CHIPS, SERIF_FONT } from "../configs/landingContent";
import MockPhoto from "./MockPhoto";
import SectionContainer from "./SectionContainer";

/** HeroSection 컴포넌트 props */
interface HeroSectionProps {
    controller: MainController; // 메인 컨트롤러
}

/** 히어로 섹션 — 서비스 핵심 문구와 대표 이미지 */
export default function HeroSection({ controller }: HeroSectionProps) {
    const { goTo, goRecommend } = controller;

    return (
        <SectionContainer sx={{ pt: { xs: 4, md: 7 }, pb: { xs: 6, md: 9 } }}>
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "1.05fr 1fr" },
                    gap: { xs: 4, md: 6 },
                    alignItems: "center",
                }}
            >
                {/* 카피 영역 */}
                <Box>
                    <Typography
                        component="h1"
                        sx={{
                            fontFamily: SERIF_FONT,
                            fontSize: { xs: 30, sm: 36, md: 42 },
                            fontWeight: 700,
                            lineHeight: 1.4,
                            color: "text.primary",
                            whiteSpace: "pre-line",
                        }}
                    >
                        {"취향이 맞는 사람을\n우리 동네에서 만나는 방법"}
                    </Typography>
                    <Typography
                        sx={{ mt: 3, fontSize: { xs: 14.5, md: 15.5 }, color: "text.secondary", lineHeight: 1.85 }}
                    >
                        도시살롱은 나의 취향과 관심사를 바탕으로
                        <br />
                        나와 맞는 사람, 모임, 공간을 연결하는
                        <br />
                        지역 기반 소셜 플랫폼입니다.
                    </Typography>

                    {/* CTA 버튼 */}
                    <Box sx={{ mt: 4, display: "flex", flexWrap: "wrap", gap: 1.5 }}>
                        <Button
                            variant="contained"
                            onClick={goRecommend}
                            sx={{
                                borderRadius: 999,
                                px: 3.25,
                                py: 1.4,
                                fontSize: 15,
                                fontWeight: 700,
                                bgcolor: "primary.dark",
                                "&:hover": { bgcolor: "primary.main" },
                            }}
                        >
                            나에게 맞는 모임 추천받기
                        </Button>
                        <Button
                            variant="outlined"
                            onClick={() => goTo("/dashboard/salons")}
                            sx={{
                                borderRadius: 999,
                                px: 3.25,
                                py: 1.4,
                                fontSize: 15,
                                fontWeight: 600,
                                color: "text.primary",
                                borderColor: "#cfc9b6",
                                "&:hover": { borderColor: "primary.dark", bgcolor: "transparent" },
                            }}
                        >
                            모임 둘러보기
                        </Button>
                    </Box>

                    {/* 키워드 칩 */}
                    <Box sx={{ mt: 4, display: "flex", flexWrap: "wrap", gap: 1.25 }}>
                        {HERO_CHIPS.map((chip) => {
                            const ChipIcon = chip.icon;
                            return (
                                <Box
                                    key={chip.label}
                                    sx={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 0.75,
                                        px: 1.75,
                                        py: 0.75,
                                        borderRadius: 999,
                                        bgcolor: "#f1ecdd",
                                        border: "1px solid #e4ddc8",
                                    }}
                                >
                                    <ChipIcon sx={{ fontSize: 16, color: "primary.dark" }} />
                                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.primary" }}>
                                        {chip.label}
                                    </Typography>
                                </Box>
                            );
                        })}
                    </Box>
                </Box>

                {/* 대표 이미지 */}
                <MockPhoto
                    variant="hero"
                    sx={{
                        width: "100%",
                        aspectRatio: { xs: "4 / 3", md: "10 / 9" },
                        borderRadius: { xs: "24px", md: "28px 140px 28px 28px" },
                    }}
                />
            </Box>
        </SectionContainer>
    );
}
