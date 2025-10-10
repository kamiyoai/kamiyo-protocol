// components/progressBar.js
import React from "react";

const ProgressBar = () => {
    return (
        <div className="progressbar fixed inset-0 flex items-center justify-center z-[99]">
            <div className="relative w-[200px] h-[10px] overflow-hidden">
                <div className="absolute inset-0 flex space-x-2 animate-slide">
                    {[...Array(10)].map((_, i) => (
                        <div key={i} className="w-[2px] h-[8px] bg-cyan-400 opacity-75"></div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ProgressBar;
