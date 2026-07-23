import { useOutletContext } from "react-router-dom";
import type { MainController } from "../controllers/mainController";
import ConcernsSection from "./components/ConcernsSection";
import HeroSection from "./components/HeroSection";
import HowItWorksSection from "./components/HowItWorksSection";
import RecommendSection from "./components/RecommendSection";
import SpacesSection from "./components/SpacesSection";
import TrustSection from "./components/TrustSection";
import WeeklySalonsSection from "./components/WeeklySalonsSection";

/** 메인(랜딩) 페이지 — 도시살롱 소개 섹션 구성 */
export default function MainPage() {
    const controller = useOutletContext<MainController>();

    return (
        <>
            <HeroSection controller={controller} />
            <ConcernsSection />
            <HowItWorksSection />
            <WeeklySalonsSection controller={controller} />
            <RecommendSection controller={controller} />
            <TrustSection />
            <SpacesSection controller={controller} />
        </>
    );
}
