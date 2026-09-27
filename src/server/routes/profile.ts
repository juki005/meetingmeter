import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/database.ts';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.ts';

const router = Router();

const updateProfileSchema = z.object({
  name: z.string().min(1),
  job_title: z.string().optional().nullable(),
  hourly_rate: z.number().nonnegative(),
  currency: z.string().default('EUR'),
});

router.use(authMiddleware);

router.get('/', (req: AuthenticatedRequest, res: Response): void => {
  const user = db.prepare(`SELECT id, email, name, job_title, hourly_rate, currency, created_at FROM users WHERE id = ?`).get(req.user!.id) as any;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({
    user: {
      ...user,
      hourly_rate: Number(user.hourly_rate),
    },
  });
});

router.put('/', (req: AuthenticatedRequest, res: Response): void => {
  const result = updateProfileSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const { name, job_title, hourly_rate, currency } = result.data;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE users SET name = ?, job_title = ?, hourly_rate = ?, currency = ?, updated_at = ?
    WHERE id = ?
  `).run(name, job_title || null, hourly_rate, currency, now, req.user!.id);

  res.json({
    user: {
      id: req.user!.id,
      email: req.user!.email,
      name,
      job_title: job_title || null,
      hourly_rate,
      currency,
    },
  });
});

export default router;
