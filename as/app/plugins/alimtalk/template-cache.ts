/**
 * 알림톡 템플릿 캐시
 *
 * configs/notification/alimtalk.json의 templates 배열에서 로드.
 * DB 엔티티를 사용하지 않으며, 설정 파일 수정으로 템플릿 관리.
 */

import { logger } from "@system/api";
import type { AlimtalkTemplateMapping, AlimtalkTemplate } from "./types/index.ts";

export class TemplateCache {
    private cache = new Map<string, AlimtalkTemplate>();

    /** 설정 파일에서 템플릿을 로드한다 */
    loadFromConfig(templates: AlimtalkTemplateMapping[]): void {
        if (!templates?.length) return;

        this.cache.clear();
        for (const tpl of templates) {
            if (!tpl.code) continue;
            this.cache.set(tpl.code, {
                templateCode: tpl.code,
                templateName: tpl.description,
                content: "",
                variables: tpl.variables ?? [],
            });
        }
        logger.info(
            `Alimtalk: loaded ${this.cache.size} template(s) from config`,
        );
    }

    /** 전체 템플릿 목록을 반환한다 */
    list(): AlimtalkTemplate[] {
        return [...this.cache.values()];
    }

    /** 캐시에서 템플릿을 조회한다 */
    get(code: string): AlimtalkTemplate | undefined {
        return this.cache.get(code);
    }
}
