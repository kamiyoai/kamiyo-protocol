// components/brand/CodeBlock.js
import { useState } from 'react';

export default function CodeBlock({ code, language = 'jsx', showCopy = true, title = null }) {
    const [copied, setCopied] = useState(false);

    const copyCode = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="group relative border border-gray-500/20 rounded-lg overflow-hidden">
            <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{
                background: 'linear-gradient(90deg, #4fe9ea, #ff44f5)',
                padding: '1px',
                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                maskComposite: 'exclude'
            }} />
            {title && (
                <div className="px-4 py-2 border-b border-gray-500/20 text-xs text-gray-400">
                    {title}
                </div>
            )}
            {showCopy && (
                <button
                    onClick={copyCode}
                    className="absolute top-3 right-3 px-3 py-1 text-xs text-cyan hover:opacity-80 bg-black/80 rounded border border-gray-500/25 transition-opacity z-10"
                >
                    {copied ? 'Copied!' : 'Copy'}
                </button>
            )}
            <pre className="p-6 overflow-x-auto">
                <code className="text-xs text-gray-300 font-mono">
                    {code}
                </code>
            </pre>
        </div>
    );
}
