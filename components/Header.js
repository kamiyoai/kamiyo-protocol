// components/Header.js
import { useMenu } from "../context/MenuContext";
import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { hasMinimumTier, TierName } from "../lib/tiers";

export default function Header({ children }) {
    const { isMenuOpen, setMenuOpen } = useMenu();
    const [isUserDropdownOpen, setUserDropdownOpen] = useState(false);
    const { data: session } = useSession();
    const [userTier, setUserTier] = useState(null);
    const menuRef = useRef(null);

    // Used to ensure the portal renders only on the client
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    // Fetch user's subscription tier
    useEffect(() => {
        if (session?.user?.email) {
            fetch(`/api/subscription/status?email=${session.user.email}`)
                .then(res => res.json())
                .then(data => {
                    setUserTier(data.tier);
                })
                .catch(err => console.error('Error fetching subscription:', err));
        }
    }, [session]);

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
        setUserDropdownOpen(false);
    };

    const toggleUserDropdown = () => {
        setUserDropdownOpen((prev) => !prev);
    };

    // Check if user has access to Fork Analysis (team or enterprise tier)
    const hasForkAnalysisAccess = userTier && hasMinimumTier(userTier, TierName.TEAM);

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
                            {session && (
                                <Link
                                    href="/dashboard"
                                    className="text-sm text-gray-500 hover:text-gray-300 transition-colors duration-300 uppercase tracking-wider"
                                >
                                    Dashboard
                                </Link>
                            )}
                        </nav>
                        <button
                            onClick={() => setMenuOpen(!isMenuOpen)}
                            className={`focus:outline-none transform transition-transform duration-300 group`}
                            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
                        >
                            <svg
                                className="overflow-visible w-6 h-6 text-gray-500 group-hover:text-white transition-colors duration-300"
                                viewBox="0 0 24 24"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                {/* Line 1 */}
                                <line
                                    x1={isMenuOpen ? "4" : "10"}
                                    y1="6"
                                    x2="20"
                                    y2="6"
                                    stroke="currentColor"
                                    strokeWidth="1"
                                    style={{
                                        transform: isMenuOpen ? "rotate(45deg)" : "none",
                                        transformOrigin: "center",
                                    }}
                                    className="transition-all duration-300"
                                />
                                {/* Line 2 */}
                                <line
                                    x1={isMenuOpen ? "4" : "7"}
                                    y1="10"
                                    x2="20"
                                    y2="10"
                                    stroke="currentColor"
                                    strokeWidth="1"
                                    className={`transition-all duration-300 ${isMenuOpen ? "opacity-0" : "opacity-100"}`}
                                />
                                {/* Line 3 */}
                                <line
                                    x1={isMenuOpen ? "4" : "4"}
                                    y1="14"
                                    x2="20"
                                    y2="14"
                                    stroke="currentColor"
                                    strokeWidth="1"
                                    className={`transition-all duration-300 ${isMenuOpen ? "opacity-0" : "opacity-100"}`}
                                />
                                {/* Line 4 */}
                                <line
                                    x1={isMenuOpen ? "4" : "7"}
                                    y1="18"
                                    x2="20"
                                    y2="18"
                                    stroke="currentColor"
                                    strokeWidth="1"
                                    style={{
                                        transform: isMenuOpen ? "rotate(-45deg)" : "none",
                                        transformOrigin: "center",
                                    }}
                                    className="transition-all duration-300"
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
                                {session && (
                                    <nav className="md:hidden flex flex-col items-center space-y-4 py-6 border-b border-gray-500 border-opacity-25">
                                        <Link
                                            href="/dashboard"
                                            onClick={closeMenu}
                                            className="transition-colors duration-300 text-sm text-gray-500 hover:text-gray-300 uppercase"
                                        >
                                            Dashboard
                                        </Link>
                                    </nav>
                                )}
                                    <nav className="flex flex-col items-center space-y-4 py-6">
                                        <a
                                            href="https://protocol.kamiyo.ai"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={closeMenu}
                                            className="transition-colors duration-300 text-xs text-gray-500 hover:text-gray-300"
                                        >
                                            Protocol
                                        </a>
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
                                    </nav>
                            </div>
                            {!session && (
                                <div className="py-6 border-t border-gray-500 border-opacity-25">
                                    <Link
                                        href="/auth/signin"
                                        onClick={closeMenu}
                                        className="flex items-center justify-center gap-2 transition-colors duration-300 text-sm text-gray-500 hover:text-gray-300"
                                    >
                                        <svg fill="currentColor" className="w-5 h-5" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M228,128A100,100,0,1,0,60.71,201.90967a3.97048,3.97048,0,0,0,.842.751,99.79378,99.79378,0,0,0,132.8982-.00195,3.96558,3.96558,0,0,0,.83813-.74756A99.76267,99.76267,0,0,0,228,128ZM36,128a92,92,0,1,1,157.17139,64.87207,75.616,75.616,0,0,0-44.50782-34.04053,44,44,0,1,0-41.32714,0,75.61784,75.61784,0,0,0-44.50782,34.04A91.70755,91.70755,0,0,1,36,128Zm92,28a36,36,0,1,1,36-36A36.04061,36.04061,0,0,1,128,156ZM68.86475,198.417a68.01092,68.01092,0,0,1,118.27.00049,91.80393,91.80393,0,0,1-118.27-.00049Z"/>
                                        </svg>
                                        Sign in
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
}
