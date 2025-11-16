// components/KamiCard.js
import Image from "next/image";
import { useState } from "react";

export default function KamiCard({ image, title, japanese, connectionStatus }) {
    const [imageError, setImageError] = useState(false);

    // Handle image path formatting and fallback
    const getImageSrc = () => {
        if (!image || imageError) return "/media/kami/_kami.png";

        // If it's already an absolute URL, return it as is
        if (image.startsWith('http')) return image;

        // Ensure the path has a leading slash
        return image.startsWith('/') ? image : `/${image}`;
    };

    return (
        <div className="mt-12 md:mt-0 w-full relative">
            {/* Kami Image */}
            <div className="relative py-44 overflow-hidden">
                <div className="absolute inset-0">
                    <Image
                        src={getImageSrc()}
                        alt={title || "Kami"}
                        fill
                        style={{ objectFit: "cover" }}
                        sizes="(max-width: 768px) 100vw, 50vw"
                        className="p-9"
                        onError={() => setImageError(true)}
                        priority={true}
                    />
                </div>

                {/* Kami Name & Generation */}
                <div className="absolute bottom-0 left-0">
                    <h3 className="text-gray-300 text-sm uppercase tracking-wider">
                        {title || "KAMI"}
                    </h3>
                    <p className="mb-0 text-gray-500 text-xs">SECURE-GEN</p>
                </div>

                {/* Vertical Japanese Text */}
                <div className="absolute top-4 right-4 flex flex-col items-end space-y-1">
                <span
                    className="text-gray-300 text-sm"
                    style={{ writingMode: "vertical-rl", textOrientation: "upright" }}
                >
                    {japanese || "かみ"}
                </span>
                    <span
                        className="text-gray-500 text-xs pt-2"
                        style={{ writingMode: "vertical-rl", textOrientation: "upright" }}
                    >
                    あんぜんせだい
                </span>
                </div>

                {/* Glowing Dot - now uses connectionStatus prop to determine color */}
                <div className="mt-3">
                    <span className={`w-1.5 h-1.5 rounded-full bottom-6 right-5 absolute animate-pulse ${connectionStatus?.isConnected ? 'bg-cyan' : 'bg-orange'}`}></span>
                    {connectionStatus && (
                        <span className="text-[10px] text-gray-400 absolute bottom-6 right-8 transform translate-y-[4px]">
                            {connectionStatus.statusText}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
