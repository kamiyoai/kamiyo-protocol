import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | KAMIYO Singularity',
  description: 'Privacy Policy for the KAMIYO Singularity prediction markets platform',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold text-text-primary mb-8">Privacy Policy</h1>

      <div className="prose prose-invert max-w-none space-y-6 text-text-secondary">
        <p className="text-sm text-text-secondary">Last updated: January 2025</p>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            1. Introduction
          </h2>
          <p>
            KAMIYO Singularity (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) respects your privacy and is committed to
            protecting your personal data. This privacy policy explains how we collect,
            use, and share information about you when you use our platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            2. Information We Collect
          </h2>

          <h3 className="text-lg font-medium text-text-primary mt-4 mb-2">
            2.1 Information You Provide
          </h3>
          <ul className="list-disc pl-6 space-y-2">
            <li>Wallet addresses when you connect to the platform</li>
            <li>Transaction data when you trade on markets</li>
            <li>Optional profile information (username, avatar)</li>
          </ul>

          <h3 className="text-lg font-medium text-text-primary mt-4 mb-2">
            2.2 Information Collected Automatically
          </h3>
          <ul className="list-disc pl-6 space-y-2">
            <li>IP address and approximate location</li>
            <li>Browser type and device information</li>
            <li>Usage patterns and preferences</li>
            <li>Referral source</li>
          </ul>

          <h3 className="text-lg font-medium text-text-primary mt-4 mb-2">
            2.3 Blockchain Data
          </h3>
          <p>
            All transactions on the Solana blockchain are public and permanent. This
            includes your wallet address, transaction amounts, and trading history. This
            data is not controlled by us and is inherent to blockchain technology.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            3. How We Use Your Information
          </h2>
          <p>We use your information to:</p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>Provide and maintain the platform</li>
            <li>Process your transactions</li>
            <li>Detect and prevent fraud or abuse</li>
            <li>Comply with legal obligations</li>
            <li>Improve our services</li>
            <li>Send important notifications about your account</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            4. Information Sharing
          </h2>
          <p>We may share your information with:</p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>Service providers who help operate the platform</li>
            <li>Law enforcement when required by law</li>
            <li>Other users (public transaction data on-chain)</li>
          </ul>
          <p className="mt-2">
            We do not sell your personal information to third parties.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            5. Data Retention
          </h2>
          <p>
            We retain your information for as long as your account is active or as needed
            to provide services. On-chain data is permanent and cannot be deleted.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            6. Your Rights
          </h2>
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>Access your personal data</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data (where possible)</li>
            <li>Object to processing of your data</li>
            <li>Data portability</li>
          </ul>
          <p className="mt-2">
            Note: On-chain data cannot be modified or deleted due to the nature of
            blockchain technology.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            7. Cookies
          </h2>
          <p>
            We use essential cookies to maintain your session and preferences. We do not
            use tracking cookies or share data with advertisers.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            8. Security
          </h2>
          <p>
            We implement appropriate technical and organizational measures to protect
            your data. However, no system is completely secure. You are responsible for
            maintaining the security of your wallet and private keys.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            9. International Transfers
          </h2>
          <p>
            Your information may be processed in countries other than your own. By using
            the platform, you consent to such transfers.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            10. Changes to This Policy
          </h2>
          <p>
            We may update this policy from time to time. We will notify you of
            significant changes by posting on the platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-text-primary mt-8 mb-4">
            11. Contact Us
          </h2>
          <p>
            For privacy-related inquiries, contact us at{' '}
            <a href="mailto:kamiyo-ai@users.noreply.github.com" className="text-accent hover:underline">
              kamiyo-ai@users.noreply.github.com
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
