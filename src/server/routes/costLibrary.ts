import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/database.ts';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.ts';

const router = Router();
router.use(authMiddleware);

const itemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  default_amount: z.number().nonnegative('Amount cannot be negative').default(0.0),
  currency: z.string().default('EUR'),
});

// 1. List user's Cost Library items
router.get('/', (req: AuthenticatedRequest, res: Response): void => {
  const userId = req.user!.id;
  const items = db.prepare(`
    SELECT * FROM cost_library_items WHERE user_id = ? ORDER BY name ASC
  `).all(userId) as any[];

  res.json({
    items: items.map((it) => ({
      id: it.id,
      user_id: it.user_id,
      name: it.name,
      default_amount: Number(it.default_amount),
      currency: it.currency || 'EUR',
      created_at: it.created_at,
      updated_at: it.updated_at,
    })),
  });
});

// 2. Create Cost Library item
router.post('/', (req: AuthenticatedRequest, res: Response): void => {
  const userId = req.user!.id;
  const parseResult = itemSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.errors[0].message });
    return;
  }

  const { name, default_amount, currency } = parseResult.data;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO cost_library_items (id, user_id, name, default_amount, currency, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, name.trim(), default_amount, currency || 'EUR', now, now);

  res.status(201).json({
    item: {
      id,
      user_id: userId,
      name: name.trim(),
      default_amount,
      currency: currency || 'EUR',
      created_at: now,
      updated_at: now,
    },
  });
});

// 3. Update Cost Library item
router.put('/:id', (req: AuthenticatedRequest, res: Response): void => {
  const userId = req.user!.id;
  const { id } = req.params;

  const parseResult = itemSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.errors[0].message });
    return;
  }

  const item = db.prepare(`SELECT id FROM cost_library_items WHERE id = ? AND user_id = ?`).get(id, userId);
  if (!item) {
    res.status(404).json({ error: 'Cost library item not found' });
    return;
  }

  const { name, default_amount, currency } = parseResult.data;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE cost_library_items
    SET name = ?, default_amount = ?, currency = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(name.trim(), default_amount, currency || 'EUR', now, id, userId);

  res.json({
    item: {
      id,
      user_id: userId,
      name: name.trim(),
      default_amount,
      currency: currency || 'EUR',
      updated_at: now,
    },
  });
});

// 4. Delete Cost Library item
router.delete('/:id', (req: AuthenticatedRequest, res: Response): void => {
  const userId = req.user!.id;
  const { id } = req.params;

  const item = db.prepare(`SELECT id FROM cost_library_items WHERE id = ? AND user_id = ?`).get(id, userId);
  if (!item) {
    res.status(404).json({ error: 'Cost library item not found' });
    return;
  }

  db.prepare(`DELETE FROM cost_library_items WHERE id = ? AND user_id = ?`).run(id, userId);
  res.json({ success: true, message: 'Cost library item deleted' });
});

export default router;
