// components/FilterSection.js
import { useState } from "react";
import Image from 'next/image';
import { motion, AnimatePresence } from "framer-motion";
import { useScrambleText } from "../hooks/useScrambleText";

export default function FilterSection({ cardsData }) {
    const [activeTab, setActiveTab] = useState("All");
    const [statusFilter, setStatusFilter] = useState("all");

    const tabs = ["All", "GEN-1", "GEN-2"];
    const scrambledTabs = [
        useScrambleText("All kami"),
        useScrambleText("GEN-1"),
        useScrambleText("GEN-2")
    ];
    const scrambledLive = useScrambleText("Live");
    const scrambledForming = useScrambleText("Forming");

    const filteredCards = cardsData.filter(card => {
        const categoryMatch = activeTab === "All" || card.category === activeTab;
        const statusMatch = statusFilter === "all" ||
            (statusFilter === "active" ? card.active : !card.active);
        return categoryMatch && statusMatch;
    });

    const activeCount = cardsData.reduce((count, card) => count + (card.active ? 1 : 0), 0);
    const inactiveCount = cardsData.length - activeCount;

    // Card component as a render function
    const renderCard = ({
                            image,
                            title,
                            category,
                            japanese,
                            japaneseGen,
                            active = false,
                            href = "#"
                        }) => {
        const cardStyles = {
            base: "card block relative p-5 rounded-xl border border-gray-500/25 transition-all ease-in duration-300",
            active: "group hover:shadow-xl hover:before:opacity-100",
            inactive: "opacity-50 cursor-not-allowed pointer-events-none"
        };
        const linkClasses = `${cardStyles.base} ${active ? cardStyles.active : cardStyles.inactive}`;

        return (
            <a href={active ? href : "#"} className={linkClasses}>
                <div className="relative py-40 overflow-hidden">
                    <div className="absolute inset-0 transition-transform duration-1000 ease-in-out group-hover:scale-110">
                        <Image
                            src={image}
                            alt={title}
                            fill
                            style={{ objectFit: "cover" }}
                            sizes="(max-width: 768px) 100vw, 1248px"
                        />
                    </div>
                </div>
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-gray-300 text-sm uppercase tracking-wider">{title}</h3>
                        <p className="mb-0 text-gray-500 text-xs">{category}</p>
                    </div>
                </div>
                <div className="absolute top-4 right-4 flex flex-col items-end space-y-1">
                <span className="text-gray-300 text-sm" style={{ writingMode: "vertical-rl", textOrientation: "upright" }}>
                    {japanese}
                </span>
                    <span className="text-gray-500 text-xs pt-2" style={{ writingMode: "vertical-rl", textOrientation: "upright" }}>
                    {japaneseGen}
                </span>
                </div>
                <span className={`w-1.5 h-1.5 rounded-full bottom-6 right-5 absolute animate-pulse ${active ? "bg-cyan" : "bg-orange"}`}/>
            </a>
        );
    };

    return (
        <div>
            <div className="mx-auto pt-8 pb-0 flex justify-between items-center">
                <h3 className="pl-[3px] tracking-widest uppercase text-white text-xl font-light">Kamiyonanayo</h3>
                <h3 className="text-xl font-light uppercase tracking-wide">かみよななよ</h3>
            </div>
            <div className="mx-auto pt-0 pb-12">
                <div className="flex flex-col items-start space-y-4 sm:flex-row sm:justify-between sm:items-center py-6 px-1">
                    <div className="flex justify-start space-x-4">
                        {scrambledTabs.map(({ text, setIsHovering }, index) => (
                            <button
                                key={tabs[index]}
                                onClick={() => { setActiveTab(tabs[index]); setStatusFilter("all"); }}
                                onMouseEnter={() => setIsHovering(true)}
                                onMouseLeave={() => setIsHovering(false)}
                                className={`uppercase tracking-wide text-xs transition-colors duration-300 w-24 h-10 flex items-center ${index === 0 ? "justify-start" : "justify-center"} ${activeTab === tabs[index] ? "bg-transparent text-white" : "text-gray-500 hover:text-white"}`}
                            >
                                {text}
                            </button>
                        ))}
                    </div>
                    <div className="uppercase text-gray-500 text-xs flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-4">
                        <span
                            className="text-gray-500 hover:text-white text-xs flex tracking-wide items-center cursor-pointer"
                            onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")}
                            onMouseEnter={() => scrambledLive.setIsHovering(true)}
                            onMouseLeave={() => scrambledLive.setIsHovering(false)}
                        >
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan mr-2"></span>
                            {scrambledLive.text}: {activeCount}
                        </span>
                        <span
                            className="text-gray-500 hover:text-white text-xs tracking-wide flex items-center cursor-pointer"
                            onClick={() => setStatusFilter(statusFilter === "inactive" ? "all" : "inactive")}
                            onMouseEnter={() => scrambledForming.setIsHovering(true)}
                            onMouseLeave={() => scrambledForming.setIsHovering(false)}
                        >
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange mr-2"></span>
                            {scrambledForming.text}: {inactiveCount}
                        </span>
                    </div>
                </div>
                <AnimatePresence mode="wait">
                    <motion.div
                        key={`${activeTab}-${statusFilter}`}
                        initial={{ opacity: 0, scale: 0.9, x: 20 }}
                        animate={{ opacity: 1, scale: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.9, x: -20 }}
                        transition={{ duration: 0.125 }}
                        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6"
                    >
                        {filteredCards.map(card => (
                            <div key={card.id || `${card.title}-${card.category}`}> {/* Added key prop */}
                                {renderCard(card)}
                            </div>
                        ))}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
