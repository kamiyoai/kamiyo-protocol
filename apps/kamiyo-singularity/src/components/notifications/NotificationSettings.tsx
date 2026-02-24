'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { NotificationPreferences } from '@/types';
import { cn } from '@/lib/utils';

interface ToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function Toggle({ label, description, checked, onChange, disabled }: ToggleProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="font-medium text-text-primary">{label}</p>
        <p className="text-sm text-text-secondary">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        disabled={disabled}
        role="switch"
        aria-checked={checked}
        className={cn(
          'relative w-11 h-6 rounded-full transition-colors cursor-pointer',
          'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg-primary',
          checked ? 'bg-accent' : 'bg-bg-tertiary',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
            checked && 'translate-x-5'
          )}
        />
      </button>
    </div>
  );
}

export function NotificationSettings() {
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    orderFills: true,
    marketResolutions: true,
    priceAlerts: true,
    systemAnnouncements: true,
    emailNotifications: false,
    pushNotifications: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;

    api.getNotificationPreferences()
      .then((prefs) => {
        if (!cancelled) setPreferences(prefs);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const handleChange = (key: keyof NotificationPreferences, value: boolean) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
    setStatus('idle');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateNotificationPreferences(preferences);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <div className="animate-pulse text-text-secondary">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* In-app notifications */}
        <div>
          <h4 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-2">
            In-App Notifications
          </h4>
          <div className="divide-y divide-border">
            <Toggle
              label="Order fills"
              description="When your orders are filled or partially filled"
              checked={preferences.orderFills}
              onChange={(v) => handleChange('orderFills', v)}
            />
            <Toggle
              label="Market resolutions"
              description="When markets you have positions in are resolved"
              checked={preferences.marketResolutions}
              onChange={(v) => handleChange('marketResolutions', v)}
            />
            <Toggle
              label="Price alerts"
              description="Custom price alerts you've set up"
              checked={preferences.priceAlerts}
              onChange={(v) => handleChange('priceAlerts', v)}
            />
            <Toggle
              label="System announcements"
              description="Important platform updates and announcements"
              checked={preferences.systemAnnouncements}
              onChange={(v) => handleChange('systemAnnouncements', v)}
            />
          </div>
        </div>

        {/* External notifications */}
        <div>
          <h4 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-2">
            External Notifications
          </h4>
          <div className="divide-y divide-border">
            <Toggle
              label="Email notifications"
              description="Receive notifications via email"
              checked={preferences.emailNotifications}
              onChange={(v) => handleChange('emailNotifications', v)}
            />
            <Toggle
              label="Push notifications"
              description="Browser push notifications (requires permission)"
              checked={preferences.pushNotifications}
              onChange={(v) => handleChange('pushNotifications', v)}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-4 pt-4">
          {status === 'saved' && (
            <span className="text-sm text-bid">Settings saved</span>
          )}
          {status === 'error' && (
            <span className="text-sm text-ask">Failed to save</span>
          )}
          <Button onClick={handleSave} loading={saving}>
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
