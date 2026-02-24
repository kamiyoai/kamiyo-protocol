import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | KAMIYO Singularity',
  description: 'Terms of Service for the KAMIYO Singularity prediction markets platform',
};

export default function TermsOfServicePage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold text-text-primary mb-8">Terms of Service</h1>

      <div className="prose prose-invert max-w-none space-y-6 text-text-secondary">
        <p className="text-sm text-text-secondary">Last updated: January 2025</p>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            1. Acceptance of Terms
          </h2>
          <p>
            By accessing or using KAMIYO Singularity (&quot;the Platform&quot;), you agree to be bound by
            these Terms of Service. If you do not agree to these terms, do not use the
            Platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            2. Eligibility
          </h2>
          <p>You must be at least 18 years old to use this Platform. By using the Platform, you represent that:</p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>You are at least 18 years of age</li>
            <li>You have full legal capacity to enter into binding agreements</li>
            <li>You are not located in a jurisdiction where prediction markets are prohibited</li>
            <li>You are not on any sanctions list maintained by OFAC or similar authorities</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            3. Prohibited Jurisdictions
          </h2>
          <p>
            The Platform is not available to residents of the following jurisdictions:
            United States, United Kingdom, Canada (Ontario), Australia, France, Germany,
            Italy, Spain, Netherlands, and any other jurisdiction where participation in
            prediction markets is prohibited by law.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            4. Platform Services
          </h2>
          <p>
            KAMIYO Singularity provides a decentralized prediction market platform built on the
            Solana blockchain. Users can:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>Create prediction markets on future events</li>
            <li>Trade outcome shares (Yes/No tokens)</li>
            <li>Provide liquidity to markets</li>
            <li>Claim winnings from resolved markets</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            5. Risks
          </h2>
          <p>
            Trading on prediction markets involves substantial risk. You may lose some or
            all of your deposited funds. By using the Platform, you acknowledge:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>Cryptocurrency values are volatile</li>
            <li>Smart contracts may contain bugs or vulnerabilities</li>
            <li>Markets may be resolved incorrectly</li>
            <li>You may not be able to withdraw funds in certain circumstances</li>
            <li>The Platform may become unavailable without notice</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            6. User Responsibilities
          </h2>
          <p>You agree to:</p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>Maintain the security of your wallet and private keys</li>
            <li>Not manipulate markets or engage in wash trading</li>
            <li>Not create markets on prohibited topics</li>
            <li>Comply with all applicable laws in your jurisdiction</li>
            <li>Report any bugs or vulnerabilities you discover</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            7. Prohibited Markets
          </h2>
          <p>Markets involving the following are prohibited:</p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>Violence, terrorism, or harm to individuals</li>
            <li>Assassination or death of specific individuals</li>
            <li>Illegal activities</li>
            <li>Events the market creator can directly influence</li>
            <li>Events with clearly manipulable outcomes</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            8. Fees
          </h2>
          <p>
            The Platform charges fees on market creation and trading. Current fee
            structure:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>Market creation: 0.5 SOL</li>
            <li>Trading fee: 1% of trade value</li>
            <li>Withdrawal fee: 0.1% (minimum 0.1 USDC)</li>
          </ul>
          <p className="mt-2">Fees are subject to change with notice.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            9. Dispute Resolution
          </h2>
          <p>
            Market resolution disputes are handled through on-chain oracle mechanisms.
            The Platform reserves the right to void markets that violate these terms or
            cannot be fairly resolved.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            10. Limitation of Liability
          </h2>
          <p>
            THE PLATFORM IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND. TO THE
            MAXIMUM EXTENT PERMITTED BY LAW, THE PLATFORM OPERATORS SHALL NOT BE LIABLE
            FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES
            ARISING FROM YOUR USE OF THE PLATFORM.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            11. Changes to Terms
          </h2>
          <p>
            We may modify these terms at any time. Continued use of the Platform after
            changes constitutes acceptance of the modified terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            12. Contact
          </h2>
          <p>
            For questions about these terms, contact us at{' '}
            <a href="mailto:kamiyo-ai@users.noreply.github.com" className="text-accent hover:underline">
              kamiyo-ai@users.noreply.github.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
