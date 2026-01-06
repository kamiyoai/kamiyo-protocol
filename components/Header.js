// components/Header.js
import { useMenu } from "../context/MenuContext";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function Header({ children }) {
    const { isMenuOpen, setMenuOpen } = useMenu();
    const [isHovered, setIsHovered] = useState(false);
    const menuRef = useRef(null);

    // Used to ensure the portal renders only on the client
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (isMenuOpen && menuRef.current && !menuRef.current.contains(event.target)) {
                // Check if the click is not on the hamburger button
                const isHamburgerButton = event.target.closest('button[aria-label*="menu"]');
                if (!isHamburgerButton) {
                    setMenuOpen(false);
                }
            }
        };

        if (isMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isMenuOpen, setMenuOpen]);

    const closeMenu = () => {
        setMenuOpen(false);
    };

    return (
        <>
            {/* Sticky header container */}
            <header className={`w-full text-white transition-transform duration-300 ${isMenuOpen ? "-translate-x-72" : "translate-x-0"}`}>
                <div className="w-full px-5 mx-auto py-3 flex items-center justify-between" style={{ maxWidth: '1400px' }}>
                    <Link href="/" className="flex items-center flex-shrink-0">
                        {/* Mobile logo */}
                        <img
                            src="/media/KAMIYO_logomark.png"
                            alt="Kamiyo.ai"
                            width="240"
                            height="64"
                            className="md:hidden object-contain h-10 sm:h-12 w-auto"
                        />
                        {/* Desktop logo */}
                        <img
                            src="/media/KAMIYO_logomark.png"
                            alt="Kamiyo.ai"
                            width="240"
                            height="64"
                            className="hidden md:block object-contain h-14 w-auto"
                        />
                    </Link>
                    <div className="flex items-center gap-6">
                        {/* Header navigation links */}
                        <nav className="hidden md:flex items-center gap-5">
                            <a
                                href="https://protocol.kamiyo.ai"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-gray-500 hover:text-gray-300 transition-colors duration-300 uppercase tracking-wider"
                            >
                                Protocol
                            </a>
                            <Link
                                href="/about"
                                className="text-sm text-gray-500 hover:text-gray-300 transition-colors duration-300 uppercase tracking-wider"
                            >
                                About
                            </Link>
                            <Link
                                href="/inquiries"
                                className="text-sm text-gray-500 hover:text-gray-300 transition-colors duration-300 uppercase tracking-wider"
                            >
                                Inquiries
                            </Link>
                        </nav>
                        <button
                            onClick={() => setMenuOpen(!isMenuOpen)}
                            onMouseEnter={() => setIsHovered(true)}
                            onMouseLeave={() => setIsHovered(false)}
                            className="focus:outline-none transform transition-transform duration-300 group"
                            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
                        >
                            <svg
                                className="w-6 h-6 text-gray-500 group-hover:text-white transition-colors duration-300"
                                viewBox="0 0 24 24"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                {/* Line 1 - becomes \ of X */}
                                <line
                                    x1={isMenuOpen ? "6" : (isHovered ? "4" : "10")}
                                    y1={isMenuOpen ? "6" : "6"}
                                    x2={isMenuOpen ? "18" : "20"}
                                    y2={isMenuOpen ? "18" : "6"}
                                    stroke="currentColor"
                                    strokeWidth="1"
                                    style={{ transition: 'all 0.3s ease' }}
                                />
                                {/* Line 2 */}
                                <line
                                    x1={isHovered ? "4" : "7"}
                                    y1="10"
                                    x2="20"
                                    y2="10"
                                    stroke="currentColor"
                                    strokeWidth="1"
                                    style={{
                                        transition: 'all 0.3s ease',
                                        opacity: isMenuOpen ? 0 : 1
                                    }}
                                />
                                {/* Line 3 */}
                                <line
                                    x1="4"
                                    y1="14"
                                    x2="20"
                                    y2="14"
                                    stroke="currentColor"
                                    strokeWidth="1"
                                    style={{
                                        transition: 'all 0.3s ease',
                                        opacity: isMenuOpen ? 0 : 1
                                    }}
                                />
                                {/* Line 4 - becomes / of X */}
                                <line
                                    x1={isMenuOpen ? "6" : (isHovered ? "4" : "7")}
                                    y1={isMenuOpen ? "18" : "18"}
                                    x2={isMenuOpen ? "18" : "20"}
                                    y2={isMenuOpen ? "6" : "18"}
                                    stroke="currentColor"
                                    strokeWidth="1"
                                    style={{ transition: 'all 0.3s ease' }}
                                />
                            </svg>
                        </button>
                    </div>
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
                        ref={menuRef}
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
                                    <img
                                        src="/media/KAMIYO_logomark.png"
                                        alt="Kamiyo.ai"
                                        width="240"
                                        height="64"
                                        className="object-contain w-48 h-auto"
                                    />
                                </Link>
                                <nav className="md:hidden flex flex-col items-center space-y-4 py-6 border-b border-gray-500 border-opacity-25">
                                    <a
                                        href="https://protocol.kamiyo.ai"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={closeMenu}
                                        className="transition-colors duration-300 text-sm text-gray-500 hover:text-gray-300 uppercase"
                                    >
                                        Protocol
                                    </a>
                                    <Link
                                        href="/about"
                                        onClick={closeMenu}
                                        className="transition-colors duration-300 text-sm text-gray-500 hover:text-gray-300 uppercase"
                                    >
                                        About
                                    </Link>
                                    <Link
                                        href="/inquiries"
                                        onClick={closeMenu}
                                        className="transition-colors duration-300 text-sm text-gray-500 hover:text-gray-300 uppercase"
                                    >
                                        Inquiries
                                    </Link>
                                </nav>
                                    <nav className="flex flex-col items-center space-y-4 py-6">
                                        <Link
                                            href="/docs"
                                            onClick={closeMenu}
                                            className="transition-colors duration-300 text-xs text-gray-500 hover:text-gray-300"
                                        >
                                            Docs
                                        </Link>
                                        <Link
                                            href="/privacy-policy"
                                            rel="noopener noreferrer"
                                            onClick={closeMenu}
                                            className="transition-colors duration-300 text-xs text-gray-500 hover:text-gray-300"
                                        >
                                            Privacy Policy
                                        </Link>
                                        <Link
                                            href="/terms-of-service"
                                            rel="noopener noreferrer"
                                            onClick={closeMenu}
                                            className="transition-colors duration-300 text-xs text-gray-500 hover:text-gray-300"
                                        >
                                            Terms of Service
                                        </Link>
                                        <Link
                                            href="/brand"
                                            onClick={closeMenu}
                                            className="transition-colors duration-300 text-xs text-gray-500 hover:text-gray-300"
                                        >
                                            Brand Guidelines
                                        </Link>
                                    </nav>

                                    <nav className="flex flex-col items-center space-y-4 pt-6 border-t border-gray-500 border-opacity-25">
                                        <a
                                            href="https://x.com/KAMIYO"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={closeMenu}
                                            className="transition-colors duration-300 text-xs text-gray-500 hover:text-gray-300"
                                        >
                                            X
                                        </a>
                                        <a
                                            href="https://discord.com/invite/6Qxps5XP"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={closeMenu}
                                            className="transition-colors duration-300 text-xs text-gray-500 hover:text-gray-300"
                                        >
                                            Discord
                                        </a>
                                        <a
                                            href="https://github.com/kamiyo-ai/kamiyo-protocol"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={closeMenu}
                                            className="transition-colors duration-300 text-xs text-gray-500 hover:text-gray-300"
                                        >
                                            GitHub
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
