import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../utils/api.ts';
import { Meeting } from '../types/index.ts';
import { formatDuration } from '../utils/export.ts';
import { Activity, PlusCircle, History, Clock, Users, ArrowRight, Play, FileText, Calendar, Repeat, Copy, Trash2, FileSpreadsheet, Sparkles, BookmarkPlus } from 'lucide-react';

interface DashboardPageProps {
  onNavigate: (tab: string, meetingId?: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMeetings = () => {
    setLoading(true);
    apiRequest<{ meetings: Meeting[] }>('/meetings')
      .then((data) => setMeetings(data.meetings))
      .catch((err) => console.error('Error fetching meetings:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadMeetings();
  }, []);

  const handleStartPrepared = async (id: string) => {
    try {
      await apiRequest(`/meetings/${id}/start`, { method: 'POST' });
      onNavigate('live', id);
    } catch (err: any) {
      alert('Failed to start meeting: ' + err.message);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await apiRequest(`/meetings/${id}/duplicate`, { method: 'POST' });
      loadMeetings();
    } catch (err: any) {
      alert('Failed to duplicate meeting: ' + err.message);
    }
  };

  const handleDeletePrepared = async (id: string) => {
    if (!window.confirm('Delete this prepared meeting?')) return;
    try {
      await apiRequest(`/meetings/${id}`, { method: 'DELETE' });
      loadMeetings();
    } catch (err: any) {
      alert('Failed to delete meeting: ' + err.message);
    }
  };

  const liveMeetings = meetings.filter((m) => m.status === 'LIVE');
  const preparedMeetings = meetings.filter((m) => (m.status === 'PREPARED' || m.status === 'CONFIGURED') && !m.is_missed);
  const missedMeetings = meetings.filter((m) => m.is_missed);
  const concludedMeetings = meetings.filter((m) => m.status === 'ENDED');

  const totalSpent = concludedMeetings.reduce((acc, curr) => acc + (curr.total_estimated_cost || curr.accumulated_cost || 0), 0);
  const totalDuration = concludedMeetings.reduce((acc, curr) => acc + (curr.total_duration_seconds || 0), 0);

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header HUD Banner */}
      <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden shadow-xl">
        <div className="space-y-1 relative z-10">
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/30 text-brand-primary text-xs font-mono mb-2">
            <span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse-live" />
            <span>OPERATIONAL COCKPIT</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink-primary tracking-tight">
            Welcome back, {user?.name}
          </h1>
          <p className="text-sm text-ink-secondary max-w-xl">
            Real-time telemetry, prepared agendas, and retrospective meeting cost intelligence for executive leadership.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <button
            onClick={() => onNavigate('config')}
            className="px-4 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover text-[#090A0F] font-bold text-xs flex items-center space-x-2 shadow-glow-emerald transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Live / Prepare</span>
          </button>

          <button
            onClick={() => onNavigate('manual')}
            className="px-4 py-2.5 rounded-xl bg-surface-elevated hover:bg-surface-bright text-brand-cyan border border-brand-cyan/30 font-bold text-xs flex items-center space-x-2 transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Manual Entry</span>
          </button>
        </div>
      </div>

      {/* Live Active Running Sessions if Any */}
      {liveMeetings.length > 0 && (
        <div className="bg-status-active/10 border border-status-active/40 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-status-active font-mono font-bold text-sm">
              <span className="w-3 h-3 rounded-full bg-status-active animate-pulse-live" />
              <span>ACTIVE RUNNING SESSION IN PROGRESS</span>
            </div>
            <span className="text-xs font-mono text-ink-muted">{liveMeetings.length} active</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {liveMeetings.map((m) => (
              <div
                key={m.id}
                className="bg-surface-card border border-brand-primary/40 rounded-xl p-4 flex items-center justify-between shadow-lg"
              >
                <div>
                  <div className="font-bold text-base text-ink-primary">{m.title}</div>
                  <div className="text-xs font-mono text-brand-primary mt-1">
                    Running • €{Number(m.total_estimated_cost || m.accumulated_cost || 0).toFixed(2)} accumulated
                  </div>
                </div>
                <button
                  onClick={() => onNavigate('live', m.id)}
                  className="px-4 py-2 rounded-lg bg-brand-primary text-[#090A0F] font-bold text-xs flex items-center space-x-1 shadow-glow-emerald cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Enter Cockpit</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prepared Meetings Section */}
      {preparedMeetings.length > 0 && (
        <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 space-y-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <BookmarkPlus className="w-5 h-5 text-brand-primary" />
              <h2 className="text-base font-bold text-ink-primary">Upcoming Prepared Meetings</h2>
            </div>
            <span className="text-xs font-mono text-ink-muted">{preparedMeetings.length} saved</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {preparedMeetings.map((m) => (
              <div key={m.id} className="p-4 bg-surface-inset border border-border-subtle rounded-xl flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-sm text-ink-primary">{m.title}</div>
                    {m.is_recurring && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-brand-primary/20 text-brand-primary border border-brand-primary/30 flex items-center space-x-1 flex-shrink-0">
                        <Repeat className="w-3 h-3" />
                        <span>Recurring</span>
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-ink-secondary mt-1 flex items-center space-x-2">
                    <Calendar className="w-3.5 h-3.5 text-ink-muted" />
                    <span>{m.planned_date || 'Date TBD'} {m.planned_time ? `at ${m.planned_time}` : ''}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-border-subtle flex items-center justify-between">
                  <div className="flex items-center space-x-1">
                    {m.is_recurring && (
                      <button
                        onClick={() => handleDuplicate(m.id)}
                        className="p-1.5 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-elevated transition-all"
                        title="Duplicate Occurrence"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeletePrepared(m.id)}
                      className="p-1.5 rounded-lg text-ink-muted hover:text-status-danger hover:bg-status-danger/10 transition-all"
                      title="Delete Prepared Meeting"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <button
                    onClick={() => handleStartPrepared(m.id)}
                    className="px-3 py-1.5 rounded-lg bg-brand-primary text-[#090A0F] font-bold text-xs flex items-center space-x-1 shadow-glow-emerald cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Start Meter</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface-card border border-border-subtle p-5 rounded-xl">
          <div className="flex items-center justify-between text-xs font-mono text-ink-muted uppercase">
            <span>Total Concluded</span>
            <History className="w-4 h-4 text-brand-primary" />
          </div>
          <div className="text-2xl sm:text-3xl font-mono font-extrabold text-ink-primary mt-2">
            {concludedMeetings.length}
          </div>
          <div className="text-[11px] text-ink-secondary mt-1">Saved to private history</div>
        </div>

        <div className="bg-surface-card border border-border-subtle p-5 rounded-xl">
          <div className="flex items-center justify-between text-xs font-mono text-ink-muted uppercase">
            <span>Cumulative Spend</span>
            <Activity className="w-4 h-4 text-brand-cyan" />
          </div>
          <div className="text-2xl sm:text-3xl font-mono font-extrabold text-brand-primary mt-2">
            €{totalSpent.toFixed(2)}
          </div>
          <div className="text-[11px] text-ink-secondary mt-1">Estimated meeting cost (EUR)</div>
        </div>

        <div className="bg-surface-card border border-border-subtle p-5 rounded-xl">
          <div className="flex items-center justify-between text-xs font-mono text-ink-muted uppercase">
            <span>Total Measured Time</span>
            <Clock className="w-4 h-4 text-status-paused" />
          </div>
          <div className="text-2xl sm:text-3xl font-mono font-extrabold text-ink-primary mt-2">
            {formatDuration(totalDuration)}
          </div>
          <div className="text-[11px] text-ink-secondary mt-1">Synchronous hours logged</div>
        </div>

        <div className="bg-surface-card border border-border-subtle p-5 rounded-xl">
          <div className="flex items-center justify-between text-xs font-mono text-ink-muted uppercase">
            <span>Personal Base Rate</span>
            <Users className="w-4 h-4 text-brand-secondary" />
          </div>
          <div className="text-2xl sm:text-3xl font-mono font-extrabold text-ink-primary mt-2">
            €{user?.hourly_rate.toFixed(2)}<span className="text-xs text-ink-muted">/hr</span>
          </div>
          <div className="text-[11px] text-ink-secondary mt-1">{user?.job_title || 'Organizer'}</div>
        </div>
      </div>

      {/* Recent History Table */}
      <div className="bg-surface-card border border-border-subtle rounded-2xl p-6 space-y-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink-primary">Recent Meeting Archives</h2>
            <p className="text-xs text-ink-secondary">Past live sessions, manual entries, and fiscal receipts</p>
          </div>
          <button
            onClick={() => onNavigate('history')}
            className="text-xs font-semibold text-brand-primary hover:text-brand-primary-hover flex items-center space-x-1"
          >
            <span>View All History</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs font-mono text-ink-muted">Loading telemetry data...</div>
        ) : concludedMeetings.length === 0 ? (
          <div className="py-12 text-center space-y-2 border border-dashed border-border-subtle rounded-xl">
            <p className="text-sm text-ink-secondary">No meetings recorded yet.</p>
            <p className="text-xs text-ink-muted">Click "+ New Live / Prepare" above or "Manual Entry" to record a meeting.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-border-subtle text-ink-muted uppercase">
                  <th className="pb-3 font-semibold">Meeting Title</th>
                  <th className="pb-3 font-semibold">Provenance</th>
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold">Duration</th>
                  <th className="pb-3 font-semibold text-right">Final Estimated Cost</th>
                  <th className="pb-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {concludedMeetings.slice(0, 5).map((m) => (
                  <tr key={m.id} className="hover:bg-surface-elevated/40 transition-colors">
                    <td className="py-3 font-semibold text-ink-primary font-sans text-sm">{m.title}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono ${
                        m.provenance === 'MANUAL_ENTRY'
                          ? 'bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/30'
                          : 'bg-brand-primary/15 text-brand-primary border border-brand-primary/30'
                      }`}>
                        {m.provenance === 'MANUAL_ENTRY' ? 'Manual Entry' : 'Live Meter'}
                      </span>
                    </td>
                    <td className="py-3 text-ink-secondary">
                      {m.planned_date ? m.planned_date : new Date(m.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-ink-secondary">{formatDuration(m.total_duration_seconds)}</td>
                    <td className="py-3 text-right font-extrabold text-brand-primary text-sm">
                      €{Number(m.total_estimated_cost || m.accumulated_cost || 0).toFixed(2)}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => onNavigate('receipt', m.id)}
                        className="px-2.5 py-1 rounded bg-surface-elevated hover:bg-surface-bright text-brand-primary border border-border-subtle text-[11px] font-semibold transition-all inline-flex items-center space-x-1 cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Receipt</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
