import { Metadata } from 'next';
import { ApiDocumentation } from '@/components/docs/ApiDocumentation';

export const metadata: Metadata = {
  title: 'API Documentation | KAMIYO Singularity',
  description: 'REST API documentation for the KAMIYO Singularity prediction market platform',
};

export default function ApiDocsPage() {
  return <ApiDocumentation />;
}
