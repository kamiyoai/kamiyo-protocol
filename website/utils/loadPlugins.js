import web3Plugin from "../plugins/web3Plugin";
import mythologyPlugin from "../plugins/mythologyPlugin";
import paradoxPlugin from "../plugins/paradoxPlugin";

const availablePlugins = {
    "Web3 Knowledge Retrieval": web3Plugin,
    "AI Mythology Insights": mythologyPlugin,
    "Philosophical Paradox Generator": paradoxPlugin
};

export default async function loadPlugins(pluginNames) {
    return pluginNames
        .map(name => availablePlugins[name])
        .filter(plugin => plugin); // Load only existing plugins
}
