import { useOutletContext } from "react-router-dom";
import type { MainController } from "../../controllers/mainController";
import V2ConcernsSection from "./components/V2ConcernsSection";
import V2HeroSection from "./components/V2HeroSection";
import V2HowItWorksSection from "./components/V2HowItWorksSection";
import V2RecommendSection from "./components/V2RecommendSection";
import V2SpacesSection from "./components/V2SpacesSection";
import V2TrustSection from "./components/V2TrustSection";
import V2WeeklySalonsSection from "./components/V2WeeklySalonsSection";

/** 2안 메인(랜딩) 페이지 — 다크 에디토리얼 무드 섹션 구성 */
export default function V2Page() {
    const controller = useOutletContext<MainController>();

    return (
        <>
            <V2HeroSection controller={controller} />
            <V2ConcernsSection />
            <V2HowItWorksSection />
            <V2WeeklySalonsSection controller={controller} />
            <V2RecommendSection controller={controller} />
            <V2TrustSection />
            <V2SpacesSection controller={controller} />
        </>
    );
}
