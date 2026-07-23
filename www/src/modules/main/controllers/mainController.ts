import { useNavigate } from "react-router-dom";
import { useGlobalForm, useGlobalFormaState } from "@ehfuse/forma";
import { InfoAlert } from "@ehfuse/alerts";
import { defaultMainStateValues, defaultRecommendFormValues } from "../models/defaults";
import type { MainState, RecommendForm } from "../models/types";
import * as Actions from "./mainActions";

/** 맞춤 추천 섹션 스크롤 이동에 쓰는 DOM id */
export const RECOMMEND_SECTION_ID = "main-recommend-section";

/** 메인(랜딩) 화면의 상태·폼·흐름을 소유한다. */
export function useMainController() {
    const navigate = useNavigate();

    const state = useGlobalFormaState<MainState>({
        stateId: "mainState",
        initialValues: defaultMainStateValues,
        actions: {
            setMobileMenuOpen: Actions.setMobileMenuOpen(),
        },
    });

    const form = useGlobalForm<RecommendForm>({
        formId: "recommendForm",
        initialValues: defaultRecommendFormValues,
        onValidate: (values) => {
            if (!values.region && !values.topic && !values.groupSize && !values.mood) {
                InfoAlert({ message: "관심 있는 항목을 하나 이상 선택해주세요." });
                return false;
            }
            return true;
        },
        onSubmit: async () => {
            // 목업 단계 — 추천 백엔드(AS) 연동 전까지 준비 안내만 띄운다.
            InfoAlert({ message: "맞춤 추천 기능을 준비 중이에요. 곧 만나요!" });
        },
    });

    /** 메뉴/버튼에서 경로로 이동한다(모바일 메뉴는 닫는다). */
    const goTo = (path: string): void => {
        state.actions.setMobileMenuOpen(false);
        navigate(path);
    };

    /** 맞춤 추천 섹션으로 부드럽게 스크롤한다(메인 밖이면 메인으로 이동 후 안내). */
    const goRecommend = (): void => {
        state.actions.setMobileMenuOpen(false);
        const section = document.getElementById(RECOMMEND_SECTION_ID);
        if (section) {
            section.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
        navigate("/dashboard");
    };

    return { state, form, goTo, goRecommend };
}

/** 컨트롤러 반환 타입 — Outlet context/props 로 전달할 때 사용한다. */
export type MainController = ReturnType<typeof useMainController>;
