import { Box, IconButton, Link, Typography } from "@mui/material";
import InstagramIcon from "@mui/icons-material/Instagram";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import { CONTACT_EMAIL, SITE_NAME } from "@configs/site-info";
import type { MainController } from "../../../controllers/mainController";
import { FOOTER_LINK_GROUPS, SERIF_FONT } from "../../configs/landingContent";
import SectionContainer from "../../components/SectionContainer";
import { V2_COLORS } from "../configs/v2Theme";

/** V2Footer 컴포넌트 props */
interface V2FooterProps {
    controller: MainController; // 메인 컨트롤러
}

/** 2안 하단 푸터 — 다크 미니멀 */
export default function V2Footer({ controller }: V2FooterProps) {
    const { goTo } = controller;

    return (
        <Box component="footer" sx={{ borderTop: `1px solid ${V2_COLORS.border}` }}>
            <SectionContainer sx={{ py: { xs: 5, md: 7 } }}>
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "1.4fr repeat(3, 1fr) 1.4fr" },
                        gap: { xs: 4, md: 3 },
                    }}
                >
                    {/* 브랜드 */}
                    <Box>
                        <Typography
                            sx={{ fontFamily: SERIF_FONT, fontSize: 22, fontWeight: 700, color: V2_COLORS.textPrimary }}
                        >
                            {SITE_NAME}
                        </Typography>
                        <Typography sx={{ mt: 1, fontSize: 12.5, color: "text.secondary", lineHeight: 1.7 }}>
                            취향이 맞는 사람을
                            <br />
                            우리 동네에서 만나는 방법
                        </Typography>
                        <Box sx={{ mt: 2, display: "flex", gap: 0.5 }}>
                            <IconButton size="small" aria-label="인스타그램" sx={{ color: "text.secondary" }}>
                                <InstagramIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" aria-label="커뮤니티" sx={{ color: "text.secondary" }}>
                                <ForumOutlinedIcon fontSize="small" />
                            </IconButton>
                            <IconButton size="small" aria-label="메일" sx={{ color: "text.secondary" }}>
                                <MailOutlineIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    </Box>

                    {/* 링크 묶음 */}
                    {FOOTER_LINK_GROUPS.map((group, groupIndex) => (
                        <Box
                            key={groupIndex}
                            sx={{ display: "flex", flexDirection: "column", gap: 1.25, pt: { md: 0.5 } }}
                        >
                            {group.map((link) => (
                                <Link
                                    key={link.label}
                                    component="button"
                                    type="button"
                                    underline="hover"
                                    onClick={() => goTo(link.path)}
                                    sx={{
                                        fontSize: 13,
                                        color: "text.secondary",
                                        textAlign: "left",
                                        width: "fit-content",
                                        "&:hover": { color: V2_COLORS.accent },
                                    }}
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </Box>
                    ))}

                    {/* 문의 */}
                    <Box sx={{ pt: { md: 0.5 } }}>
                        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                            문의
                            <Link
                                href={`mailto:${CONTACT_EMAIL}`}
                                underline="hover"
                                sx={{ color: V2_COLORS.accent, ml: 1.5 }}
                            >
                                {CONTACT_EMAIL}
                            </Link>
                        </Typography>
                        <Typography sx={{ mt: 2, fontSize: 12, color: "text.secondary" }}>
                            © {new Date().getFullYear()} {SITE_NAME}. All rights reserved.
                        </Typography>
                    </Box>
                </Box>
            </SectionContainer>
        </Box>
    );
}
