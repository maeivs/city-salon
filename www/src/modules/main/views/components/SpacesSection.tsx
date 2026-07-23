import { Box, Button, Typography } from "@mui/material";
import EastOutlinedIcon from "@mui/icons-material/EastOutlined";
import type { MainController } from "../../controllers/mainController";
import { SERIF_FONT, SPACE_ITEMS } from "../configs/landingContent";
import MockPhoto from "./MockPhoto";
import SectionContainer from "./SectionContainer";

/** SpacesSection 컴포넌트 props */
interface SpacesSectionProps {
    controller: MainController; // 메인 컨트롤러
}

/** 파트너 공간 섹션 — 큐레이션된 로컬 공간 소개 */
export default function SpacesSection({ controller }: SpacesSectionProps) {
    const { goTo } = controller;

    return (
        <Box sx={{ bgcolor: "#fffdf8", borderTop: "1px solid #efeadb" }}>
            <SectionContainer sx={{ py: { xs: 6, md: 9 } }}>
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
                            component="h2"
                            sx={{
                                fontFamily: SERIF_FONT,
                                fontSize: { xs: 22, md: 26 },
                                fontWeight: 700,
                                lineHeight: 1.55,
                                whiteSpace: "pre-line",
                            }}
                        >
                            {"사람이 자연스럽게\n가까워지는 공간"}
                        </Typography>
                        <Typography sx={{ mt: 2, fontSize: 13.5, color: "text.secondary", lineHeight: 1.8 }}>
                            도시살롱은 대화와 관계 형성에
                            <br />
                            적합한 지역의 F&B 공간을 선정합니다.
                        </Typography>
                        <Button
                            variant="outlined"
                            onClick={() => goTo("/dashboard/partner")}
                            endIcon={<EastOutlinedIcon sx={{ fontSize: 16 }} />}
                            sx={{
                                mt: 3,
                                borderRadius: 999,
                                px: 2.75,
                                py: 1,
                                fontSize: 13.5,
                                fontWeight: 600,
                                color: "text.primary",
                                borderColor: "#cfc9b6",
                                "&:hover": { borderColor: "primary.dark", bgcolor: "transparent" },
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
                                sx={{ aspectRatio: { xs: "16 / 9", sm: "3 / 4" }, borderRadius: 3 }}
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
                                        background: "linear-gradient(180deg, transparent 45%, rgba(20,18,12,0.72) 100%)",
                                    }}
                                >
                                    <Typography sx={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>
                                        {space.name}
                                    </Typography>
                                    <Typography sx={{ color: "rgba(255,255,255,0.75)", fontSize: 12 }}>
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
