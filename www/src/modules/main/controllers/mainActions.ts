import type { ActionContext } from "@ehfuse/forma";
import type { MainState } from "../models/types";

/** 모바일 메뉴 드로어 열림 상태를 변경한다. */
export const setMobileMenuOpen =
    () =>
    (context: ActionContext<MainState>, open: boolean): void => {
        context.setValue("mobileMenuOpen", open);
    };
