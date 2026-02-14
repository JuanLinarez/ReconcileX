import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getOrganization,
  updateOrganizationName,
  getUserRole,
  updateUserProfile,
  changePassword,
  updateUserPreferences,
} from '@/lib/database';

const CURRENCIES = [
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
  { value: 'MXN', label: 'MXN' },
  { value: 'CAD', label: 'CAD' },
  { value: 'AUD', label: 'AUD' },
  { value: 'JPY', label: 'JPY' },
  { value: 'CHF', label: 'CHF' },
];

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Dubai',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
  'UTC',
];

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

function getInitials(user: {
  user_metadata?: { full_name?: string };
  email?: string | null;
}): string {
  const name = user.user_metadata?.full_name?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  }
  const email = user.email ?? '';
  if (email) return email.slice(0, 2).toUpperCase();
  return '?';
}

export function SettingsPage() {
  const { user, organizationId } = useAuth();

  const [profileFullName, setProfileFullName] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [orgName, setOrgName] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgSaveLoading, setOrgSaveLoading] = useState(false);
  const [orgMessage, setOrgMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [timezone, setTimezone] = useState(() => getBrowserTimezone());
  const [prefsLoading, setPrefsLoading] = useState(false);
  const [prefsMessage, setPrefsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user?.user_metadata?.full_name != null) {
      setProfileFullName(String(user.user_metadata.full_name));
    }
  }, [user?.user_metadata?.full_name]);

  useEffect(() => {
    if (user?.user_metadata?.default_currency != null) {
      setDefaultCurrency(String(user.user_metadata.default_currency));
    }
  }, [user?.user_metadata?.default_currency]);

  useEffect(() => {
    if (user?.user_metadata?.timezone != null) {
      setTimezone(String(user.user_metadata.timezone));
    }
  }, [user?.user_metadata?.timezone]);

  useEffect(() => {
    if (!organizationId) {
      setOrgLoading(false);
      setOrgName('');
      setUserRole(null);
      return;
    }
    setOrgLoading(true);
    Promise.all([
      getOrganization(organizationId),
      user ? getUserRole(organizationId, user.id) : Promise.resolve(null),
    ])
      .then(([org, role]) => {
        setOrgName(org?.name ?? '');
        setUserRole(role);
      })
      .finally(() => setOrgLoading(false));
  }, [organizationId, user?.id]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage(null);
    setProfileLoading(true);
    const { error } = await updateUserProfile({ full_name: profileFullName.trim() });
    setProfileLoading(false);
    if (error) {
      setProfileMessage({ type: 'error', text: error });
    } else {
      setProfileMessage({ type: 'success', text: 'Profile updated successfully.' });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    setPasswordLoading(true);
    const { error } = await changePassword(newPassword);
    setPasswordLoading(false);
    if (error) {
      setPasswordMessage({ type: 'error', text: error });
    } else {
      setPasswordMessage({ type: 'success', text: 'Password changed successfully.' });
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const handleSaveOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    setOrgMessage(null);
    setOrgSaveLoading(true);
    const ok = await updateOrganizationName(organizationId, orgName.trim());
    setOrgSaveLoading(false);
    if (ok) {
      setOrgMessage({ type: 'success', text: 'Organization updated successfully.' });
    } else {
      setOrgMessage({ type: 'error', text: 'Failed to update organization.' });
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setPrefsMessage(null);
    setPrefsLoading(true);
    const { error } = await updateUserPreferences({
      default_currency: defaultCurrency,
      timezone,
    });
    setPrefsLoading(false);
    if (error) {
      setPrefsMessage({ type: 'error', text: error });
    } else {
      setPrefsMessage({ type: 'success', text: 'Preferences saved successfully.' });
    }
  };

  const allTimezones = (() => {
    const base = TIMEZONES.includes(getBrowserTimezone())
      ? TIMEZONES
      : [getBrowserTimezone(), ...TIMEZONES];
    if (timezone && !base.includes(timezone)) {
      return [timezone, ...base];
    }
    return base;
  })();

  return (
    <div className="space-y-6 pb-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--app-heading)]">
          Settings
        </h1>
        <p className="mt-1 text-sm text-[var(--app-body)]">
          Manage your account, organization, and preferences
        </p>
      </header>

      {/* Profile */}
      <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)]">
        <h2 className="mb-1 text-base font-semibold text-[var(--app-heading)]">Profile</h2>
        <p className="mb-6 text-sm text-[var(--app-body)]">
          Update your personal information
        </p>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--app-primary)] text-sm font-semibold text-white">
              {user ? getInitials(user) : '?'}
            </div>
            <form onSubmit={handleSaveProfile} className="flex-1 space-y-4">
              <div>
                <Label htmlFor="profile-full-name" className="mb-1.5 text-sm font-medium text-[var(--app-heading)]">Full Name</Label>
                <Input
                  id="profile-full-name"
                  type="text"
                  autoComplete="name"
                  value={profileFullName}
                  onChange={(e) => setProfileFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="mt-1.5 rounded-lg border-slate-200 focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)]/20"
                />
              </div>
              <div>
                <Label htmlFor="profile-email" className="mb-1.5 text-sm font-medium text-[var(--app-heading)]">Email</Label>
                <Input
                  id="profile-email"
                  type="email"
                  value={user?.email ?? ''}
                  disabled
                  className="mt-1.5 opacity-70 rounded-lg border-slate-200"
                />
              </div>
              {profileMessage && (
                <p
                  className={
                    profileMessage.type === 'success'
                      ? 'text-sm text-emerald-600'
                      : 'text-sm text-destructive'
                  }
                >
                  {profileMessage.text}
                </p>
              )}
              <Button type="submit" disabled={profileLoading}>
                {profileLoading ? 'Saving…' : 'Save Profile'}
              </Button>
            </form>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="mb-3 text-base font-semibold text-[var(--app-heading)]">
              Change Password
            </h3>
            <form onSubmit={handleChangePassword} className="max-w-md space-y-4">
              <div>
                <Label htmlFor="new-password" className="mb-1.5 text-sm font-medium text-[var(--app-heading)]">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="mt-1.5 rounded-lg border-slate-200 focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)]/20"
                />
              </div>
              <div>
                <Label htmlFor="confirm-password" className="mb-1.5 text-sm font-medium text-[var(--app-heading)]">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="mt-1.5 rounded-lg border-slate-200 focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)]/20"
                />
              </div>
              {passwordMessage && (
                <p
                  className={
                    passwordMessage.type === 'success'
                      ? 'text-sm text-emerald-600'
                      : 'text-sm text-destructive'
                  }
                >
                  {passwordMessage.text}
                </p>
              )}
              <Button type="submit" variant="outline" disabled={passwordLoading}>
                {passwordLoading ? 'Changing…' : 'Change Password'}
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Organization */}
      <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)]">
        <h2 className="mb-1 text-base font-semibold text-[var(--app-heading)]">Organization</h2>
        <p className="mb-6 text-sm text-[var(--app-body)]">
          Manage your organization settings
        </p>
          {orgLoading ? (
            <div className="space-y-3">
              <div className="h-9 rounded bg-muted animate-pulse w-64" />
              <div className="h-9 rounded bg-muted animate-pulse w-32" />
            </div>
          ) : organizationId ? (
            <form onSubmit={handleSaveOrganization} className="max-w-md space-y-4">
              <div>
                <Label htmlFor="org-name" className="mb-1.5 text-sm font-medium text-[var(--app-heading)]">Organization Name</Label>
                <Input
                  id="org-name"
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="My Organization"
                  className="mt-1.5 rounded-lg border-slate-200 focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)]/20"
                />
              </div>
              <div>
                <Label htmlFor="org-role" className="mb-1.5 text-sm font-medium text-[var(--app-heading)]">Your Role</Label>
                <Input
                  id="org-role"
                  type="text"
                  value={userRole ?? '—'}
                  disabled
                  className="mt-1.5 opacity-70 rounded-lg border-slate-200"
                />
              </div>
              {orgMessage && (
                <p
                  className={
                    orgMessage.type === 'success'
                      ? 'text-sm text-emerald-600'
                      : 'text-sm text-destructive'
                  }
                >
                  {orgMessage.text}
                </p>
              )}
              <Button type="submit" disabled={orgSaveLoading}>
                {orgSaveLoading ? 'Saving…' : 'Save'}
              </Button>
            </form>
          ) : (
            <p className="text-sm leading-relaxed text-[var(--app-body)]">
              No organization linked. Contact your administrator.
            </p>
          )}
      </div>

      {/* Preferences */}
      <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-[0_1px_3px_0_rgb(0,0,0,0.04)]">
        <h2 className="mb-1 text-base font-semibold text-[var(--app-heading)]">Preferences</h2>
        <p className="mb-6 text-sm text-[var(--app-body)]">
          Set your default currency and timezone
        </p>
        <form onSubmit={handleSavePreferences} className="max-w-md space-y-4">
            <div>
              <Label htmlFor="prefs-currency" className="mb-1.5 text-sm font-medium text-[var(--app-heading)]">Default Currency</Label>
              <Select value={defaultCurrency} onValueChange={setDefaultCurrency}>
                <SelectTrigger id="prefs-currency" className="mt-1.5 w-full rounded-lg border-slate-200 focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)]/20">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="prefs-timezone" className="mb-1.5 text-sm font-medium text-[var(--app-heading)]">Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id="prefs-timezone" className="mt-1.5 w-full rounded-lg border-slate-200 focus:border-[var(--app-primary)] focus:ring-1 focus:ring-[var(--app-primary)]/20">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {allTimezones.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {prefsMessage && (
              <p
                className={
                  prefsMessage.type === 'success'
                    ? 'text-sm text-emerald-600'
                    : 'text-sm text-destructive'
                }
              >
                {prefsMessage.text}
              </p>
            )}
            <Button type="submit" disabled={prefsLoading}>
              {prefsLoading ? 'Saving…' : 'Save Preferences'}
            </Button>
          </form>
      </div>
    </div>
  );
}
