import Head from 'next/head';

export default function About() {
    return (
        <div className="min-h-screen">
            <Head>
                <title>About KAMIYO - Blockchain Exploit Intelligence</title>
            </Head>

            <section className="py-10 px-5 md:px-1 mx-auto" style={{ maxWidth: '1400px' }}>
                <div className="border-dotted border-b border-cyan mb-12 pb-6">
                    <p className="font-light text-sm uppercase tracking-widest text-cyan mb-8">— &nbsp;About</p>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-light">What is KAMIYO</h1>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
                    <div>
                        <h4 className="text-xl md:text-2xl mb-4">Real-time Exploit Intelligence</h4>
                        <p>We operate as a blockchain exploit intelligence aggregator, collecting and analyzing data from trusted sources to deliver real-time insights into on-chain security incidents.</p>

                        <p>In the rapidly evolving blockchain security landscape, timely access to verified exploit information is essential. Our platform consolidates data from 18 aggregators (56 established sources)—including security firms, blockchain explorers, and verified security researchers—into a centralized intelligence feed.</p>

                        <p>By prioritizing speed and data accuracy, we enable security teams, DeFi protocols, and institutional investors to respond to threats more efficiently than manual monitoring allows.</p>

                        <h4 className="pt-6 text-xl md:text-2xl mb-4">Core Principles</h4>
                        <ol start="1" data-spread="true">
                            <li>
                                <p><strong>Verified Sources Only:</strong> Every exploit must have a transaction hash on-chain and be confirmed by reputable security sources like Rekt News, BlockSec, PeckShield, or Etherscan.</p>
                            </li>
                            <li>
                                <p><strong>Speed Over Speculation:</strong> Our value is in being fast to aggregate confirmed information, not in predicting or discovering vulnerabilities. We organize what's already been verified.</p>
                            </li>
                            <li>
                                <p><strong>No Security Analysis:</strong> KAMIYO doesn't claim to find vulnerabilities, score risks, or provide security audits. We aggregate external reports and present them clearly.</p>
                            </li>
                            <li>
                                <p><strong>Comprehensive Coverage:</strong> Track exploits across 55+ blockchain networks including Ethereum, Hyperliquid, Solana, BSC, Arbitrum, and more from a single dashboard.</p>
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
                        <h4 className="text-xl md:text-2xl mb-4">How Our Platform Works</h4>
                        <ul data-spread="true">
                            <li>
                                <p><strong>Multi-Source Data Collection:</strong><br/>Our systems continuously monitor 18 aggregators (56 sources) including Rekt News, BlockSec, PeckShield, Certik, Immunefi, Trail of Bits, and established security researchers across social platforms.</p>
                            </li>
                            <li>
                                <p><strong>On-Chain Data Verification:</strong><br/>We validate every reported incident against transaction data from blockchain explorers like Etherscan, ensuring all intelligence includes verifiable on-chain evidence.</p>
                            </li>
                            <li>
                                <p><strong>Automated Data Processing:</strong><br/>When multiple sources report the same incident, our deduplication system automatically consolidates and enriches the data, creating a single comprehensive record from all available sources.</p>
                            </li>
                            <li>
                                <p><strong>Multi-Channel Alert Delivery:</strong><br/>Clients receive instant notifications through their preferred channels—Discord, Telegram, Slack, or email—when new exploits match their configured monitoring criteria.</p>
                            </li>
                        </ul>
                        <h4 className="pt-6 text-xl md:text-2xl mb-4">Our Mission</h4>
                        <p>We exist to provide the blockchain ecosystem with accessible, timely, and reliable security intelligence. While the crypto industry loses billions annually to exploits and vulnerabilities, we help organizations respond faster by delivering verified information the moment incidents occur.</p>
                        <p>Our platform transforms fragmented security reports into organized, searchable intelligence that security teams can integrate directly into their operational workflows and response procedures.</p>
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
                        <p>We collect incident reports from established blockchain security firms including PeckShield, BlockSec, Certik, Quantstamp, Trail of Bits, OpenZeppelin, and Consensys Diligence.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">BUG BOUNTIES</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">Verified Discoveries</h4>
                        <p>Our platform tracks confirmed vulnerabilities and exploits disclosed through major bug bounty programs like Immunefi and HackerOne, where security researchers responsibly report discovered issues.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">BLOCKCHAIN DATA</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">On-Chain Verification</h4>
                        <p>We verify all reported incidents against transaction data from blockchain explorers including Etherscan, BscScan, Solscan, and Arbiscan, ensuring every entry includes provable on-chain evidence.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">COMMUNITY SOURCES</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">Security Research Community</h4>
                        <p>We monitor verified security researchers and incident reporters across social platforms, capturing early detection signals and community-verified information about emerging security events.</p>
                    </div>
                    <div>
                        <p className="mb-2 tracking-widest font-light text-xs text-gray-500">INCIDENT DATABASES</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">Historical Records</h4>
                        <p>We maintain comprehensive exploit archives sourced from Rekt News, SlowMist Hacked, and Chainalysis, enabling historical trend analysis and pattern recognition across the blockchain security landscape.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">PROTOCOL MONITORING</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">Direct Protocol Sources</h4>
                        <p>Our systems monitor security advisories, GitHub security alerts, and official communications directly from blockchain protocols and DeFi projects, capturing first-party incident disclosures.</p>

                        <p className="mb-2 mt-12 tracking-widest font-light text-xs text-gray-500">DATA QUALITY</p>
                        <h4 className="pt-0 text-xl md:text-2xl mb-4">Quality Standards</h4>
                        <p>We maintain rigorous data quality standards. All reported exploits must be confirmed by multiple reputable sources and include verifiable on-chain transaction evidence. Our system prioritizes accuracy by filtering unverified reports and speculation.</p>
                        <p>Our aggregation infrastructure cross-references multiple sources, enriches records with contextual data, and delivers a unified, comprehensive view of each security incident.</p>
                    </div>
                </div>
            </section>

        </div>
    );
}
