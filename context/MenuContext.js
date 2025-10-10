import { createContext, useContext, useState, useEffect } from "react";

const MenuContext = createContext();

export function MenuProvider({ children }) {
    const [isMenuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        // When the menu is open, disable scrolling entirely.
        document.body.style.overflow = isMenuOpen ? "hidden" : "";

        // Cleanup: reset overflow when the component unmounts.
        return () => {
            document.body.style.overflow = "";
        };
    }, [isMenuOpen]);

    return (
        <MenuContext.Provider value={{ isMenuOpen, setMenuOpen }}>
            {children}
        </MenuContext.Provider>
    );
}

export function useMenu() {
    return useContext(MenuContext);
}
