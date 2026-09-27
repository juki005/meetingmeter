import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../utils/api.ts';
import { Person } from '../types/index.ts';
import { Users, UserPlus, Search, Edit2, Trash2, HelpCircle, Building, CheckCircle2, Shield } from 'lucide-react';

export const PeoplePage: React.FC = () => {
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'internal' | 'guest'>('all');

  // Modal / Form state
  const [showModal, setShowModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [formType, setFormType] = useState<'internal' | 'guest'>('internal');
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formOrg, setFormOrg] = useState('');
  const [formRateKnown, setFormRateKnown] = useState(true);
  const [formRate, setFormRate] = useState('100');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchPeople = async () => {
    try {
      const data = await apiRequest<{ people: Person[] }>('/people');
      setPeople(data.people);
    } catch (err) {
      console.error('Failed to load people:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPeople();
  }, []);

  const handleOpenAdd = () => {
    setEditingPerson(null);
    setFormType('internal');
    setFormName('');
    setFormRole('');
    setFormOrg('');
    setFormRateKnown(true);
    setFormRate('100');
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (p: Person) => {
    setEditingPerson(p);
    setFormType(p.type);
    setFormName(p.name);
    setFormRole(p.role || '');
    setFormOrg(p.organization || '');
    setFormRateKnown(p.rate_known);
    setFormRate(p.hourly_rate !== null ? p.hourly_rate.toString() : '');
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const payload = {
        type: formType,
        name: formName,
        role: formRole || null,
        organization: formOrg || null,
        rate_known: formType === 'internal' ? true : formRateKnown,
        hourly_rate: (formType === 'internal' || formRateKnown) ? (parseFloat(formRate) || 0) : null,
      };

      if (editingPerson) {
        await apiRequest(`/people/${editingPerson.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/people', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setShowModal(false);
      await fetchPeople();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save person');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove "${name}" from your roster?`)) return;
    try {
      await apiRequest(`/people/${id}`, { method: 'DELETE' });
      await fetchPeople();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  const currencySymbol = user?.currency === 'EUR' ? '€' : user?.currency === 'USD' ? '$' : user?.currency === 'GBP' ? '£' : '€';

  const filteredPeople = people.filter((p) => {
    if (filter === 'internal' && p.type !== 'internal') return false;
    if (filter === 'guest' && p.type !== 'guest') return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.role && p.role.toLowerCase().includes(q)) ||
        (p.organization && p.organization.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Users className="w-6 h-6 text-brand-primary" />
            <h1 className="text-2xl font-extrabold text-ink-primary">Roster & Rate Directory</h1>
          </div>
          <p className="text-xs sm:text-sm text-ink-secondary mt-1">
            Maintain your internal team members and external guests with private rate snapshots.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-[#090A0F] font-bold text-xs sm:text-sm flex items-center space-x-2 shadow-glow-emerald transition-all"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Member / Guest</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface-card p-4 rounded-xl border border-border-subtle">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-ink-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, role, org..."
            className="w-full pl-9 pr-3 py-1.5 bg-surface-inset border border-border-subtle focus:border-brand-primary rounded-lg text-xs text-ink-primary focus:outline-none transition-colors"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === 'all'
                ? 'bg-surface-elevated text-brand-primary border border-brand-primary/40'
                : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            All ({people.length})
          </button>
          <button
            onClick={() => setFilter('internal')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === 'internal'
                ? 'bg-surface-elevated text-brand-primary border border-brand-primary/40'
                : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            Internal Team ({people.filter((p) => p.type === 'internal').length})
          </button>
          <button
            onClick={() => setFilter('guest')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === 'guest'
                ? 'bg-surface-elevated text-brand-primary border border-brand-primary/40'
                : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            Guests ({people.filter((p) => p.type === 'guest').length})
          </button>
        </div>
      </div>

      {/* People Grid */}
      {loading ? (
        <div className="py-12 text-center text-xs font-mono text-ink-muted">Loading roster...</div>
      ) : filteredPeople.length === 0 ? (
        <div className="py-12 text-center space-y-2 border border-dashed border-border-subtle rounded-xl bg-surface-card/40">
          <Users className="w-8 h-8 text-ink-muted mx-auto" />
          <p className="text-sm text-ink-secondary">No people found matching the criteria.</p>
          <button
            onClick={handleOpenAdd}
            className="text-xs font-semibold text-brand-primary hover:underline"
          >
            Add your first colleague or client
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPeople.map((p) => (
            <div
              key={p.id}
              className="bg-surface-card border border-border-subtle hover:border-brand-primary/30 p-5 rounded-xl space-y-3 transition-all shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${
                        p.type === 'internal'
                          ? 'bg-brand-primary/10 text-brand-primary border border-brand-primary/30'
                          : 'bg-status-unknown/15 text-status-unknown border border-status-unknown/40'
                      }`}
                    >
                      {p.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-ink-primary">{p.name}</h3>
                      <div className="text-xs text-ink-secondary">{p.role || 'Team Member'}</div>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                      p.type === 'internal'
                        ? 'bg-brand-primary/10 text-brand-primary border border-brand-primary/20'
                        : 'bg-status-unknown/20 text-status-unknown border border-status-unknown/40'
                    }`}
                  >
                    {p.type}
                  </span>
                </div>

                {p.organization && (
                  <div className="flex items-center space-x-1 text-xs text-ink-muted mt-2">
                    <Building className="w-3.5 h-3.5" />
                    <span>{p.organization}</span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-border-subtle flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase text-ink-muted block">Hourly Rate</span>
                  <span className="text-sm font-mono font-bold text-ink-primary">
                    {p.rate_known && p.hourly_rate !== null ? (
                      `${currencySymbol}${p.hourly_rate.toFixed(2)}/hr`
                    ) : (
                      <span className="text-status-unknown flex items-center space-x-1 text-xs">
                        <HelpCircle className="w-3 h-3 inline" />
                        <span>Unknown (Not Zero)</span>
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => handleOpenEdit(p)}
                    className="p-1.5 rounded-lg text-ink-muted hover:text-brand-primary hover:bg-surface-elevated transition-colors"
                    title="Edit Member"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(p.id, p.name)}
                    className="p-1.5 rounded-lg text-ink-muted hover:text-status-danger hover:bg-surface-elevated transition-colors"
                    title="Remove Member"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Person Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-surface-card border border-border-subtle rounded-2xl max-w-md w-full p-6 shadow-hud-modal space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-3 border-b border-border-subtle">
              <h2 className="text-lg font-bold text-ink-primary">
                {editingPerson ? 'Edit Directory Member' : 'Add Member to Roster'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-ink-muted hover:text-ink-primary text-sm font-mono"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-status-danger/10 border border-status-danger/30 rounded-lg text-status-danger text-xs font-mono">
                {formError}
              </div>
            )}

            <form className="space-y-4" onSubmit={handleSubmit}>
              {/* Type Switcher */}
              <div>
                <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Affiliation Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormType('internal')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                      formType === 'internal'
                        ? 'bg-brand-primary/10 border-brand-primary text-brand-primary'
                        : 'bg-surface-inset border-border-subtle text-ink-secondary'
                    }`}
                  >
                    Internal Team
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormType('guest')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold border transition-all ${
                      formType === 'guest'
                        ? 'bg-status-unknown/15 border-status-unknown text-status-unknown'
                        : 'bg-surface-inset border-border-subtle text-ink-secondary'
                    }`}
                  >
                    External Guest
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Jordan Lee"
                  className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-primary rounded-lg text-sm text-ink-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Job Title / Role</label>
                <input
                  type="text"
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  placeholder="e.g. Lead Architect / Product Manager"
                  className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-primary rounded-lg text-sm text-ink-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Organization (Optional)</label>
                <input
                  type="text"
                  value={formOrg}
                  onChange={(e) => setFormOrg(e.target.value)}
                  placeholder="e.g. Client Org / Agency / Acme Corp"
                  className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-primary rounded-lg text-sm text-ink-primary focus:outline-none"
                />
              </div>

              {/* Hourly Rate & Known/Unknown Toggle */}
              {formType === 'guest' && (
                <div className="p-3 bg-surface-inset rounded-lg border border-border-subtle space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono uppercase text-ink-secondary">Guest Cost Information</span>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!formRateKnown}
                        onChange={(e) => setFormRateKnown(!e.target.checked)}
                        className="rounded border-border-subtle text-brand-primary focus:ring-0"
                      />
                      <span className="text-xs text-status-unknown font-semibold">Rate is Unknown</span>
                    </label>
                  </div>
                  {!formRateKnown && (
                    <p className="text-[11px] text-ink-muted leading-tight">
                      Unknown rates are explicitly distinguished and not treated as zero in final receipts.
                    </p>
                  )}
                </div>
              )}

              {(formType === 'internal' || formRateKnown) && (
                <div>
                  <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">
                    Hourly Rate ({currencySymbol}) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={formRate}
                    onChange={(e) => setFormRate(e.target.value)}
                    placeholder="120"
                    className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-primary rounded-lg text-sm text-ink-primary font-mono focus:outline-none"
                  />
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg bg-surface-elevated text-ink-secondary hover:text-ink-primary text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-brand-primary hover:bg-brand-primary-hover text-[#090A0F] text-xs font-bold shadow-glow-emerald disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingPerson ? 'Update Member' : 'Add to Roster'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
