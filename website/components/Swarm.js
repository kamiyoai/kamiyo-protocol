import { useState } from "react";

export default function KamiyonanayoSwarm() {
    const [status, setStatus] = useState("Idle");

    const runAISwarm = async () => {
        setStatus("Initiating swarm...");
        try {
            const response = await fetch("/api/run-ai");
            const data = await response.json();
            setStatus(`Swarm running in ${data.mode} Mode`);
        } catch (error) {
            console.error("Swarm error:", error);
            setStatus("Error running swarm.");
        }
    };

    return (
        <div>
            <h2>Kamiyo AI Swarm</h2>
            <button onClick={runAISwarm}>Initiate swarm</button>
            <p>Status: {status}</p>
        </div>
    );
}
