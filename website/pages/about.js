import Head from 'next/head';

export default function About() {
    return (
        <div className="min-h-screen">
            <Head>
                <title>About Kamiyo - Blockchain Exploit Intelligence</title>
            </Head>

            <section className="py-10 px-5 md:px-1 mx-auto" style={{ maxWidth: '1400px' }}>
                <div className="border-dotted border-b border-cyan mb-12 pb-6">
                    <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;About</p>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-light">What is Kamiyo</h1>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                    <div>
                        <h4 className="text-xl md:text-2xl mb-4">Real-time Exploit Intelligence</h4>
                        <p>Kamiyo is a comprehensive blockchain exploit intelligence aggregator that brings together verified security incidents from across the cryptocurrency ecosystem into one unified platform.</p>

                        <p>In the fast-moving world of blockchain security, staying informed about exploits, hacks, and vulnerabilities is critical. Kamiyo aggregates data from 20+ trusted sources including security firms, blockchain explorers, and verified social media accounts to provide real-time intelligence on confirmed exploits.</p>

                        <p>With an emphasis on speed and accuracy, Kamiyo delivers verified intelligence faster than manual monitoring, helping security researchers, DeFi protocols, and crypto investors stay ahead of threats.</p>

                        <h4 className="pt-6 text-xl md:text-2xl mb-4">Core Principles</h4>
                        <ol start="1" data-spread="true">
                            <li>
                                <p><strong>Verified Sources Only:</strong> Every exploit must have a transaction hash on-chain and be confirmed by reputable security sources like Rekt News, BlockSec, PeckShield, or Etherscan.</p>
                            </li>
                            <li>
                                <p><strong>Speed Over Speculation:</strong> Our value is in being fast to aggregate confirmed information, not in predicting or discovering vulnerabilities. We organize what's already been verified.</p>
                            </li>
                            <li>
                                <p><strong>No Security Analysis:</strong> Kamiyo doesn't claim to find vulnerabilities, score risks, or provide security audits. We aggregate external reports and present them clearly.</p>
                            </li>
                            <li>
                                <p><strong>Comprehensive Coverage:</strong> Track exploits across 55+ blockchain networks including Ethereum, Solana, BSC, Arbitrum, and more from a single dashboard.</p>
                            </li>
                            <li>
                                <p><strong>Historical Context:</strong> Access a searchable database of past exploits to identify patterns, understand attack vectors, and learn from the history of blockchain security incidents.</p>
                            </li>
                            <li>
                                <p><strong>Developer-Friendly API:</strong> Integrate real-time exploit intelligence into your applications, monitoring tools, or internal security systems via our REST API and WebSocket feeds.</p>
                            </li>
                            <li>
                                <p><strong>Community-Driven:</strong> Built for security researchers, DeFi protocols, blockchain developers, and crypto investors who need reliable, fast intelligence without the noise.</p>
                            </li>
                        </ol>

                    </div>
                    <div>
                        <h4 className="text-xl md:text-2xl mb-4">How Kamiyo Works</h4>
                        <ul data-spread="true">
                            <li>
                                <p><strong>Aggregation from Trusted Sources:</strong><br/>Kamiyo continuously monitors 20+ verified sources including Rekt News, BlockSec, PeckShield, Certik, Immunefi, Trail of Bits, and trusted security researchers on X (Twitter).</p>
                            </li>
                            <li>
                                <p><strong>On-Chain Verification:</strong><br/>Every exploit is validated with transaction hashes directly from blockchain explorers like Etherscan, ensuring all reported incidents have verifiable on-chain evidence.</p>
                            </li>
                            <li>
                                <p><strong>Intelligent Deduplication:</strong><br/>Multiple sources may report the same incident. Our system automatically deduplicates and enriches exploit data by combining information from multiple sources into a single, comprehensive record.</p>
                            </li>
                            <li>
                                <p><strong>Real-Time Alerts:</strong><br/>Subscribe to instant notifications via Discord, Telegram, or email when new exploits are detected affecting chains, protocols, or categories you care about.</p>
                            </li>
                        </ul>
                        <h4 className="pt-6 text-xl md:text-2xl mb-4">Our Mission</h4>
                        <p>Kamiyo exists to make blockchain security intelligence accessible, fast, and reliable. The crypto ecosystem loses billions annually to exploits and hacks. While we can't prevent these incidents, we can help the community stay informed and respond quickly when they occur.</p>
                        <p>By aggregating scattered security information into one organized, searchable platform, Kamiyo empowers users to track threats, understand historical patterns, and integrate real-time exploit data into their security workflows.</p>
                    </div>
                </div>

            </section>
            <section className="py-10 px-5 md:px-1 mx-auto" style={{ maxWidth: '1400px' }}>
                <div className="border-dotted border-b border-cyan mb-12 pb-6">
                    <p className="mb-8 font-light text-sm uppercase tracking-widest text-cyan">— &nbsp;Data Sources</p>
                    <h3 className="text-3xl md:text-4xl lg:text-5xl font-light">Trusted Intelligence</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                    <div>
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">SECURITY FIRMS</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">Professional Auditors</h4>
                        <p>Kamiyo aggregates reports from leading blockchain security firms including PeckShield, BlockSec, Certik, Quantstamp, Trail of Bits, OpenZeppelin, and Consensys Diligence.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">BUG BOUNTIES</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">Verified Discoveries</h4>
                        <p>Track confirmed vulnerabilities and exploits reported through major bug bounty platforms like Immunefi and HackerOne, where white-hat hackers discover and report security issues responsibly.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">BLOCKCHAIN DATA</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">On-Chain Verification</h4>
                        <p>Every exploit is verified with transaction data from blockchain explorers including Etherscan, BscScan, Solscan, and Arbiscan, ensuring all incidents have provable on-chain evidence.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">COMMUNITY SOURCES</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">Social Intelligence</h4>
                        <p>Monitor verified security researchers and incident reporters on X (Twitter), providing early signals and community-verified information about emerging threats.</p>
                    </div>
                    <div>
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">INCIDENT DATABASES</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">Historical Records</h4>
                        <p>Aggregate comprehensive exploit histories from sources like Rekt News, SlowMist Hacked, and Chainalysis, providing historical context and pattern recognition capabilities.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">PROTOCOL MONITORING</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">Direct Observation</h4>
                        <p>Track security advisories, GitHub advisories, and official announcements directly from blockchain protocols and DeFi projects for first-party incident reports.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">DATA QUALITY</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">Rigorous Standards</h4>
                        <p>Kamiyo maintains strict data quality standards. All exploits must be confirmed by multiple reputable sources and include verifiable on-chain transaction hashes. We prioritize accuracy over speed, filtering out rumors and unverified reports.</p>
                        <p>Our aggregation system cross-references multiple sources, enriches data with additional context, and presents a unified view of each security incident.</p>
                    </div>
                </div>
            </section>

        </div>
    );
}
