import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/database.ts';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.ts';
import { computeLiveMeetingState } from '../services/calculation.ts';

const router = Router();

router.use(authMiddleware);

const participantInputSchema = z.object({
  person_id: z.string().optional().nullable(),
  name: z.string().min(1),
  role: z.string().optional().nullable(),
  organization: z.string().optional().nullable(),
  is_guest: z.boolean().default(false),
  hourly_rate: z.number().nonnegative().optional().nullable(),
  rate_known: z.boolean().default(true),
  selected: z.boolean().default(true),
});

const createMeetingSchema = z.object({
  title: z.string().min(1),
  currency: z.string().default('EUR'),
  participants: z.array(participantInputSchema).min(1),
});

const updateConfigSchema = z.object({
  title: z.string().min(1).optional(),
  participants: z.array(participantInputSchema).optional(),
});

const participantActionSchema = z.object({
  participant_id: z.string().min(1),
});

// List meetings (history or active)
router.get('/', (req: AuthenticatedRequest, res: Response): void => {
  const statusFilter = req.query.status as string | undefined;
  let query = `SELECT * FROM meetings WHERE user_id = ?`;
  const params: any[] = [req.user!.id];

  if (statusFilter) {
    query += ` AND status = ?`;
    params.push(statusFilter);
  }

  query += ` ORDER BY created_at DESC`;
  const meetings = db.prepare(query).all(...params) as any[];

  res.json({
    meetings: meetings.map((m) => ({
      ...m,
      accumulated_cost: Number(m.accumulated_cost || 0),
    })),
  });
});

// Create meeting (CONFIGURED state)
router.post('/', (req: AuthenticatedRequest, res: Response): void => {
  const result = createMeetingSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const { title, currency, participants } = result.data;
  const meetingId = crypto.randomUUID();
  const now = new Date().toISOString();

  const insertMeeting = db.prepare(`
    INSERT INTO meetings (id, user_id, title, status, currency, created_at, accumulated_cost, unknown_cost_count, total_duration_seconds, updated_at)
    VALUES (?, ?, ?, 'CONFIGURED', ?, ?, 0.0, 0, 0, ?)
  `);

  const insertParticipant = db.prepare(`
    INSERT INTO meeting_participants (
      id, meeting_id, person_id, name, role, organization, is_guest,
      hourly_rate_snapshot, rate_known, state, selected, measured_seconds,
      calculated_cost, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, 0, NULL, ?, ?)
  `);

  const tx = db.transaction(() => {
    insertMeeting.run(meetingId, req.user!.id, title, currency, now, now);

    for (const p of participants) {
      const partId = crypto.randomUUID();
      const isGuest = p.is_guest || false;
      const rateKnown = isGuest ? (p.rate_known ?? true) : true;
      const rateSnapshot = rateKnown ? (p.hourly_rate ?? 0) : null;
      const selectedInt = p.selected ? 1 : 0;

      insertParticipant.run(
        partId,
        meetingId,
        p.person_id || null,
        p.name,
        p.role || null,
        p.organization || null,
        isGuest ? 1 : 0,
        rateSnapshot,
        rateKnown ? 1 : 0,
        selectedInt,
        now,
        now
      );
    }
  });

  tx();

  const state = computeLiveMeetingState(meetingId);
  res.status(201).json({ meeting: state });
});

// Get meeting details / live state
router.get('/:id', (req: AuthenticatedRequest, res: Response): void => {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id);
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found or unauthorized' });
    return;
  }

  const state = computeLiveMeetingState(req.params.id);
  res.json({ meeting: state });
});

router.get('/:id/live', (req: AuthenticatedRequest, res: Response): void => {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id);
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found or unauthorized' });
    return;
  }

  const state = computeLiveMeetingState(req.params.id);
  res.json({ meeting: state });
});

// Update meeting config (only when CONFIGURED)
router.put('/:id/config', (req: AuthenticatedRequest, res: Response): void => {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id) as any;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  if (meeting.status !== 'CONFIGURED') {
    res.status(400).json({ error: 'Cannot update configuration once meeting has started or ended' });
    return;
  }

  const result = updateConfigSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const { title, participants } = result.data;
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    if (title) {
      db.prepare(`UPDATE meetings SET title = ?, updated_at = ? WHERE id = ?`).run(title, now, req.params.id);
    }

    if (participants) {
      // Replace participants
      db.prepare(`DELETE FROM meeting_participants WHERE meeting_id = ?`).run(req.params.id);
      const insertParticipant = db.prepare(`
        INSERT INTO meeting_participants (
          id, meeting_id, person_id, name, role, organization, is_guest,
          hourly_rate_snapshot, rate_known, state, selected, measured_seconds,
          calculated_cost, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, 0, NULL, ?, ?)
      `);

      for (const p of participants) {
        const partId = crypto.randomUUID();
        const isGuest = p.is_guest || false;
        const rateKnown = isGuest ? (p.rate_known ?? true) : true;
        const rateSnapshot = rateKnown ? (p.hourly_rate ?? 0) : null;
        const selectedInt = p.selected ? 1 : 0;

        insertParticipant.run(
          partId,
          req.params.id,
          p.person_id || null,
          p.name,
          p.role || null,
          p.organization || null,
          isGuest ? 1 : 0,
          rateSnapshot,
          rateKnown ? 1 : 0,
          selectedInt,
          now,
          now
        );
      }
    }
  });

  tx();

  const state = computeLiveMeetingState(req.params.id);
  res.json({ meeting: state });
});

// Explicit Start: CONFIGURED -> LIVE
router.post('/:id/start', (req: AuthenticatedRequest, res: Response): void => {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id) as any;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  if (meeting.status !== 'CONFIGURED') {
    res.status(400).json({ error: `Cannot start meeting in status ${meeting.status}` });
    return;
  }

  const selectedParticipants = db.prepare(`
    SELECT id FROM meeting_participants WHERE meeting_id = ? AND selected = 1
  `).all(req.params.id) as any[];

  if (selectedParticipants.length === 0) {
    res.status(400).json({ error: 'At least one participant must be selected to start measurement' });
    return;
  }

  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE meetings SET status = 'LIVE', started_at = ?, updated_at = ? WHERE id = ?
    `).run(now, now, req.params.id);

    // Set selected participants to ACTIVE and create first interval
    const insertInterval = db.prepare(`
      INSERT INTO measurement_intervals (id, meeting_id, participant_id, started_at, ended_at, duration_seconds)
      VALUES (?, ?, ?, ?, NULL, 0)
    `);

    for (const p of selectedParticipants) {
      db.prepare(`UPDATE meeting_participants SET state = 'ACTIVE', updated_at = ? WHERE id = ?`).run(now, p.id);
      insertInterval.run(crypto.randomUUID(), req.params.id, p.id, now);
    }
  });

  tx();

  const state = computeLiveMeetingState(req.params.id);
  res.json({ meeting: state });
});

// Pause participant
router.post('/:id/pause', (req: AuthenticatedRequest, res: Response): void => {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id) as any;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  if (meeting.status !== 'LIVE') {
    res.status(400).json({ error: 'Meeting is not LIVE' });
    return;
  }

  const result = participantActionSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'participant_id is required' });
    return;
  }

  const { participant_id } = result.data;
  const participant = db.prepare(`
    SELECT * FROM meeting_participants WHERE id = ? AND meeting_id = ?
  `).get(participant_id, req.params.id) as any;

  if (!participant) {
    res.status(404).json({ error: 'Participant not found in this meeting' });
    return;
  }

  if (participant.state !== 'ACTIVE') {
    res.status(400).json({ error: `Cannot pause participant with state ${participant.state}` });
    return;
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const tx = db.transaction(() => {
    // Find open interval
    const openInterval = db.prepare(`
      SELECT * FROM measurement_intervals WHERE participant_id = ? AND ended_at IS NULL
    `).get(participant_id) as any;

    if (openInterval) {
      const startMs = new Date(openInterval.started_at).getTime();
      const dur = Math.max(0, Math.floor((now.getTime() - startMs) / 1000));
      db.prepare(`
        UPDATE measurement_intervals SET ended_at = ?, duration_seconds = ? WHERE id = ?
      `).run(nowIso, dur, openInterval.id);
    }

    db.prepare(`UPDATE meeting_participants SET state = 'PAUSED', updated_at = ? WHERE id = ?`).run(nowIso, participant_id);
  });

  tx();

  const state = computeLiveMeetingState(req.params.id);
  res.json({ meeting: state });
});

// Resume participant
router.post('/:id/resume', (req: AuthenticatedRequest, res: Response): void => {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id) as any;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  if (meeting.status !== 'LIVE') {
    res.status(400).json({ error: 'Meeting is not LIVE' });
    return;
  }

  const result = participantActionSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'participant_id is required' });
    return;
  }

  const { participant_id } = result.data;
  const participant = db.prepare(`
    SELECT * FROM meeting_participants WHERE id = ? AND meeting_id = ?
  `).get(participant_id, req.params.id) as any;

  if (!participant) {
    res.status(404).json({ error: 'Participant not found in this meeting' });
    return;
  }

  if (participant.state !== 'PAUSED') {
    res.status(400).json({ error: `Cannot resume participant with state ${participant.state}` });
    return;
  }

  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    // Open new interval
    db.prepare(`
      INSERT INTO measurement_intervals (id, meeting_id, participant_id, started_at, ended_at, duration_seconds)
      VALUES (?, ?, ?, ?, NULL, 0)
    `).run(crypto.randomUUID(), req.params.id, participant_id, now);

    db.prepare(`UPDATE meeting_participants SET state = 'ACTIVE', updated_at = ? WHERE id = ?`).run(now, participant_id);
  });

  tx();

  const state = computeLiveMeetingState(req.params.id);
  res.json({ meeting: state });
});

// Mark participant as LEFT
router.post('/:id/leave', (req: AuthenticatedRequest, res: Response): void => {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id) as any;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  if (meeting.status !== 'LIVE') {
    res.status(400).json({ error: 'Meeting is not LIVE' });
    return;
  }

  const result = participantActionSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'participant_id is required' });
    return;
  }

  const { participant_id } = result.data;
  const participant = db.prepare(`
    SELECT * FROM meeting_participants WHERE id = ? AND meeting_id = ?
  `).get(participant_id, req.params.id) as any;

  if (!participant) {
    res.status(404).json({ error: 'Participant not found in this meeting' });
    return;
  }

  if (participant.state === 'LEFT') {
    res.status(400).json({ error: 'Participant has already left the meeting' });
    return;
  }

  const now = new Date();
  const nowIso = now.toISOString();

  const tx = db.transaction(() => {
    if (participant.state === 'ACTIVE') {
      const openInterval = db.prepare(`
        SELECT * FROM measurement_intervals WHERE participant_id = ? AND ended_at IS NULL
      `).get(participant_id) as any;

      if (openInterval) {
        const startMs = new Date(openInterval.started_at).getTime();
        const dur = Math.max(0, Math.floor((now.getTime() - startMs) / 1000));
        db.prepare(`
          UPDATE measurement_intervals SET ended_at = ?, duration_seconds = ? WHERE id = ?
        `).run(nowIso, dur, openInterval.id);
      }
    }

    db.prepare(`
      UPDATE meeting_participants SET state = 'LEFT', left_at = ?, updated_at = ? WHERE id = ?
    `).run(nowIso, nowIso, participant_id);
  });

  tx();

  const state = computeLiveMeetingState(req.params.id);
  res.json({ meeting: state });
});

// Explicit End: LIVE -> ENDED
router.post('/:id/end', (req: AuthenticatedRequest, res: Response): void => {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id) as any;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  if (meeting.status === 'ENDED') {
    // Idempotent: return finalized state
    const state = computeLiveMeetingState(req.params.id);
    res.json({ meeting: state });
    return;
  }

  if (meeting.status !== 'LIVE') {
    res.status(400).json({ error: `Cannot end meeting in status ${meeting.status}` });
    return;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const startedMs = new Date(meeting.started_at).getTime();
  const totalDuration = Math.max(0, Math.floor((now.getTime() - startedMs) / 1000));

  const tx = db.transaction(() => {
    // 1. Close all open intervals
    const openIntervals = db.prepare(`
      SELECT * FROM measurement_intervals WHERE meeting_id = ? AND ended_at IS NULL
    `).all(req.params.id) as any[];

    for (const inv of openIntervals) {
      const startMs = new Date(inv.started_at).getTime();
      const dur = Math.max(0, Math.floor((now.getTime() - startMs) / 1000));
      db.prepare(`
        UPDATE measurement_intervals SET ended_at = ?, duration_seconds = ? WHERE id = ?
      `).run(nowIso, dur, inv.id);
    }

    // 2. Finalize each participant's measured_seconds and calculated_cost
    const participants = db.prepare(`
      SELECT * FROM meeting_participants WHERE meeting_id = ? AND selected = 1
    `).all(req.params.id) as any[];

    let accumulatedCost = 0;
    let unknownCostCount = 0;

    for (const p of participants) {
      const intervals = db.prepare(`
        SELECT duration_seconds FROM measurement_intervals WHERE participant_id = ?
      `).all(p.id) as any[];

      const totalSec = intervals.reduce((acc, curr) => acc + (curr.duration_seconds || 0), 0);
      let pCost: number | null = null;

      if (p.rate_known && p.hourly_rate_snapshot !== null) {
        pCost = (p.hourly_rate_snapshot * totalSec) / 3600;
        accumulatedCost += pCost;
      } else {
        unknownCostCount++;
      }

      db.prepare(`
        UPDATE meeting_participants
        SET measured_seconds = ?, calculated_cost = ?, updated_at = ?
        WHERE id = ?
      `).run(totalSec, pCost !== null ? Math.round(pCost * 100) / 100 : null, nowIso, p.id);
    }

    // 3. Finalize meeting
    db.prepare(`
      UPDATE meetings
      SET status = 'ENDED', ended_at = ?, accumulated_cost = ?, unknown_cost_count = ?,
          total_duration_seconds = ?, updated_at = ?
      WHERE id = ?
    `).run(
      nowIso,
      Math.round(accumulatedCost * 100) / 100,
      unknownCostCount,
      totalDuration,
      nowIso,
      req.params.id
    );
  });

  tx();

  const state = computeLiveMeetingState(req.params.id);
  res.json({ meeting: state });
});

// Final Receipt summary
router.get('/:id/receipt', (req: AuthenticatedRequest, res: Response): void => {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id) as any;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found or unauthorized' });
    return;
  }

  const user = db.prepare(`SELECT id, name, email FROM users WHERE id = ?`).get(meeting.user_id) as any;
  const state = computeLiveMeetingState(req.params.id);
  if (!state) {
    res.status(404).json({ error: 'State computation error' });
    return;
  }

  // Generate light, sarcastic quotes based on cost & duration
  const quotes = [
    "This definitely could have been an email.",
    "Time is money, and we just spent both.",
    "Decisions made: TBD. Money burned: Visible above.",
    "Executive productivity at its finest.",
    "Another high-value alignment session in the books.",
    "Synergy achieved, budget diminished.",
  ];
  const quoteIndex = Math.floor(Math.abs(hashString(meeting.id)) % quotes.length);
  const quote = quotes[quoteIndex];

  res.json({
    receipt: {
      meeting_id: meeting.id,
      title: meeting.title,
      status: meeting.status,
      creator: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      currency: meeting.currency,
      created_at: meeting.created_at,
      started_at: meeting.started_at,
      ended_at: meeting.ended_at,
      total_duration_seconds: state.elapsed_seconds,
      final_estimated_cost: state.accumulated_cost,
      unknown_cost_count: state.unknown_cost_count,
      participants_count: state.participants.length,
      participants: state.participants,
      tone_quote: quote,
      estimate_disclaimer: "MeetingMeter estimated calculation only. Not an official accounting, payroll, billing, or invoice document.",
    },
  });
});

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export default router;
