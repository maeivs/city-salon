import type { ReactNode } from "react";
import { Box, Button, Typography } from "@mui/material";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import type { MainController } from "../../controllers/mainController";
import type { MockPhotoVariant } from "../../models/types";
import { SERIF_FONT } from "../configs/landingContent";
import MockPhoto from "./MockPhoto";

/** SalonCard 컴포넌트 props */
interface SalonCardProps {
    controller: MainController; // 메인 컨트롤러
    index: number; // weeklySalons 배열 인덱스
}

/** 카드 메타(지역/인원/일자) 한 칸 표기 */
function SalonMeta({ icon, label }: { icon: ReactNode; label: string }) {
    return (
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
            {icon}
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{label}</Typography>
        </Box>
    );
}

/** 이번 주 살롱 카드 — 자기 인덱스의 슬라이스만 구독한다 */
export default function SalonCard({ controller, index }: SalonCardProps) {
    const { state, goTo } = controller;
    const titleRaw = state.useValue(`weeklySalons.${index}.title`);
    const regionRaw = state.useValue(`weeklySalons.${index}.region`);
    const capacityRaw = state.useValue(`weeklySalons.${index}.capacity`);
    const dateRaw = state.useValue(`weeklySalons.${index}.date`);
    const photoRaw = state.useValue(`weeklySalons.${index}.photo`);
    const title = (titleRaw as string | undefined) ?? "";
    const region = (regionRaw as string | undefined) ?? "";
    const capacity = (capacityRaw as string | undefined) ?? "";
    const date = (dateRaw as string | undefined) ?? "";
    const photo = (photoRaw as MockPhotoVariant | undefined) ?? "dinner";

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75 }}>
            <MockPhoto variant={photo} sx={{ width: "100%", aspectRatio: "16 / 10", borderRadius: 3 }} />
            <Typography sx={{ fontFamily: SERIF_FONT, fontSize: 18, fontWeight: 700 }}>{title}</Typography>
            <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.75 }}>
                <SalonMeta icon={<PlaceOutlinedIcon sx={{ fontSize: 15, color: "text.secondary" }} />} label={region} />
                <SalonMeta
                    icon={<PeopleAltOutlinedIcon sx={{ fontSize: 15, color: "text.secondary" }} />}
                    label={capacity}
                />
                <SalonMeta
                    icon={<CalendarMonthOutlinedIcon sx={{ fontSize: 15, color: "text.secondary" }} />}
                    label={date}
                />
            </Box>
            <Button
                variant="outlined"
                onClick={() => goTo("/dashboard/salons")}
                sx={{
                    borderRadius: 2,
                    py: 1,
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "text.primary",
                    borderColor: "#cfc9b6",
                    "&:hover": { borderColor: "primary.dark", bgcolor: "transparent" },
                }}
            >
                자세히 보기
            </Button>
        </Box>
    );
}
