import { Box, Button, IconButton, Typography } from "@mui/material";
import EastOutlinedIcon from "@mui/icons-material/EastOutlined";
import { Select } from "@ehfuse/mui-form-controls";
import type { MainController } from "../../controllers/mainController";
import { RECOMMEND_SECTION_ID } from "../../controllers/mainController";
import { RECOMMEND_FIELDS, RECOMMEND_MATCHES, SERIF_FONT } from "../configs/landingContent";
import MockPhoto from "./MockPhoto";
import SectionContainer from "./SectionContainer";

/** RecommendSection 컴포넌트 props */
interface RecommendSectionProps {
    controller: MainController; // 메인 컨트롤러
}

/** 맞춤 추천 섹션 — 취향 선택 폼 + 추천 미리보기 카드 */
export default function RecommendSection({ controller }: RecommendSectionProps) {
    const { form } = controller;

    return (
        <SectionContainer sx={{ pb: { xs: 6, md: 9 } }}>
            <Box
                id={RECOMMEND_SECTION_ID}
                sx={{
                    scrollMarginTop: 84,
                    bgcolor: "#f3eedd",
                    borderRadius: { xs: 4, md: 6 },
                    p: { xs: 3, md: 6 },
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "1.1fr auto 1fr" },
                    gap: { xs: 4, md: 5 },
                    alignItems: "center",
                }}
            >
                {/* 취향 선택 폼 */}
                <Box>
                    <Typography
                        component="h2"
                        sx={{
                            fontFamily: SERIF_FONT,
                            fontSize: { xs: 22, md: 26 },
                            fontWeight: 700,
                            lineHeight: 1.5,
                            whiteSpace: "pre-line",
                        }}
                    >
                        {"모임을 고르기 어렵다면\n도시살롱이 찾아드릴게요"}
                    </Typography>

                    <Box sx={{ mt: 3, display: "flex", flexDirection: "column", gap: 1.5 }}>
                        {RECOMMEND_FIELDS.map((field) => {
                            const FieldIcon = field.icon;
                            return (
                                <Box
                                    key={field.name}
                                    sx={{
                                        display: "grid",
                                        gridTemplateColumns: { xs: "1fr", sm: "170px 1fr" },
                                        alignItems: "center",
                                        gap: { xs: 0.75, sm: 2 },
                                    }}
                                >
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                        <FieldIcon sx={{ fontSize: 18, color: "primary.dark" }} />
                                        <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{field.label}</Typography>
                                    </Box>
                                    <Select
                                        form={form}
                                        name={field.name}
                                        options={field.options}
                                        showEmptyOption
                                        emptyLabel="선택해주세요"
                                        fullWidth
                                        size="small"
                                        sx={{ bgcolor: "#fffdf8", borderRadius: 2 }}
                                    />
                                </Box>
                            );
                        })}
                    </Box>

                    <Button
                        variant="contained"
                        onClick={form.submit}
                        sx={{
                            mt: 3,
                            width: { xs: "100%", sm: "auto" },
                            minWidth: { sm: 320 },
                            borderRadius: 2.5,
                            py: 1.4,
                            fontSize: 15,
                            fontWeight: 700,
                            bgcolor: "primary.dark",
                            "&:hover": { bgcolor: "primary.main" },
                        }}
                    >
                        맞춤 추천 시작하기
                    </Button>
                </Box>

                {/* 가운데 화살표(장식) */}
                <IconButton
                    onClick={form.submit}
                    aria-label="맞춤 추천 시작"
                    sx={{
                        display: { xs: "none", md: "inline-flex" },
                        width: 52,
                        height: 52,
                        bgcolor: "primary.dark",
                        color: "#fff",
                        "&:hover": { bgcolor: "primary.main" },
                    }}
                >
                    <EastOutlinedIcon />
                </IconButton>

                {/* 추천 미리보기 카드 */}
                <Box sx={{ bgcolor: "#fffdf8", borderRadius: 4, p: { xs: 2.5, md: 3.5 } }}>
                    <Typography sx={{ fontSize: 16, fontWeight: 700 }}>회원님께는 이런 모임이 잘 맞아요</Typography>
                    <Box sx={{ mt: 2.5, display: "flex", flexDirection: "column", gap: 2.5 }}>
                        {RECOMMEND_MATCHES.map((match) => {
                            const MatchIcon = match.icon;
                            return (
                                <Box key={match.title} sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                                    <MockPhoto
                                        variant={match.photo}
                                        sx={{ width: 76, height: 76, borderRadius: 2.5, flexShrink: 0 }}
                                    />
                                    <Box sx={{ flex: 1 }}>
                                        <Typography sx={{ fontSize: 14.5, fontWeight: 700 }}>{match.title}</Typography>
                                        <Typography
                                            sx={{ mt: 0.5, fontSize: 12.5, color: "text.secondary", lineHeight: 1.65 }}
                                        >
                                            {match.description}
                                        </Typography>
                                    </Box>
                                    <Box
                                        sx={{
                                            width: 44,
                                            height: 44,
                                            borderRadius: "50%",
                                            bgcolor: "#efe9d6",
                                            display: { xs: "none", sm: "flex" },
                                            alignItems: "center",
                                            justifyContent: "center",
                                            color: "primary.dark",
                                            flexShrink: 0,
                                        }}
                                    >
                                        <MatchIcon sx={{ fontSize: 22 }} />
                                    </Box>
                                </Box>
                            );
                        })}
                    </Box>
                </Box>
            </Box>
        </SectionContainer>
    );
}
