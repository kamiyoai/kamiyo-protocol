// components/brand/ColorSwatch.js
import { useState } from 'react';

export default function ColorSwatch({ name, hex, rgb, usage }) {
    const [copied, setCopied] = useState(false);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(hex);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="group relative border border-gray-500/25 rounded-lg overflow-hidden transition-colors duration-300">
            <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{
                background: 'linear-gradient(90deg, #4fe9ea, #ff44f5)',
                padding: '1px',
                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude'
            }} />
            <div
                className="w-full h-32"
                style={{ backgroundColor: hex }}
            />
            <div className="p-4">
                <h3 className="text-white text-lg mb-2">{name}</h3>
                <div className="flex items-center gap-3 mb-2">
                    <code className="text-sm text-gray-400">{hex}</code>
                    <button
                        onClick={copyToClipboard}
                        className="text-xs text-cyan hover:opacity-80 transition-opacity duration-300"
                    >
                        {copied ? 'Copied!' : 'Copy'}
                    </button>
                </div>
                <p className="text-xs text-gray-400 mb-1">RGB: {rgb}</p>
                <p className="text-xs text-gray-500 mt-3">{usage}</p>
            </div>
        </div>
    );
}
