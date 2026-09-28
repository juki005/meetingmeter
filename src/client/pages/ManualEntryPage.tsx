import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../utils/api.ts';
import { Person, CostLibraryItem, ExternalCost } from '../types/index.ts';
import { FileSpreadsheet, Plus, Trash2, Users, AlertCircle, Clock, Calendar, Shield, Building, Sparkles } from 'lucide-react';

interface ManualEntryPageProps {
  onMeetingCreated?: (meetingId: string) => void;
  onSaved?: (meetingId: string) => void;
  onCancel?: () => void;
}

interface ManualParticipantItem {
  person_id?: string;
  name: string;
  role?: string | null;
  organization?: string | null;
  is_guest: boolean;
  hourly_rate: number | null;
  rate_known: boolean;
  selected: boolean;
  duration_minutes: number;
}

export const ManualEntryPage: React.FC<ManualEntryPageProps> = ({ onMeetingCreated, onSaved, onCancel }) => {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('');
  const [meetingDurationMinutes, setMeetingDurationMinutes] = useState(60);
  const [manualReason, setManualReason] = useState('');
  const [roster, setRoster] = useState<ManualParticipantItem[]>([]);
  const [costLibrary, setCostLibrary] = useState<CostLibraryItem[]>([]);
  const [externalCosts, setExternalCosts] = useState<ExternalCost[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New inline guest state
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestRole, setGuestRole] = useState('');
  const [guestOrg, setGuestOrg] = useState('');
  const [guestRateKnown, setGuestRateKnown] = useState(true);
  const [guestRate, setGuestRate] = useState('100');

  // Custom external cost state
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
        const initialRoster: ManualParticipantItem[] = [];

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
            duration_minutes: 60,
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
            duration_minutes: 60,
          });
        }

        setRoster(initialRoster);
        setCostLibrary(libData.items);
      })
      .catch((err) => {
        console.error('Failed to load initial data:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [user]);

  // Sync participant durations when meeting duration changes if they match old duration
  const handleMeetingDurationChange = (newMin: number) => {
    const val = Math.max(1, newMin);
    const prevMin = meetingDurationMinutes;
    setMeetingDurationMinutes(val);
    setRoster((prev) =>
      prev.map((p) => ({
        ...p,
        duration_minutes: p.duration_minutes === prevMin || p.duration_minutes > val ? val : p.duration_minutes,
      }))
    );
  };

  const toggleSelect = (index: number) => {
    setRoster((prev) => {
      const next = [...prev];
      next[index].selected = !next[index].selected;
      return next;
    });
  };

  const updateParticipantDuration = (index: number, minutes: number) => {
    const val = Math.max(0, Math.min(meetingDurationMinutes, minutes));
    setRoster((prev) => {
      const next = [...prev];
      next[index].duration_minutes = val;
      return next;
    });
  };

  const handleAddInlineGuest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;

    setRoster((prev) => [
      ...prev,
      {
        name: guestName.trim(),
        role: guestRole.trim() || 'Guest',
        organization: guestOrg.trim() || null,
        is_guest: true,
        hourly_rate: guestRateKnown ? parseFloat(guestRate) || 0 : null,
        rate_known: guestRateKnown,
        selected: true,
        duration_minutes: meetingDurationMinutes,
      },
    ]);

    setGuestName('');
    setGuestRole('');
    setGuestOrg('');
    setGuestRateKnown(true);
    setGuestRate('100');
    setShowAddGuest(false);
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

  // Live Calculations
  const selectedParticipants = roster.filter((r) => r.selected);
  const participantCostTotal = selectedParticipants
    .filter((p) => p.rate_known && p.hourly_rate !== null)
    .reduce((acc, p) => acc + (p.hourly_rate! * (p.duration_minutes * 60)) / 3600, 0);

  const unknownCount = selectedParticipants.filter((p) => !p.rate_known).length;
  const externalCostTotal = externalCosts.reduce((acc, c) => acc + c.amount, 0);
  const totalEstimatedCost = participantCostTotal + externalCostTotal;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a meeting title');
      return;
    }
    if (!date) {
      setError('Meeting date is required for Manual Entry');
      return;
    }
    if (selectedParticipants.length === 0) {
      setError('At least one participant must be selected');
      return;
    }

    setSubmitting(true);
    setError(null);

    const meetingDurationSeconds = meetingDurationMinutes * 60;

    try {
      const res = await apiRequest<{ meeting: any }>('/meetings/manual', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          planned_date: date,
          planned_time: time || null,
          meeting_duration_seconds: meetingDurationSeconds,
          manual_reason: manualReason.trim() || null,
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
            manual_duration_seconds: p.duration_minutes * 60,
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

      (onSaved || onMeetingCreated)?.(res.meeting.id);
    } catch (err: any) {
      setError(err.message || 'Failed to save Manual Entry');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-2">
          <FileSpreadsheet className="w-7 h-7 text-brand-cyan" />
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink-primary tracking-tight">
            Manual Entry Reconstruction
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-ink-secondary mt-1">
          Reconstruct completed or offline meeting costs retroactively without running live timers.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-status-danger/10 border border-status-danger/30 rounded-xl text-status-danger text-xs font-mono flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Meeting Context */}
        <div className="p-6 bg-surface-card border border-border-subtle rounded-2xl shadow-lg space-y-4">
          <h2 className="text-xs font-mono uppercase text-brand-cyan tracking-wider font-bold">
            1. Meeting Details & Duration
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Meeting Title *</label>
              <input
                type="text"
                required
                placeholder="e.g. Executive Strategy & Offsite Retro"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-cyan rounded-lg text-sm text-ink-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Date Occurred *</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-cyan rounded-lg text-sm text-ink-primary font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Time (Optional)</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-cyan rounded-lg text-sm text-ink-primary font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Total Duration (Minutes) *</label>
              <input
                type="number"
                min="1"
                required
                value={meetingDurationMinutes}
                onChange={(e) => handleMeetingDurationChange(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-cyan rounded-lg text-sm text-ink-primary font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-ink-secondary mb-1">Manual Reason (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Offline board meeting / Forgot to run live timer"
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                className="w-full px-3 py-2 bg-surface-inset border border-border-subtle focus:border-brand-cyan rounded-lg text-sm text-ink-primary"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Participants & Individual Participation Times */}
        <div className="p-6 bg-surface-card border border-border-subtle rounded-2xl shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
            <div>
              <h2 className="text-xs font-mono uppercase text-brand-cyan tracking-wider font-bold">
                2. Select Attendees & Individual Participation
              </h2>
              <p className="text-xs text-ink-secondary mt-0.5">
                Adjust individual attendance duration (0 to {meetingDurationMinutes} mins) for each participant.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddGuest(true)}
              className="px-3 py-1.5 rounded-lg bg-brand-cyan/15 text-brand-cyan hover:bg-brand-cyan/25 border border-brand-cyan/30 text-xs font-semibold flex items-center space-x-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Guest</span>
            </button>
          </div>

          {/* Inline Add Guest form */}
          {showAddGuest && (
            <div className="p-4 bg-surface-inset border border-brand-cyan/40 rounded-xl space-y-3">
              <div className="flex justify-between items-center text-xs font-mono text-brand-cyan font-bold">
                <span>ADD GUEST PARTICIPANT</span>
                <button type="button" onClick={() => setShowAddGuest(false)} className="text-ink-muted hover:text-ink-primary">✕</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Guest Name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="px-3 py-1.5 bg-surface-card border border-border-subtle rounded text-xs text-ink-primary"
                />
                <input
                  type="text"
                  placeholder="Role / Title"
                  value={guestRole}
                  onChange={(e) => setGuestRole(e.target.value)}
                  className="px-3 py-1.5 bg-surface-card border border-border-subtle rounded text-xs text-ink-primary"
                />
                <input
                  type="text"
                  placeholder="Organization"
                  value={guestOrg}
                  onChange={(e) => setGuestOrg(e.target.value)}
                  className="px-3 py-1.5 bg-surface-card border border-border-subtle rounded text-xs text-ink-primary"
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center space-x-2 text-xs text-ink-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!guestRateKnown}
                    onChange={(e) => setGuestRateKnown(!e.target.checked)}
                    className="rounded text-brand-cyan"
                  />
                  <span className="text-status-unknown font-semibold">Unknown Hourly Rate</span>
                </label>
                {guestRateKnown && (
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono text-ink-muted">Rate (€/hr):</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={guestRate}
                      onChange={(e) => setGuestRate(e.target.value)}
                      className="w-20 px-2 py-1 bg-surface-card border border-border-subtle rounded text-xs text-ink-primary font-mono"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleAddInlineGuest}
                  className="px-3 py-1.5 rounded-lg bg-brand-cyan text-[#090A0F] font-bold text-xs"
                >
                  Add to List
                </button>
              </div>
            </div>
          )}

          {/* Roster Items */}
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {roster.map((item, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                  item.selected
                    ? 'bg-surface-elevated/70 border-brand-cyan/40 shadow-sm'
                    : 'bg-surface-inset/50 border-border-subtle opacity-50'
                }`}
              >
                <div className="flex items-center space-x-3 cursor-pointer" onClick={() => toggleSelect(idx)}>
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => toggleSelect(idx)}
                    className="w-4 h-4 rounded text-brand-cyan cursor-pointer"
                  />
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-sm text-ink-primary">{item.name}</span>
                      {item.is_guest && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-status-unknown/20 text-status-unknown uppercase">
                          Guest
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-ink-secondary">
                      {item.role || 'Participant'} {item.organization ? `• ${item.organization}` : ''}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-4 pl-7 sm:pl-0">
                  <div className="text-right font-mono text-xs">
                    {item.rate_known && item.hourly_rate !== null ? (
                      <span className="font-bold text-brand-primary">€{item.hourly_rate.toFixed(2)}/hr</span>
                    ) : (
                      <span className="text-status-unknown">Unknown Rate</span>
                    )}
                  </div>

                  {item.selected && (
                    <div className="flex items-center space-x-1.5 bg-surface-inset px-2.5 py-1 rounded-lg border border-border-subtle">
                      <Clock className="w-3.5 h-3.5 text-ink-muted" />
                      <input
                        type="number"
                        min="0"
                        max={meetingDurationMinutes}
                        value={item.duration_minutes}
                        onChange={(e) => updateParticipantDuration(idx, parseInt(e.target.value) || 0)}
                        className="w-16 bg-transparent text-xs font-mono font-bold text-ink-primary focus:outline-none text-right"
                      />
                      <span className="text-[10px] font-mono text-ink-muted">min</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: External Costs */}
        <div className="p-6 bg-surface-card border border-border-subtle rounded-2xl shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
            <div>
              <h2 className="text-xs font-mono uppercase text-status-warning tracking-wider font-bold">
                3. External Cost Items (EUR €)
              </h2>
              <p className="text-xs text-ink-secondary mt-0.5">
                Attach catering, venue fees, equipment, or AV tools.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddCost(!showAddCost)}
              className="px-3 py-1.5 rounded-lg bg-status-warning/15 text-status-warning hover:bg-status-warning/25 border border-status-warning/30 text-xs font-semibold flex items-center space-x-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add External Cost</span>
            </button>
          </div>

          {showAddCost && (
            <div className="p-4 bg-surface-inset border border-status-warning/40 rounded-xl space-y-3">
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
                    placeholder="Description (e.g. Conference Catering)"
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
                  type="button"
                  onClick={handleAddCost}
                  className="px-3 py-1.5 rounded-lg bg-status-warning text-[#090A0F] font-bold text-xs"
                >
                  Add Cost
                </button>
              </div>
            </div>
          )}

          {/* External Costs List */}
          {externalCosts.length === 0 ? (
            <div className="text-xs text-ink-muted italic">No external costs added for this meeting.</div>
          ) : (
            <div className="space-y-2">
              {externalCosts.map((c, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-surface-inset border border-border-subtle flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-xs text-ink-primary">{c.name}</div>
                    <div className="text-[10px] text-ink-muted">
                      {c.cost_library_id ? 'From Cost Library' : 'Custom Item'}
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

        {/* Live Summary & Launch */}
        <div className="p-6 bg-surface-card border border-brand-cyan/40 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-1 text-center sm:text-left">
            <div className="text-[11px] font-mono uppercase text-ink-muted">Calculated Total Meeting Cost</div>
            <div className="text-3xl font-mono font-extrabold text-brand-primary">
              €{totalEstimatedCost.toFixed(2)}
            </div>
            <div className="text-xs text-ink-secondary flex items-center space-x-2">
              <span>Participants: €{participantCostTotal.toFixed(2)}</span>
              <span>•</span>
              <span>External: €{externalCostTotal.toFixed(2)}</span>
              {unknownCount > 0 && <span className="text-status-unknown">({unknownCount} with unknown rate)</span>}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-brand-cyan hover:brightness-110 text-[#090A0F] font-extrabold text-base flex items-center justify-center space-x-2 shadow-glow-cyan transition-all cursor-pointer"
          >
            <Sparkles className="w-5 h-5" />
            <span>{submitting ? 'Generating Fiscal Receipt...' : 'Save & View Fiscal Receipt'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
