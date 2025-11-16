"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls } from "@react-three/drei";

// Helper: Convert hex color to normalized RGB array.
const hexToRgbNormalized = (hex) => {
    hex = hex.replace(/^#/, "");
    if (hex.length === 3) {
        hex = hex.split("").map((c) => c + c).join("");
    }
    const bigint = parseInt(hex, 16);
    return [(bigint >> 16 & 255) / 255, (bigint >> 8 & 255) / 255, (bigint & 255) / 255];
};

export default function MagicParticles({ count = 500, activeCards = [] }) {
    const ref = useRef();
    const { scene, camera } = useThree();
    const safeActiveCards = Array.isArray(activeCards) ? activeCards : [];

    useEffect(() => {
        camera.position.set(0, 0, 300);
    }, [camera]);

    const activeSpread = 200;
    const minDistance = 50;

    const basePositions = useMemo(() => {
        const arr = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            arr[i * 3] = (Math.random() - 0.5) * 200;
            arr[i * 3 + 1] = (Math.random() - 0.5) * 200;
            arr[i * 3 + 2] = (Math.random() - 0.5) * 200;
        }
        return arr;
    }, [count]);

    const particles = useMemo(() => {
        const arr = new Float32Array(basePositions);
        for (let i = 0; i < safeActiveCards.length; i++) {
            const idx = i * 3;
            let x = arr[idx], y = arr[idx + 1], z = arr[idx + 2];
            let d = Math.sqrt(x * x + y * y + z * z);
            while (d < minDistance) {
                x = (Math.random() - 0.5) * activeSpread;
                y = (Math.random() - 0.5) * activeSpread;
                z = (Math.random() - 0.5) * activeSpread;
                d = Math.sqrt(x * x + y * y + z * z);
            }
            arr[idx] = x;
            arr[idx + 1] = y;
            arr[idx + 2] = z;
        }
        return arr;
    }, [basePositions, safeActiveCards.length]);

    const geometry = useMemo(() => {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute("position", new THREE.BufferAttribute(particles, 3));
        return geom;
    }, [particles]);

    const ACTIVE_COLOR = hexToRgbNormalized("#f0f");

    const colors = useMemo(() => {
        const arr = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            if (i < safeActiveCards.length) {
                arr.set(i === 0 ? [1, 1, 1] : ACTIVE_COLOR, i * 3);
            } else {
                arr.set([1, 1, 1], i * 3);
            }
        }
        return arr;
    }, [safeActiveCards, count]);

    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const sizes = useMemo(() => {
        return Float32Array.from({ length: count }, (_, i) =>
            i < safeActiveCards.length ? safeActiveCards[i].size * 5 : 1.5
        );
    }, [safeActiveCards, count]);

    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const material = useMemo(() => new THREE.PointsMaterial({
        vertexColors: true,
        sizeAttenuation: true,
        transparent: true,
        size: 1.5,
    }), []);

    useFrame(() => {
        if (ref.current) {
            ref.current.rotation.y += 0.001;
        }
    });

    return (
        <>
            <points ref={ref} geometry={geometry} material={material} />
            <OrbitControls enableZoom={true} enablePan={true} maxDistance={500} />
        </>
    );
}
