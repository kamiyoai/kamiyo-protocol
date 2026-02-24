import { Metadata } from 'next';
import { SecurityAuditChecklist } from '@/components/admin/SecurityAuditChecklist';

export const metadata: Metadata = {
  title: 'Security Audit | KAMIYO Singularity Admin',
  description: 'Security audit checklist and preparation',
};

export default function SecurityAuditPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Security Audit Preparation</h1>
      <SecurityAuditChecklist />
    </div>
  );
}
