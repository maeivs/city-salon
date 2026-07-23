/** 목업 사진 변형 이름 — MockPhoto 컴포넌트의 색감 프리셋 키 */
export type MockPhotoVariant =
    | "hero" // 히어로 — 카페에서 대화하는 모임
    | "dinner" // 저녁 대화 살롱
    | "booktalk" // 북토크
    | "wine" // 와인 모임
    | "reco-small" // 추천 — 소규모 대화형
    | "reco-local" // 추천 — 로컬 체험형
    | "lounge" // 공간 — 라운지
    | "cafe" // 공간 — 카페
    | "bar"; // 공간 — 다이닝 바

/** 이번 주 살롱 카드 아이템 */
export interface WeeklySalon {
    id: string; // 카드 식별자
    title: string; // 살롱 제목
    region: string; // 지역명
    capacity: string; // 모임 인원 표기
    date: string; // 진행 일자 표기
    photo: MockPhotoVariant; // 카드 사진(목업) 변형
}

/** 메인(랜딩) 화면 상태 */
export interface MainState {
    mobileMenuOpen: boolean; // 모바일 메뉴 드로어 열림 여부
    weeklySalons: WeeklySalon[]; // 이번 주 살롱 목록 (목업 — AS 연동 시 액션 조회로 교체)
}
