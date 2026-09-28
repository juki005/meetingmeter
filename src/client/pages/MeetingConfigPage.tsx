import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../utils/api.ts';
import { Person, CostLibraryItem, ExternalCost } from '../types/index.ts';
import { Play, Plus, Users, CheckSquare, Square, Building, HelpCircle, Shield, AlertCircle, Calendar, Clock, Repeat, Package, Trash2, BookmarkPlus } from 'lucide-react';

interface MeetingConfigPageProps {
  onStartMeeting: (meetingId: string) => void;
  onPreparedSaved?: () => void;
}

interface SelectedRosterItem {
  person_id?: string;
  name: string;
  role?: string | null;
  organization?: string | null;
  is_guest: boolean;
  hourly_rate: number | null;
  rate_known: boolean;
  selected: boolean;
}

export const MeetingConfigPage: React.FC<MeetingConfigPageProps> = ({ onStartMeeting, onPreparedSaved }) => {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'LIVE' | 'PREPARED'>('LIVE');
  const [plannedDate, setPlannedDate] = useState('');
  const [plannedTime, setPlannedTime] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [roster, setRoster] = useState<SelectedRosterItem[]>([]);
  const [costLibrary, setCostLibrary] = useState<CostLibraryItem[]>([]);
  const [externalCosts, setExternalCosts] = useState<ExternalCost[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Inline Quick Add Guest
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickRole, setQuickRole] = useState('');
  const [quickOrg, setQuickOrg] = useState('');
  const [quickRateKnown, setQuickRateKnown] = useState(true);
  const [quickRate, setQuickRate] = useState('100');

  // External Costs addition state
  const [showAddCost, setShowAddCost] = useState(false);
  const [costName, setCostName] = useState('');
  const [costAmount, setCostAmount] = useState('50');
  const [selectedLibId, setSelectedLibId] = useState('');

  useEffect(() => {
    Promise.all([
      apiRequest<{ people: Person[] }>('/people'),
      apiRequest<{ items: CostLibraryItem[] }>('/cost-library'),
    ])
      .then(([peopleData, libData]) => {
        const initialRoster: SelectedRosterItem[] = [];

        // 1. Add Self (Organizer)
        if (user) {
          initialRoster.push({
            name: `${user.name} (You)`,
            role: user.job_title || 'Meeting Organizer',
            organization: 'Internal',
            is_guest: false,
            hourly_rate: user.hourly_rate,
            rate_known: true,
            selected: true,
          });
        }

        // 2. Add saved directory members
        for (const p of peopleData.people) {
          initialRoster.push({
            person_id: p.id,
            name: p.name,
            role: p.role,
            organization: p.organization,
            is_guest: p.type === 'guest',
            hourly_rate: p.hourly_rate,
            rate_known: p.rate_known,
            selected: true,
          });
        }

        setRoster(initialRoster);
        setCostLibrary(libData.items);
      })
      .catch((err) => {
        console.error('Error loading config data:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [user]);

  const toggleSelect = (index: number) => {
    setRoster((prev) => {
      const next = [...prev];
      next[index].selected = !next[index].selected;
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allSelected = roster.every((r) => r.selected);
    setRoster((prev) => prev.map((r) => ({ ...r, selected: !allSelected })));
  };

  const handleQuickAddGuest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickName.trim()) return;

    const newItem: SelectedRosterItem = {
      name: quickName.trim(),
      role: quickRole.trim() || 'Guest',
      organization: quickOrg.trim() || null,
      is_guest: true,
      rate_known: quickRateKnown,
      hourly_rate: quickRateKnown ? parseFloat(quickRate) || 0 : null,
      selected: true,
    };

    setRoster((prev) => [...prev, newItem]);
    setQuickName('');
    setQuickRole('');
    setQuickOrg('');
    setQuickRateKnown(true);
    setQuickRate('100');
    setShowQuickAdd(false);
  };

  const handleAddCost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!costName.trim()) return;

    setExternalCosts((prev) => [
      ...prev,
      {
        cost_library_id: selectedLibId || null,
        name: costName.trim(),
        amount: Math.max(0, parseFloat(costAmount) || 0),
        currency: 'EUR',
        is_overridden: Boolean(selectedLibId && costLibrary.find((l) => l.id === selectedLibId)?.default_amount !== parseFloat(costAmount)),
      },
    ]);

    setCostName('');
    setCostAmount('50');
    setSelectedLibId('');
    setShowAddCost(false);
  };

  const handleSelectLibItem = (libId: string) => {
    setSelectedLibId(libId);
    const item = costLibrary.find((l) => l.id === libId);
    if (item) {
      setCostName(item.name);
      setCostAmount(item.default_amount.toString());
    }
  };

  const handleRemoveCost = (index: number) => {
    setExternalCosts((prev) => prev.filter((_, i) => i !== index));
  };

  const selectedCount = roster.filter((r) => r.selected).length;
  const selectedBurnRate = roster
    .filter((r) => r.selected && r.rate_known && r.hourly_rate !== null)
    .reduce((acc, curr) => acc + (curr.hourly_rate || 0), 0);
  const selectedUnknowns = roster.filter((r) => r.selected && !r.rate_known).length;
  const externalCostSum = externalCosts.reduce((acc, c) => acc + c.amount, 0);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Please provide a meeting title (e.g. "Sprint Planning" or "Client Alignment")');
      return;
    }

    const selectedParticipants = roster.filter((r) => r.selected);
    if (selectedParticipants.length === 0) {
      setError('At least one attendee must be selected.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await apiRequest<{ meeting: any }>('/meetings', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          status: mode === 'LIVE' ? 'LIVE' : 'PREPARED',
          planned_date: plannedDate || null,
          planned_time: plannedTime || null,
          is_recurring: isRecurring,
          currency: 'EUR',
          participants: selectedParticipants.map((p) => ({
            person_id: p.person_id || null,
            name: p.name,
            role: p.role || null,
            organization: p.organization || null,
            is_guest: p.is_guest,
            hourly_rate: p.hourly_rate,
            rate_known: p.rate_known,
            selected: true,
          })),
          external_costs: externalCosts.map((c) => ({
            cost_library_id: c.cost_library_id || null,
            name: c.name,
            amount: c.amount,
            currency: 'EUR',
            is_overridden: c.is_overridden || false,
          })),
        }),
      });

      const meetingId = res.meeting.id;

      if (mode === 'LIVE') {
        onStartMeeting(meetingId);
      } else {
        if (onPreparedSaved) {
          onPreparedSaved();
        } else {
          onStartMeeting(meetingId);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create meeting');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Title Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink-primary tracking-tight">
          Configure / Prepare Meeting
        </h1>
        <p className="text-xs sm:text-sm text-ink-secondary mt-1">
          Select participants from your roster, attach external costs, and launch live or save for future execution.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-status-danger/10 border border-status-danger/30 rounded-xl text-status-danger text-xs font-mono flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Mode Switch: Live vs Prepared */}
      <div className="grid grid-cols-2 gap-3 p-1.5 bg-surface-inset border border-border-subtle rounded-2xl">
        <button
          type="button"
          onClick={() => setMode('LIVE')}
          className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
            mode === 'LIVE'
              ? 'bg-brand-primary text-[#090A0F] shadow-glow-emerald'
              : 'text-ink-secondary hover:text-ink-primary'
          }`}
        >
          <Play className="w-4 h-4 fill-current" />
          <span>Start Live Telemetry Now</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('PREPARED')}
          className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
            mode === 'PREPARED'
              ? 'bg-surface-elevated text-brand-primary border border-brand-primary/40 shadow-sm'
              : 'text-ink-secondary hover:text-ink-primary'
          }`}
        >
          <BookmarkPlus className="w-4 h-4" />
          <span>Save as Prepared Meeting</span>
        </button>
      </div>

      {/* Meeting Parameters Card */}
      <div className="bg-surface-card border border-border-subtle p-6 rounded-2xl shadow-lg space-y-4">
        <h2 className="text-sm font-mono uppercase text-ink-muted tracking-wider">1. Meeting Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Meeting Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q4 Executive Strategy Alignment"
              className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-primary rounded-lg text-sm text-ink-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">
              Planned Date {mode === 'PREPARED' ? '(Optional)' : ''}
            </label>
            <input
              type="date"
              value={plannedDate}
              onChange={(e) => setPlannedDate(e.target.value)}
              className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-primary rounded-lg text-sm text-ink-primary font-mono focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Planned Time (Optional)</label>
            <input
              type="time"
              value={plannedTime}
              onChange={(e) => setPlannedTime(e.target.value)}
              className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-primary rounded-lg text-sm text-ink-primary font-mono focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2 flex items-center space-x-3 pt-1">
            <label className="flex items-center space-x-2 text-xs font-semibold text-ink-primary cursor-pointer">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="w-4 h-4 rounded text-brand-primary"
              />
              <span className="flex items-center space-x-1.5">
                <Repeat className="w-3.5 h-3.5 text-brand-primary" />
                <span>Mark as Recurring Template (Enables 1-Click Duplication)</span>
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Roster Selection Card */}
      <div className="bg-surface-card border border-border-subtle p-6 rounded-2xl shadow-lg space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
          <div>
            <h2 className="text-sm font-mono uppercase text-ink-muted tracking-wider">2. Select Attendees to Measure</h2>
            <p className="text-xs text-ink-secondary mt-0.5">
              Only selected participants will accumulate measured time and estimated cost.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={toggleSelectAll}
              type="button"
              className="px-3 py-1.5 rounded-lg bg-surface-elevated text-brand-primary hover:bg-surface-bright border border-border-subtle text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              {roster.every((r) => r.selected) ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              <span>{roster.every((r) => r.selected) ? 'Deselect All' : 'Select All'}</span>
            </button>

            <button
              onClick={() => setShowQuickAdd(true)}
              type="button"
              className="px-3 py-1.5 rounded-lg bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 border border-brand-primary/30 text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Quick Guest</span>
            </button>
          </div>
        </div>

        {/* Quick Add Guest inline box */}
        {showQuickAdd && (
          <form onSubmit={handleQuickAddGuest} className="p-4 bg-surface-inset border border-brand-primary/40 rounded-xl space-y-3">
            <div className="flex justify-between items-center text-xs font-mono text-brand-primary font-bold">
              <span>ADD INLINE GUEST ATTENDEE</span>
              <button type="button" onClick={() => setShowQuickAdd(false)} className="text-ink-muted hover:text-ink-primary">✕</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                placeholder="Guest Name"
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                className="px-3 py-1.5 bg-surface-card border border-border-subtle rounded-lg text-xs text-ink-primary"
              />
              <input
                type="text"
                placeholder="Role / Title"
                value={quickRole}
                onChange={(e) => setQuickRole(e.target.value)}
                className="px-3 py-1.5 bg-surface-card border border-border-subtle rounded-lg text-xs text-ink-primary"
              />
              <input
                type="text"
                placeholder="Client / Organization"
                value={quickOrg}
                onChange={(e) => setQuickOrg(e.target.value)}
                className="px-3 py-1.5 bg-surface-card border border-border-subtle rounded-lg text-xs text-ink-primary"
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center space-x-2 text-xs text-ink-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={!quickRateKnown}
                  onChange={(e) => setQuickRateKnown(!e.target.checked)}
                  className="rounded text-brand-primary"
                />
                <span className="text-status-unknown font-semibold">Undisclosed / Unknown Hourly Rate</span>
              </label>

              {quickRateKnown && (
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono text-ink-muted">Rate (€/hr):</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={quickRate}
                    onChange={(e) => setQuickRate(e.target.value)}
                    className="w-20 px-2 py-1 bg-surface-card border border-border-subtle rounded text-xs text-ink-primary font-mono"
                  />
                </div>
              )}

              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-brand-primary text-[#090A0F] font-bold text-xs cursor-pointer"
              >
                Include in Meeting
              </button>
            </div>
          </form>
        )}

        {/* Roster Items */}
        {loading ? (
          <div className="py-8 text-center text-xs font-mono text-ink-muted">Loading attendees...</div>
        ) : roster.length === 0 ? (
          <div className="py-8 text-center text-xs text-ink-muted">No attendees in roster.</div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {roster.map((item, idx) => (
              <div
                key={idx}
                onClick={() => toggleSelect(idx)}
                className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  item.selected
                    ? 'bg-surface-elevated/70 border-brand-primary/40 shadow-sm'
                    : 'bg-surface-inset/50 border-border-subtle opacity-50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="text-brand-primary">
                    {item.selected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-ink-muted" />}
                  </div>

                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-sm text-ink-primary">{item.name}</span>
                      {item.is_guest && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-status-unknown/20 text-status-unknown uppercase">
                          Guest
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-secondary flex items-center space-x-2">
                      {item.role && <span>{item.role}</span>}
                      {item.organization && (
                        <span className="flex items-center space-x-1 text-ink-muted">
                          <Building className="w-3 h-3" />
                          <span>{item.organization}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono text-xs">
                  {item.rate_known && item.hourly_rate !== null ? (
                    <span className="font-bold text-brand-primary">€{item.hourly_rate.toFixed(2)}/hr</span>
                  ) : (
                    <span className="text-status-unknown flex items-center space-x-1">
                      <HelpCircle className="w-3 h-3 inline" />
                      <span>Unknown Rate</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* External Costs Section */}
      <div className="bg-surface-card border border-border-subtle p-6 rounded-2xl shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
          <div>
            <h2 className="text-sm font-mono uppercase text-ink-muted tracking-wider">3. External Costs (EUR €)</h2>
            <p className="text-xs text-ink-secondary mt-0.5">
              Add catering, venue rental, or software tool costs for this meeting.
            </p>
          </div>

          <button
            onClick={() => setShowAddCost(!showAddCost)}
            type="button"
            className="px-3 py-1.5 rounded-lg bg-status-warning/15 text-status-warning hover:bg-status-warning/25 border border-status-warning/30 text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Cost</span>
          </button>
        </div>

        {showAddCost && (
          <form onSubmit={handleAddCost} className="p-4 bg-surface-inset border border-status-warning/40 rounded-xl space-y-3">
            <div className="text-xs font-mono text-status-warning font-bold">ADD EXTERNAL COST</div>
            {costLibrary.length > 0 && (
              <div>
                <label className="block text-[11px] font-mono uppercase text-ink-secondary mb-1">Pick from Cost Library</label>
                <select
                  value={selectedLibId}
                  onChange={(e) => handleSelectLibItem(e.target.value)}
                  className="w-full px-3 py-1.5 bg-surface-card border border-border-subtle rounded text-xs text-ink-primary font-mono"
                >
                  <option value="">-- Choose Library Template or enter custom below --</option>
                  {costLibrary.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} (€{item.default_amount.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <input
                  type="text"
                  required
                  placeholder="Cost Description"
                  value={costName}
                  onChange={(e) => setCostName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-surface-card border border-border-subtle rounded text-xs text-ink-primary"
                />
              </div>
              <div>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  placeholder="Amount €"
                  value={costAmount}
                  onChange={(e) => setCostAmount(e.target.value)}
                  className="w-full px-3 py-1.5 bg-surface-card border border-border-subtle rounded text-xs text-ink-primary font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowAddCost(false)}
                className="px-3 py-1.5 rounded-lg bg-surface-elevated text-ink-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-status-warning text-[#090A0F] font-bold text-xs"
              >
                Attach Cost
              </button>
            </div>
          </form>
        )}

        {externalCosts.length === 0 ? (
          <div className="text-xs text-ink-muted italic">No external costs attached.</div>
        ) : (
          <div className="space-y-2">
            {externalCosts.map((c, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-surface-inset border border-border-subtle flex items-center justify-between">
                <div>
                  <div className="font-semibold text-xs text-ink-primary">{c.name}</div>
                  <div className="text-[10px] text-ink-muted">
                    {c.cost_library_id ? 'From Cost Library' : 'Custom Item'} {c.is_overridden ? '(Overridden)' : ''}
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="font-mono font-bold text-xs text-status-warning">€{c.amount.toFixed(2)}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCost(idx)}
                    className="p-1 rounded text-ink-muted hover:text-status-danger"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Burn Rate Summary & Launch Action */}
      <div className="bg-surface-card border border-brand-primary/30 p-6 rounded-2xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-1 text-center sm:text-left">
          <div className="text-xs font-mono uppercase text-ink-muted">
            {mode === 'LIVE' ? 'Initial Live Burn Rate' : 'Configured Rate Preview'}
          </div>
          <div className="text-2xl sm:text-3xl font-mono font-extrabold text-brand-primary">
            €{selectedBurnRate.toFixed(2)}<span className="text-sm font-normal text-ink-muted">/hr</span>
          </div>
          <div className="text-xs text-ink-secondary">
            {selectedCount} participant{selectedCount !== 1 ? 's' : ''} selected
            {selectedUnknowns > 0 && ` (${selectedUnknowns} with unknown rate)`}
            {externalCostSum > 0 && ` • €${externalCostSum.toFixed(2)} external costs attached`}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting || selectedCount === 0}
          className="w-full sm:w-auto px-8 py-4 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-[#090A0F] font-extrabold text-base flex items-center justify-center space-x-3 shadow-glow-emerald disabled:opacity-50 transition-all cursor-pointer"
        >
          {mode === 'LIVE' ? <Play className="w-5 h-5 fill-current" /> : <BookmarkPlus className="w-5 h-5" />}
          <span>
            {submitting
              ? 'Processing...'
              : mode === 'LIVE'
              ? 'Start Meeting Meter'
              : 'Save Prepared Meeting'}
          </span>
        </button>
      </div>
    </div>
  );
};
