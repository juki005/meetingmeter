import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/database.ts';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.ts';

const router = Router();

router.use(authMiddleware);

const personSchema = z.object({
  type: z.enum(['internal', 'guest']),
  name: z.string().min(1),
  role: z.string().optional().nullable(),
  organization: z.string().optional().nullable(),
  hourly_rate: z.number().nonnegative().optional().nullable(),
  rate_known: z.boolean().default(true),
});

router.get('/', (req: AuthenticatedRequest, res: Response): void => {
  const people = db.prepare(`
    SELECT * FROM people WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.user!.id) as any[];

  res.json({
    people: people.map((p) => ({
      ...p,
      rate_known: Boolean(p.rate_known),
      hourly_rate: p.rate_known && p.hourly_rate !== null ? Number(p.hourly_rate) : null,
    })),
  });
});

router.post('/', (req: AuthenticatedRequest, res: Response): void => {
  const result = personSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const { type, name, role, organization, hourly_rate, rate_known } = result.data;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const finalRateKnown = type === 'internal' ? true : rate_known;
  const finalHourlyRate = finalRateKnown ? (hourly_rate ?? 0) : null;

  db.prepare(`
    INSERT INTO people (id, user_id, type, name, role, organization, hourly_rate, rate_known, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user!.id, type, name, role || null, organization || null, finalHourlyRate, finalRateKnown ? 1 : 0, now, now);

  res.status(201).json({
    person: {
      id,
      user_id: req.user!.id,
      type,
      name,
      role: role || null,
      organization: organization || null,
      hourly_rate: finalHourlyRate,
      rate_known: finalRateKnown,
      created_at: now,
      updated_at: now,
    },
  });
});

router.put('/:id', (req: AuthenticatedRequest, res: Response): void => {
  const existing = db.prepare(`SELECT * FROM people WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id);
  if (!existing) {
    res.status(404).json({ error: 'Person not found' });
    return;
  }

  const result = personSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const { type, name, role, organization, hourly_rate, rate_known } = result.data;
  const now = new Date().toISOString();
  const finalRateKnown = type === 'internal' ? true : rate_known;
  const finalHourlyRate = finalRateKnown ? (hourly_rate ?? 0) : null;

  db.prepare(`
    UPDATE people
    SET type = ?, name = ?, role = ?, organization = ?, hourly_rate = ?, rate_known = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(type, name, role || null, organization || null, finalHourlyRate, finalRateKnown ? 1 : 0, now, req.params.id, req.user!.id);

  res.json({
    person: {
      id: req.params.id,
      user_id: req.user!.id,
      type,
      name,
      role: role || null,
      organization: organization || null,
      hourly_rate: finalHourlyRate,
      rate_known: finalRateKnown,
      updated_at: now,
    },
  });
});

router.delete('/:id', (req: AuthenticatedRequest, res: Response): void => {
  const existing = db.prepare(`SELECT * FROM people WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id);
  if (!existing) {
    res.status(404).json({ error: 'Person not found' });
    return;
  }

  db.prepare(`DELETE FROM people WHERE id = ? AND user_id = ?`).run(req.params.id, req.user!.id);
  res.json({ success: true, message: 'Person deleted' });
});

export default router;
