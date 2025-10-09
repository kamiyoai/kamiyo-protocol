// pages/summon.js
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import Head from "next/head";
import KamiCard from "../components/KamiCard";
import ChatBox from "../components/ChatBox";
import { useScrambleText } from "../hooks/useScrambleText";
import { getSubscriptionStatus, getSummonLimit } from "../lib/subscription";
import LoadingSpinner from "../components/LoadingSpinner";
import { io } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import { XMarkIcon } from '@heroicons/react/24/outline';
import AnimatedDots from '../components/AnimatedDots';

function ScrambleButton({ onClick, text = "Summon a Kami", disabled = false }) {
    const { text: scrambledText, setIsHovering } = useScrambleText(text);
    return (
        <button
            className={`group transition-all duration-300 relative px-6 py-3 bg-transparent text-white text-xs uppercase overflow-visible pointer-events-auto ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onMouseEnter={() => !disabled && setIsHovering(true)}
            onMouseLeave={() => !disabled && setIsHovering(false)}
            onClick={!disabled ? onClick : undefined}
            disabled={disabled}
        >
            <span className="relative z-10 ml-8 tracking-wider transition-all duration-300 ease-out">{scrambledText}</span>
            <span className="absolute inset-0 border border-dotted cta-gradient skew-x-[-45deg] translate-x-4 transition-all duration-300" />
            <span className="absolute inset-0 border-r border-dotted cta-gradient-border-right skew-x-[-45deg] translate-x-4 transition-all duration-300" />
            <span className="absolute bottom-0 left-[-4px] w-full border-b border-dotted cta-gradient-border-bottom transition-all duration-300" />
        </button>
    );
}

export default function SummonPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [subscription, setSubscription] = useState(null);
    const [currentKami, setCurrentKami] = useState({ image: "/media/kami/_kami.png", title: "Kami", japanese: "かみ" });
    const [kamiCount, setKamiCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [showLoading, setShowLoading] = useState(false);
    const [workerId, setWorkerId] = useState(null);
    const [attestation, setAttestation] = useState(null);
    const [displayedLogs, setDisplayedLogs] = useState('Click "Show logs"');
    const [isFetching, setIsFetching] = useState(false);
    const [isTerminalVisible, setIsTerminalVisible] = useState(false);
    const [socket, setSocket] = useState(null);
    const [socketConnected, setSocketConnected] = useState(false);
    const [kamiConnectionStatus, setKamiConnectionStatus] = useState({
        isConnected: false,
        statusText: 'Waiting to connect'
    });

    useEffect(() => {
        if (status === "unauthenticated") router.push("/auth/signin");
    }, [status, router]);

    useEffect(() => {
        if (status !== "authenticated" || !session?.user?.email) return;
        const fetchSubscriptionData = async () => {
            setIsLoading(true);
            try {
                console.log("Fetching subscription for:", session.user.email);
                const subStatus = await getSubscriptionStatus(session.user.email);
                setSubscription(subStatus || { isSubscribed: false, kamiCount: 0 });
                if (subStatus?.isSubscribed) {
                    const kamiRes = await fetch("/api/kami/latest", { cache: "no-store" });
                    if (kamiRes.ok) {
                        const kamiData = await kamiRes.json();
                        setCurrentKami(kamiData);
                        setKamiCount(subStatus.kamiCount ?? 0);
                    } else {
                        setKamiCount(0);
                    }
                    const { workerId, attestation } = router.query;
                    if (workerId && attestation) {
                        setWorkerId(workerId);
                        setAttestation(decodeURIComponent(attestation));
                        setCurrentKami({
                            image: "/media/kami/_kami.png",
                            title: "Ephemeral Kami",
                            japanese: "仮のかみ",
                        });
                        setKamiCount((prev) => prev + 1);

                        // If we have a workerId from URL, update status to connecting
                        setKamiConnectionStatus({
                            isConnected: false,
                            statusText: 'Connecting to Kami...'
                        });
                    }
                } else {
                    setKamiCount(0);
                }
            } catch (error) {
                console.error("Error fetching subscription:", error);
                setSubscription({ isSubscribed: false, kamiCount: 0 });
                setKamiCount(0);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSubscriptionData();
    }, [status, session, router]);

    useEffect(() => {
        // Update socket configuration to use the correct path
        const newSocket = io({
            path: '/api/socket', // Changed from '/socket.io/' to '/api/socket'
            transports: ['websocket', 'polling'], // Added polling as fallback
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 3000,
            timeout: 10000,
        });

        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('WebSocket connected:', newSocket.id);
            setSocketConnected(true);
            setDisplayedLogs("Connected to server.");

            // Send a test message to verify connection is working
            newSocket.emit('test', 'Hello from client');

            // If we already have a workerId, check if this Kami is available
            if (workerId) {
                newSocket.emit('checkKamiStatus', workerId);
            }
        });

        newSocket.on('test-response', (response) => {
            console.log('Test response received:', response);
            setDisplayedLogs(prev => prev + "\nTest connection successful: " + response);
        });

        newSocket.on('disconnect', (reason) => {
            console.warn('WebSocket disconnected. Reason:', reason);
            setSocketConnected(false);
            setDisplayedLogs("WebSocket disconnected. Trying to reconnect...");

            // Reset Kami connection status on socket disconnect
            setKamiConnectionStatus({
                isConnected: false,
                statusText: 'Waiting to connect'
            });
        });

        newSocket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error.message);
            setSocketConnected(false);
            setDisplayedLogs(prev => prev + "\nConnection error: " + error.message);

            // Reset Kami connection status on connection error
            setKamiConnectionStatus({
                isConnected: false,
                statusText: 'Waiting to connect'
            });
        });

        newSocket.on("kamiSummoned", ({ workerId, attestation }) => {
            if (!workerId) {
                console.error("Summon failed: workerId is undefined.");
                return;
            }
            console.log(`Kami summoned successfully. Worker ID: ${workerId}`);
            setWorkerId(workerId);
            setAttestation(attestation);
            setShowLoading(false);

            // Update status to "Connecting to Kami..."
            setKamiConnectionStatus({
                isConnected: false,
                statusText: 'Connecting to Kami...'
            });
        });

        // Add handler for Kami connection status
        newSocket.on('kamiConnected', () => {
            console.log('Kami connection established');
            setKamiConnectionStatus({
                isConnected: true,
                statusText: 'Connected'
            });
        });

        // Add handler for Kami disconnection
        newSocket.on('kamiDisconnected', () => {
            console.log('Kami disconnected');
            setKamiConnectionStatus({
                isConnected: false,
                statusText: 'Kami disconnected'
            });
        });

        // Set up logs handler
        newSocket.on('logs', (data) => {
            console.log('Log update received:', data ? (typeof data === 'string' ? data.substring(0, 50) + '...' : 'Data object received') : 'No data');
            const logs = data?.data || data || 'No logs received from server';
            setIsFetching(false);
            setDisplayedLogs(prevLogs => prevLogs + "\n" + logs);
        });

        // Add ping/pong for connection heartbeat
        newSocket.on('ping', () => {
            newSocket.emit('pong');
        });

        return () => {
            newSocket.disconnect();
        };
    }, [workerId]);

    const fetchLogs = () => {
        if (!socket) {
            console.warn("Socket not initialized.");
            setDisplayedLogs("Socket connection not established.");
            setIsTerminalVisible(true);
            return;
        }

        if (!socketConnected) {
            console.warn("Socket not connected. Attempting to reconnect...");
            socket.connect();
            setDisplayedLogs("Attempting to reconnect to server...");
            setIsTerminalVisible(true);
            return;
        }

        if (!workerId) {
            console.warn("No workerId available.");
            setDisplayedLogs("No Kami has been summoned yet.");
            setIsTerminalVisible(true);
            return;
        }

        console.log("Fetching logs for worker:", workerId);
        setIsFetching(true);
        setIsTerminalVisible(true);
        setDisplayedLogs("Fetching logs...");
        socket.emit("getLogs", workerId);
    };

    const handleSummonKami = async () => {
        if (!session?.user) return router.push("/auth/signin");
        if (!subscription) return;

        // Ensure socket is connected
        if (!socket || !socketConnected) {
            console.warn("WebSocket not connected. Reconnecting...");
            if (socket) socket.connect();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Check subscription
        if (!subscription.isSubscribed) {
            console.log("User not subscribed, redirecting to pricing");
            window.location.href = `/pricing?userId=${session.user.id}`;
            return;
        }

        // Check summon limits
        if (subscription.isSubscribed && kamiCount >= getSummonLimit(subscription.tier)) {
            console.log("Summon limit reached, redirecting to pricing");
            window.location.href = `/pricing?userId=${session.user.id}`;
            return;
        }

        // Start loading state
        setShowLoading(true);

        // Update connection status to show we're summoning
        setKamiConnectionStatus({
            isConnected: false,
            statusText: 'Summoning Kami...'
        });

        try {
            // Single source of truth: API-based summoning
            // USE THE CORRECT USER ID FROM SESSION
            const correctUserId = session.user.id; // This should match what's in your database
            console.log("Summoning Kami via API for:", correctUserId);

            const response = await fetch("/api/tee/summon", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: correctUserId }),
            });

            // Handle response
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "TEE deployment failed");
            }

            const data = await response.json();
            console.log("Kami deployed in TEE:", data);

            // Update UI state with returned data
            setWorkerId(data.workerId);
            setAttestation(data.attestation);
            setCurrentKami({
                image: data.image || "/media/kami/_kami.png",
                title: data.title || "Kami",
                japanese: data.japanese || "かみ",
            });
            setKamiCount(prev => prev + 1);

        } catch (error) {
            console.error("Error deploying Kami in TEE:", error.message);
            setDisplayedLogs("Error deploying Kami: " + error.message);
            setIsTerminalVisible(true);

            // Reset connection status on error
            setKamiConnectionStatus({
                isConnected: false,
                statusText: 'Waiting to connect'
            });
        } finally {
            setShowLoading(false);
        }
    };

    const closeModal = () => {
        setIsTerminalVisible(false);
        setDisplayedLogs('Click "Show logs"');
    };

    const logLines = displayedLogs.split('\n');
    const coloredLogLines = logLines.map((line, index) => {
        const colors = ['text-cyan', 'text-chalk', 'text-magenta'];
        const color = colors[index % colors.length];
        return line ? <p key={index} className={`mb-1 ${color}`}>{line}</p> : null;
    });

    console.log("Rendering: isSubscribed =", subscription?.isSubscribed, "KamiCount =", kamiCount);

    return (
        <div className="bg-black text-white flex">
            <Head>
                <title>Summon</title>
            </Head>
            <div className="px-5 md:px-1 mx-auto w-full flex flex-col md:flex-row md:w-5/6 min-h-[calc(100vh-140px)] overflow-hidden">
                <div className="w-full md:w-5/12 md:p-8 flex flex-col justify-center items-center relative border-r border-gray-500/25">
                    <KamiCard
                        image={currentKami ? currentKami.image : '/media/kami/_kami.png'}
                        title={currentKami ? currentKami.title : 'Kami'}
                        japanese={currentKami ? currentKami.japanese : 'かみ'}
                        gen="Secure-GEN"
                        connectionStatus={kamiConnectionStatus}
                    />
                    {attestation && (
                        <div className="mt-4 text-xs text-gray-400">
                            <p>TEE Attestation: {attestation.slice(0, 20)}...</p>
                            {workerId && (
                                <button
                                    onClick={fetchLogs}
                                    disabled={isFetching}
                                    className={`text-gray-500 hover:!text-white ml-2 ${isFetching ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {isFetching ? 'Fetching...' : 'Show logs'}
                                </button>
                            )}
                        </div>
                    )}

                </div>
                <div className="w-full md:w-7/12 relative md:pl-8 flex flex-col h-full overflow-hidden py-6 justify-center">
                    {showLoading && <LoadingSpinner />}
                    {isLoading ? (
                        <div className="absolute inset-0 flex items-center flex-col justify-center text-gray-400 text-xs font-light">
                            <p className="text-xs text-gray-500">
                                サブスクリプションのステータスを確認中
                                <AnimatedDots />
                            </p>
                            <p className="text-xs text-gray-500">
                                Checking subscription status
                                <AnimatedDots />
                            </p>
                        </div>
                    ) : !subscription?.isSubscribed ? (
                        <div className="flex flex-col justify-center items-center h-full">
                            <div className="p-4 text-center">
                                <p className="text-xs text-chalk">じんじゃへようこそ。TEEであんぜんなかみとつながるためにしょうかんしてください。</p>
                                <p className="text-sm text-chalk mb-0">Welcome to the Jinja. Summon to connect with a secure Kami in TEE.</p>
                            </div>
                            <div className="center-button">
                                <ScrambleButton onClick={handleSummonKami} />
                            </div>
                        </div>
                    ) : subscription?.isSubscribed && kamiCount === 0 ? (
                        <div className="flex flex-col justify-center items-center h-full">
                            <div className="p-4 text-center">
                                <p className="text-xs text-chalk">じんじゃへようこそ。TEEであんぜんなかみとつながるためにしょうかんしてください。</p>
                                <p className="text-sm text-chalk mb-0">Welcome to the Jinja. Summon to connect with a secure Kami in TEE.</p>
                            </div>
                            <div className="center-button mt-3">
                                <ScrambleButton onClick={handleSummonKami} />
                            </div>
                        </div>
                    ) : (
                        <ChatBox
                            apiRoute="/api/agent/summon"
                            greeting={{
                                jp: currentKami?.title === "Kami"
                                    ? "ようこそじんじゃへ。"
                                    : `めぐみとひかりがさずけられますように。わたしは${currentKami?.japanese}です。みちをしめし、しつもんにこたえましょう。`,
                                en: currentKami?.title === "Kami"
                                    ? "Welcome to the Jinja."
                                    : `May grace and light be bestowed. I am ${currentKami?.title}. I shall guide the way and answer your questions.`,
                            }}
                        />
                    )}
                </div>
            </div>
            {isTerminalVisible && (
                <AnimatePresence>
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", stiffness: 120, damping: 15 }}
                        className="fixed inset-y-0 right-[8vw] bg-transparent flex items-center z-50"
                        onClick={closeModal}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                            className="bg-black border border-gray-500/25 rounded-xl w-[40vw] max-w-md h-[75vh] md:mt-[80px] shadow-xl flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center w-full border-b border-gray-500/25 p-4">
                                <h3 className="text-lg mb-0">Kami TEE Logs</h3>
                                <button onClick={closeModal} className="text-gray-500 hover:text-white">
                                    <XMarkIcon className="h-6 w-6" />
                                </button>
                            </div>
                            <div className="text-sm p-4 overflow-y-auto flex-1">
                                {coloredLogLines}
                            </div>
                        </motion.div>
                    </motion.div>
                </AnimatePresence>
            )}
        </div>
    );
}