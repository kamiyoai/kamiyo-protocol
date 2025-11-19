// components/brand/BrandCard.js
import Link from 'next/link';

export default function BrandCard({ title, description, image, href, isVideo = false }) {
    return (
        <Link
            href={href}
            className="group relative block border border-gray-500/25 rounded-lg overflow-hidden transition-all duration-300"
        >
            <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{
                background: 'linear-gradient(90deg, #4fe9ea, #ff44f5)',
                padding: '1px',
                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude'
            }} />
            <div className="aspect-video overflow-hidden relative">
                {isVideo ? (
                    <video
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    >
                        <source src={image} type="video/mp4" />
                    </video>
                ) : (
                    <div
                        className="w-full h-full bg-cover bg-center group-hover:scale-105 transition-transform duration-500"
                        style={{ backgroundImage: `url(${image})` }}
                    />
                )}
            </div>
            <div className="p-6">
                <h3 className="text-white text-lg mb-2 group-hover:text-magenta transition-colors duration-300">
                    {title}
                </h3>
                <p className="text-gray-400 text-sm">{description}</p>
            </div>
        </Link>
    );
}
