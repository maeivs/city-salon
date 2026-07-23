import { createTheme } from "@mui/material";

/** 공통 MUI 테마 (템플릿 기본값 — 브랜드 확정 시 조정) */
const CustomMuiTheme = createTheme({
    palette: {
        primary: {
            main: "#0f766e", // 틸 (템플릿 기본 브랜드색)
            light: "#14b8a6",
            dark: "#115e59",
        },
        secondary: {
            main: "#2563eb",
        },
        background: {
            default: "#f1f4f7",
        },
        text: {
            primary: "#1f2937",
            secondary: "#6b7280",
        },
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

export default CustomMuiTheme;
