import React, { useEffect } from "react";

export default function ChatFooter({ input, setInput, handleSend, status, isThinking, textAreaRef }) {
    useEffect(() => {
        if (status === "authenticated" && textAreaRef?.current) {
            textAreaRef.current.focus();
        }
    }, [status, isThinking]);

    return (
        <div className="md:p-4 md:pr-0 relative w-full bg-black">
            <div className="relative">
                <textarea
                    ref={textAreaRef}
                    placeholder="Type your message..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    className="w-full bg-transparent border border-gray-500 border-opacity-25 text-gray-500 text-[16px] md:text-xs font-light p-4 pr-12 rounded-xl focus:outline-none resize-none overflow-hidden"
                    rows={1}
                    inputMode="text"
                />
                <button
                    onClick={handleSend}
                    className="absolute top-1/2 right-4 transform -translate-y-[60%] text-[#FF00FF]"
                    disabled={isThinking || !input.trim()}
                >
                    {isThinking ? (
                        <div className="flex space-x-1">
                            <span
                                className="block w-[1px] h-[12px] bg-current animate-wave"
                                style={{ animationDelay: '0s' }}
                            ></span>
                            <span
                                className="block w-[1px] h-[12px] bg-current animate-wave"
                                style={{ animationDelay: '0.1s' }}
                            ></span>
                            <span
                                className="block w-[1px] h-[12px] bg-current animate-wave"
                                style={{ animationDelay: '0.2s' }}
                            ></span>
                        </div>
                    ) : (
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-6 w-6"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1}
                                d="M5 12h14M12 5l7 7-7 7"
                            />
                        </svg>
                    )}
                </button>
            </div>
        </div>
    );
}
