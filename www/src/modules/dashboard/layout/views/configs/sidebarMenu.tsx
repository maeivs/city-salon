import type { MenuItem } from "@ehfuse/mui-dashboard-layout";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";

/** 기본 사이드바 메뉴 — 도메인 메뉴는 프로젝트 진행에 따라 추가한다. */
const menuItems: MenuItem[] = [
    {
        label: "메뉴",
        groupLabel: true,
        collapsible: false,
        collapsedLabel: "메뉴",
        children: [
            { label: "대시보드", icon: <DashboardOutlinedIcon />, path: "/dashboard" },
            { label: "설정", icon: <SettingsOutlinedIcon />, path: "/dashboard/settings" },
        ],
    },
];

/** 사이드바 메뉴를 반환한다. */
export function getSidebarMenuItems(): MenuItem[] {
    return menuItems;
}
