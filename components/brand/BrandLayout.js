// components/brand/BrandLayout.js
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function BrandLayout({ children }) {
    const router = useRouter();
    const currentPath = router.pathname;

    const sections = [
        { name: "Logo & Identity", href: "/brand/logo" },
        { name: "Color", href: "/brand/color" },
        { name: "Typography", href: "/brand/typography" },
    ];

    return (
        <div className="flex gap-12 max-w-[1400px] mx-auto pl-5 py-16">
            {/* Sidebar Navigation */}
            <aside className="hidden md:block w-56 flex-shrink-0">
                <div className="sticky top-24">
                    <nav className="flex flex-col space-y-2 py-6">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-4 px-4">
                            Brand Guidelines
                        </div>
                        {sections.map((section) => (
                            <Link
                                key={section.href}
                                href={section.href}
                                className={`px-4 py-2 text-sm transition-colors duration-300 block ${
                                    currentPath === section.href
                                        ? "text-magenta border-l-2 border-magenta"
                                        : "text-gray-400 hover:text-gray-300"
                                }`}
                            >
                                {section.name}
                            </Link>
                        ))}
                        <div className="border-t border-gray-500/25 mt-8 pt-4">
                            <a
                                href="/kamiyo-brand.zip"
                                download
                                className="px-4 py-2 text-sm text-cyan hover:text-cyan/80 flex items-center gap-2 transition-colors duration-300"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Download Assets
                            </a>
                        </div>
                    </nav>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 max-w-4xl">
                {children}
            </main>
        </div>
    );
}
