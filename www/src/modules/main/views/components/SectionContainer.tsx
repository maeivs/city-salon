import { Box, type SxProps, type Theme } from "@mui/material";
import type { ReactNode } from "react";

/** SectionContainer 컴포넌트 props */
interface SectionContainerProps {
    sx?: SxProps<Theme>; // 섹션별 추가 스타일
    children: ReactNode; // 섹션 내용
}

/** 랜딩 섹션 공통 가로 컨테이너(최대폭 + 좌우 여백) */
export default function SectionContainer({ sx, children }: SectionContainerProps) {
    return (
        <Box
            sx={[
                {
                    maxWidth: 1240,
                    mx: "auto",
                    px: { xs: 2.5, md: 5 },
                },
                ...(Array.isArray(sx) ? sx : [sx]),
            ]}
        >
            {children}
        </Box>
    );
}
