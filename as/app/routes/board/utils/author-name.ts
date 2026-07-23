const PREFIX_WORDS = [
    "고운",
    "맑은",
    "밝은",
    "어둔",
    "푸른",
    "붉은",
    "검은",
    "흰빛",
    "깊은",
    "높은",
    "작은",
    "젊은",
    "늦은",
    "이른",
    "빠른",
    "느린",
    "고른",
    "여문",
    "새찬",
    "여린",
    "고요",
    "단단",
    "반듯",
    "은근",
    "산뜻",
    "은빛",
    "달큰",
    "담백",
    "수줍",
    "정든",
    "찬란",
    "싱근",
    "잔잔",
    "총총",
    "도톰",
    "말랑",
    "폭신",
    "차분",
    "반짝",
    "순한",
    "영근",
    "바른",
    "한결",
    "보들",
    "포근",
];

const TAIL_NOUN_WORDS = [
    "당근",
    "연필",
    "고래",
    "토끼",
    "사과",
    "사슴",
    "기린",
    "참새",
    "수첩",
    "리본",
    "지도",
    "우산",
    "램프",
    "나비",
    "보석",
    "장미",
    "쿠키",
    "소금",
    "하프",
    "모자",
    "시계",
    "거북",
    "해달",
    "들판",
    "유리",
    "단추",
    "연못",
    "마차",
    "고양이",
    "강아지",
    "악어",
    "하마",
    "코알라",
    "참치",
    "문어",
    "해파리",
    "독수리",
    "다람쥐",
    "부엉이",
    "두더지",
    "병아리",
    "앵무새",
    "청설모",
    "판다",
    "치타",
    "돌고래",
    "올빼미",
    "너구리",
    "오징어",
    "도마뱀",
    "수달",
    "고슴도치",
    "선인장",
    "머그컵",
    "나침반",
    "비행기",
    "자전거",
    "도토리",
    "머리핀",
    "목도리",
    "꽃사슴",
    "해바라기",
];

function pickRandom(words: readonly string[]): string {
    return words[Math.floor(Math.random() * words.length)] ?? "무명";
}

export function createAnonymousBoardAuthorName(): string {
    return `${pickRandom(PREFIX_WORDS)}${pickRandom(TAIL_NOUN_WORDS)}`;
}

export function resolveBoardAuthorName(
    accountName: unknown,
    isAnonymous: boolean,
): string | null {
    if (isAnonymous) {
        return createAnonymousBoardAuthorName();
    }

    if (typeof accountName !== "string") {
        return null;
    }

    const normalizedName = accountName.trim();
    return normalizedName || null;
}
