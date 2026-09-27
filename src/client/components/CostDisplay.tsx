import React from 'react';

interface CostDisplayProps {
  cost: number;
  currency: string;
  isLive?: boolean;
  burnRatePerHour?: number;
  burnRatePerSecond?: number;
  unknownCount?: number;
  size?: 'sm' | 'md' | 'lg' | 'hero';
}

export const CostDisplay: React.FC<CostDisplayProps> = ({
  cost,
  currency,
  isLive = false,
  burnRatePerHour = 0,
  burnRatePerSecond = 0,
  unknownCount = 0,
  size = 'hero',
}) => {
  const currencySymbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency;

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-surface-inset border border-border-subtle rounded-2xl relative overflow-hidden">
      {/* Background ambient glow when live */}
      {isLive && (
        <div className="absolute inset-0 bg-radial-gradient from-brand-primary/10 via-transparent to-transparent pointer-events-none" />
      )}

      <div className="flex items-center space-x-2 text-xs font-mono uppercase tracking-widest text-ink-muted mb-2">
        {isLive && (
          <span className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-status-active/10 border border-status-active/30 text-status-active text-[10px]">
            <span className="w-2 h-2 rounded-full bg-status-active animate-pulse-live" />
            <span>MEASURING</span>
          </span>
        )}
        <span>Estimated Total Meeting Cost</span>
      </div>

      {/* Main Big Ticker Number */}
      <div className="flex items-baseline space-x-2 my-1">
        <span className="text-2xl sm:text-4xl font-mono font-light text-brand-primary">{currencySymbol}</span>
        <span className="text-5xl sm:text-7xl font-mono font-extrabold tracking-tight text-ink-primary font-mono-tabular">
          {cost.toFixed(2)}
        </span>
      </div>

      {/* Unknown Cost Disclaimer callout if any */}
      {unknownCount > 0 && (
        <div className="mt-2 px-3 py-1 rounded-full bg-status-unknown/15 border border-status-unknown/40 text-status-unknown text-xs font-mono flex items-center space-x-1.5">
          <span>+ {unknownCount} participant{unknownCount > 1 ? 's' : ''} with unknown cost</span>
        </div>
      )}

      {/* Telemetry sub-metrics */}
      {isLive && (
        <div className="mt-4 pt-4 border-t border-border-subtle w-full grid grid-cols-2 gap-4 text-center">
          <div className="bg-surface-elevated/40 p-2 rounded-lg border border-border-subtle/60">
            <span className="text-[10px] font-mono text-ink-muted uppercase block">Active Burn Rate</span>
            <span className="text-sm sm:text-base font-mono font-bold text-ink-primary">
              {currencySymbol}{burnRatePerHour.toFixed(2)}<span className="text-xs text-ink-muted font-normal">/hr</span>
            </span>
          </div>
          <div className="bg-surface-elevated/40 p-2 rounded-lg border border-border-subtle/60">
            <span className="text-[10px] font-mono text-ink-muted uppercase block">Burn Velocity</span>
            <span className="text-sm sm:text-base font-mono font-bold text-brand-cyan">
              {currencySymbol}{burnRatePerSecond.toFixed(4)}<span className="text-xs text-ink-muted font-normal">/sec</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
