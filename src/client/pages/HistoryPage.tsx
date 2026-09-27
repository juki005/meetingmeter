import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../utils/api.ts';
import { Meeting } from '../types/index.ts';
import { formatDuration, downloadCsv } from '../utils/export.ts';
import { History, Search, FileText, Download, Shield, Clock, HelpCircle, ArrowRight } from 'lucide-react';

interface HistoryPageProps {
  onNavigate: (tab: string, meetingId?: string) => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchMeetings = async () => {
    try {
      const data = await apiRequest<{ meetings: Meeting[] }>('/meetings');
      setMeetings(data.meetings.filter((m) => m.status === 'ENDED'));
    } catch (err) {
      console.error('Failed to load meeting history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, []);

  const currencySymbol = user?.currency === 'EUR' ? '€' : user?.currency === 'USD' ? '$' : user?.currency === 'GBP' ? '£' : '€';

  const filteredMeetings = meetings.filter((m) =>
    m.title.toLowerCase().includes(search.toLowerCase())
  );

  const totalCost = meetings.reduce((acc, curr) => acc + (curr.accumulated_cost || 0), 0);
  const totalDuration = meetings.reduce((acc, curr) => acc + (curr.total_duration_seconds || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <History className="w-6 h-6 text-brand-primary" />
            <h1 className="text-2xl font-extrabold text-ink-primary">Private Meeting History</h1>
          </div>
          <p className="text-xs sm:text-sm text-ink-secondary mt-1">
            Archival record of your finalized meeting sessions, immutable cost snapshots, and receipts.
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
          <div className="text-2xl font-mono font-bold text-ink-primary mt-1">{meetings.length}</div>
        </div>
        <div className="bg-surface-card border border-border-subtle p-4 rounded-xl">
          <span className="text-[10px] font-mono text-ink-muted uppercase">Total Synchronous Time</span>
          <div className="text-2xl font-mono font-bold text-ink-primary mt-1">{formatDuration(totalDuration)}</div>
        </div>
        <div className="bg-surface-card border border-border-subtle p-4 rounded-xl">
          <span className="text-[10px] font-mono text-ink-muted uppercase">Cumulative Estimated Spend</span>
          <div className="text-2xl font-mono font-bold text-brand-primary mt-1">{currencySymbol}{totalCost.toFixed(2)}</div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-surface-card p-4 rounded-xl border border-border-subtle flex items-center">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-ink-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search meetings by title..."
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
            <p className="text-sm text-ink-secondary">No concluded meetings found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-border-subtle text-ink-muted uppercase">
                  <th className="pb-3 font-semibold">Meeting Title</th>
                  <th className="pb-3 font-semibold">Date Concluded</th>
                  <th className="pb-3 font-semibold">Duration</th>
                  <th className="pb-3 font-semibold">Unknowns</th>
                  <th className="pb-3 font-semibold text-right">Final Estimated Cost</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filteredMeetings.map((m) => (
                  <tr key={m.id} className="hover:bg-surface-elevated/40 transition-colors">
                    <td className="py-3.5 font-semibold text-ink-primary font-sans text-sm">{m.title}</td>
                    <td className="py-3.5 text-ink-secondary">{new Date(m.created_at).toLocaleString()}</td>
                    <td className="py-3.5 text-ink-secondary">{formatDuration(m.total_duration_seconds)}</td>
                    <td className="py-3.5">
                      {m.unknown_cost_count > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-status-unknown/15 text-status-unknown text-[10px]">
                          {m.unknown_cost_count} unknown
                        </span>
                      ) : (
                        <span className="text-ink-muted">-</span>
                      )}
                    </td>
                    <td className="py-3.5 text-right font-extrabold text-brand-primary text-sm">
                      {currencySymbol}{m.accumulated_cost.toFixed(2)}
                    </td>
                    <td className="py-3.5 text-right">
                      <div className="inline-flex items-center space-x-1.5">
                        <button
                          onClick={() => onNavigate('receipt', m.id)}
                          className="px-2.5 py-1 rounded bg-surface-elevated hover:bg-surface-bright text-brand-primary border border-border-subtle text-[11px] font-semibold transition-all inline-flex items-center space-x-1"
                          title="View Fiscal Receipt"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Receipt</span>
                        </button>
                        <button
                          onClick={() => downloadCsv(m.id)}
                          className="p-1 rounded bg-surface-elevated hover:bg-surface-bright text-ink-muted hover:text-ink-primary border border-border-subtle transition-all"
                          title="Download CSV"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
