import { Metadata } from 'next';
import { NotificationSettings } from '@/components/notifications';

export const metadata: Metadata = {
  title: 'Notification Settings | KAMIYO Singularity',
  description: 'Manage your notification preferences',
};

export default function NotificationSettingsPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-text-primary mb-6">Settings</h1>
      <NotificationSettings />
    </div>
  );
}
