import { Box, Typography } from "@mui/material";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import EastOutlinedIcon from "@mui/icons-material/EastOutlined";
import type { SvgIconComponent } from "@mui/icons-material";
import type { MainController } from "../../../controllers/mainController";
import type { MockPhotoVariant } from "../../../models/types";
import { SERIF_FONT } from "../../configs/landingContent";
import MockPhoto from "../../components/MockPhoto";
import { V2_COLORS } from "../configs/v2Theme";

/** V2SalonCard 컴포넌트 props */
interface V2SalonCardProps {
    controller: MainController; // 메인 컨트롤러
    index: number; // weeklySalons 배열 인덱스
}

/** 사진 위 메타 칩 한 개 */
function V2SalonMetaChip({ icon: MetaIcon, label }: { icon: SvgIconComponent; label: string }) {
    return (
        <Box
            sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                px: 1.25,
                py: 0.4,
                borderRadius: 999,
                bgcolor: "rgba(20, 18, 14, 0.72)",
                backdropFilter: "blur(6px)",
                border: "1px solid rgba(255,255,255,0.14)",
            }}
        >
            <MetaIcon sx={{ fontSize: 13, color: V2_COLORS.accent }} />
            <Typography sx={{ fontSize: 11.5, color: "#f2ede3" }}>{label}</Typography>
        </Box>
    );
}

/** 2안 이번 주 살롱 카드 — 자기 인덱스 슬라이스만 구독한다 */
export default function V2SalonCard({ controller, index }: V2SalonCardProps) {
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
        <Box
            onClick={() => goTo("/dashboard/salons")}
            sx={{
                cursor: "pointer",
                borderRadius: 5,
                border: `1px solid ${V2_COLORS.border}`,
                bgcolor: "rgba(255,255,255,0.02)",
                overflow: "hidden",
                transition: "border-color 0.25s ease, transform 0.25s ease",
                "&:hover": { borderColor: V2_COLORS.borderStrong, transform: "translateY(-4px)" },
            }}
        >
            <MockPhoto variant={photo} sx={{ width: "100%", aspectRatio: "16 / 10" }}>
                {/* 사진 위 메타 칩 */}
                <Box sx={{ position: "absolute", left: 12, bottom: 12, display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                    <V2SalonMetaChip icon={PlaceOutlinedIcon} label={region} />
                    <V2SalonMetaChip icon={PeopleAltOutlinedIcon} label={capacity} />
                    <V2SalonMetaChip icon={CalendarMonthOutlinedIcon} label={date} />
                </Box>
            </MockPhoto>
            <Box sx={{ p: 2.5, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                <Typography
                    sx={{ fontFamily: SERIF_FONT, fontSize: 18, fontWeight: 700, color: V2_COLORS.textPrimary }}
                >
                    {title}
                </Typography>
                <EastOutlinedIcon sx={{ fontSize: 18, color: V2_COLORS.accent, flexShrink: 0 }} />
            </Box>
        </Box>
    );
}
