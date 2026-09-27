import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../utils/api.ts';
import { UserCheck, Shield, CheckCircle, Save } from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [jobTitle, setJobTitle] = useState(user?.job_title || '');
  const [hourlyRate, setHourlyRate] = useState(user?.hourly_rate !== undefined ? user.hourly_rate.toString() : '120');
  const [currency, setCurrency] = useState(user?.currency || 'EUR');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setJobTitle(user.job_title || '');
      setHourlyRate(user.hourly_rate.toString());
      setCurrency(user.currency || 'EUR');
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setLoading(true);

    try {
      const data = await apiRequest<{ user: any }>('/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim() || user?.name || 'Organizer',
          job_title: jobTitle.trim() || null,
          hourly_rate: parseFloat(hourlyRate) || 0,
          currency,
        }),
      });

      updateUser(data.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center space-x-3">
        <div className="p-2.5 rounded-xl bg-brand-primary/10 border border-brand-primary/30 text-brand-primary">
          <UserCheck className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-ink-primary">Personal Profile & Rate</h1>
          <p className="text-xs sm:text-sm text-ink-secondary">
            Manage your personal identity and hourly rate for MeetingMeter calculations.
          </p>
        </div>
      </div>

      <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 sm:p-8 shadow-xl">
        {saved && (
          <div className="mb-6 p-3 bg-brand-primary/10 border border-brand-primary/40 rounded-xl text-brand-primary text-xs font-mono flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>Profile and hourly rate updated successfully!</span>
          </div>
        )}

        {error && (
          <div className="mb-6 p-3 bg-status-danger/10 border border-status-danger/40 rounded-xl text-status-danger text-xs font-mono">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Account Email</label>
            <input
              type="text"
              disabled
              value={user?.email || ''}
              className="w-full px-3 py-2 bg-surface-inset/50 border border-border-subtle rounded-lg text-sm text-ink-muted font-mono cursor-not-allowed"
            />
            <span className="text-[11px] text-ink-muted mt-1 block">Account identity is fixed.</span>
          </div>

          <div>
            <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-primary rounded-lg text-sm text-ink-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Job Title / Role</label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-primary rounded-lg text-sm text-ink-primary focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Personal Hourly Rate *</label>
              <input
                type="number"
                min="0"
                step="any"
                required
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-primary rounded-lg text-sm text-ink-primary font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Default Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-primary rounded-lg text-sm text-ink-primary font-mono focus:outline-none"
              >
                <option value="EUR">EUR (€)</option>
                <option value="USD">USD ($)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>

          <div className="p-4 bg-surface-inset rounded-xl border border-border-subtle flex items-start space-x-3 text-xs text-ink-secondary">
            <Shield className="w-5 h-5 text-brand-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-ink-primary">Rate Stability & Historical Immutability</p>
              <p className="mt-0.5 text-ink-muted">
                When you include yourself in meetings, this rate is snapshotted into the session record. Updating your rate here will apply to future meetings without altering past historical receipts.
              </p>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-[#090A0F] font-bold text-xs sm:text-sm flex items-center space-x-2 shadow-glow-emerald disabled:opacity-50 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Saving...' : 'Save Profile Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
