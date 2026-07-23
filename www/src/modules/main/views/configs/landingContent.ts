import type { SvgIconComponent } from "@mui/icons-material";
import Groups2Outlined from "@mui/icons-material/Groups2Outlined";
import FavoriteBorderOutlined from "@mui/icons-material/FavoriteBorderOutlined";
import PlaceOutlined from "@mui/icons-material/PlaceOutlined";
import PersonSearchOutlined from "@mui/icons-material/PersonSearchOutlined";
import PersonOutline from "@mui/icons-material/PersonOutline";
import EditNoteOutlined from "@mui/icons-material/EditNoteOutlined";
import MapsUgcOutlined from "@mui/icons-material/MapsUgcOutlined";
import HomeWorkOutlined from "@mui/icons-material/HomeWorkOutlined";
import Diversity1Outlined from "@mui/icons-material/Diversity1Outlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PeopleAltOutlined from "@mui/icons-material/PeopleAltOutlined";
import WineBarOutlined from "@mui/icons-material/WineBarOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import MapOutlined from "@mui/icons-material/MapOutlined";
import VerifiedUserOutlined from "@mui/icons-material/VerifiedUserOutlined";
import HowToRegOutlined from "@mui/icons-material/HowToRegOutlined";
import ApartmentOutlined from "@mui/icons-material/ApartmentOutlined";
import NotificationImportantOutlined from "@mui/icons-material/NotificationImportantOutlined";
import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import type { SelectOption } from "@ehfuse/mui-form-controls";
import type { MockPhotoVariant, RecommendForm } from "../../models/types";

/** 랜딩 헤드라인용 세리프 폰트 스택 */
export const SERIF_FONT = '"Noto Serif KR", "Nanum Myeongjo", serif';

/** 상단 네비게이션 메뉴 아이템 */
export interface NavItem {
    label: string; // 메뉴 표기명
    path?: string; // 이동 경로 (없으면 recommend 스크롤)
    recommend?: boolean; // true 면 맞춤 추천 섹션으로 스크롤
}

/** 상단 네비게이션 메뉴 목록 */
export const NAV_ITEMS: NavItem[] = [
    { label: "모임 찾기", path: "/dashboard/salons" },
    { label: "맞춤 추천", recommend: true },
    { label: "도시살롱 소개", path: "/dashboard/about" },
    { label: "파트너 신청", path: "/dashboard/partner" },
];

/** 히어로 하단 키워드 칩 */
export const HERO_CHIPS: { icon: SvgIconComponent; label: string }[] = [
    { icon: Groups2Outlined, label: "소규모 모임" },
    { icon: FavoriteBorderOutlined, label: "취향 기반" },
    { icon: PlaceOutlined, label: "우리 동네" },
];

/** 공감 포인트(사람을 만나고 싶지만…) 카드 */
export const CONCERN_ITEMS: { icon: SvgIconComponent; text: string }[] = [
    { icon: Groups2Outlined, text: "새로운 사람을\n만날 기회가 부족해요" },
    { icon: PersonSearchOutlined, text: "모임 분위기를\n미리 알기 어려워요" },
    { icon: PersonOutline, text: "혼자 신청하기엔\n조금 부담돼요" },
    { icon: FavoriteBorderOutlined, text: "내 취향과 맞는\n사람을 찾고 싶어요" },
];

/** 이용 방법 스텝 카드 */
export const HOW_IT_WORKS_STEPS: { icon: SvgIconComponent; title: string; description: string }[] = [
    { icon: EditNoteOutlined, title: "취향을 알려주세요", description: "관심사, 지역, 원하는 분위기를 선택해요" },
    { icon: MapsUgcOutlined, title: "모임을 추천받아요", description: "나와 잘 맞는 모임을 제안해드려요" },
    { icon: HomeWorkOutlined, title: "검증된 공간에서 만나요", description: "도시살롱이 선정한 로컬 공간에서 진행돼요" },
    { icon: Diversity1Outlined, title: "관계를 이어가요", description: "한 번의 만남이 새로운 커뮤니티로 이어져요" },
];

/** 맞춤 추천 폼 필드 정의 */
export const RECOMMEND_FIELDS: { icon: SvgIconComponent; label: string; name: keyof RecommendForm; options: SelectOption[] }[] = [
    {
        icon: PlaceOutlined,
        label: "활동 지역",
        name: "region",
        options: [
            { value: "seongsu", label: "성수" },
            { value: "yeonnam", label: "연남" },
            { value: "euljiro", label: "을지로" },
            { value: "mangwon", label: "망원" },
            { value: "hannam", label: "한남" },
        ],
    },
    {
        icon: EditOutlined,
        label: "관심 주제",
        name: "topic",
        options: [
            { value: "talk", label: "대화" },
            { value: "book", label: "북토크" },
            { value: "wine", label: "와인" },
            { value: "food", label: "음식" },
            { value: "culture", label: "문화·전시" },
        ],
    },
    {
        icon: PeopleAltOutlined,
        label: "편안한 모임 인원",
        name: "groupSize",
        options: [
            { value: "small", label: "4명 이하" },
            { value: "medium", label: "6~8명" },
            { value: "large", label: "10명 내외" },
        ],
    },
    {
        icon: WineBarOutlined,
        label: "원하는 분위기",
        name: "mood",
        options: [
            { value: "calm", label: "차분한 대화" },
            { value: "lively", label: "활기찬 분위기" },
            { value: "taste", label: "취향 탐구" },
            { value: "new", label: "새로운 경험" },
        ],
    },
];

/** 맞춤 추천 결과 미리보기(회원님께는 이런 모임이…) 카드 */
export const RECOMMEND_MATCHES: { icon: SvgIconComponent; photo: MockPhotoVariant; title: string; description: string }[] = [
    {
        icon: GroupsOutlined,
        photo: "reco-small",
        title: "소규모 대화형 모임",
        description: "6~8명의 소규모 인원으로 깊이 있는 대화를 나눌 수 있어요.",
    },
    {
        icon: MapOutlined,
        photo: "reco-local",
        title: "로컬 문화 체험형 모임",
        description: "동네의 매력을 함께 경험하며 자연스럽게 가까워져요.",
    },
];

/** 신뢰 기준(만남의 기준) 카드 */
export const TRUST_ITEMS: { icon: SvgIconComponent; title: string; description: string }[] = [
    { icon: VerifiedUserOutlined, title: "본인인증", description: "안심하고 참여할 수 있는 본인 인증" },
    { icon: HowToRegOutlined, title: "검증된 호스트", description: "신뢰할 수 있는 호스트가 모임을 운영해요" },
    { icon: ApartmentOutlined, title: "검증된 공간", description: "직접 방문하고 검토한 공간에서 진행돼요" },
    { icon: GroupsOutlined, title: "소규모 운영", description: "적절한 인원으로 편안한 분위기를 유지해요" },
    { icon: NotificationImportantOutlined, title: "신고 및 이용 제한", description: "위반 시 신고와 함께 이용이 제한돼요" },
    { icon: MenuBookOutlined, title: "커뮤니티 가이드", description: "모두가 존중하는 문화를 함께 만들어가요" },
];

/** 파트너 공간 카드 */
export const SPACE_ITEMS: { photo: MockPhotoVariant; name: string; region: string }[] = [
    { photo: "lounge", name: "성수 로컬 라운지", region: "성수동" },
    { photo: "cafe", name: "연남 살롱 카페", region: "연남동" },
    { photo: "bar", name: "을지로 다이닝 바", region: "을지로" },
];

/** 푸터 링크 묶음 */
export const FOOTER_LINK_GROUPS: { label: string; path: string }[][] = [
    [
        { label: "모임 찾기", path: "/dashboard/salons" },
        { label: "맞춤 추천", path: "/dashboard" },
        { label: "도시살롱 소개", path: "/dashboard/about" },
    ],
    [
        { label: "이용 가이드", path: "/dashboard/guide" },
        { label: "자주 묻는 질문", path: "/dashboard/faq" },
    ],
    [
        { label: "커뮤니티 가이드", path: "/dashboard/community-guide" },
        { label: "이용약관", path: "/dashboard/terms" },
        { label: "개인정보처리방침", path: "/dashboard/privacy" },
    ],
];
