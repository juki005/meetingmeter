import React, { useState } from 'react';
import { useAuth } from './context/AuthContext.tsx';
import { Navbar } from './components/Navbar.tsx';
import { AuthPage } from './pages/AuthPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { PeoplePage } from './pages/PeoplePage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { MeetingConfigPage } from './pages/MeetingConfigPage.tsx';
import { LiveMeterPage } from './pages/LiveMeterPage.tsx';
import { MeetingReceiptPage } from './pages/MeetingReceiptPage.tsx';
import { HistoryPage } from './pages/HistoryPage.tsx';
import { CostLibraryPage } from './pages/CostLibraryPage.tsx';
import { ManualEntryPage } from './pages/ManualEntryPage.tsx';

export const App: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center font-mono text-xs text-brand-primary">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand-primary border-t-transparent animate-spin" />
          <span>Initializing MeetingMeter Telemetry...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const handleNavigate = (tab: string, meetingId?: string) => {
    setCurrentTab(tab);
    if (meetingId) {
      setSelectedMeetingId(meetingId);
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-ink-primary flex flex-col font-sans">
      <Navbar
        currentTab={currentTab}
        onSelectTab={(tab) => handleNavigate(tab)}
        activeMeetingId={selectedMeetingId}
      />

      <main className="flex-1 pb-16">
        {currentTab === 'dashboard' && <DashboardPage onNavigate={handleNavigate} />}
        {currentTab === 'config' && (
          <MeetingConfigPage
            onStartMeeting={(id) => handleNavigate('live', id)}
            onPreparedSaved={() => handleNavigate('dashboard')}
          />
        )}
        {currentTab === 'manual' && (
          <ManualEntryPage
            onSaved={(id) => handleNavigate('receipt', id)}
            onCancel={() => handleNavigate('dashboard')}
          />
        )}
        {currentTab === 'cost-library' && <CostLibraryPage />}
        {currentTab === 'live' && selectedMeetingId && (
          <LiveMeterPage
            meetingId={selectedMeetingId}
            onMeetingEnded={(id) => handleNavigate('receipt', id)}
          />
        )}
        {currentTab === 'receipt' && selectedMeetingId && (
          <MeetingReceiptPage meetingId={selectedMeetingId} onNavigate={handleNavigate} />
        )}
        {currentTab === 'people' && <PeoplePage />}
        {currentTab === 'history' && <HistoryPage onNavigate={handleNavigate} />}
        {currentTab === 'profile' && <ProfilePage />}
      </main>

      {/* Persistent Footer */}
      <footer className="border-t border-border-subtle/60 py-4 px-6 text-center text-xs font-mono text-ink-muted bg-surface-card/40">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>MeetingMeter v1.1 • Executive Telemetry HUD</span>
          <span className="text-[11px] text-ink-muted">Estimated calculation only. Not official payroll/billing.</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
