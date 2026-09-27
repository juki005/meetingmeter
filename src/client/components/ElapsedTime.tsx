import React from 'react';
import { Clock } from 'lucide-react';
import { formatDuration } from '../utils/export.ts';

interface ElapsedTimeProps {
  seconds: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const ElapsedTime: React.FC<ElapsedTimeProps> = ({ seconds, label = 'Elapsed Time', size = 'md' }) => {
  return (
    <div className="flex items-center space-x-2 bg-surface-elevated/60 px-3 py-1.5 rounded-lg border border-border-subtle">
      <Clock className="w-4 h-4 text-brand-primary" />
      <span className="text-xs font-mono text-ink-muted uppercase">{label}:</span>
      <span className="text-sm sm:text-base font-mono font-bold text-ink-primary font-mono-tabular">
        {formatDuration(seconds)}
      </span>
    </div>
  );
};
