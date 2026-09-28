import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/database.ts';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.ts';
import { computeLiveMeetingState, recalculateAndPersistMeeting } from '../services/calculation.ts';

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
  manual_duration_seconds: z.number().nonnegative().optional().nullable(),
});

const externalCostInputSchema = z.object({
  cost_library_id: z.string().optional().nullable(),
  name: z.string().min(1),
  amount: z.number().nonnegative('Amount cannot be negative').default(0.0),
  currency: z.string().default('EUR'),
  is_overridden: z.boolean().default(false),
});

const createMeetingSchema = z.object({
  title: z.string().min(1),
  status: z.enum(['PREPARED', 'CONFIGURED', 'LIVE']).default('PREPARED'),
  currency: z.string().default('EUR'),
  planned_date: z.string().optional().nullable(),
  planned_time: z.string().optional().nullable(),
  is_recurring: z.boolean().default(false),
  participants: z.array(participantInputSchema).min(1),
  external_costs: z.array(externalCostInputSchema).optional().default([]),
});

const updatePreparedSchema = z.object({
  title: z.string().min(1).optional(),
  planned_date: z.string().optional().nullable(),
  planned_time: z.string().optional().nullable(),
  is_recurring: z.boolean().optional(),
  participants: z.array(participantInputSchema).optional(),
  external_costs: z.array(externalCostInputSchema).optional(),
});

const manualEntrySchema = z.object({
  title: z.string().min(1),
  planned_date: z.string().min(1, 'Date is required for manual entry'),
  planned_time: z.string().optional().nullable(),
  meeting_duration_seconds: z.number().positive('Meeting duration must be positive'),
  manual_reason: z.string().optional().nullable(),
  currency: z.string().default('EUR'),
  participants: z.array(participantInputSchema).min(1),
  external_costs: z.array(externalCostInputSchema).optional().default([]),
});

const participantActionSchema = z.object({
  participant_id: z.string().min(1),
});

// Helper: check if a prepared meeting is MISSED / NOT HELD
function isMissed(meeting: any): boolean {
  if (meeting.status !== 'PREPARED' && meeting.status !== 'CONFIGURED') return false;
  if (!meeting.planned_date) return false;

  const now = new Date();
  const meetingDateStr = meeting.planned_time 
    ? `${meeting.planned_date}T${meeting.planned_time}:00` 
    : `${meeting.planned_date}T23:59:59`;
  const plannedDate = new Date(meetingDateStr);
  return plannedDate.getTime() < now.getTime();
}

// 1. List user's meetings
router.get('/', (req: AuthenticatedRequest, res: Response): void => {
  const statusFilter = req.query.status as string | undefined;
  const provenanceFilter = req.query.provenance as string | undefined;

  let query = `SELECT * FROM meetings WHERE user_id = ?`;
  const params: any[] = [req.user!.id];

  if (statusFilter) {
    query += ` AND status = ?`;
    params.push(statusFilter);
  }

  if (provenanceFilter) {
    query += ` AND provenance = ?`;
    params.push(provenanceFilter);
  }

  query += ` ORDER BY created_at DESC`;
  const meetings = db.prepare(query).all(...params) as any[];

  res.json({
    meetings: meetings.map((m) => {
      const missed = isMissed(m);
      return {
        ...m,
        status: m.status === 'CONFIGURED' ? 'PREPARED' : m.status,
        is_missed: missed,
        is_recurring: Boolean(m.is_recurring),
        accumulated_cost: Number(m.accumulated_cost || m.total_estimated_cost || 0),
        participant_cost_total: Number(m.participant_cost_total || 0),
        external_cost_total: Number(m.external_cost_total || 0),
        total_estimated_cost: Number(m.total_estimated_cost || m.accumulated_cost || 0),
      };
    }),
  });
});

// 2. Create Meeting (PREPARED or Immediate Start)
router.post('/', (req: AuthenticatedRequest, res: Response): void => {
  const result = createMeetingSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const { title, status, currency, planned_date, planned_time, is_recurring, participants, external_costs } = result.data;
  const meetingId = crypto.randomUUID();
  const now = new Date().toISOString();
  const initialStatus = status === 'LIVE' ? 'LIVE' : 'PREPARED';

  const insertMeeting = db.prepare(`
    INSERT INTO meetings (
      id, user_id, title, status, provenance, currency, planned_date, planned_time,
      is_recurring, created_at, started_at, accumulated_cost, participant_cost_total,
      external_cost_total, total_estimated_cost, unknown_cost_count, total_duration_seconds, updated_at
    ) VALUES (?, ?, ?, ?, 'LIVE', ?, ?, ?, ?, ?, ?, 0.0, 0.0, 0.0, 0.0, 0, 0, ?)
  `);

  const insertParticipant = db.prepare(`
    INSERT INTO meeting_participants (
      id, meeting_id, person_id, name, role, organization, is_guest,
      hourly_rate_snapshot, rate_known, state, selected, measured_seconds,
      calculated_cost, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, 0, NULL, ?, ?)
  `);

  const insertCost = db.prepare(`
    INSERT INTO meeting_external_costs (
      id, meeting_id, cost_library_id, name, amount, currency, is_overridden, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertInterval = db.prepare(`
    INSERT INTO measurement_intervals (id, meeting_id, participant_id, started_at, ended_at, duration_seconds)
    VALUES (?, ?, ?, ?, NULL, 0)
  `);

  const tx = db.transaction(() => {
    insertMeeting.run(
      meetingId,
      req.user!.id,
      title,
      initialStatus,
      currency || 'EUR',
      planned_date || null,
      planned_time || null,
      is_recurring ? 1 : 0,
      now,
      initialStatus === 'LIVE' ? now : null,
      now
    );

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

      if (initialStatus === 'LIVE' && p.selected) {
        insertInterval.run(crypto.randomUUID(), meetingId, partId, now);
      }
    }

    if (external_costs && external_costs.length > 0) {
      for (const ec of external_costs) {
        insertCost.run(
          crypto.randomUUID(),
          meetingId,
          ec.cost_library_id || null,
          ec.name.trim(),
          Math.max(0, ec.amount),
          ec.currency || 'EUR',
          ec.is_overridden ? 1 : 0,
          now,
          now
        );
      }
    }
  });

  tx();

  const state = recalculateAndPersistMeeting(meetingId);
  res.status(201).json({ meeting: state });
});

// 3. Create MANUAL ENTRY Meeting
router.post('/manual', (req: AuthenticatedRequest, res: Response): void => {
  const result = manualEntrySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const { title, planned_date, planned_time, meeting_duration_seconds, manual_reason, currency, participants, external_costs } = result.data;

  // Validation: individual participant duration must satisfy 0 <= duration <= meeting_duration
  for (const p of participants) {
    const dur = p.manual_duration_seconds ?? meeting_duration_seconds;
    if (dur < 0 || dur > meeting_duration_seconds) {
      res.status(400).json({
        error: `Participant '${p.name}' participation duration (${dur}s) must be between 0 and meeting duration (${meeting_duration_seconds}s)`
      });
      return;
    }
  }

  const meetingId = crypto.randomUUID();
  const now = new Date().toISOString();

  const insertMeeting = db.prepare(`
    INSERT INTO meetings (
      id, user_id, title, status, provenance, currency, planned_date, planned_time, manual_reason,
      is_recurring, created_at, started_at, ended_at, accumulated_cost, participant_cost_total,
      external_cost_total, total_estimated_cost, unknown_cost_count, total_duration_seconds, updated_at
    ) VALUES (?, ?, ?, 'ENDED', 'MANUAL_ENTRY', ?, ?, ?, ?, 0, ?, ?, ?, 0.0, 0.0, 0.0, 0.0, 0, ?, ?)
  `);

  const insertParticipant = db.prepare(`
    INSERT INTO meeting_participants (
      id, meeting_id, person_id, name, role, organization, is_guest,
      hourly_rate_snapshot, rate_known, state, selected, measured_seconds,
      manual_duration_seconds, calculated_cost, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?, NULL, ?, ?)
  `);

  const insertCost = db.prepare(`
    INSERT INTO meeting_external_costs (
      id, meeting_id, cost_library_id, name, amount, currency, is_overridden, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insertMeeting.run(
      meetingId,
      req.user!.id,
      title,
      currency || 'EUR',
      planned_date,
      planned_time || null,
      manual_reason || null,
      now,
      now,
      now,
      meeting_duration_seconds,
      now
    );

    for (const p of participants) {
      const partId = crypto.randomUUID();
      const isGuest = p.is_guest || false;
      const rateKnown = isGuest ? (p.rate_known ?? true) : true;
      const rateSnapshot = rateKnown ? (p.hourly_rate ?? 0) : null;
      const partDur = p.manual_duration_seconds ?? meeting_duration_seconds;

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
        partDur,
        partDur,
        now,
        now
      );
    }

    if (external_costs && external_costs.length > 0) {
      for (const ec of external_costs) {
        insertCost.run(
          crypto.randomUUID(),
          meetingId,
          ec.cost_library_id || null,
          ec.name.trim(),
          Math.max(0, ec.amount),
          ec.currency || 'EUR',
          ec.is_overridden ? 1 : 0,
          now,
          now
        );
      }
    }
  });

  tx();

  const state = recalculateAndPersistMeeting(meetingId);
  res.status(201).json({ meeting: state });
});

// 4. Update / Edit MANUAL ENTRY Meeting
router.put('/:id/manual', (req: AuthenticatedRequest, res: Response): void => {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id) as any;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  if (meeting.provenance !== 'MANUAL_ENTRY') {
    res.status(400).json({ error: 'Meeting is not a Manual Entry record' });
    return;
  }

  const result = manualEntrySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const { title, planned_date, planned_time, meeting_duration_seconds, manual_reason, participants, external_costs } = result.data;

  // Validation
  for (const p of participants) {
    const dur = p.manual_duration_seconds ?? meeting_duration_seconds;
    if (dur < 0 || dur > meeting_duration_seconds) {
      res.status(400).json({
        error: `Participant '${p.name}' participation duration (${dur}s) must be between 0 and meeting duration (${meeting_duration_seconds}s)`
      });
      return;
    }
  }

  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE meetings
      SET title = ?, planned_date = ?, planned_time = ?, total_duration_seconds = ?, manual_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(title, planned_date, planned_time || null, meeting_duration_seconds, manual_reason || null, now, req.params.id);

    // Replace participants
    db.prepare(`DELETE FROM meeting_participants WHERE meeting_id = ?`).run(req.params.id);
    const insertParticipant = db.prepare(`
      INSERT INTO meeting_participants (
        id, meeting_id, person_id, name, role, organization, is_guest,
        hourly_rate_snapshot, rate_known, state, selected, measured_seconds,
        manual_duration_seconds, calculated_cost, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 1, ?, ?, NULL, ?, ?)
    `);

    for (const p of participants) {
      const partId = crypto.randomUUID();
      const isGuest = p.is_guest || false;
      const rateKnown = isGuest ? (p.rate_known ?? true) : true;
      const rateSnapshot = rateKnown ? (p.hourly_rate ?? 0) : null;
      const partDur = p.manual_duration_seconds ?? meeting_duration_seconds;

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
        partDur,
        partDur,
        now,
        now
      );
    }

    if (external_costs) {
      db.prepare(`DELETE FROM meeting_external_costs WHERE meeting_id = ?`).run(req.params.id);
      const insertCost = db.prepare(`
        INSERT INTO meeting_external_costs (
          id, meeting_id, cost_library_id, name, amount, currency, is_overridden, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const ec of external_costs) {
        insertCost.run(
          crypto.randomUUID(),
          req.params.id,
          ec.cost_library_id || null,
          ec.name.trim(),
          Math.max(0, ec.amount),
          ec.currency || 'EUR',
          ec.is_overridden ? 1 : 0,
          now,
          now
        );
      }
    }
  });

  tx();

  const state = recalculateAndPersistMeeting(req.params.id);
  res.json({ meeting: state });
});

// 5. Get meeting details
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

// 6. Update PREPARED meeting (edit / reschedule)
router.put('/:id', (req: AuthenticatedRequest, res: Response): void => {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id) as any;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  if (meeting.status !== 'PREPARED' && meeting.status !== 'CONFIGURED') {
    res.status(400).json({ error: `Cannot edit meeting in status ${meeting.status}` });
    return;
  }

  const result = updatePreparedSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const { title, planned_date, planned_time, is_recurring, participants, external_costs } = result.data;
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE meetings
      SET title = COALESCE(?, title),
          planned_date = COALESCE(?, planned_date),
          planned_time = COALESCE(?, planned_time),
          is_recurring = COALESCE(?, is_recurring),
          updated_at = ?
      WHERE id = ?
    `).run(
      title || null,
      planned_date !== undefined ? planned_date : null,
      planned_time !== undefined ? planned_time : null,
      is_recurring !== undefined ? (is_recurring ? 1 : 0) : null,
      now,
      req.params.id
    );

    if (participants) {
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

    if (external_costs) {
      db.prepare(`DELETE FROM meeting_external_costs WHERE meeting_id = ?`).run(req.params.id);
      const insertCost = db.prepare(`
        INSERT INTO meeting_external_costs (
          id, meeting_id, cost_library_id, name, amount, currency, is_overridden, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const ec of external_costs) {
        insertCost.run(
          crypto.randomUUID(),
          req.params.id,
          ec.cost_library_id || null,
          ec.name.trim(),
          Math.max(0, ec.amount),
          ec.currency || 'EUR',
          ec.is_overridden ? 1 : 0,
          now,
          now
        );
      }
    }
  });

  tx();

  const state = recalculateAndPersistMeeting(req.params.id);
  res.json({ meeting: state });
});

// 7. Delete Meeting (PREPARED or MISSED)
router.delete('/:id', (req: AuthenticatedRequest, res: Response): void => {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id) as any;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  db.prepare(`DELETE FROM meetings WHERE id = ?`).run(req.params.id);
  res.json({ success: true, message: 'Meeting deleted successfully' });
});

// 8. Duplicate Recurring Meeting
router.post('/:id/duplicate', (req: AuthenticatedRequest, res: Response): void => {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id) as any;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  const participants = db.prepare(`SELECT * FROM meeting_participants WHERE meeting_id = ?`).all(req.params.id) as any[];
  const externalCosts = db.prepare(`SELECT * FROM meeting_external_costs WHERE meeting_id = ?`).all(req.params.id) as any[];

  const newId = crypto.randomUUID();
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO meetings (
        id, user_id, title, status, provenance, currency, planned_date, planned_time,
        is_recurring, created_at, started_at, accumulated_cost, participant_cost_total,
        external_cost_total, total_estimated_cost, unknown_cost_count, total_duration_seconds, updated_at
      ) VALUES (?, ?, ?, 'PREPARED', 'LIVE', ?, NULL, NULL, 1, ?, NULL, 0.0, 0.0, 0.0, 0.0, 0, 0, ?)
    `).run(
      newId,
      req.user!.id,
      `${meeting.title} (Recurring Copy)`,
      meeting.currency || 'EUR',
      now,
      now
    );

    const insertParticipant = db.prepare(`
      INSERT INTO meeting_participants (
        id, meeting_id, person_id, name, role, organization, is_guest,
        hourly_rate_snapshot, rate_known, state, selected, measured_seconds,
        calculated_cost, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, 0, NULL, ?, ?)
    `);

    for (const p of participants) {
      insertParticipant.run(
        crypto.randomUUID(),
        newId,
        p.person_id,
        p.name,
        p.role,
        p.organization,
        p.is_guest,
        p.hourly_rate_snapshot,
        p.rate_known,
        p.selected,
        now,
        now
      );
    }

    const insertCost = db.prepare(`
      INSERT INTO meeting_external_costs (
        id, meeting_id, cost_library_id, name, amount, currency, is_overridden, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const ec of externalCosts) {
      insertCost.run(
        crypto.randomUUID(),
        newId,
        ec.cost_library_id,
        ec.name,
        ec.amount,
        ec.currency,
        ec.is_overridden,
        now,
        now
      );
    }
  });

  tx();

  const state = recalculateAndPersistMeeting(newId);
  res.status(201).json({ meeting: state });
});

// 9. Explicit Start: PREPARED -> LIVE
router.post('/:id/start', (req: AuthenticatedRequest, res: Response): void => {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id) as any;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  if (meeting.status !== 'PREPARED' && meeting.status !== 'CONFIGURED') {
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

  const state = recalculateAndPersistMeeting(req.params.id);
  res.json({ meeting: state });
});

// 10. Pause participant
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
    db.prepare(`UPDATE meetings SET updated_at = ? WHERE id = ?`).run(nowIso, req.params.id);
  });

  tx();

  const state = computeLiveMeetingState(req.params.id);
  res.json({ meeting: state });
});

// 11. Resume participant
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
    db.prepare(`
      INSERT INTO measurement_intervals (id, meeting_id, participant_id, started_at, ended_at, duration_seconds)
      VALUES (?, ?, ?, ?, NULL, 0)
    `).run(crypto.randomUUID(), req.params.id, participant_id, now);

    db.prepare(`UPDATE meeting_participants SET state = 'ACTIVE', updated_at = ? WHERE id = ?`).run(now, participant_id);
    db.prepare(`UPDATE meetings SET updated_at = ? WHERE id = ?`).run(now, req.params.id);
  });

  tx();

  const state = computeLiveMeetingState(req.params.id);
  res.json({ meeting: state });
});

// 12. Leave participant
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
    db.prepare(`UPDATE meetings SET updated_at = ? WHERE id = ?`).run(nowIso, req.params.id);
  });

  tx();

  const state = computeLiveMeetingState(req.params.id);
  res.json({ meeting: state });
});

// 13. Explicit End: LIVE -> ENDED
router.post('/:id/end', (req: AuthenticatedRequest, res: Response): void => {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id) as any;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  if (meeting.status === 'ENDED') {
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

    // 2. Set status to ENDED
    db.prepare(`
      UPDATE meetings
      SET status = 'ENDED', ended_at = ?, total_duration_seconds = ?, updated_at = ?
      WHERE id = ?
    `).run(nowIso, totalDuration, nowIso, req.params.id);
  });

  tx();

  // 3. Recalculate & lock final values
  const state = recalculateAndPersistMeeting(req.params.id);
  res.json({ meeting: state });
});

// 14. Add / Replace External Costs on Meeting (PREPARED, LIVE, or post-End)
router.post('/:id/external-costs', (req: AuthenticatedRequest, res: Response): void => {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id) as any;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  const now = new Date().toISOString();

  // Case A: Batch update/sync of external costs array
  if (req.body && Array.isArray(req.body.external_costs)) {
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM meeting_external_costs WHERE meeting_id = ?`).run(req.params.id);
      const insertCost = db.prepare(`
        INSERT INTO meeting_external_costs (
          id, meeting_id, cost_library_id, name, amount, currency, is_overridden, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const ec of req.body.external_costs) {
        if (!ec.name || typeof ec.name !== 'string') continue;
        insertCost.run(
          ec.id || crypto.randomUUID(),
          req.params.id,
          ec.cost_library_id || null,
          ec.name.trim(),
          Math.max(0, parseFloat(ec.amount) || 0),
          ec.currency || 'EUR',
          ec.is_overridden ? 1 : 0,
          ec.created_at || now,
          now
        );
      }

      db.prepare(`UPDATE meetings SET updated_at = ? WHERE id = ?`).run(now, req.params.id);
    });

    tx();

    const state = recalculateAndPersistMeeting(req.params.id);
    res.status(200).json({ meeting: state });
    return;
  }

  // Case B: Single external cost item addition
  const parseResult = externalCostInputSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.errors[0].message });
    return;
  }

  const { cost_library_id, name, amount, currency, is_overridden } = parseResult.data;
  const costId = crypto.randomUUID();

  db.prepare(`
    INSERT INTO meeting_external_costs (
      id, meeting_id, cost_library_id, name, amount, currency, is_overridden, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    costId,
    req.params.id,
    cost_library_id || null,
    name.trim(),
    Math.max(0, amount),
    currency || 'EUR',
    is_overridden ? 1 : 0,
    now,
    now
  );

  db.prepare(`UPDATE meetings SET updated_at = ? WHERE id = ?`).run(now, req.params.id);

  const state = recalculateAndPersistMeeting(req.params.id);
  res.status(201).json({ meeting: state });
});

// 15. Edit External Cost item (works post-End as explicit exception to immutability)
router.put('/:id/external-costs/:costId', (req: AuthenticatedRequest, res: Response): void => {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id) as any;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  const existingCost = db.prepare(`
    SELECT id FROM meeting_external_costs WHERE id = ? AND meeting_id = ?
  `).get(req.params.costId, req.params.id);

  if (!existingCost) {
    res.status(404).json({ error: 'External cost item not found' });
    return;
  }

  const parseResult = externalCostInputSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.errors[0].message });
    return;
  }

  const { cost_library_id, name, amount, currency, is_overridden } = parseResult.data;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE meeting_external_costs
    SET name = ?, amount = ?, currency = ?, cost_library_id = ?, is_overridden = ?, updated_at = ?
    WHERE id = ? AND meeting_id = ?
  `).run(
    name.trim(),
    Math.max(0, amount),
    currency || 'EUR',
    cost_library_id || null,
    is_overridden ? 1 : 0,
    now,
    req.params.costId,
    req.params.id
  );

  const state = recalculateAndPersistMeeting(req.params.id);
  res.json({ meeting: state });
});

// 16. Delete External Cost item
router.delete('/:id/external-costs/:costId', (req: AuthenticatedRequest, res: Response): void => {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id) as any;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  const existingCost = db.prepare(`
    SELECT id FROM meeting_external_costs WHERE id = ? AND meeting_id = ?
  `).get(req.params.costId, req.params.id);

  if (!existingCost) {
    res.status(404).json({ error: 'External cost item not found' });
    return;
  }

  db.prepare(`DELETE FROM meeting_external_costs WHERE id = ? AND meeting_id = ?`).run(req.params.costId, req.params.id);

  const state = recalculateAndPersistMeeting(req.params.id);
  res.json({ meeting: state });
});

// 17. Final Receipt Summary
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
      provenance: meeting.provenance || 'LIVE',
      creator: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      currency: meeting.currency || 'EUR',
      planned_date: meeting.planned_date || null,
      planned_time: meeting.planned_time || null,
      manual_reason: meeting.manual_reason || null,
      is_recurring: Boolean(meeting.is_recurring),
      created_at: meeting.created_at,
      started_at: meeting.started_at,
      ended_at: meeting.ended_at,
      updated_at: state.updated_at,
      total_duration_seconds: state.elapsed_seconds,
      participant_cost_total: state.participant_cost_total,
      external_cost_total: state.external_cost_total,
      final_estimated_cost: state.total_estimated_cost,
      total_estimated_cost: state.total_estimated_cost,
      unknown_cost_count: state.unknown_cost_count,
      participants_count: state.participants.length,
      participants: state.participants,
      external_costs: state.external_costs,
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
