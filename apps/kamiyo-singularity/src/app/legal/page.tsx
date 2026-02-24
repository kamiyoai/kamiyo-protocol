import { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';

export const metadata: Metadata = {
  title: 'Legal | KAMIYO Singularity',
  description: 'Legal information for the KAMIYO Singularity prediction markets platform',
};

const legalPages = [
  {
    title: 'Terms of Service',
    description: 'Rules and conditions for using the KAMIYO Singularity platform',
    href: '/legal/terms',
  },
  {
    title: 'Privacy Policy',
    description: 'How we collect, use, and protect your data',
    href: '/legal/privacy',
  },
  {
    title: 'Risk Disclaimer',
    description: 'Important information about the risks of prediction markets',
    href: '/legal/disclaimer',
  },
];

export default function LegalPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold text-text-primary mb-8">Legal</h1>

      <div className="grid gap-4">
        {legalPages.map((page) => (
          <Link key={page.href} href={page.href}>
            <Card hover>
              <CardHeader>
                <CardTitle>{page.title}</CardTitle>
                <CardDescription>{page.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
