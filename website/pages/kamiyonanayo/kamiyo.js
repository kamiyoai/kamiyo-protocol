// pages/kamiyonanayo/kamiyo.js
// @refresh reset
import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Card from '../../components/Card';
import kamiyonanyoData from '../../data/kamiyonanyoData';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { Square2StackIcon, XMarkIcon, CheckCircleIcon, CheckIcon } from '@heroicons/react/24/outline';
import { Progress } from 'flowbite-react';
import { io } from 'socket.io-client';
import { useTokenData } from '../../components/TokenData';
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow, parseISO } from 'date-fns';

const CopyButton = ({ text }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    };

    return (
        <CopyToClipboard text={text} onCopy={handleCopy}>
            <button className="ml-2 text-gray-500 hover:text-white flex items-center">
                {copied ? (
                    <>
                        <CheckIcon className="h-3 w-3 text-cyan ml-2" />
                        <span className="ml-1 text-xs text-cyan font-light">Copied!</span>
                    </>
                ) : (
                    <Square2StackIcon className="h-4 w-4" />
                )}
            </button>
        </CopyToClipboard>
    );
};

export default function KamiyoPage() {

    const mintAddress = 'Loading...';
    const tokenData = useTokenData(mintAddress);

    const teeData = {
        creationDate: '2025-02-13',
        verified: true,
        running: true,
        logs: 'Awaiting TEE initialization...',
    };

    const [displayedLogs, setDisplayedLogs] = useState([]);
    const [isFetching, setIsFetching] = useState(false);
    const [isTerminalVisible, setIsTerminalVisible] = useState(false);
    const [socket, setSocket] = useState(null);

    const handleLogUpdate = useCallback((data) => {
        if (!data || typeof data !== 'string' || data.trim().length === 0) {
            console.warn('Received empty or invalid log data:', data);
            return;
        }

        console.log('Log update received:', data);

        setIsFetching(false);

        const newLogs = data.split('\n')
            .map(line => line.trim()) // Ensure lines are trimmed
            .filter(line => line.length > 0); // Ignore empty lines

        setDisplayedLogs((prev) => [...prev, ...newLogs]); // Append logs properly
    }, []);

    useEffect(() => {
        const newSocket = io('http://localhost:3000', {
            path: '/socket.io',
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
            autoConnect: true,
        });

        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('Socket connected:', newSocket.id);
            setDisplayedLogs([ <p key="fetching" className="text-xs text-gray-500">
                Fetching logs
                <span className="loading-dots">
                <span>.</span>
                <span>.</span>
                <span>.</span>
            </span>
            </p>]);
            newSocket.emit('getLogs', 'kamiyo-main'); // Start fetching logs immediately
        });

        newSocket.on('logs', handleLogUpdate);

        newSocket.on('connect_error', (error) => {
            console.error('Socket connection error:', error.message);
            setDisplayedLogs(['Connection error: ' + error.message]);
            setIsFetching(false);
        });

        newSocket.on('reconnect', (attempt) => {
            console.log('Reconnected on attempt:', attempt);
            setDisplayedLogs(['Reconnected. Fetching logs...']);
            newSocket.emit('getLogs', 'kamiyo-main'); // Refetch logs on reconnect
        });

        newSocket.on('disconnect', (reason) => {
            console.log('Socket disconnected, reason:', reason);
            setDisplayedLogs(['Socket disconnected. Reconnecting...']);
            setIsFetching(false);
        });

        // Keep the WebSocket connection alive
        const pingInterval = setInterval(() => {
            if (newSocket.connected) {
                newSocket.emit('ping');
            }
        }, 15000); // Ping every 15s

        newSocket.connect();

        return () => {
            newSocket.off('logs', handleLogUpdate);
            clearInterval(pingInterval);
            newSocket.disconnect();
        };
    }, [handleLogUpdate]);

    const fetchLogs = useCallback(() => {
        if (socket && socket.connected) {
            console.log('Emitting getLogs to:', socket.id);
            setIsFetching(true);
            setIsTerminalVisible(true); // Show modal on click
            setDisplayedLogs([ <p key="fetching" className="text-xs text-gray-500">
                Fetching logs
                <span className="loading-dots">
                <span>.</span>
                <span>.</span>
                <span>.</span>
            </span>
            </p>]);
            socket.emit('getLogs', 'kamiyo-main'); // Default workerId for Kamiyo
        } else {
            console.log('Socket not connected or not initialized');
            setDisplayedLogs('Socket not connected. Attempting to reconnect...');
            setIsTerminalVisible(true); // Show modal even on error
            if (socket) {
                socket.connect();
                let retryCount = 0;
                const maxRetries = 3;
                const retryInterval = setInterval(() => {
                    if (socket.connected && retryCount < maxRetries) {
                        console.log(`Reconnected, emitting getLogs to: ${socket.id}, attempt ${retryCount + 1}`);
                        setIsFetching(true);
                        setDisplayedLogs('Fetching logs...');
                        socket.emit('getLogs', 'kamiyo-main'); // Default workerId for Kamiyo
                        clearInterval(retryInterval);
                    } else if (retryCount >= maxRetries) {
                        console.log('Reconnect failed after max retries');
                        setDisplayedLogs('Failed to connect after retries. Check server status.');
                        clearInterval(retryInterval);
                    }
                    retryCount++;
                }, 1000);
            } else {
                setDisplayedLogs('Socket not initialized. Check server.');
            }
        }
    }, [socket]);

    const logLines = Array.isArray(displayedLogs) ? displayedLogs : displayedLogs.split('\n');
    const coloredLogLines = logLines.map((line, index) => {
        const colors = ['text-cyan', 'text-chalk', 'text-magenta'];
        const color = colors[index % colors.length];

        return (
            <p key={index} className={`mb-1 ${color} whitespace-pre-wrap`}>
                {line}
            </p>
        );
    });



    const renderAgentCard = () => {
        const agentCard = kamiyonanyoData.find((card) => card.id === 1);
        if (!agentCard) return null;
        return (
            <Card
                key={agentCard.id}
                image={agentCard.image}
                title={agentCard.title}
                japanese={agentCard.japanese}
                japaneseGen={agentCard.japaneseGen}
                category={agentCard.category}
                active={agentCard.active}
                className="mt-12 md:mt-0 w-full relative"
                positionClass="-right-1"
                dotPositionClass="right-0"// Add this to control the positioning
            />
        );
    };

    const closeModal = () => {
        setIsTerminalVisible(false);
        setDisplayedLogs(''); // Clear logs when closing
    };

    const logContainerRef = React.useRef(null);

    useEffect(() => {
        if (logContainerRef.current) {
            setTimeout(() => {
                logContainerRef.current.scrollTo({
                    top: logContainerRef.current.scrollHeight,
                    behavior: "smooth",  // Enables soft scrolling effect
                });
            }, 1000); // Slight pause before scrolling (200ms)
        }
    }, [displayedLogs]);

    const creationTimeAgo = formatDistanceToNow(parseISO(teeData.creationDate), { addSuffix: true });
    const truncateText = (text, maxLength = 32) => {
        return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
    };

    return (
        <div className="bg-black text-white flex">
            <Head>
                <title>Kamiyo</title>
            </Head>
            <div className="px-5 md:px-1 mx-auto w-full flex flex-col md:flex-row md:w-5/6 min-h-[calc(100vh-140px)] overflow-hidden">
                <div className="w-full md:w-5/12 md:p-8 flex flex-col items-center justify-center md:border-r border-gray-500/25">
                    <div className="block relative p-5 w-full mt-6 md:mt-0">{renderAgentCard()}</div>
                </div>
                <div className="w-full md:w-4/12 flex flex-col py-8 md:py12 justify-center mx-auto">
                    <div className="mb-12">
                        <h4 className="text-xl md:text-2xl mb-5">Kami data | <span className="text-l md:text-xl">カミ関連データ</span></h4>
                        <div className="flex items-center mb-4">
                            <p className="mr-2 mb-0">CA: </p>
                            <p className="mr-2 mb-0">
                                <span className="text-gray-500">{truncateText(tokenData.ca, 41)}</span>
                            </p>
                            <CopyButton text={tokenData.ca} />
                        </div>
                        <p>Market Cap: <span className="text-gray-500">{tokenData.marketCap}</span></p>
                        <div className="flex items-center mb-4">
                            <p className="mr-2 mb-0">Wallet: </p>
                            <p className="mr-2 mb-0">
                                <span className="text-gray-500">{truncateText(tokenData.walletAddress, 37)}</span>
                            </p>
                            <CopyButton text={tokenData.walletAddress} />
                        </div>
                        <p>Balance: <span className="text-gray-500">{tokenData.walletBalance}</span></p>
                        <div className="text-gray-500 relative flex justify-items-stretch my-6">
                            {tokenData.traits.length > 0 ? (
                                tokenData.traits.map((trait, index) => (
                                    <span key={index} className="border border-ash rounded-xl px-5 py-0.5 text-xs font-thin mx-3 ml-0">
        {trait}
      </span>
                                ))
                            ) : (
                                <span className="text-gray-500 text-xs">No traits available</span>
                            )}
                        </div>

                        <div className="flex items-center">
                            <p className="mr-2 mb-0">Progress:</p>
                            <div className="relative w-full">
                                <div className="absolute top-0 left-0 h-full border border-dotted border-cyan" style={{ width: `${tokenData.progress / 432 * 100}%` }}></div>
                                <Progress value={tokenData.progress} max={432} size="xs" className="relative" />
                            </div>
                            <p className="ml-2 mb-0 min-w-fit">{tokenData.progress}/100%</p>
                        </div>

                        <div className="mx-0.5 flex items-center gap-4 mt-5">
                            <a href="https://x.com/KamiyoAI" target="_blank" rel="noopener noreferrer" className="font-light text-gray-500 text-[0.6rem] flex items-center gap-2">
                                <svg viewBox="1 2 22 20" width="16" height="16" className="fill-current hover:fill-chalk transition-fill duration-300">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
                                </svg>
                            </a>
                            <a href="https://discord.gg/6Qxps5XP" target="_blank" rel="noopener noreferrer" className="font-light text-gray-500 text-[0.6rem] flex items-center gap-2">
                                <svg className="fill-current hover:fill-chalk transition-fill duration-300" viewBox="0 -28.5 256 256" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" preserveAspectRatio="xMidYMid" width="18" height="18">
                                    <g>
                                        <path d="M216.856339,16.5966031 C200.285002,8.84328665 182.566144,3.2084988 164.041564,0 C161.766523,4.11318106 159.108624,9.64549908 157.276099,14.0464379 C137.583995,11.0849896 118.072967,11.0849896 98.7430163,14.0464379 C96.9108417,9.64549908 94.1925838,4.11318106 91.8971895,0 C73.3526068,3.2084988 55.6133949,8.86399117 39.0420583,16.6376612 C5.61752293,67.146514 -3.4433191,116.400813 1.08711069,164.955721 C23.2560196,181.510915 44.7403634,191.567697 65.8621325,198.148576 C71.0772151,190.971126 75.7283628,183.341335 79.7352139,175.300261 C72.104019,172.400575 64.7949724,168.822202 57.8887866,164.667963 C59.7209612,163.310589 61.5131304,161.891452 63.2445898,160.431257 C105.36741,180.133187 151.134928,180.133187 192.754523,160.431257 C194.506336,161.891452 196.298154,163.310589 198.110326,164.667963 C191.183787,168.842556 183.854737,172.420929 176.223542,175.320965 C180.230393,183.341335 184.861538,190.991831 190.096624,198.16893 C211.238746,191.588051 232.743023,181.531619 254.911949,164.955721 C260.227747,108.668201 245.831087,59.8662432 216.856339,16.5966031 Z M85.4738752,135.09489 C72.8290281,135.09489 62.4592217,123.290155 62.4592217,108.914901 C62.4592217,94.5396472 72.607595,82.7145587 85.4738752,82.7145587 C98.3405064,82.7145587 108.709962,94.5189427 108.488529,108.914901 C108.508531,123.290155 98.3405064,135.09489 85.4738752,135.09489 Z M170.525237,135.09489 C157.88039,135.09489 147.510584,123.290155 147.510584,108.914901 C147.510584,94.5396472 157.658606,82.7145587 170.525237,82.7145587 C183.391518,82.7145587 193.761324,94.5189427 193.539891,108.914901 C193.539891,123.290155 183.391518,135.09489 170.525237,135.09489 Z"></path>
                                    </g>
                                </svg>
                            </a>
                        </div>
                    </div>
                    <div>
                        <h4 className="text-xl md:text-2xl mb-5">TEE data | <span className="text-l md:text-xl">TEE関連データ</span></h4>
                        <p>Created: <span className="text-gray-500">{creationTimeAgo}</span></p>
                        <p className="flex flex-row justify-between mb-4">
    <span className="flex items-center">
        Verified:{' '}
        {teeData.verified ? (
            <a
                href="https://proof.t16z.com/reports/9c321622185ea6ac45f1b46482274cbe3e5186781570a8851768074fdf72bad6"
                target="_blank"
                rel="noopener noreferrer"
            ><CheckCircleIcon className="h-5 w-5 text-cyan ml-2" />
            </a>
        ) : (
            ' TEE attestation pending...'
        )}
    </span>

                            {teeData.verified && (
                                <a
                                    href="https://proof.t16z.com/reports/9c321622185ea6ac45f1b46482274cbe3e5186781570a8851768074fdf72bad6"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-28 relative px-4 py-1 rounded-xl text-xs border border-transparent bg-transparent live-button"
                                >
                                    <span className="relative z-10">Attestation</span>
                                </a>
                            )}
                        </p>


                        <p className="flex flex-row justify-between mb-4 items-center">
    <span className="flex items-center">
        Running:{' '}
        {teeData.running ? (
            <CheckCircleIcon className="h-5 w-5 text-cyan ml-2" />
        ) : (
            ' No'
        )}
    </span>

                            {teeData.running && (
                                <button
                                    onClick={fetchLogs}
                                    disabled={isFetching}
                                    className={`w-28 relative px-4 py-1 rounded-xl text-xs border border-transparent bg-transparent live-button
                ${isFetching ? 'opacity-50 cursor-not-allowed' : ''}
            `}
                                >
            <span className="relative z-10">
                {isFetching ? 'Fetching...' : 'Show logs'}
            </span>
                                </button>
                            )}
                        </p>


                    </div>
                </div>
            </div>

            {isTerminalVisible && (
                <AnimatePresence>
                    <motion.div
                        initial={{ x: "100%" }}  // Start fully outside the screen
                        animate={{ x: 0 }}       // Slide in smoothly
                        exit={{ x: "100%" }}      // Slide out when closed
                        transition={{
                            type: "spring",
                            stiffness: 120,  // Adjusted for smoothness
                            damping: 15,     // Prevents jagged jumps
                        }}
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
                            {/* Title section (fixed) */}
                            <div className="flex justify-between items-center w-full border-b border-gray-500/25 p-4">
                                <h3 className="text-lg mb-0">TEE Logs</h3>
                                <button
                                    onClick={closeModal}
                                    className="text-gray-500 hover:text-white"
                                >
                                    <XMarkIcon className="h-6 w-6" />
                                </button>
                            </div>

                            {/* Scrollable logs with auto-scroll */}
                            <div ref={logContainerRef} className="text-sm p-4 overflow-y-auto flex-1">
                                {coloredLogLines}
                            </div>
                        </motion.div>
                    </motion.div>
                </AnimatePresence>
            )}
        </div>
    );
}