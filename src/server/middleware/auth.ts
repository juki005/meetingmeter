import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/database.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'meetingmeter-super-secret-key-2026';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  job_title: string | null;
  hourly_rate: number;
  currency: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export function generateToken(user: { id: string; email: string }): string {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    const user = db.prepare(`SELECT id, email, name, job_title, hourly_rate, currency FROM users WHERE id = ?`).get(payload.id) as any;
    
    if (!user) {
      res.status(401).json({ error: 'Unauthorized: User not found' });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      job_title: user.job_title,
      hourly_rate: Number(user.hourly_rate),
      currency: user.currency || 'EUR',
    };

    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}
