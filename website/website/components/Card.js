// components/Card.js
import Image from 'next/image';

export default function Card({
                                 image,
                                 title,
                                 category,
                                 japanese,
                                 japaneseGen,
                                 active = false,
                                 href = "#",
                                 className,
                                 japaneseClass,
                                 japaneseGenClass,
                                 positionClass = "right-4",
                                 dotPositionClass = "right-2"// New prop with default value
                             }) {
    const linkClasses = className ? className : "card group block relative block p-5 rounded-xl border border-gray-500/25";
    const japaneseClasses = japaneseClass || "text-gray-300 text-sm";
    const japaneseGenClasses = japaneseGenClass || "text-gray-500 text-xs pt-2";

    return (
        <a href={href} className={linkClasses}>
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
                    <h3 className="text-gray-300 text-sm uppercase tracking-wider">
                        {title}
                    </h3>
                    <p className="mb-0 text-gray-500 text-xs">{category}</p>
                </div>
            </div>
            <div className={`absolute top-4 ${positionClass} flex flex-col items-end space-y-1`}>
                <span
                    className={japaneseClasses}
                    style={{ writingMode: "vertical-rl", textOrientation: "upright" }}
                >
                    {japanese}
                </span>
                <span
                    className={japaneseGenClasses}
                    style={{ writingMode: "vertical-rl", textOrientation: "upright" }}
                >
                    {japaneseGen}
                </span>
            </div>
            <span
                className={`w-1.5 h-1.5 rounded-full bottom-2 ${dotPositionClass} absolute animate-pulse ${
                    active ? "bg-cyan" : "bg-orange"
                }`}
            />
        </a>
    );
}