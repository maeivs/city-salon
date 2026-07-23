import { Box, type SxProps, type Theme } from "@mui/material";
import type { ReactNode } from "react";
import type { MockPhotoVariant } from "../../models/types";

/** 변형별 목업 사진 배경(따뜻한 조명의 공간 느낌 그라디언트) */
const VARIANT_BACKGROUNDS: Record<MockPhotoVariant, string> = {
    hero: "radial-gradient(circle at 22% 28%, rgba(255,214,150,0.45), transparent 42%), radial-gradient(circle at 78% 62%, rgba(255,238,200,0.3), transparent 46%), linear-gradient(118deg, #55412e 0%, #83643f 48%, #c09a67 100%)",
    dinner: "radial-gradient(circle at 30% 25%, rgba(255,200,130,0.4), transparent 45%), radial-gradient(circle at 80% 70%, rgba(255,170,110,0.25), transparent 40%), linear-gradient(130deg, #3c2d21 0%, #6c5030 55%, #93683c 100%)",
    booktalk: "radial-gradient(circle at 70% 25%, rgba(255,235,180,0.35), transparent 45%), radial-gradient(circle at 25% 70%, rgba(210,190,140,0.3), transparent 40%), linear-gradient(125deg, #45402c 0%, #6f6444 55%, #a08c5c 100%)",
    wine: "radial-gradient(circle at 30% 30%, rgba(255,180,150,0.35), transparent 42%), radial-gradient(circle at 75% 65%, rgba(230,150,140,0.25), transparent 45%), linear-gradient(125deg, #45222c 0%, #7a4149 55%, #a56a58 100%)",
    "reco-small": "radial-gradient(circle at 30% 30%, rgba(255,235,200,0.5), transparent 45%), linear-gradient(120deg, #8a7250 0%, #b99c72 60%, #d9c39a 100%)",
    "reco-local": "radial-gradient(circle at 70% 30%, rgba(230,240,210,0.4), transparent 45%), linear-gradient(120deg, #55603f 0%, #7d8759 60%, #a9ad7f 100%)",
    lounge: "radial-gradient(circle at 25% 30%, rgba(190,220,200,0.3), transparent 45%), radial-gradient(circle at 75% 70%, rgba(255,220,170,0.25), transparent 42%), linear-gradient(125deg, #2c3a34 0%, #526457 55%, #7d8a72 100%)",
    cafe: "radial-gradient(circle at 70% 25%, rgba(255,225,170,0.45), transparent 45%), radial-gradient(circle at 25% 70%, rgba(240,200,150,0.3), transparent 42%), linear-gradient(125deg, #64492c 0%, #97744a 55%, #c4a06d 100%)",
    bar: "radial-gradient(circle at 30% 30%, rgba(255,190,120,0.35), transparent 40%), radial-gradient(circle at 75% 60%, rgba(200,160,110,0.25), transparent 45%), linear-gradient(125deg, #262f2c 0%, #4c4438 55%, #7a674c 100%)",
};

/** MockPhoto 컴포넌트 props */
interface MockPhotoProps {
    variant: MockPhotoVariant; // 색감 프리셋
    sx?: SxProps<Theme>; // 크기/모서리 등 추가 스타일
    children?: ReactNode; // 캡션 등 오버레이 콘텐츠
}

/** 실사 사진이 준비되기 전까지 쓰는 그라디언트 목업 포토 */
export default function MockPhoto({ variant, sx, children }: MockPhotoProps) {
    return (
        <Box
            sx={[
                {
                    position: "relative",
                    overflow: "hidden",
                    background: VARIANT_BACKGROUNDS[variant],
                },
                ...(Array.isArray(sx) ? sx : [sx]),
            ]}
        >
            {children}
        </Box>
    );
}
