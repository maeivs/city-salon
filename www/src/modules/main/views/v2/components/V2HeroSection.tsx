import { Box, Button, Typography } from "@mui/material";
import EastOutlinedIcon from "@mui/icons-material/EastOutlined";
import NightlifeOutlinedIcon from "@mui/icons-material/NightlifeOutlined";
import type { MainController } from "../../../controllers/mainController";
import { HERO_CHIPS, SERIF_FONT } from "../../configs/landingContent";
import MockPhoto from "../../components/MockPhoto";
import SectionContainer from "../../components/SectionContainer";
import { V2_COLORS } from "../configs/v2Theme";

/** V2HeroSection 컴포넌트 props */
interface V2HeroSectionProps {
    controller: MainController; // 메인 컨트롤러
}

/** 2안 히어로 — 다크 배경 + 골드 글로우 + 에디토리얼 타이포 */
export default function V2HeroSection({ controller }: V2HeroSectionProps) {
    const { goTo, goRecommend } = controller;

    return (
        <Box sx={{ position: "relative", overflow: "hidden" }}>
            {/* 배경 글로우 */}
            <Box
                sx={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    background: `radial-gradient(560px 380px at 18% 12%, ${V2_COLORS.glow}, transparent 70%), radial-gradient(640px 460px at 85% 65%, ${V2_COLORS.glowGreen}, transparent 72%)`,
                }}
            />
            <SectionContainer sx={{ position: "relative", pt: { xs: 6, md: 10 }, pb: { xs: 7, md: 11 } }}>
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "1.05fr 1fr" },
                        gap: { xs: 5, md: 7 },
                        alignItems: "center",
                    }}
                >
                    {/* 카피 영역 */}
                    <Box>
                        {/* 아이브로우 라벨 */}
                        <Typography
                            sx={{
                                fontSize: 12,
                                fontWeight: 600,
                                letterSpacing: "0.35em",
                                color: V2_COLORS.accent,
                            }}
                        >
                            CITY SALON — 지역 기반 소셜 살롱
                        </Typography>
                        <Typography
                            component="h1"
                            sx={{
                                mt: 2.5,
                                fontFamily: SERIF_FONT,
                                fontSize: { xs: 32, sm: 40, md: 48 },
                                fontWeight: 700,
                                lineHeight: 1.35,
                                wordBreak: "keep-all",
                                color: V2_COLORS.textPrimary,
                            }}
                        >
                            취향이 맞는 사람을
                            <br />
                            <Box component="span" sx={{ color: V2_COLORS.accent }}>
                                우리 동네
                            </Box>
                            에서 만나는 방법
                        </Typography>
                        <Typography
                            sx={{ mt: 3, fontSize: { xs: 14.5, md: 16 }, color: "text.secondary", lineHeight: 1.9 }}
                        >
                            도시살롱은 나의 취향과 관심사를 바탕으로
                            <br />
                            나와 맞는 사람, 모임, 공간을 연결합니다.
                        </Typography>

                        {/* CTA 버튼 */}
                        <Box sx={{ mt: 4.5, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2 }}>
                            <Button
                                variant="contained"
                                onClick={goRecommend}
                                sx={{ borderRadius: 999, px: 3.5, py: 1.5, fontSize: 15, fontWeight: 700 }}
                            >
                                나에게 맞는 모임 추천받기
                            </Button>
                            <Button
                                onClick={() => goTo("/dashboard/salons")}
                                endIcon={<EastOutlinedIcon sx={{ fontSize: 16 }} />}
                                sx={{
                                    color: V2_COLORS.textPrimary,
                                    fontSize: 15,
                                    fontWeight: 600,
                                    "&:hover": { color: V2_COLORS.accent, bgcolor: "transparent" },
                                }}
                            >
                                모임 둘러보기
                            </Button>
                        </Box>

                        {/* 키워드 칩 */}
                        <Box sx={{ mt: 4.5, display: "flex", flexWrap: "wrap", gap: 1.25 }}>
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
                                            border: `1px solid ${V2_COLORS.border}`,
                                            bgcolor: "rgba(255,255,255,0.03)",
                                        }}
                                    >
                                        <ChipIcon sx={{ fontSize: 16, color: V2_COLORS.accent }} />
                                        <Typography
                                            sx={{ fontSize: 13, fontWeight: 500, color: V2_COLORS.textPrimary }}
                                        >
                                            {chip.label}
                                        </Typography>
                                    </Box>
                                );
                            })}
                        </Box>
                    </Box>

                    {/* 대표 이미지 + 플로팅 배지 */}
                    <Box sx={{ position: "relative" }}>
                        <MockPhoto
                            variant="hero"
                            sx={{
                                width: "100%",
                                aspectRatio: { xs: "4 / 3", md: "10 / 9" },
                                borderRadius: 6,
                                border: `1px solid ${V2_COLORS.border}`,
                                boxShadow: `0 30px 80px rgba(0,0,0,0.5), 0 0 120px ${V2_COLORS.glow}`,
                            }}
                        />
                        {/* 감성 플로팅 카드 */}
                        <Box
                            sx={{
                                position: "absolute",
                                left: { xs: 12, md: -24 },
                                bottom: { xs: 12, md: 28 },
                                display: "flex",
                                alignItems: "center",
                                gap: 1.25,
                                px: 2,
                                py: 1.25,
                                borderRadius: 3,
                                bgcolor: "rgba(24, 22, 18, 0.85)",
                                backdropFilter: "blur(10px)",
                                border: `1px solid ${V2_COLORS.borderStrong}`,
                            }}
                        >
                            <NightlifeOutlinedIcon sx={{ fontSize: 20, color: V2_COLORS.accent }} />
                            <Box>
                                <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: V2_COLORS.textPrimary }}>
                                    오늘 밤, 성수의 살롱이 열려요
                                </Typography>
                                <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                                    이번 주 모임 12개 진행 중
                                </Typography>
                            </Box>
                        </Box>
                    </Box>
                </Box>
            </SectionContainer>
        </Box>
    );
}
