import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../utils/api.ts';
import { Meeting } from '../types/index.ts';
import { formatDuration, downloadCsv } from '../utils/export.ts';
import { History, Search, FileText, Download, Shield, Clock, HelpCircle, ArrowRight, Repeat, Calendar, AlertTriangle, Play, Plus, Edit3, Copy } from 'lucide-react';

interface HistoryPageProps {
  onNavigate: (tab: string, meetingId?: string) => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'CONCLUDED' | 'PREPARED' | 'MISSED'>('ALL');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchMeetings = async () => {
    try {
      const data = await apiRequest<{ meetings: Meeting[] }>('/meetings');
      setMeetings(data.meetings);
    } catch (err) {
      console.error('Failed to load meeting history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, []);

  const handleDuplicateRecurring = async (meetingId: string) => {
    setActionLoading(meetingId);
    try {
      const res = await apiRequest<{ meeting: Meeting }>(`/meetings/${meetingId}/duplicate-recurring`, {
        method: 'POST',
      });
      alert(`Next recurring meeting created: "${res.meeting.title}" (Prepared)`);
      await fetchMeetings();
    } catch (err: any) {
      alert('Failed to duplicate recurring meeting: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartPrepared = async (meetingId: string) => {
    setActionLoading(meetingId);
    try {
      await apiRequest(`/meetings/${meetingId}/start`, { method: 'POST' });
      onNavigate('live', meetingId);
    } catch (err: any) {
      alert('Failed to launch live meeting: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const currencySymbol = user?.currency === 'EUR' ? '€' : user?.currency === 'USD' ? '$' : user?.currency === 'GBP' ? '£' : '€';

  // Filtered by status tab
  const tabFiltered = meetings.filter((m) => {
    if (activeFilter === 'CONCLUDED') return m.status === 'ENDED';
    if (activeFilter === 'PREPARED') return m.status === 'PREPARED' && !m.is_missed;
    if (activeFilter === 'MISSED') return m.is_missed;
    return true;
  });

  // Filtered by search query
  const filteredMeetings = tabFiltered.filter((m) =>
    m.title.toLowerCase().includes(search.toLowerCase())
  );

  const concludedMeetings = meetings.filter((m) => m.status === 'ENDED');
  const totalCost = concludedMeetings.reduce(
    (acc, curr) => acc + (curr.total_estimated_cost || curr.accumulated_cost || 0),
    0
  );
  const totalDuration = concludedMeetings.reduce((acc, curr) => acc + (curr.total_duration_seconds || curr.elapsed_seconds || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <History className="w-6 h-6 text-brand-primary" />
            <h1 className="text-2xl font-extrabold text-ink-primary">Private Meeting Archives</h1>
          </div>
          <p className="text-xs sm:text-sm text-ink-secondary mt-1">
            Complete archival record of your live sessions, post-hoc manual entries, prepared schedules, and receipts.
          </p>
        </div>

        <div className="flex items-center space-x-3 text-xs font-mono bg-surface-card border border-border-subtle px-4 py-2 rounded-xl">
          <Shield className="w-4 h-4 text-brand-primary" />
          <span className="text-ink-secondary">Protected Creator Archives</span>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface-card border border-border-subtle p-4 rounded-xl">
          <span className="text-[10px] font-mono text-ink-muted uppercase">Meetings Concluded</span>
          <div className="text-2xl font-mono font-bold text-ink-primary mt-1">{concludedMeetings.length}</div>
        </div>
        <div className="bg-surface-card border border-border-subtle p-4 rounded-xl">
          <span className="text-[10px] font-mono text-ink-muted uppercase">Total Synchronous Time</span>
          <div className="text-2xl font-mono font-bold text-ink-primary mt-1">{formatDuration(totalDuration)}</div>
        </div>
        <div className="bg-surface-card border border-border-subtle p-4 rounded-xl">
          <span className="text-[10px] font-mono text-ink-muted uppercase">Cumulative Estimated Spend</span>
          <div className="text-2xl font-mono font-bold text-brand-primary mt-1">
            {currencySymbol}{totalCost.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Search Bar and Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface-card p-3 sm:p-4 rounded-xl border border-border-subtle">
        {/* Filter Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setActiveFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeFilter === 'ALL'
                ? 'bg-brand-primary text-[#090A0F]'
                : 'bg-surface-elevated text-ink-secondary hover:text-ink-primary'
            }`}
          >
            All ({meetings.length})
          </button>
          <button
            onClick={() => setActiveFilter('CONCLUDED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeFilter === 'CONCLUDED'
                ? 'bg-brand-primary text-[#090A0F]'
                : 'bg-surface-elevated text-ink-secondary hover:text-ink-primary'
            }`}
          >
            Concluded ({concludedMeetings.length})
          </button>
          <button
            onClick={() => setActiveFilter('PREPARED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeFilter === 'PREPARED'
                ? 'bg-brand-primary text-[#090A0F]'
                : 'bg-surface-elevated text-ink-secondary hover:text-ink-primary'
            }`}
          >
            Prepared ({meetings.filter((m) => m.status === 'PREPARED' && !m.is_missed).length})
          </button>
          <button
            onClick={() => setActiveFilter('MISSED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              activeFilter === 'MISSED'
                ? 'bg-brand-primary text-[#090A0F]'
                : 'bg-surface-elevated text-ink-secondary hover:text-ink-primary'
            }`}
          >
            Missed ({meetings.filter((m) => m.is_missed).length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-ink-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search archive..."
            className="w-full pl-9 pr-3 py-1.5 bg-surface-inset border border-border-subtle focus:border-brand-primary rounded-lg text-xs text-ink-primary focus:outline-none"
          />
        </div>
      </div>

      {/* History Table */}
      <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 shadow-xl space-y-4">
        {loading ? (
          <div className="py-12 text-center text-xs font-mono text-ink-muted">Loading meeting archives...</div>
        ) : filteredMeetings.length === 0 ? (
          <div className="py-12 text-center space-y-2 border border-dashed border-border-subtle rounded-xl">
            <p className="text-sm text-ink-secondary">No records found matching your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-border-subtle text-ink-muted uppercase">
                  <th className="pb-3 font-semibold">Meeting & Provenance</th>
                  <th className="pb-3 font-semibold">Date / Scheduled</th>
                  <th className="pb-3 font-semibold">Duration</th>
                  <th className="pb-3 font-semibold">Participant Cost</th>
                  <th className="pb-3 font-semibold">External Cost</th>
                  <th className="pb-3 font-semibold text-right">Total Est. Cost</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filteredMeetings.map((m) => {
                  const isConcluded = m.status === 'ENDED';
                  const isManual = m.provenance === 'MANUAL_ENTRY';
                  const isMissed = m.is_missed;
                  const isPrepared = m.status === 'PREPARED' && !isMissed;
                  const partCost = m.participant_cost_total || m.accumulated_cost || 0;
                  const extCost = m.external_cost_total || 0;
                  const totCost = m.total_estimated_cost || (partCost + extCost);
                  const durSeconds = m.total_duration_seconds || m.elapsed_seconds || 0;

                  return (
                    <tr key={m.id} className="hover:bg-surface-elevated/40 transition-colors">
                      <td className="py-3.5 pr-2">
                        <div className="font-semibold text-ink-primary font-sans text-sm">{m.title}</div>
                        <div className="flex items-center space-x-1.5 mt-1 flex-wrap gap-1">
                          {isMissed ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-400 text-[10px] font-bold">
                              MISSED / NOT HELD
                            </span>
                          ) : isPrepared ? (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/15 border border-blue-500/40 text-blue-400 text-[10px] font-bold">
                              PREPARED
                            </span>
                          ) : isManual ? (
                            <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/40 text-cyan-400 text-[10px] font-bold">
                              MANUAL ENTRY
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold">
                              LIVE
                            </span>
                          )}

                          {m.is_recurring && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/15 border border-purple-500/40 text-purple-400 text-[10px] font-bold flex items-center space-x-1">
                              <Repeat className="w-3 h-3" />
                              <span>RECURRING</span>
                            </span>
                          )}

                          {m.unknown_cost_count > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-status-unknown/15 text-status-unknown text-[10px]">
                              {m.unknown_cost_count} unknown rate{m.unknown_cost_count > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 text-ink-secondary">
                        {m.planned_date ? (
                          <div>
                            <div>{m.planned_date}</div>
                            {m.planned_time && <div className="text-[10px] text-ink-muted">{m.planned_time}</div>}
                          </div>
                        ) : (
                          new Date(m.created_at).toLocaleDateString()
                        )}
                      </td>

                      <td className="py-3.5 text-ink-secondary">
                        {isMissed ? (
                          <span className="text-ink-muted italic">Not held</span>
                        ) : isPrepared ? (
                          <span className="text-ink-muted italic">Pending start</span>
                        ) : (
                          formatDuration(durSeconds)
                        )}
                      </td>

                      <td className="py-3.5 text-ink-secondary">
                        {isPrepared || isMissed ? '-' : `${currencySymbol}${partCost.toFixed(2)}`}
                      </td>

                      <td className="py-3.5 text-brand-cyan">
                        {extCost > 0 ? `${currencySymbol}${extCost.toFixed(2)}` : '-'}
                      </td>

                      <td className="py-3.5 text-right font-extrabold text-brand-primary text-sm">
                        {isPrepared || isMissed ? '-' : `${currencySymbol}${totCost.toFixed(2)}`}
                      </td>

                      <td className="py-3.5 text-right">
                        <div className="inline-flex items-center space-x-1.5">
                          {isConcluded && (
                            <>
                              <button
                                onClick={() => onNavigate('receipt', m.id)}
                                className="px-2.5 py-1 rounded bg-surface-elevated hover:bg-surface-bright text-brand-primary border border-border-subtle text-[11px] font-semibold transition-all inline-flex items-center space-x-1"
                                title="View Thermal Receipt"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>Receipt</span>
                              </button>
                              <button
                                onClick={() => downloadCsv(m.id)}
                                className="p-1.5 rounded bg-surface-elevated hover:bg-surface-bright text-ink-muted hover:text-ink-primary border border-border-subtle transition-all"
                                title="Download CSV"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {isPrepared && (
                            <button
                              onClick={() => handleStartPrepared(m.id)}
                              disabled={actionLoading === m.id}
                              className="px-2.5 py-1 rounded bg-brand-primary hover:bg-brand-primary/90 text-[#090A0F] font-bold text-[11px] transition-all inline-flex items-center space-x-1 shadow-glow-emerald"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>Start Live</span>
                            </button>
                          )}

                          {m.is_recurring && (
                            <button
                              onClick={() => handleDuplicateRecurring(m.id)}
                              disabled={actionLoading === m.id}
                              className="p-1.5 rounded bg-surface-elevated hover:bg-surface-bright text-purple-400 border border-purple-500/30 transition-all"
                              title="Duplicate next recurring meeting"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {isMissed && (
                            <button
                              onClick={() => onNavigate('manual')}
                              className="px-2.5 py-1 rounded bg-surface-elevated hover:bg-surface-bright text-brand-cyan border border-brand-cyan/30 text-[11px] font-semibold transition-all inline-flex items-center space-x-1"
                              title="Reconstruct as Manual Entry"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Reconstruct</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
