// components/Layout.js
import Header from "./Header";
import Footer from "./Footer";
import { useMenu } from "../context/MenuContext";

export default function Layout({ children }) {
    const { isMenuOpen } = useMenu();

    return (
        <div className="min-h-screen flex flex-col relative">
            {/* Move fixed styling here and pass className */}
            <div className="fixed top-0 left-0 w-full z-50 bg-black border-b border-gray-500 border-opacity-25">
                <Header />
            </div>
            {/* Ensure content scrolls properly */}
            <main className={`flex-1 overflow-y-auto pt-[80px] transition-transform duration-300 ${isMenuOpen ? "-translate-x-72" : "translate-x-0"} relative`}>
                {children}
            </main>
            <Footer />
        </div>
    );
}
