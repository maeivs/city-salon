import { createTheme } from "@mui/material";

/** 공통 MUI 테마 (도시살롱 브랜드 — 딥그린 + 크림) */
const CustomMuiTheme = createTheme({
    palette: {
        primary: {
            main: "#2c4a33", // 도시살롱 딥그린
            light: "#54745c",
            dark: "#1e3624",
        },
        secondary: {
            main: "#b5924c", // 골드 포인트
        },
        background: {
            default: "#faf8f2", // 크림 배경
        },
        text: {
            primary: "#2b2a24",
            secondary: "#716f64",
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
