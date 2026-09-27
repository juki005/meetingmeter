import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/database.ts';
import { generateToken, authMiddleware, AuthenticatedRequest } from '../middleware/auth.ts';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  job_title: z.string().optional(),
  hourly_rate: z.number().nonnegative().default(0),
  currency: z.string().default('EUR'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/register', (req: Request, res: Response): void => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const { email, password, name, job_title, hourly_rate, currency } = result.data;

  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email.toLowerCase());
  if (existing) {
    res.status(409).json({ error: 'User with this email already exists' });
    return;
  }

  const password_hash = bcrypt.hashSync(password, 10);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, job_title, hourly_rate, currency, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, email.toLowerCase(), password_hash, name, job_title || null, hourly_rate, currency, now, now);

  const token = generateToken({ id, email: email.toLowerCase() });
  res.status(201).json({
    token,
    user: {
      id,
      email: email.toLowerCase(),
      name,
      job_title: job_title || null,
      hourly_rate,
      currency,
    },
  });
});

router.post('/login', (req: Request, res: Response): void => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const { email, password } = result.data;
  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase()) as any;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const token = generateToken({ id: user.id, email: user.email });
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      job_title: user.job_title,
      hourly_rate: Number(user.hourly_rate),
      currency: user.currency || 'EUR',
    },
  });
});

router.get('/me', authMiddleware, (req: AuthenticatedRequest, res: Response): void => {
  res.json({ user: req.user });
});

export default router;
