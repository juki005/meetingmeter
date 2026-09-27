import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../utils/api.ts';
import { Activity, Shield, ArrowRight, CheckCircle } from 'lucide-react';

export const AuthPage: React.FC = () => {
  const { login } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [hourlyRate, setHourlyRate] = useState('120');
  const [currency, setCurrency] = useState('EUR');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        const data = await apiRequest<{ token: string; user: any }>('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
            name,
            job_title: jobTitle,
            hourly_rate: parseFloat(hourlyRate) || 0,
            currency,
          }),
        });
        login(data.token, data.user);
      } else {
        const data = await apiRequest<{ token: string; user: any }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        login(data.token, data.user);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background HUD Grid Accent */}
      <div className="absolute inset-0 bg-[radial-gradient(#1E293B_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-primary/10 border border-brand-primary/40 text-brand-primary shadow-glow-emerald mb-4">
          <Activity className="w-8 h-8" />
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-ink-primary">
          Meeting<span className="text-brand-primary">Meter</span>
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-ink-secondary">
          Real-time meeting cost telemetry and fiscal transparency HUD
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-surface-card border border-border-subtle py-8 px-6 sm:px-10 shadow-2xl rounded-2xl">
          <div className="flex border-b border-border-subtle mb-6">
            <button
              onClick={() => { setIsRegister(false); setError(null); }}
              className={`flex-1 pb-3 text-sm font-semibold text-center border-b-2 transition-all ${
                !isRegister ? 'border-brand-primary text-brand-primary' : 'border-transparent text-ink-muted hover:text-ink-primary'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setIsRegister(true); setError(null); }}
              className={`flex-1 pb-3 text-sm font-semibold text-center border-b-2 transition-all ${
                isRegister ? 'border-brand-primary text-brand-primary' : 'border-transparent text-ink-muted hover:text-ink-primary'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-status-danger/10 border border-status-danger/30 rounded-lg text-status-danger text-xs font-mono">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            {isRegister && (
              <>
                <div>
                  <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-primary rounded-lg text-sm text-ink-primary focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Job Title / Role</label>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="e.g. VP Engineering"
                    className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-primary rounded-lg text-sm text-ink-primary focus:outline-none transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Hourly Rate</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-primary rounded-lg text-sm text-ink-primary font-mono focus:outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Currency</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-primary rounded-lg text-sm text-ink-primary font-mono focus:outline-none transition-colors"
                    >
                      <option value="EUR">EUR (€)</option>
                      <option value="USD">USD ($)</option>
                      <option value="GBP">GBP (£)</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Work Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-primary rounded-lg text-sm text-ink-primary focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-primary rounded-lg text-sm text-ink-primary focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 py-2.5 px-4 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-[#090A0F] font-bold text-sm flex items-center justify-center space-x-2 shadow-glow-emerald transition-all disabled:opacity-50"
            >
              <span>{loading ? 'Processing...' : isRegister ? 'Create Account & Setup Rate' : 'Enter Meeting Cockpit'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-border-subtle flex items-center justify-center space-x-2 text-[11px] text-ink-muted">
            <Shield className="w-3.5 h-3.5 text-brand-primary" />
            <span>Private & protected session telemetry</span>
          </div>
        </div>
      </div>
    </div>
  );
};
