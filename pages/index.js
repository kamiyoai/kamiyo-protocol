// pages/index.js
import { useEffect, useRef, useState } from "react";
import PayButton from "../components/PayButton";
import FAQ from "../components/FAQ";
import SEO from "../components/SEO";
import { LinkButton } from "../components/Button";

export default function Home() {
    const [logoLoaded, setLogoLoaded] = useState(false);
    const [sectionsVisible, setSectionsVisible] = useState({
        howItWorks: false,
        features: false,
        scale: false,
        sdk: false,
        buildingFor: false,
        faq: false
    });

    const howItWorksRef = useRef(null);
    const featuresRef = useRef(null);
    const scaleRef = useRef(null);
    const sdkRef = useRef(null);
    const buildingForRef = useRef(null);
    const faqRef = useRef(null);

    // Logo animation on page load
    useEffect(() => {
        setLogoLoaded(true);
    }, []);

    // Scroll animations for sections
    useEffect(() => {
        const observerCallback = (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.dataset.section;
                    setSectionsVisible(prev => ({ ...prev, [id]: true }));
                }
            });
        };

        const observer = new IntersectionObserver(observerCallback, { threshold: 0.15 });

        const refs = [
            { ref: howItWorksRef, id: 'howItWorks' },
            { ref: featuresRef, id: 'features' },
            { ref: scaleRef, id: 'scale' },
            { ref: sdkRef, id: 'sdk' },
            { ref: buildingForRef, id: 'buildingFor' },
            { ref: faqRef, id: 'faq' }
        ];

        refs.forEach(({ ref, id }) => {
            if (ref.current) {
                ref.current.dataset.section = id;
                observer.observe(ref.current);
            }
        });

        return () => observer.disconnect();
    }, []);

    return (
        <>
            <SEO />
            <div className="text-white bg-black min-h-screen">
                {/* Hero Section */}
                <section className="w-full min-h-[calc(100vh-80px)] flex items-center border-b border-gray-500/25 bg-black">
                <div className="w-full px-5 mx-auto max-w-[1400px] -mt-16">
                    {/* SEO-friendly H1 (visually hidden) */}
                    <h1 className="sr-only leading-[1.25]">KAMIYO: Trust Infrastructure for Autonomous Agents | Escrow & Dispute Resolution</h1>

                    {/* Two-column layout */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                        {/* Left column: Content */}
                        <article className="space-y-8">
                            {/* Heading */}
                            <header>
                                <p className="font-light text-sm tracking-widest gradient-text mb-4 md:mb-8">— &nbsp;自律エージェント信頼基盤</p>
                                <h2 className="text-[2.2rem] md:text-[3.1rem] font-light mb-4 leading-tight text-white">
                                    Trust layer for the agentic economy
                                </h2>
                                <p className="text-gray-400 text-sm md:text-lg leading-relaxed">
                                    In an era where AI agents handle trillions in autonomous transactions, KAMIYO provides the decentralized framework to ensure fair outcomes and reliable enforcement in machine-to-machine interactions.
                                </p>
                            </header>

                            {/* Feature Badges */}
                            <div className="flex flex-wrap gap-3">
                                <span className="text-xs text-gray-400 border border-gray-500/50 px-3 py-2 rounded-full">
                                    On-chain escrow
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500/50 px-3 py-2 rounded-full">
                                    Multi-oracle disputes
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500/50 px-3 py-2 rounded-full">
                                    Quality-based refunds
                                </span>
                                <span className="text-xs text-gray-400 border border-gray-500/50 px-3 py-2 rounded-full">
                                    x402 compatible
                                </span>
                            </div>

                            {/* CTA Buttons */}
                            <div className="flex flex-col md:flex-row gap-6 items-center pt-8">
                                <div className="scale-110 md:origin-left md:ml-8">
                                    <PayButton
                                        textOverride="Get Started"
                                        onClickOverride={() => window.open('https://protocol.kamiyo.ai', '_self')}
                                    />
                                </div>
                                <div className="pt-[0.15rem] md:pl-16">
                                    <LinkButton
                                        href="https://protocol.kamiyo.ai"
                                        title="View Protocol"
                                        aria-label="View Protocol"
                                    >
                                        View protocol →
                                    </LinkButton>
                                </div>
                            </div>

                        </article>

                        {/* Right column: Video (hidden on mobile) */}
                        <div
                            className="hidden md:flex justify-center md:justify-end"
                            style={{ perspective: '1000px' }}
                        >
                            <video
                                style={{
                                    transform: logoLoaded ? 'scale(1) rotateX(0deg) rotateY(0deg)' : 'scale(0.3) rotateX(45deg) rotateY(180deg)',
                                    opacity: logoLoaded ? 1 : 0,
                                    transition: 'all 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
                                }}
                                autoPlay
                                loop
                                muted
                                playsInline
                                preload="metadata"
                                className="w-auto h-96 saturate-[2.0] contrast-[1.2]"
                                aria-label="KAMIYO trust infrastructure demonstration"
                                title="KAMIYO escrow and dispute resolution"
                            >
                                <source src="/media/kamiyo_logomark.mp4" type="video/mp4" />
                                Your browser does not support the video tag.
                            </video>
                        </div>
                    </div>
                </div>
            </section>

            {/* How It Works Section */}
            <section ref={howItWorksRef} className={`w-full px-5 mx-auto pt-8 md:pt-16 pb-16 border-t border-gray-500/25 max-w-[1400px] transition-all duration-700 ${sectionsVisible.howItWorks ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`} aria-labelledby="how-it-works-heading">
                <header className="text-center mb-16">
                    <h2 id="how-it-works-heading" className="text-3xl md:text-4xl font-light mb-4">The KAMIYO Protocol</h2>
                    <p className="text-gray-400 text-sm md:text-lg">Trustless settlement for autonomous transactions</p>
                </header>

                {/* Timeline with connecting line */}
                <div className="relative mb-16">
                    {/* Connecting line - hidden on mobile */}
                    <div className="hidden md:block absolute top-8 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" style={{ left: '12.5%', right: '12.5%' }}></div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-6">
                        {/* Step 1 - Create Agreement: dots forming protective enclosure */}
                        <div className={`relative flex flex-col items-center text-center transition-all duration-500 ${sectionsVisible.howItWorks ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-6'}`} style={{ transitionDelay: '100ms' }}>
                            <div className="w-16 h-16 rounded-full bg-black flex items-center justify-center mb-4 relative z-10">
{/* Two diagonal blocks */}
                                <svg className="w-8 h-8" viewBox="0 0 20 20">
                                    <defs>
                                        <linearGradient id="iconGradient1" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stopColor="#00f0ff" />
                                            <stop offset="100%" stopColor="#ff44f5" />
                                        </linearGradient>
                                    </defs>
                                    {/* Top-left block: 4x3 */}
                                    <rect x="2.4" y="3.4" width="1.2" height="1.2" fill="url(#iconGradient1)" /><rect x="4.4" y="3.4" width="1.2" height="1.2" fill="url(#iconGradient1)" /><rect x="6.4" y="3.4" width="1.2" height="1.2" fill="url(#iconGradient1)" /><rect x="8.4" y="3.4" width="1.2" height="1.2" fill="url(#iconGradient1)" />
                                    <rect x="2.4" y="5.4" width="1.2" height="1.2" fill="url(#iconGradient1)" /><rect x="4.4" y="5.4" width="1.2" height="1.2" fill="url(#iconGradient1)" /><rect x="6.4" y="5.4" width="1.2" height="1.2" fill="url(#iconGradient1)" /><rect x="8.4" y="5.4" width="1.2" height="1.2" fill="url(#iconGradient1)" />
                                    <rect x="2.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient1)" /><rect x="4.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient1)" /><rect x="6.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient1)" /><rect x="8.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient1)" />
                                    {/* Bottom-right block: 4x3 - corners touching */}
                                    <rect x="9.6" y="8.6" width="1.2" height="1.2" fill="url(#iconGradient1)" /><rect x="11.6" y="8.6" width="1.2" height="1.2" fill="url(#iconGradient1)" /><rect x="13.6" y="8.6" width="1.2" height="1.2" fill="url(#iconGradient1)" /><rect x="15.6" y="8.6" width="1.2" height="1.2" fill="url(#iconGradient1)" />
                                    <rect x="9.6" y="10.6" width="1.2" height="1.2" fill="url(#iconGradient1)" /><rect x="11.6" y="10.6" width="1.2" height="1.2" fill="url(#iconGradient1)" /><rect x="13.6" y="10.6" width="1.2" height="1.2" fill="url(#iconGradient1)" /><rect x="15.6" y="10.6" width="1.2" height="1.2" fill="url(#iconGradient1)" />
                                    <rect x="9.6" y="12.6" width="1.2" height="1.2" fill="url(#iconGradient1)" /><rect x="11.6" y="12.6" width="1.2" height="1.2" fill="url(#iconGradient1)" /><rect x="13.6" y="12.6" width="1.2" height="1.2" fill="url(#iconGradient1)" /><rect x="15.6" y="12.6" width="1.2" height="1.2" fill="url(#iconGradient1)" />
                                </svg>
                            </div>
                            <div className="text-white text-lg font-extralight mb-2">Create Agreement</div>
                            <div className="text-gray-500 text-sm">
                                Funds locked in escrow PDA with configurable time-lock
                            </div>
                        </div>

                        {/* Step 2 - Service Delivered: dots flowing diagonally */}
                        <div className={`relative flex flex-col items-center text-center transition-all duration-500 ${sectionsVisible.howItWorks ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`} style={{ transitionDelay: '150ms' }}>
                            <div className="w-16 h-16 rounded-full bg-black flex items-center justify-center mb-4 relative z-10">
{/* Diamond - 4 squares as 2x2 dots */}
                                <svg className="w-8 h-8" viewBox="-1 -1 20 20">
                                    <defs>
                                        <linearGradient id="iconGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stopColor="#00f0ff" />
                                            <stop offset="100%" stopColor="#ff44f5" />
                                        </linearGradient>
                                    </defs>
                                    {/* Top center */}
                                    <rect x="7.4" y="3.4" width="1.2" height="1.2" fill="url(#iconGradient2)" /><rect x="9.4" y="3.4" width="1.2" height="1.2" fill="url(#iconGradient2)" />
                                    <rect x="7.4" y="5.4" width="1.2" height="1.2" fill="url(#iconGradient2)" /><rect x="9.4" y="5.4" width="1.2" height="1.2" fill="url(#iconGradient2)" />
                                    {/* Middle left */}
                                    <rect x="3.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient2)" /><rect x="5.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient2)" />
                                    <rect x="3.4" y="9.4" width="1.2" height="1.2" fill="url(#iconGradient2)" /><rect x="5.4" y="9.4" width="1.2" height="1.2" fill="url(#iconGradient2)" />
                                    {/* Middle right */}
                                    <rect x="11.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient2)" /><rect x="13.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient2)" />
                                    <rect x="11.4" y="9.4" width="1.2" height="1.2" fill="url(#iconGradient2)" /><rect x="13.4" y="9.4" width="1.2" height="1.2" fill="url(#iconGradient2)" />
                                    {/* Bottom center */}
                                    <rect x="7.4" y="11.4" width="1.2" height="1.2" fill="url(#iconGradient2)" /><rect x="9.4" y="11.4" width="1.2" height="1.2" fill="url(#iconGradient2)" />
                                    <rect x="7.4" y="13.4" width="1.2" height="1.2" fill="url(#iconGradient2)" /><rect x="9.4" y="13.4" width="1.2" height="1.2" fill="url(#iconGradient2)" />
                                </svg>
                            </div>
                            <div className="text-white text-lg font-extralight mb-2">Service Delivered</div>
                            <div className="text-gray-500 text-sm">
                                Provider delivers, agent evaluates quality
                            </div>
                        </div>

                        {/* Step 3 - Oracle Consensus: dots converging to center */}
                        <div className={`relative flex flex-col items-center text-center transition-all duration-500 ${sectionsVisible.howItWorks ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-6'}`} style={{ transitionDelay: '200ms' }}>
                            <div className="w-16 h-16 rounded-full bg-black flex items-center justify-center mb-4 relative z-10">
{/* X pattern - 7 squares */}
                                <svg className="w-8 h-8" viewBox="-1 -1 20 20">
                                    <defs>
                                        <linearGradient id="iconGradient3" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stopColor="#00f0ff" />
                                            <stop offset="100%" stopColor="#ff44f5" />
                                        </linearGradient>
                                    </defs>
                                    {/* Row 0: col 1, col 3 */}
                                    <rect x="5.4" y="3.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="7.4" y="3.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="5.4" y="5.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="7.4" y="5.4" width="1.2" height="1.2" fill="url(#iconGradient3)" />
                                    <rect x="11.4" y="3.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="13.4" y="3.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="11.4" y="5.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="13.4" y="5.4" width="1.2" height="1.2" fill="url(#iconGradient3)" />
                                    {/* Row 1: col 0, col 2, col 4 */}
                                    <rect x="2.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="4.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="2.4" y="9.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="4.4" y="9.4" width="1.2" height="1.2" fill="url(#iconGradient3)" />
                                    <rect x="8.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="10.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="8.4" y="9.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="10.4" y="9.4" width="1.2" height="1.2" fill="url(#iconGradient3)" />
                                    <rect x="14.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="16.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="14.4" y="9.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="16.4" y="9.4" width="1.2" height="1.2" fill="url(#iconGradient3)" />
                                    {/* Row 2: col 1, col 3 */}
                                    <rect x="5.4" y="11.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="7.4" y="11.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="5.4" y="13.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="7.4" y="13.4" width="1.2" height="1.2" fill="url(#iconGradient3)" />
                                    <rect x="11.4" y="11.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="13.4" y="11.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="11.4" y="13.4" width="1.2" height="1.2" fill="url(#iconGradient3)" /><rect x="13.4" y="13.4" width="1.2" height="1.2" fill="url(#iconGradient3)" />
                                </svg>
                            </div>
                            <div className="text-white text-lg font-extralight mb-2">Oracle Consensus</div>
                            <div className="text-gray-500 text-sm">
                                Multi-oracle panel scores quality (0-100)
                            </div>
                        </div>

                        {/* Step 4 - Auto Settlement: balanced resolution pattern */}
                        <div className={`relative flex flex-col items-center text-center transition-all duration-500 ${sectionsVisible.howItWorks ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-6'}`} style={{ transitionDelay: '250ms' }}>
                            <div className="w-16 h-16 rounded-full bg-black flex items-center justify-center mb-4 relative z-10">
{/* Two mirrored arrows - 11 squares */}
                                <svg className="w-8 h-8" viewBox="0 0 21 18">
                                    <defs>
                                        <linearGradient id="iconGradient4" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stopColor="#00f0ff" />
                                            <stop offset="100%" stopColor="#ff44f5" />
                                        </linearGradient>
                                    </defs>
                                    {/* Row 0: left pair, right pair */}
                                    <rect x="3.4" y="3.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="5.4" y="3.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="3.4" y="5.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="5.4" y="5.4" width="1.2" height="1.2" fill="url(#iconGradient4)" />
                                    <rect x="7.4" y="3.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="9.4" y="3.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="7.4" y="5.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="9.4" y="5.4" width="1.2" height="1.2" fill="url(#iconGradient4)" />
                                    <rect x="11.4" y="3.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="13.4" y="3.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="11.4" y="5.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="13.4" y="5.4" width="1.2" height="1.2" fill="url(#iconGradient4)" />
                                    <rect x="15.4" y="3.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="17.4" y="3.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="15.4" y="5.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="17.4" y="5.4" width="1.2" height="1.2" fill="url(#iconGradient4)" />
                                    {/* Row 1: left, center, right */}
                                    <rect x="1.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="3.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="1.4" y="9.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="3.4" y="9.4" width="1.2" height="1.2" fill="url(#iconGradient4)" />
                                    <rect x="9.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="11.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="9.4" y="9.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="11.4" y="9.4" width="1.2" height="1.2" fill="url(#iconGradient4)" />
                                    <rect x="17.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="19.4" y="7.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="17.4" y="9.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="19.4" y="9.4" width="1.2" height="1.2" fill="url(#iconGradient4)" />
                                    {/* Row 2: left pair, right pair */}
                                    <rect x="3.4" y="11.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="5.4" y="11.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="3.4" y="13.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="5.4" y="13.4" width="1.2" height="1.2" fill="url(#iconGradient4)" />
                                    <rect x="7.4" y="11.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="9.4" y="11.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="7.4" y="13.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="9.4" y="13.4" width="1.2" height="1.2" fill="url(#iconGradient4)" />
                                    <rect x="11.4" y="11.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="13.4" y="11.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="11.4" y="13.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="13.4" y="13.4" width="1.2" height="1.2" fill="url(#iconGradient4)" />
                                    <rect x="15.4" y="11.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="17.4" y="11.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="15.4" y="13.4" width="1.2" height="1.2" fill="url(#iconGradient4)" /><rect x="17.4" y="13.4" width="1.2" height="1.2" fill="url(#iconGradient4)" />
                                </svg>
                            </div>
                            <div className="text-white text-lg font-extralight mb-2">Auto Settlement</div>
                            <div className="text-gray-500 text-sm">
                                Funds distributed, reputations updated on-chain
                            </div>
                        </div>
                    </div>
                </div>

                {/* Core Features - more compact */}
                <div ref={featuresRef} className={`grid grid-cols-1 md:grid-cols-3 gap-6 transition-all duration-700 ${sectionsVisible.features ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                    <div className="border border-gray-500/25 rounded-lg p-5">
                        <div className="gradient-text text-xs uppercase tracking-wider mb-2">Identity</div>
                        <div className="text-white text-lg font-extralight mb-2">Stake-Backed Agents</div>
                        <div className="text-gray-500 text-sm">
                            PDA-based identities with SOL collateral. On-chain reputation scoring.
                        </div>
                    </div>

                    <div className="border border-gray-500/25 rounded-lg p-5">
                        <div className="gradient-text text-xs uppercase tracking-wider mb-2">Resolution</div>
                        <div className="text-white text-lg font-extralight mb-2">Quality-Based Arbitration</div>
                        <div className="text-gray-500 text-sm">
                            Sliding refund scale based on oracle-determined quality scores.
                        </div>
                    </div>

                    <div className="border border-gray-500/25 rounded-lg p-5">
                        <div className="gradient-text text-xs uppercase tracking-wider mb-2">Consensus</div>
                        <div className="text-white text-lg font-extralight mb-2">Multi-Oracle Verification</div>
                        <div className="text-gray-500 text-sm">
                            Decentralized dispute resolution. Median-based, anti-collusion.
                        </div>
                    </div>
                </div>

                {/* Quality-Based Refund Scale */}
                <div className="mt-12" ref={scaleRef}>
                    <h3 className="text-xl font-light text-white mb-6">Quality-based refund scale</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div
                            className={`bg-black border border-gray-500/25 rounded-lg p-5 text-center transition-all duration-500 ${sectionsVisible.scale ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                            style={{ transitionDelay: '0ms' }}
                        >
                            <div className="gradient-text text-xs uppercase tracking-wider mb-2">80-100%</div>
                            <div className="text-white text-2xl font-light mb-1">100%</div>
                            <div className="text-gray-500 text-xs">to provider</div>
                        </div>
                        <div
                            className={`bg-black border border-gray-500/25 rounded-lg p-5 text-center transition-all duration-500 ${sectionsVisible.scale ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}
                            style={{ transitionDelay: '75ms' }}
                        >
                            <div className="gradient-text text-xs uppercase tracking-wider mb-2">65-79%</div>
                            <div className="text-white text-2xl font-light mb-1">35%</div>
                            <div className="text-gray-500 text-xs">refund</div>
                        </div>
                        <div
                            className={`bg-black border border-gray-500/25 rounded-lg p-5 text-center transition-all duration-500 ${sectionsVisible.scale ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                            style={{ transitionDelay: '150ms' }}
                        >
                            <div className="gradient-text text-xs uppercase tracking-wider mb-2">50-64%</div>
                            <div className="text-white text-2xl font-light mb-1">75%</div>
                            <div className="text-gray-500 text-xs">refund</div>
                        </div>
                        <div
                            className={`bg-black border border-gray-500/25 rounded-lg p-5 text-center transition-all duration-500 ${sectionsVisible.scale ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}
                            style={{ transitionDelay: '225ms' }}
                        >
                            <div className="gradient-text text-xs uppercase tracking-wider mb-2">0-49%</div>
                            <div className="text-white text-2xl font-light mb-1">100%</div>
                            <div className="text-gray-500 text-xs">refund</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* SDK Integration Section */}
            <section ref={sdkRef} className={`w-full px-5 mx-auto pt-16 pb-16 max-w-[1400px] transition-all duration-700 ${sectionsVisible.sdk ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}>
                <h2 className="text-3xl md:text-4xl font-light text-center mb-4">
                    SDK integration
                </h2>
                <p className="text-gray-400 text-center mb-12">Three lines to protect your first transaction</p>

                {/* Single unified code block */}
                <div className="max-w-3xl mx-auto mb-12">
                    <div className="rounded-lg overflow-hidden border border-gray-500/25">
                        {/* Code block header */}
                        <div className="bg-gray-900/50 px-4 py-2 flex items-center justify-between border-b border-gray-500/25">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 font-mono">typescript</span>
                            </div>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(`import { KAMIYOClient } from '@kamiyo/sdk'

const client = new KAMIYOClient({ connection, wallet })

// 1. Create agent identity with stake
await client.createAgent({
  name: 'MyAgent',
  stakeAmount: 500_000_000
})

// 2. Lock funds in escrow
const agreement = await client.createAgreement({
  provider: providerPubkey,
  amount: 100_000_000,
  timeLockSeconds: 86400
})

// 3. Release on success, or dispute
await client.releaseFunds(agreement.id)
// or: await client.markDisputed(agreement.id)`);
                                }}
                                className="text-xs text-gray-500 hover:text-white transition-colors flex items-center gap-1"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                Copy
                            </button>
                        </div>
                        {/* Code content */}
                        <div className="bg-black p-6 font-mono text-sm overflow-x-auto">
                            <div className="text-white"><span className="text-cyan">import</span> {'{'} KAMIYOClient {'}'} <span className="text-cyan">from</span> <span className="text-gray-400">'@kamiyo/sdk'</span></div>
                            <div className="text-white mb-4"></div>
                            <div className="text-white"><span className="text-cyan">const</span> client = <span className="text-cyan">new</span> KAMIYOClient({'{'} connection, wallet {'}'})</div>
                            <div className="text-white mb-4"></div>
                            <div className="text-gray-500">// 1. Create agent identity with stake</div>
                            <div className="text-white"><span className="text-cyan">await</span> client.createAgent({'{'}</div>
                            <div className="ml-4 text-white">name: <span className="text-gray-400">'MyAgent'</span>,</div>
                            <div className="ml-4 text-white">stakeAmount: <span className="text-magenta">500_000_000</span></div>
                            <div className="text-white">{'}'})</div>
                            <div className="text-white mb-4"></div>
                            <div className="text-gray-500">// 2. Lock funds in escrow</div>
                            <div className="text-white"><span className="text-cyan">const</span> agreement = <span className="text-cyan">await</span> client.createAgreement({'{'}</div>
                            <div className="ml-4 text-white">provider: <span className="text-gray-400">providerPubkey</span>,</div>
                            <div className="ml-4 text-white">amount: <span className="text-magenta">100_000_000</span>,</div>
                            <div className="ml-4 text-white">timeLockSeconds: <span className="text-magenta">86400</span></div>
                            <div className="text-white">{'}'})</div>
                            <div className="text-white mb-4"></div>
                            <div className="text-gray-500">// 3. Release on success, or dispute</div>
                            <div className="text-white"><span className="text-cyan">await</span> client.releaseFunds(agreement.id)</div>
                            <div className="text-gray-500">// or: await client.markDisputed(agreement.id)</div>
                        </div>
                    </div>
                </div>

                {/* SDK Packages */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="p-4 border border-gray-500/20 rounded-lg text-center hover:border-cyan/50 transition-colors">
                        <div className="font-mono text-cyan text-xs mb-1">@kamiyo/sdk</div>
                        <div className="text-gray-500 text-xs">Core client</div>
                    </div>
                    <div className="p-4 border border-gray-500/20 rounded-lg text-center hover:border-cyan/50 transition-colors">
                        <div className="font-mono text-cyan text-xs mb-1">@kamiyo/agent-client</div>
                        <div className="text-gray-500 text-xs">Auto-dispute</div>
                    </div>
                    <div className="p-4 border border-gray-500/20 rounded-lg text-center hover:border-cyan/50 transition-colors">
                        <div className="font-mono text-cyan text-xs mb-1">@kamiyo/middleware</div>
                        <div className="text-gray-500 text-xs">HTTP 402</div>
                    </div>
                    <div className="p-4 border border-gray-500/20 rounded-lg text-center hover:border-cyan/50 transition-colors">
                        <div className="font-mono text-cyan text-xs mb-1">@kamiyo/mcp</div>
                        <div className="text-gray-500 text-xs">Claude/LLMs</div>
                    </div>
                    <div className="p-4 border border-gray-500/20 rounded-lg text-center hover:border-cyan/50 transition-colors">
                        <div className="font-mono text-cyan text-xs mb-1">@kamiyo/langchain</div>
                        <div className="text-gray-500 text-xs">LangChain</div>
                    </div>
                    <div className="p-4 border border-gray-500/20 rounded-lg text-center hover:border-cyan/50 transition-colors">
                        <div className="font-mono text-cyan text-xs mb-1">@kamiyo/x402-client</div>
                        <div className="text-gray-500 text-xs">x402 escrow</div>
                    </div>
                </div>
            </section>

            {/* Building For Section */}
            <section ref={buildingForRef} className={`w-full border-t border-gray-500/25 py-16 transition-all duration-700 ${sectionsVisible.buildingFor ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.98]'}`}>
                <div className="w-full px-5 mx-auto max-w-[1400px]">
                    <h2 className="text-3xl md:text-4xl font-light text-center mb-12">
                        Building for
                    </h2>
                    <div className="flex flex-wrap items-center justify-center gap-12 md:gap-16 lg:gap-20">
                        <div className="grayscale hover:grayscale-0 transition-all duration-300 opacity-60 hover:opacity-100 flex items-center">
                            <img
                                src="/media/monad.png"
                                alt="Monad"
                                className="h-6 w-auto"
                            />
                        </div>
                        <div className="grayscale hover:grayscale-0 transition-all duration-300 opacity-60 hover:opacity-100 flex items-center">
                            <img
                                src="/media/payai.svg"
                                alt="PayAI"
                                className="h-32 w-auto"
                            />
                        </div>
                        <div className="grayscale hover:grayscale-0 transition-all duration-300 opacity-60 hover:opacity-100 flex items-center">
                            <img
                                src="/media/hyperliquid.svg"
                                alt="Hyperliquid"
                                className="h-8 w-auto"
                            />
                        </div>
                        <div className="grayscale hover:grayscale-0 transition-all duration-300 opacity-60 hover:opacity-100 flex items-center">
                            <img
                                src="/media/daydreams.png"
                                alt="Daydreams"
                                className="h-12 w-auto"
                            />
                        </div>
                        <div className="grayscale hover:grayscale-0 transition-all duration-300 opacity-60 hover:opacity-100 flex items-center">
                            <img
                                src="/media/solana.svg"
                                alt="Solana"
                                style={{ height: '1.65rem' }}
                                className="w-auto"
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section ref={faqRef} className={`w-full border-t border-gray-500/25 py-16 transition-all duration-500 ${sectionsVisible.faq ? 'opacity-100' : 'opacity-0'}`}>
                <div className="w-full px-5 mx-auto max-w-[1200px]">
                    <FAQ />
                </div>
            </section>
        </div>
        </>
    );
}
