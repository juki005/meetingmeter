import React from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { Activity, Users, History, UserCheck, LogOut, PlusCircle } from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  activeMeetingId?: string | null;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onSelectTab, activeMeetingId }) => {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border-subtle bg-surface-card/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-2 sm:space-x-3 cursor-pointer flex-shrink-0" onClick={() => onSelectTab('dashboard')}>
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center text-brand-primary shadow-glow-emerald">
            <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-base sm:text-lg tracking-tight text-ink-primary">
                Meeting<span className="text-brand-primary">Meter</span>
              </span>
              <span className="px-1 py-0.5 text-[9px] font-mono uppercase bg-surface-inset border border-border-subtle text-ink-muted rounded">
                v1.0
              </span>
            </div>
          </div>
        </div>

        {/* Center Navigation Links */}
        <nav className="flex items-center space-x-1">
          <button
            onClick={() => onSelectTab('dashboard')}
            className={`px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center space-x-1 sm:space-x-1.5 ${
              currentTab === 'dashboard'
                ? 'bg-surface-elevated text-brand-primary border border-brand-primary/30 shadow-sm'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-elevated/50'
            }`}
          >
            <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline sm:inline">Cockpit</span>
          </button>

          <button
            onClick={() => onSelectTab('config')}
            className={`px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center space-x-1 sm:space-x-1.5 ${
              currentTab === 'config'
                ? 'bg-surface-elevated text-brand-primary border border-brand-primary/30 shadow-sm'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-elevated/50'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>New Meter</span>
          </button>

          <button
            onClick={() => onSelectTab('people')}
            className={`px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center space-x-1 sm:space-x-1.5 ${
              currentTab === 'people'
                ? 'bg-surface-elevated text-brand-primary border border-brand-primary/30 shadow-sm'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-elevated/50'
            }`}
          >
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Roster</span>
          </button>

          <button
            onClick={() => onSelectTab('history')}
            className={`px-2 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center space-x-1 sm:space-x-1.5 ${
              currentTab === 'history'
                ? 'bg-surface-elevated text-brand-primary border border-brand-primary/30 shadow-sm'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-elevated/50'
            }`}
          >
            <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>History</span>
          </button>
        </nav>

        {/* Right user & profile */}
        <div className="flex items-center space-x-1 sm:space-x-3">
          {user && (
            <button
              onClick={() => onSelectTab('profile')}
              data-testid="profile-btn"
              className="flex items-center space-x-2 cursor-pointer p-1.5 rounded-lg hover:bg-surface-elevated border border-transparent hover:border-border-subtle transition-all"
              title="View & Edit Profile"
              aria-label="View Profile"
            >
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-brand-secondary/20 border border-brand-secondary/40 flex items-center justify-center text-xs font-mono font-bold text-ink-primary">
                {user.name.substring(0, 2).toUpperCase()}
              </div>
              <div className="hidden md:block text-left">
                <div className="text-xs font-semibold text-ink-primary leading-tight">{user.name}</div>
                <div className="text-[10px] font-mono text-brand-primary">{user.hourly_rate} {user.currency}/hr</div>
              </div>
            </button>
          )}

          <button
            onClick={logout}
            className="p-1.5 sm:p-2 rounded-lg text-ink-muted hover:text-status-danger hover:bg-status-danger/10 border border-transparent hover:border-status-danger/30 transition-all"
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
