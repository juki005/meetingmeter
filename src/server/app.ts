import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.ts';
import profileRoutes from './routes/profile.ts';
import peopleRoutes from './routes/people.ts';
import costLibraryRoutes from './routes/costLibrary.ts';
import meetingRoutes from './routes/meetings.ts';
import exportRoutes from './routes/export.ts';

export const app = express();

app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/people', peopleRoutes);
app.use('/api/cost-library', costLibraryRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/export', exportRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'MeetingMeter API', timestamp: new Date().toISOString() });
});

// 404 handler for API
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Endpoint not found' });
    return;
  }
  next();
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('API Error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

export default app;
