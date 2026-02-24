import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Risk Disclaimer | KAMIYO Singularity',
  description: 'Risk Disclaimer for the KAMIYO Singularity prediction markets platform',
};

export default function DisclaimerPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold text-text-primary mb-8">Risk Disclaimer</h1>

      <div className="prose prose-invert max-w-none space-y-6 text-text-secondary">
        <div className="p-4 rounded-lg bg-ask/10 border border-ask/20 mb-8">
          <p className="text-ask font-medium">
            IMPORTANT: Trading on prediction markets involves substantial risk of loss.
            Only trade with funds you can afford to lose.
          </p>
        </div>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            Financial Risk
          </h2>
          <p>
            Trading outcome shares on prediction markets is speculative and carries a
            high level of risk. The value of your positions can go up or down rapidly,
            and you may lose some or all of your deposited funds. Past performance is not
            indicative of future results.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            Cryptocurrency Volatility
          </h2>
          <p>
            The platform operates with USDC on the Solana blockchain. While USDC is
            designed to maintain a stable value, cryptocurrency markets are inherently
            volatile. Network congestion, smart contract issues, or market conditions may
            affect your ability to deposit, withdraw, or trade.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            Smart Contract Risk
          </h2>
          <p>
            The platform relies on smart contracts deployed on the Solana blockchain.
            While these contracts have been tested, there is no guarantee they are free
            from bugs or vulnerabilities. Exploits or bugs could result in loss of funds.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            Market Resolution Risk
          </h2>
          <p>
            Markets are resolved by oracles or designated resolvers. There is a risk
            that:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>Markets may be resolved incorrectly</li>
            <li>Ambiguous outcomes may be disputed</li>
            <li>Resolution may be delayed</li>
            <li>Markets may be voided entirely</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            Liquidity Risk
          </h2>
          <p>
            Some markets may have low liquidity, which can result in:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>Wide bid-ask spreads</li>
            <li>Difficulty executing large orders</li>
            <li>Slippage on trades</li>
            <li>Inability to exit positions</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            Regulatory Risk
          </h2>
          <p>
            Prediction markets may be subject to changing regulations in your
            jurisdiction. You are responsible for ensuring your use of the platform
            complies with applicable laws. The platform may be required to restrict
            access or cease operations in certain regions.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            No Investment Advice
          </h2>
          <p>
            Nothing on this platform constitutes investment, financial, legal, or tax
            advice. You should consult with appropriate professionals before making any
            financial decisions. We do not recommend or endorse any particular trading
            strategies.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            Your Responsibility
          </h2>
          <p>
            By using the platform, you acknowledge that you:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>Understand the risks involved</li>
            <li>Are solely responsible for your trading decisions</li>
            <li>Have conducted your own research</li>
            <li>Can afford to lose any funds you deposit</li>
            <li>Accept full responsibility for your use of the platform</li>
          </ul>
        </section>

        <section className="mt-8 p-4 rounded-lg bg-bg-secondary">
          <p className="text-sm">
            If you do not understand these risks or do not agree with this disclaimer,
            please do not use the platform.
          </p>
        </section>
      </div>
    </div>
  );
}
