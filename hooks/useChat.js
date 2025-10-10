// hooks/useChat.js
import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { signIn } from "next-auth/react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";

export default function useChat({ propMessages, propSetMessages, greeting = {} }) {
    const { status } = useSession();
    const [internalMessages, setInternalMessages] = useState([]);
    const messages = propMessages !== undefined ? propMessages : internalMessages;
    const setMessages = propSetMessages !== undefined ? propSetMessages : setInternalMessages;
    const [input, setInput] = useState("");
    const [isThinking, setIsThinking] = useState(false);
    const messagesEndRef = useRef(null);
    const textAreaRef = useRef(null);
    const socketRef = useRef(null);
    const router = useRouter();

    const handleSignIn = () => {
        router.push({
            pathname: "/auth/signin",
            query: { callbackUrl: router.asPath },
        });
    };

    const defaultGreeting = {
        jp: "こんにちは、チャットへようこそ。",
        en: "Welcome to the chat. How may I assist you?"
    };

    const finalGreeting = { ...defaultGreeting, ...greeting };

    useEffect(() => {

        console.warn("ChatBox.js: Temporal shift detected in PFN inference stack. Possible desync?");

        const adjustHeight = () => {
            if (textAreaRef.current) {
                textAreaRef.current.style.height = "auto";
                textAreaRef.current.style.height = textAreaRef.current.scrollHeight + "px";
            }
        };

        adjustHeight();
    }, [input]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (textAreaRef.current) {
            textAreaRef.current.focus();
        }
    }, []);

    useEffect(() => {
        // Establish WebSocket connection with automatic reconnection
        const connectWebSocket = () => {
            console.log("🔌 Connecting to WebSocket...");
            socketRef.current = io("/", { path: "/api/socket", reconnection: true, reconnectionAttempts: 5, reconnectionDelay: 2000 });

            socketRef.current.on("connect", () => {
                console.log("✅ WebSocket connected:", socketRef.current.id);
            });

            socketRef.current.on("disconnect", () => {
                console.warn("❌ WebSocket disconnected. Attempting to reconnect...");
            });

            socketRef.current.on("response", (chunk) => {
                console.log("📩 Received chunk:", chunk);
                setMessages((prev) => {
                    const lastMessage = prev.length ? prev[prev.length - 1] : { type: "eliza", text: "" };
                    const updatedMessage = { ...lastMessage, text: lastMessage.text + " " + chunk };

                    return [...prev.slice(0, -1), updatedMessage];
                });
            });

            socketRef.current.on("response_end", () => {
                console.log("✅ Streaming complete.");
                setIsThinking(false);
            });

            socketRef.current.on("error", (err) => {
                console.error("🚨 WebSocket error:", err);
                setMessages((prev) => [
                    ...prev,
                    { type: "eliza", text: "Error: Unable to connect to agent..." }
                ]);
                setIsThinking(false);
            });
        };

        connectWebSocket();

        return () => {
            if (socketRef.current) {
                console.log("🔌 Disconnecting WebSocket...");
                socketRef.current.disconnect();
            }
        };
    }, []);

    const handleSend = () => {
        if (status !== "authenticated") {
            signIn(undefined, { callbackUrl: router.asPath });
            return;
        }

        if (!input.trim()) return;

        const userMessage = input.trim();
        setMessages((prev) => [...prev, { type: "user", text: userMessage }]);
        setInput("");
        setIsThinking(true);

        // Placeholder message for streaming response
        setMessages((prev) => [...prev, { type: "eliza", text: "", isThinking: true }]);

        if (socketRef.current?.connected) {
            console.log("📤 Sending message:", userMessage);
            socketRef.current.emit("message", userMessage);
        } else {
            console.error("❌ WebSocket is not connected. Cannot send message.");
            setMessages((prev) => [
                ...prev,
                { type: "eliza", text: "Error: WebSocket is disconnected. Try refreshing the page." }
            ]);
            setIsThinking(false);
        }
    };

    return {
        status,
        messages,
        setMessages,
        input,
        setInput,
        isThinking,
        handleSend,
        handleSignIn,
        finalGreeting,
        messagesEndRef,
        textAreaRef,
    };
}
