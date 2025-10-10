// components/Header.js
import { useMenu } from "../context/MenuContext";
import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

export default function Header({ children }) {
    const { isMenuOpen, setMenuOpen } = useMenu();
    const [isUserDropdownOpen, setUserDropdownOpen] = useState(false);
    const { data: session } = useSession();

    // Used to ensure the portal renders only on the client
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    const closeMenu = () => {
        setMenuOpen(false);
        setUserDropdownOpen(false);
    };

    const toggleUserDropdown = () => {
        setUserDropdownOpen((prev) => !prev);
    };

    return (
        <>
            {/* Sticky header container */}
                <header className={`w-full px-5 mx-auto text-white py-3 flex items-center justify-between transition-transform duration-300 ${isMenuOpen ? "-translate-x-72" : "translate-x-0"}`} style={{ maxWidth: '1400px' }}>
                    <div>
                        <Link href="/" className="flex items-center">
                            <Image
                                src="/media/kamiyo-ai_logomark.svg"
                                alt="Kamiyo.ai"
                                width={240}
                                height={64}
                                className="object-contain"
                            />
                        </Link>
                    </div>
                    <div className="flex items-center gap-8">
                        <Link
                            href="/dashboard"
                            className="hidden md:block text-sm text-gray-500 hover:text-gray-300 transition-colors duration-300 uppercase tracking-wider"
                        >
                            Dashboard
                        </Link>
                        {!session && (
                            <Link
                                href="/auth/signin"
                                className="hidden md:block text-sm text-gray-500 hover:text-gray-300 transition-colors duration-300 uppercase tracking-wider"
                            >
                                Sign in
                            </Link>
                        )}
                        <button
                            onClick={() => setMenuOpen(!isMenuOpen)}
                            className={`focus:outline-none transform transition-transform duration-300`}
                            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
                        >
                            <svg
                                className="overflow-visible w-6 h-6 text-white"
                                viewBox="0 0 24 24"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                {/* Top line */}
                                <line
                                    x1="1"
                                    y1="6"
                                    x2="23"
                                    y2="6"
                                    stroke="currentColor"
                                    strokeWidth="1"
                                    style={{
                                        transform: isMenuOpen
                                            ? "scale(0.9) rotate(45deg) translateY(6px)"
                                            : "none",
                                    }}
                                    className="transition-all duration-300 origin-center"
                                />
                                {/* Middle line */}
                                <line
                                    x1="1"
                                    y1="12"
                                    x2="23"
                                    y2="12"
                                    stroke="currentColor"
                                    strokeWidth="1"
                                    className={`transition-all duration-300 ${
                                        isMenuOpen ? "opacity-0" : "opacity-100"
                                    }`}
                                />
                                {/* Bottom line */}
                                <line
                                    x1="1"
                                    y1="18"
                                    x2="23"
                                    y2="18"
                                    stroke="currentColor"
                                    strokeWidth="1"
                                    style={{
                                        transform: isMenuOpen
                                            ? "scale(0.9) rotate(-45deg) translateY(-6px)"
                                            : "none",
                                    }}
                                    className="transition-all duration-300 origin-center"
                                />
                            </svg>
                        </button>
                    </div>
                </header>

            {/* Page Content that slides */}
            <div
                className={`transition-transform duration-300 ${
                    isMenuOpen ? "-translate-x-72" : "translate-x-0"
                }`}
            >
                <div className="content">{children}</div>
            </div>

            {/* Slide-out Menu Panel rendered via portal */}
            {mounted &&
                createPortal(
                    <div
                        className={`w-72 fixed top-0 right-0 h-screen flex flex-col bg-black border-l border-gray-500 border-opacity-25 transform transition-transform duration-300 z-50 ${
                            isMenuOpen ? "translate-x-0" : "translate-x-72"
                        }`}
                    >
                        <div className="py-4 flex flex-col h-full justify-between">
                            <div>
                                <Link
                                    href="/"
                                    className="flex items-center mb-8 justify-center"
                                    onClick={closeMenu}
                                >
                                    <Image
                                        src="/media/kamiyo-ai_logomark.svg"
                                        alt="Kamiyo.ai"
                                        width={240}
                                        height={64}
                                        className="object-contain"
                                    />
                                </Link>
                                <nav className="md:hidden flex flex-col items-center space-y-4 py-6 border-b border-gray-500 border-opacity-25">
                                    <Link
                                        href="/dashboard"
                                        onClick={closeMenu}
                                        className="transition-colors duration-300 text-sm text-gray-500 hover:text-gray-300 uppercase"
                                    >
                                        Dashboard
                                    </Link>
                                    {!session && (
                                        <Link
                                            href="/auth/signin"
                                            onClick={closeMenu}
                                            className="transition-colors duration-300 text-sm text-gray-500 hover:text-gray-300 uppercase"
                                        >
                                            Sign in
                                        </Link>
                                    )}
                                </nav>
                                <nav className="flex flex-col items-center space-y-4 py-6">
                                    <Link
                                        href="/about"
                                        onClick={closeMenu}
                                        className="transition-colors duration-300 text-sm text-gray-500 hover:text-gray-300 uppercase"
                                    >
                                        About
                                    </Link>
                                    <Link href="/pricing"
                                          rel="noopener noreferrer"
                                          onClick={closeMenu}
                                          className="transition-colors duration-300 text-sm text-gray-500 hover:text-gray-300 uppercase"
                                    >
                                        Pricing
                                    </Link>
                                    <Link href="/inquiries"
                                          rel="noopener noreferrer"
                                          onClick={closeMenu}
                                          className="transition-colors duration-300 text-sm text-gray-500 hover:text-gray-300 uppercase"
                                    >
                                        Inquiries
                                    </Link>
                                    <Link href="/privacy-policy"
                                          rel="noopener noreferrer"
                                          onClick={closeMenu}
                                          className="transition-colors duration-300 text-sm text-gray-500 hover:text-gray-300 text-xs pt-4"
                                    >
                                        Privacy Policy
                                    </Link>
                                </nav>

                                    <nav className="flex flex-col items-center space-y-4 pt-6 border-t border-gray-500 border-opacity-25">
                                        <a
                                            href="https://x.com/KamiyoAI"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={closeMenu}
                                            className="transition-colors duration-300 text-xs text-gray-500 hover:text-gray-300"
                                        >
                                            Twitter
                                        </a>
                                        <a
                                            href="https://discord.com/invite/6Qxps5XP   "
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={closeMenu}
                                            className="transition-colors duration-300 text-xs text-gray-500 hover:text-gray-300"
                                        >
                                            Discord
                                        </a>
                                    </nav>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
}
