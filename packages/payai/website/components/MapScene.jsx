import React, { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import MagicParticles from './MagicParticles';
import { ScrambleButton } from './ScrambleButton';
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";

// Function to generate random but evenly spread positions
const generateButtonPositions = (count, spreadRange = 100) => {
    const positions = [];
    const gridSize = Math.ceil(Math.sqrt(count)); // Ensures an even spread

    for (let i = 0; i < count; i++) {
        const row = Math.floor(i / gridSize);
        const col = i % gridSize;

        const x = (col / gridSize) * spreadRange - spreadRange / 2;
        const y = (row / gridSize) * spreadRange - spreadRange / 2;
        const z = Math.random() * 80 + 30; // Spread deeper into the scene

        positions.push([x, y, z]);
    }

    return positions;
};


export default function MapScene({ activeCards = [], sceneWidth = 12, sceneHeight = 10 }) {
    const { data: session } = useSession();
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [buttonPositions, setButtonPositions] = useState([]);
    const router = useRouter();

    useEffect(() => {
        if (!session?.user?.email) {
            setLoading(false);
            return;
        }

        const checkSubscription = async () => {
            try {
                const res = await fetch(`/api/subscription/status?email=${session.user.email}`);
                if (!res.ok) throw new Error("Failed to fetch subscription status");

                const data = await res.json();
                setIsSubscribed(data.isSubscribed);
            } catch (error) {
                console.error("Error checking subscription status:", error);
            } finally {
                setLoading(false);
            }
        };

        checkSubscription();
    }, [session]);

    const handleButtonClick = () => {
        if (loading) return; // Prevent navigation while checking status
        const targetUrl = isSubscribed ? "/summon" : "/services";
        router.push(targetUrl);
    };

    useEffect(() => {
        setButtonPositions(generateButtonPositions(8));
    }, []);

    return (
        <Canvas
            style={{ width: '100%', height: '100%', background: 'black' }}
            camera={{ position: [0, 0, 300], fov: 50, near: 0.1, far: 1000 }}
            gl={{ antialias: true }}
        >
            <MagicParticles
                count={1000}
                activeCards={activeCards}
                sceneWidth={sceneWidth}
                sceneHeight={sceneHeight}
            />
            <OrbitControls
                maxDistance={100} // Max zoom out
                minDistance={20}  // Min zoom in
                zoomSpeed={0.01}   // Controls zoom speed

                enableDamping={true} // Smooth motion effect
                dampingFactor={0.01} // Fine-tune zoom responsiveness

                enablePan={true} // Allow dragging
                panSpeed={0.1} // Control dragging speed
                screenSpacePanning={false} // Keeps panning feeling natural
            />

            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 10]} intensity={0.8} />

            <Html position={[0, 0, 89.5]} transform>
                <ScrambleButton text="Summon Kami" enabled={!loading} onClick={handleButtonClick} loading={loading} />
            </Html>

            {/* Additional buttons at static positions */}
            {buttonPositions.map((pos, index) => (
                <Html key={index} position={pos} transform>
                    <ScrambleButton text="Summon Kami" enabled={!loading} onClick={handleButtonClick} loading={loading} />
                </Html>
            ))}
        </Canvas>
    );
}
