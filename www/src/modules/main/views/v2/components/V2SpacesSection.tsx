import { Box, Button, Typography } from "@mui/material";
import EastOutlinedIcon from "@mui/icons-material/EastOutlined";
import type { MainController } from "../../../controllers/mainController";
import { SERIF_FONT, SPACE_ITEMS } from "../../configs/landingContent";
import MockPhoto from "../../components/MockPhoto";
import SectionContainer from "../../components/SectionContainer";
import { V2_COLORS } from "../configs/v2Theme";

/** V2SpacesSection 컴포넌트 props */
interface V2SpacesSectionProps {
    controller: MainController; // 메인 컨트롤러
}

/** 2안 파트너 공간 섹션 — 무드 포토 카드 */
export default function V2SpacesSection({ controller }: V2SpacesSectionProps) {
    const { goTo } = controller;

    return (
        <Box sx={{ borderTop: `1px solid ${V2_COLORS.border}`, bgcolor: V2_COLORS.bgElevated }}>
            <SectionContainer sx={{ py: { xs: 6, md: 10 } }}>
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "1fr 2fr" },
                        gap: { xs: 3, md: 6 },
                        alignItems: "center",
                    }}
                >
                    {/* 소개 카피 */}
                    <Box>
                        <Typography
                            sx={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.35em", color: V2_COLORS.accent }}
                        >
                            SPACES
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
                                color: V2_COLORS.textPrimary,
                            }}
                        >
                            {"사람이 자연스럽게\n가까워지는 공간"}
                        </Typography>
                        <Typography sx={{ mt: 2, fontSize: 13.5, color: "text.secondary", lineHeight: 1.85 }}>
                            도시살롱은 대화와 관계 형성에
                            <br />
                            적합한 지역의 F&B 공간을 선정합니다.
                        </Typography>
                        <Button
                            variant="outlined"
                            onClick={() => goTo("/dashboard/partner")}
                            endIcon={<EastOutlinedIcon sx={{ fontSize: 16 }} />}
                            sx={{
                                mt: 3.5,
                                borderRadius: 999,
                                px: 2.75,
                                py: 1,
                                fontSize: 13.5,
                                fontWeight: 600,
                                color: V2_COLORS.accent,
                                borderColor: V2_COLORS.borderStrong,
                                "&:hover": { borderColor: V2_COLORS.accent, bgcolor: "rgba(217,181,108,0.06)" },
                            }}
                        >
                            공간 파트너 신청하기
                        </Button>
                    </Box>

                    {/* 공간 카드 3개 */}
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
                            gap: 2,
                        }}
                    >
                        {SPACE_ITEMS.map((space) => (
                            <MockPhoto
                                key={space.name}
                                variant={space.photo}
                                sx={{
                                    aspectRatio: { xs: "16 / 9", sm: "3 / 4" },
                                    borderRadius: 4,
                                    border: `1px solid ${V2_COLORS.border}`,
                                    transition: "transform 0.25s ease",
                                    "&:hover": { transform: "translateY(-4px)" },
                                }}
                            >
                                {/* 하단 캡션 오버레이 */}
                                <Box
                                    sx={{
                                        position: "absolute",
                                        inset: 0,
                                        display: "flex",
                                        flexDirection: "column",
                                        justifyContent: "flex-end",
                                        p: 2,
                                        background: "linear-gradient(180deg, transparent 40%, rgba(10,9,6,0.82) 100%)",
                                    }}
                                >
                                    <Typography
                                        sx={{
                                            fontFamily: SERIF_FONT,
                                            color: "#f7f2e7",
                                            fontSize: 15.5,
                                            fontWeight: 700,
                                        }}
                                    >
                                        {space.name}
                                    </Typography>
                                    <Typography sx={{ color: V2_COLORS.accent, fontSize: 12 }}>
                                        {space.region}
                                    </Typography>
                                </Box>
                            </MockPhoto>
                        ))}
                    </Box>
                </Box>
            </SectionContainer>
        </Box>
    );
}
