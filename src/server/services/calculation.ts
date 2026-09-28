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
  manual_duration_seconds: number | null;
  calculated_cost: number | null;
  left_at: string | null;
}

export interface ExternalCostCalculation {
  id: string;
  cost_library_id: string | null;
  name: string;
  amount: number;
  currency: string;
  is_overridden: boolean;
  created_at: string;
  updated_at: string;
}

export interface MeetingLiveState {
  id: string;
  title: string;
  status: 'PREPARED' | 'CONFIGURED' | 'LIVE' | 'ENDED';
  provenance: 'LIVE' | 'MANUAL_ENTRY';
  currency: string;
  planned_date: string | null;
  planned_time: string | null;
  manual_reason: string | null;
  is_recurring: boolean;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  updated_at: string;
  elapsed_seconds: number;
  accumulated_cost: number;
  participant_cost_total: number;
  external_cost_total: number;
  total_estimated_cost: number;
  burn_rate_per_hour: number;
  burn_rate_per_second: number;
  unknown_cost_count: number;
  participants: ParticipantCalculation[];
  external_costs: ExternalCostCalculation[];
}

export function computeLiveMeetingState(meetingId: string, asOfTime: Date = new Date()): MeetingLiveState | null {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(meetingId) as any;
  if (!meeting) return null;

  const participants = db.prepare(`
    SELECT * FROM meeting_participants WHERE meeting_id = ? AND selected = 1
  `).all(meetingId) as any[];

  const externalCostsRows = db.prepare(`
    SELECT * FROM meeting_external_costs WHERE meeting_id = ? ORDER BY created_at ASC
  `).all(meetingId) as any[];

  const externalCosts: ExternalCostCalculation[] = externalCostsRows.map(c => ({
    id: c.id,
    cost_library_id: c.cost_library_id,
    name: c.name,
    amount: Math.max(0, Number(c.amount || 0)),
    currency: c.currency || 'EUR',
    is_overridden: Boolean(c.is_overridden),
    created_at: c.created_at,
    updated_at: c.updated_at,
  }));

  const externalCostTotal = externalCosts.reduce((sum, item) => sum + item.amount, 0);

  const nowMs = asOfTime.getTime();

  let elapsedSeconds = 0;
  if (meeting.provenance === 'MANUAL_ENTRY') {
    elapsedSeconds = Number(meeting.total_duration_seconds || 0);
  } else if (meeting.started_at) {
    const startedMs = new Date(meeting.started_at).getTime();
    if (meeting.ended_at) {
      const endedMs = new Date(meeting.ended_at).getTime();
      elapsedSeconds = Math.max(0, Math.floor((endedMs - startedMs) / 1000));
    } else {
      elapsedSeconds = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
    }
  }

  // If meeting is ENDED or MANUAL_ENTRY, calculate from stored/locked durations
  if (meeting.status === 'ENDED' || meeting.provenance === 'MANUAL_ENTRY') {
    let participantCostTotal = 0;
    let unknownCount = 0;

    const pResults: ParticipantCalculation[] = participants.map((p) => {
      const isRateKnown = Boolean(p.rate_known);
      if (!isRateKnown) {
        unknownCount++;
      }

      const durationSec = meeting.provenance === 'MANUAL_ENTRY'
        ? Number(p.manual_duration_seconds ?? meeting.total_duration_seconds ?? 0)
        : Number(p.measured_seconds || 0);

      let calcCost: number | null = null;
      if (isRateKnown && p.hourly_rate_snapshot !== null) {
        calcCost = (p.hourly_rate_snapshot * durationSec) / 3600;
        participantCostTotal += calcCost;
      }

      return {
        id: p.id,
        name: p.name,
        role: p.role,
        organization: p.organization,
        is_guest: Boolean(p.is_guest),
        hourly_rate_snapshot: p.hourly_rate_snapshot,
        rate_known: isRateKnown,
        state: p.state,
        measured_seconds: durationSec,
        manual_duration_seconds: p.manual_duration_seconds,
        calculated_cost: calcCost !== null ? Math.round(calcCost * 100) / 100 : null,
        left_at: p.left_at,
      };
    });

    const finalParticipantTotal = Math.round(participantCostTotal * 100) / 100;
    const finalExternalTotal = Math.round(externalCostTotal * 100) / 100;
    const finalTotalEstimated = Math.round((finalParticipantTotal + finalExternalTotal) * 100) / 100;

    return {
      id: meeting.id,
      title: meeting.title,
      status: meeting.status,
      provenance: meeting.provenance || 'LIVE',
      currency: meeting.currency || 'EUR',
      planned_date: meeting.planned_date || null,
      planned_time: meeting.planned_time || null,
      manual_reason: meeting.manual_reason || null,
      is_recurring: Boolean(meeting.is_recurring),
      created_at: meeting.created_at,
      started_at: meeting.started_at,
      ended_at: meeting.ended_at,
      updated_at: meeting.updated_at || meeting.created_at,
      elapsed_seconds: meeting.total_duration_seconds || elapsedSeconds,
      accumulated_cost: finalTotalEstimated,
      participant_cost_total: finalParticipantTotal,
      external_cost_total: finalExternalTotal,
      total_estimated_cost: finalTotalEstimated,
      burn_rate_per_hour: 0,
      burn_rate_per_second: 0,
      unknown_cost_count: unknownCount,
      participants: pResults,
      external_costs: externalCosts,
    };
  }

  // Live or Prepared meeting calculation
  let participantCostTotal = 0;
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

    for (const inv of intervals) {
      const invStartMs = new Date(inv.started_at).getTime();
      if (inv.ended_at) {
        const invEndMs = new Date(inv.ended_at).getTime();
        measuredSec += Math.max(0, Math.floor((invEndMs - invStartMs) / 1000));
      } else {
        // Open interval (active right now)
        measuredSec += Math.max(0, Math.floor((nowMs - invStartMs) / 1000));
      }
    }

    let calculatedCost: number | null = null;
    if (isRateKnown && p.hourly_rate_snapshot !== null) {
      calculatedCost = (p.hourly_rate_snapshot * measuredSec) / 3600;
      participantCostTotal += calculatedCost;

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
      manual_duration_seconds: p.manual_duration_seconds,
      calculated_cost: calculatedCost !== null ? Math.round(calculatedCost * 100) / 100 : null,
      left_at: p.left_at,
    });
  }

  const burnRatePerSecond = currentActiveBurnPerHour / 3600;
  const pTotal = Math.round(participantCostTotal * 100) / 100;
  const eTotal = Math.round(externalCostTotal * 100) / 100;
  const combinedTotal = Math.round((pTotal + eTotal) * 100) / 100;

  return {
    id: meeting.id,
    title: meeting.title,
    status: meeting.status,
    provenance: meeting.provenance || 'LIVE',
    currency: meeting.currency || 'EUR',
    planned_date: meeting.planned_date || null,
    planned_time: meeting.planned_time || null,
    manual_reason: meeting.manual_reason || null,
    is_recurring: Boolean(meeting.is_recurring),
    created_at: meeting.created_at,
    started_at: meeting.started_at,
    ended_at: meeting.ended_at,
    updated_at: meeting.updated_at || meeting.created_at,
    elapsed_seconds: elapsedSeconds,
    accumulated_cost: combinedTotal,
    participant_cost_total: pTotal,
    external_cost_total: eTotal,
    total_estimated_cost: combinedTotal,
    burn_rate_per_hour: Math.round(currentActiveBurnPerHour * 100) / 100,
    burn_rate_per_second: Math.round(burnRatePerSecond * 10000) / 10000,
    unknown_cost_count: unknownCount,
    participants: participantResults,
    external_costs: externalCosts,
  };
}

export function recalculateAndPersistMeeting(meetingId: string): MeetingLiveState | null {
  const state = computeLiveMeetingState(meetingId);
  if (!state) return null;

  const now = new Date().toISOString();

  // Persist computed totals and update timestamp
  db.prepare(`
    UPDATE meetings
    SET participant_cost_total = ?,
        external_cost_total = ?,
        total_estimated_cost = ?,
        accumulated_cost = ?,
        unknown_cost_count = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    state.participant_cost_total,
    state.external_cost_total,
    state.total_estimated_cost,
    state.total_estimated_cost,
    state.unknown_cost_count,
    now,
    meetingId
  );

  // Persist participant calculated costs
  const updateP = db.prepare(`
    UPDATE meeting_participants
    SET calculated_cost = ?,
        measured_seconds = ?,
        updated_at = ?
    WHERE id = ?
  `);

  for (const p of state.participants) {
    updateP.run(p.calculated_cost, p.measured_seconds, now, p.id);
  }

  state.updated_at = now;
  return state;
}
