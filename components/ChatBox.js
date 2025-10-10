// components/ChatBox.js
import { motion } from 'framer-motion';
import ChatFooter from './ChatFooter';
import AnimatedDots from './AnimatedDots';
import useChat from '../hooks/useChat';

export default function ChatBox({ apiRoute, greeting, messages, setMessages }) {
    const {
        status,
        messages: chatMessages,
        input,
        setInput,
        isThinking,
        handleSend,
        handleSignIn,
        // Provide a default for formatMessage if it's not returned by useChat:
        formatMessage = (text) => text,
        finalGreeting,
        messagesEndRef,
        textAreaRef,
    } = useChat({ apiRoute, greeting, propMessages: messages, propSetMessages: setMessages });

    return (
        <div className="relative flex flex-col h-full">
            {chatMessages.length === 0 ? (
                <div className="flex flex-col justify-center items-center h-full">
                    <div className="p-4 text-center">
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 1 }}
                            className="md:text-sm text-lg text-chalk px-16"
                        >
                            {finalGreeting.jp}
                        </motion.p>
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 1, delay: 0.3 }}
                            className="md:text-sm text-lg text-chalk font-light px-8"
                        >
                            {finalGreeting.en}
                        </motion.p>
                    </div>
                    <ChatFooter
                        input={input}
                        setInput={setInput}
                        handleSend={handleSend}
                        handleSignIn={handleSignIn}
                        status={status}
                        isThinking={isThinking}
                        textAreaRef={textAreaRef}
                    />
                </div>
            ) : (
                <>
                    <div className="flex-1 overflow-y-auto md:px-6 flex flex-col space-y-4 pb-24">
                        {chatMessages.map((msg, index) => (
                            <div
                                key={index}
                                className={`p-3 rounded-3xl max-w-md ${
                                    msg.type === "user"
                                        ? "text-chalk self-end"
                                        : "text-chalk self-start"
                                }`}
                            >
                                <p className="text-xs mb-0 px-5">
                                    {msg.isThinking ? (
                                        <AnimatedDots />
                                    ) : (
                                        formatMessage(msg.text)
                                    )}
                                </p>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0">
                        <ChatFooter
                            input={input}
                            setInput={setInput}
                            handleSend={handleSend}
                            handleSignIn={handleSignIn}
                            status={status}
                            isThinking={isThinking}
                            textAreaRef={textAreaRef}
                        />
                    </div>
                </>
            )}
        </div>
    );
}
