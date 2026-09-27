import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { apiRequest } from '../utils/api.ts';
import { Receipt } from '../types/index.ts';
import { ReceiptSummary } from '../components/ReceiptSummary.tsx';
import { ArrowLeft, PlusCircle, History, Sparkles } from 'lucide-react';

interface MeetingReceiptPageProps {
  meetingId: string;
  onNavigate: (tab: string, meetingId?: string) => void;
}

export const MeetingReceiptPage: React.FC<MeetingReceiptPageProps> = ({ meetingId, onNavigate }) => {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ receipt: Receipt }>(`/meetings/${meetingId}/receipt`)
      .then((data) => {
        setReceipt(data.receipt);
        // Trigger celebratory confetti for successfully surviving the meeting
        try {
          confetti({
            particleCount: 70,
            spread: 60,
            origin: { y: 0.7 },
            colors: ['#10B981', '#00F0FF', '#0D9488', '#F59E0B'],
          });
        } catch (_) {}
      })
      .catch((err: any) => {
        setError(err.message || 'Failed to load receipt');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [meetingId]);

  if (loading) {
    return (
      <div className="py-24 text-center font-mono text-xs text-ink-muted">
        Generating fiscal receipt...
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <div className="p-4 bg-status-danger/10 border border-status-danger/40 rounded-xl text-status-danger text-sm font-mono">
          {error || 'Receipt not found'}
        </div>
        <button
          onClick={() => onNavigate('dashboard')}
          className="text-xs font-semibold text-brand-primary hover:underline"
        >
          Return to Cockpit
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Navigation / Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          onClick={() => onNavigate('dashboard')}
          className="inline-flex items-center space-x-2 text-xs font-semibold text-ink-secondary hover:text-ink-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Cockpit</span>
        </button>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onNavigate('config')}
            className="px-4 py-2 rounded-xl bg-brand-primary text-[#090A0F] font-bold text-xs flex items-center space-x-1.5 shadow-glow-emerald"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Meeting Meter</span>
          </button>
          <button
            onClick={() => onNavigate('history')}
            className="px-3 py-2 rounded-xl bg-surface-card hover:bg-surface-elevated text-ink-secondary hover:text-ink-primary border border-border-subtle text-xs font-semibold flex items-center space-x-1.5"
          >
            <History className="w-4 h-4" />
            <span>All History</span>
          </button>
        </div>
      </div>

      {/* Main Thermal Receipt Summary Component */}
      <ReceiptSummary receipt={receipt} />
    </div>
  );
};
