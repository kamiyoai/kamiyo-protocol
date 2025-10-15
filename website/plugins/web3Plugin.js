export default {
    name: "Web3 Knowledge Retrieval",
    async process(message) {
        if (message.includes("blockchain") || message.includes("Web3")) {
            return message + " The decentralized network hums in cryptographic whispers.";
        }
        return message;
    }
};
