import React from 'react';
import { Participant } from '../types/index.ts';
import { formatDuration } from '../utils/export.ts';
import { Pause, Play, LogOut, User, Building, HelpCircle } from 'lucide-react';

interface ParticipantRowProps {
  participant: Participant;
  currency: string;
  isMeetingLive: boolean;
  onPause?: (participantId: string) => void;
  onResume?: (participantId: string) => void;
  onLeave?: (participantId: string) => void;
}

export const ParticipantRow: React.FC<ParticipantRowProps> = ({
  participant,
  currency,
  isMeetingLive,
  onPause,
  onResume,
  onLeave,
}) => {
  const currencySymbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency;

  return (
    <div
      className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
        participant.state === 'ACTIVE'
          ? 'bg-surface-card border-brand-primary/30 shadow-sm'
          : participant.state === 'PAUSED'
          ? 'bg-surface-card/60 border-status-paused/30'
          : 'bg-surface-card/30 border-border-subtle opacity-70'
      }`}
    >
      {/* Left: Avatar and Info */}
      <div className="flex items-start sm:items-center space-x-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-xs flex-shrink-0 ${
            participant.state === 'ACTIVE'
              ? 'bg-brand-primary/15 text-brand-primary border border-brand-primary/40'
              : participant.state === 'PAUSED'
              ? 'bg-status-paused/15 text-status-paused border border-status-paused/40'
              : 'bg-surface-inset text-ink-muted border border-border-subtle'
          }`}
        >
          {participant.name.substring(0, 2).toUpperCase()}
        </div>

        <div>
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <span className="font-semibold text-sm sm:text-base text-ink-primary">{participant.name}</span>
            {participant.is_guest && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-status-unknown/20 border border-status-unknown/40 text-status-unknown">
                Guest
              </span>
            )}
            {/* Status Badge */}
            {participant.state === 'ACTIVE' && (
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-status-active/15 border border-status-active/40 text-status-active">
                <span className="w-1.5 h-1.5 rounded-full bg-status-active animate-pulse-live" />
                <span>ACTIVE</span>
              </span>
            )}
            {participant.state === 'PAUSED' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-status-paused/15 border border-status-paused/40 text-status-paused">
                <span>PAUSED</span>
              </span>
            )}
            {participant.state === 'LEFT' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-status-left/15 border border-status-left/40 text-status-left">
                <span>LEFT</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3 text-xs text-ink-secondary mt-0.5">
            {participant.role && <span>{participant.role}</span>}
            {participant.organization && (
              <span className="flex items-center space-x-1 text-ink-muted">
                <Building className="w-3 h-3" />
                <span>{participant.organization}</span>
              </span>
            )}
            <span className="font-mono text-ink-muted">
              {participant.rate_known && participant.hourly_rate_snapshot !== null ? (
                `${currencySymbol}${participant.hourly_rate_snapshot.toFixed(2)}/hr`
              ) : (
                <span className="text-status-unknown flex items-center space-x-1">
                  <HelpCircle className="w-3 h-3 inline" />
                  <span>Rate Unknown</span>
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Timing, Cost & Controls */}
      <div className="flex items-center justify-between sm:justify-end space-x-4 border-t sm:border-t-0 pt-2 sm:pt-0 border-border-subtle">
        {/* Measured Time */}
        <div className="text-left sm:text-right">
          <div className="text-[10px] font-mono text-ink-muted uppercase">Measured Time</div>
          <div className="text-sm font-mono font-bold text-ink-primary font-mono-tabular">
            {formatDuration(participant.measured_seconds)}
          </div>
        </div>

        {/* Accrued Cost */}
        <div className="text-left sm:text-right min-w-[80px]">
          <div className="text-[10px] font-mono text-ink-muted uppercase">Accrued Cost</div>
          <div className="text-sm sm:text-base font-mono font-extrabold text-ink-primary font-mono-tabular">
            {participant.rate_known && participant.calculated_cost !== null ? (
              `${currencySymbol}${participant.calculated_cost.toFixed(2)}`
            ) : (
              <span className="text-xs font-mono text-status-unknown">UNKNOWN</span>
            )}
          </div>
        </div>

        {/* Action buttons (only if meeting is LIVE) */}
        {isMeetingLive && participant.state !== 'LEFT' && (
          <div className="flex items-center space-x-1 pl-2">
            {participant.state === 'ACTIVE' ? (
              <button
                onClick={() => onPause && onPause(participant.id)}
                className="p-2 rounded-lg bg-surface-elevated hover:bg-status-paused/20 text-status-paused border border-border-subtle hover:border-status-paused/40 transition-all"
                title="Pause Participant (stops cost accumulation)"
                aria-label="Pause participant"
              >
                <Pause className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => onResume && onResume(participant.id)}
                className="p-2 rounded-lg bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary border border-brand-primary/40 transition-all"
                title="Resume Participant (resumes cost accumulation)"
                aria-label="Resume participant"
              >
                <Play className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={() => onLeave && onLeave(participant.id)}
              className="p-2 rounded-lg bg-surface-elevated hover:bg-status-danger/20 text-ink-muted hover:text-status-danger border border-border-subtle hover:border-status-danger/40 transition-all"
              title="Mark Participant as Left Meeting"
              aria-label="Mark participant as left"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
