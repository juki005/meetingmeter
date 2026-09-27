import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../utils/api.ts';
import { Meeting } from '../types/index.ts';
import { CostDisplay } from '../components/CostDisplay.tsx';
import { ElapsedTime } from '../components/ElapsedTime.tsx';
import { ParticipantRow } from '../components/ParticipantRow.tsx';
import { StopCircle, AlertTriangle, Users, Sparkles, Shield } from 'lucide-react';

interface LiveMeterPageProps {
  meetingId: string;
  onMeetingEnded: (meetingId: string) => void;
}

export const LiveMeterPage: React.FC<LiveMeterPageProps> = ({ meetingId, onMeetingEnded }) => {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEndModal, setShowEndModal] = useState(false);
  const [ending, setEnding] = useState(false);

  // Local tick interpolation
  const [tickSeconds, setTickSeconds] = useState(0);
  const [tickCost, setTickCost] = useState(0);

  // Fetch authoritative live state from server
  const fetchLiveState = async () => {
    try {
      const data = await apiRequest<{ meeting: Meeting }>(`/meetings/${meetingId}/live`);
      setMeeting(data.meeting);
      setTickSeconds(data.meeting.elapsed_seconds);
      setTickCost(data.meeting.accumulated_cost);

      if (data.meeting.status === 'ENDED') {
        onMeetingEnded(meetingId);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sync live state');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveState();

    // Reconcile with server every 3 seconds
    const serverInterval = setInterval(fetchLiveState, 3000);

    // Client interpolation tick every 1000ms for smooth live timer & cost display
    const tickInterval = setInterval(() => {
      setTickSeconds((prev) => prev + 1);
      setMeeting((currentMeeting) => {
        if (!currentMeeting || currentMeeting.status !== 'LIVE') return currentMeeting;
        setTickCost((prevCost) => prevCost + (currentMeeting.burn_rate_per_second || 0));
        return currentMeeting;
      });
    }, 1000);

    return () => {
      clearInterval(serverInterval);
      clearInterval(tickInterval);
    };
  }, [meetingId]);

  // Pause Participant
  const handlePause = async (participantId: string) => {
    try {
      const data = await apiRequest<{ meeting: Meeting }>(`/meetings/${meetingId}/pause`, {
        method: 'POST',
        body: JSON.stringify({ participant_id: participantId }),
      });
      setMeeting(data.meeting);
      setTickCost(data.meeting.accumulated_cost);
    } catch (err: any) {
      alert('Failed to pause participant: ' + err.message);
    }
  };

  // Resume Participant
  const handleResume = async (participantId: string) => {
    try {
      const data = await apiRequest<{ meeting: Meeting }>(`/meetings/${meetingId}/resume`, {
        method: 'POST',
        body: JSON.stringify({ participant_id: participantId }),
      });
      setMeeting(data.meeting);
      setTickCost(data.meeting.accumulated_cost);
    } catch (err: any) {
      alert('Failed to resume participant: ' + err.message);
    }
  };

  // Leave Participant
  const handleLeave = async (participantId: string) => {
    if (!window.confirm('Mark this participant as having left the meeting? Their measurement will end.')) return;
    try {
      const data = await apiRequest<{ meeting: Meeting }>(`/meetings/${meetingId}/leave`, {
        method: 'POST',
        body: JSON.stringify({ participant_id: participantId }),
      });
      setMeeting(data.meeting);
      setTickCost(data.meeting.accumulated_cost);
    } catch (err: any) {
      alert('Failed to mark participant left: ' + err.message);
    }
  };

  // End Meeting
  const handleEndMeeting = async () => {
    setEnding(true);
    try {
      await apiRequest<{ meeting: Meeting }>(`/meetings/${meetingId}/end`, {
        method: 'POST',
      });
      onMeetingEnded(meetingId);
    } catch (err: any) {
      alert('Failed to conclude meeting: ' + err.message);
      setEnding(false);
      setShowEndModal(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center space-y-3 font-mono text-xs text-ink-muted">
        <div className="w-8 h-8 rounded-full border-2 border-brand-primary border-t-transparent animate-spin mx-auto" />
        <p>Connecting to Live Telemetry Engine...</p>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center space-y-4">
        <div className="p-4 bg-status-danger/10 border border-status-danger/40 rounded-xl text-status-danger text-sm font-mono">
          {error || 'Meeting not found'}
        </div>
      </div>
    );
  }

  const activeParticipantsCount = meeting.participants.filter((p) => p.state === 'ACTIVE').length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Cockpit Top Bar */}
      <div className="bg-surface-card border border-border-subtle p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full bg-status-active/15 border border-status-active/40 text-status-active text-[11px] font-mono font-bold flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-status-active animate-pulse-live" />
              <span>LIVE METERING COCKPIT</span>
            </span>
            <span className="text-xs font-mono text-ink-muted">
              {activeParticipantsCount} of {meeting.participants.length} Active
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-ink-primary">{meeting.title}</h1>
        </div>

        <div className="flex items-center space-x-3">
          <ElapsedTime seconds={tickSeconds} label="Live Duration" />

          <button
            onClick={() => setShowEndModal(true)}
            className="px-5 py-2.5 rounded-xl bg-status-danger hover:bg-status-danger/90 text-white font-bold text-xs sm:text-sm flex items-center space-x-2 shadow-glow-danger transition-all cursor-pointer"
          >
            <StopCircle className="w-4 h-4" />
            <span>End Meeting</span>
          </button>
        </div>
      </div>

      {/* Main Cost Display HUD */}
      <CostDisplay
        cost={tickCost}
        currency={meeting.currency}
        isLive={true}
        burnRatePerHour={meeting.burn_rate_per_hour}
        burnRatePerSecond={meeting.burn_rate_per_second}
        unknownCount={meeting.unknown_cost_count}
      />

      {/* Sarcastic Ticker Banner */}
      <div className="p-3 bg-surface-elevated/60 border border-border-subtle rounded-xl flex items-center justify-center space-x-2 text-xs text-ink-secondary italic text-center">
        <Sparkles className="w-4 h-4 text-brand-primary flex-shrink-0" />
        <span>"Every 60 seconds that pass in this alignment, the meter keeps ticking."</span>
      </div>

      {/* Participants Manifest Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink-primary flex items-center space-x-2">
              <Users className="w-5 h-5 text-brand-primary" />
              <span>Participant Manifest ({meeting.participants.length})</span>
            </h2>
            <p className="text-xs text-ink-secondary">
              Individually pause members on temporary hold or mark departures as they leave.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {meeting.participants.map((p) => (
            <ParticipantRow
              key={p.id}
              participant={p}
              currency={meeting.currency}
              isMeetingLive={true}
              onPause={handlePause}
              onResume={handleResume}
              onLeave={handleLeave}
            />
          ))}
        </div>
      </div>

      {/* End Meeting Confirmation Modal */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-surface-card border border-border-subtle rounded-2xl max-w-md w-full p-6 shadow-hud-modal space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-status-danger">
              <StopCircle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-ink-primary">Conclude Meeting & Freeze Cost?</h3>
            </div>

            <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed">
              Ending the meeting will stop all active participant timers, close open intervals, finalize the accumulated estimated cost, and generate your immutable fiscal receipt.
            </p>

            <div className="p-3 bg-surface-inset rounded-xl border border-border-subtle text-xs font-mono space-y-1">
              <div className="flex justify-between text-ink-muted">
                <span>Duration:</span>
                <span className="text-ink-primary">{Math.floor(tickSeconds / 60)} min {tickSeconds % 60} sec</span>
              </div>
              <div className="flex justify-between text-ink-muted">
                <span>Final Estimated Cost:</span>
                <span className="font-bold text-brand-primary">{tickCost.toFixed(2)} {meeting.currency}</span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3">
              <button
                onClick={() => setShowEndModal(false)}
                disabled={ending}
                className="px-4 py-2 rounded-lg bg-surface-elevated text-ink-secondary hover:text-ink-primary text-xs font-semibold"
              >
                Continue Meeting
              </button>
              <button
                onClick={handleEndMeeting}
                disabled={ending}
                className="px-4 py-2 rounded-lg bg-status-danger hover:bg-status-danger/90 text-white text-xs font-bold shadow-glow-danger"
              >
                {ending ? 'Finalizing Receipt...' : 'Yes, End & Generate Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
