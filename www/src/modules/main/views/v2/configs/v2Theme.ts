import { createTheme } from "@mui/material";

/** 2안 공통 컬러 토큰 — 웜 차콜 + 샴페인 골드 */
export const V2_COLORS = {
    bg: "#12110e", // 페이지 배경 (웜 니어블랙)
    bgElevated: "#1b1916", // 살짝 떠 있는 배경 (헤더/카드)
    panel: "#201d18", // 패널 배경
    border: "rgba(255, 255, 255, 0.08)", // 기본 보더
    borderStrong: "rgba(217, 181, 108, 0.28)", // 골드 보더
    textPrimary: "#f2ede3", // 본문 기본 (웜 아이보리)
    textSecondary: "#a69e8e", // 본문 보조
    accent: "#d9b56c", // 샴페인 골드
    accentHover: "#e6c885", // 골드 hover
    accentInk: "#181510", // 골드 버튼 위 텍스트
    glow: "rgba(217, 181, 108, 0.12)", // 골드 글로우
    glowGreen: "rgba(84, 116, 92, 0.16)", // 그린 글로우
} as const;

/** 2안 전용 다크 MUI 테마 — /v2 트리에만 스코프해서 적용한다 */
export const v2Theme = createTheme({
    palette: {
        mode: "dark",
        primary: {
            main: V2_COLORS.accent,
            light: V2_COLORS.accentHover,
            dark: "#b8944e",
            contrastText: V2_COLORS.accentInk,
        },
        background: {
            default: V2_COLORS.bg,
            paper: V2_COLORS.bgElevated,
        },
        text: {
            primary: V2_COLORS.textPrimary,
            secondary: V2_COLORS.textSecondary,
        },
        divider: V2_COLORS.border,
    },
    typography: {
        fontFamily: [
            "Pretendard",
            "Noto Sans KR",
            "-apple-system",
            "BlinkMacSystemFont",
            "Segoe UI",
            "Roboto",
            "sans-serif",
        ].join(","),
    },
    components: {
        MuiButton: {
            defaultProps: {
                disableElevation: true,
            },
        },
    },
});
