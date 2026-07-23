import type { MainState, RecommendForm } from "./types";

/** 메인(랜딩) 상태 초기값 — 살롱 목록은 목업 데이터(AS 연동 시 액션 조회로 교체) */
export const defaultMainStateValues: MainState = {
    mobileMenuOpen: false,
    weeklySalons: [
        {
            id: "salon-1",
            title: "퇴근 후 저녁 대화 살롱",
            region: "성수",
            capacity: "6~8명",
            date: "7월 31일",
            photo: "dinner",
        },
        {
            id: "salon-2",
            title: "취향으로 만나는 북토크",
            region: "성수",
            capacity: "6~8명",
            date: "7월 31일",
            photo: "booktalk",
        },
        {
            id: "salon-3",
            title: "동네 와인 & 대화 모임",
            region: "성수",
            capacity: "6~8명",
            date: "7월 31일",
            photo: "wine",
        },
    ],
};

/** 맞춤 추천 폼 초기값 */
export const defaultRecommendFormValues: RecommendForm = {
    region: "",
    topic: "",
    groupSize: "",
    mood: "",
};
