import { db } from '../db/database.ts';

export interface ParticipantCalculation {
  id: string;
  name: string;
  role: string | null;
  organization: string | null;
  is_guest: boolean;
  hourly_rate_snapshot: number | null;
  rate_known: boolean;
  state: 'ACTIVE' | 'PAUSED' | 'LEFT';
  measured_seconds: number;
  calculated_cost: number | null;
  left_at: string | null;
}

export interface MeetingLiveState {
  id: string;
  title: string;
  status: 'CONFIGURED' | 'LIVE' | 'ENDED';
  currency: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  elapsed_seconds: number;
  accumulated_cost: number;
  burn_rate_per_hour: number;
  burn_rate_per_second: number;
  unknown_cost_count: number;
  participants: ParticipantCalculation[];
}

export function computeLiveMeetingState(meetingId: string, asOfTime: Date = new Date()): MeetingLiveState | null {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(meetingId) as any;
  if (!meeting) return null;

  const participants = db.prepare(`
    SELECT * FROM meeting_participants WHERE meeting_id = ? AND selected = 1
  `).all(meetingId) as any[];

  const nowIso = asOfTime.toISOString();
  const nowMs = asOfTime.getTime();

  let elapsedSeconds = 0;
  if (meeting.started_at) {
    const startedMs = new Date(meeting.started_at).getTime();
    if (meeting.ended_at) {
      const endedMs = new Date(meeting.ended_at).getTime();
      elapsedSeconds = Math.max(0, Math.floor((endedMs - startedMs) / 1000));
    } else {
      elapsedSeconds = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
    }
  }

  // If meeting is ended, return the persisted final values
  if (meeting.status === 'ENDED') {
    const pResults: ParticipantCalculation[] = participants.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      organization: p.organization,
      is_guest: Boolean(p.is_guest),
      hourly_rate_snapshot: p.hourly_rate_snapshot,
      rate_known: Boolean(p.rate_known),
      state: p.state,
      measured_seconds: p.measured_seconds || 0,
      calculated_cost: p.rate_known && p.calculated_cost !== null ? Number(p.calculated_cost) : null,
      left_at: p.left_at,
    }));

    return {
      id: meeting.id,
      title: meeting.title,
      status: meeting.status,
      currency: meeting.currency,
      created_at: meeting.created_at,
      started_at: meeting.started_at,
      ended_at: meeting.ended_at,
      elapsed_seconds: meeting.total_duration_seconds || elapsedSeconds,
      accumulated_cost: Number(meeting.accumulated_cost || 0),
      burn_rate_per_hour: 0,
      burn_rate_per_second: 0,
      unknown_cost_count: meeting.unknown_cost_count || 0,
      participants: pResults,
    };
  }

  // Live or Configured meeting calculation
  let totalCost = 0;
  let currentActiveBurnPerHour = 0;
  let unknownCount = 0;

  const participantResults: ParticipantCalculation[] = [];

  for (const p of participants) {
    const isRateKnown = Boolean(p.rate_known);
    if (!isRateKnown) {
      unknownCount++;
    }

    // Fetch intervals for this participant
    const intervals = db.prepare(`
      SELECT * FROM measurement_intervals WHERE participant_id = ? ORDER BY started_at ASC
    `).all(p.id) as any[];

    let measuredSec = 0;
    let hasOpenInterval = false;

    for (const inv of intervals) {
      const invStartMs = new Date(inv.started_at).getTime();
      if (inv.ended_at) {
        const invEndMs = new Date(inv.ended_at).getTime();
        measuredSec += Math.max(0, Math.floor((invEndMs - invStartMs) / 1000));
      } else {
        // Open interval (active right now)
        hasOpenInterval = true;
        measuredSec += Math.max(0, Math.floor((nowMs - invStartMs) / 1000));
      }
    }

    let calculatedCost: number | null = null;
    if (isRateKnown && p.hourly_rate_snapshot !== null) {
      calculatedCost = (p.hourly_rate_snapshot * measuredSec) / 3600;
      totalCost += calculatedCost;

      if (meeting.status === 'LIVE' && p.state === 'ACTIVE') {
        currentActiveBurnPerHour += p.hourly_rate_snapshot;
      }
    }

    participantResults.push({
      id: p.id,
      name: p.name,
      role: p.role,
      organization: p.organization,
      is_guest: Boolean(p.is_guest),
      hourly_rate_snapshot: p.hourly_rate_snapshot,
      rate_known: isRateKnown,
      state: p.state,
      measured_seconds: measuredSec,
      calculated_cost: calculatedCost,
      left_at: p.left_at,
    });
  }

  const burnRatePerSecond = currentActiveBurnPerHour / 3600;

  return {
    id: meeting.id,
    title: meeting.title,
    status: meeting.status,
    currency: meeting.currency,
    created_at: meeting.created_at,
    started_at: meeting.started_at,
    ended_at: meeting.ended_at,
    elapsed_seconds: elapsedSeconds,
    accumulated_cost: Math.round(totalCost * 100) / 100,
    burn_rate_per_hour: Math.round(currentActiveBurnPerHour * 100) / 100,
    burn_rate_per_second: Math.round(burnRatePerSecond * 10000) / 10000,
    unknown_cost_count: unknownCount,
    participants: participantResults,
  };
}
