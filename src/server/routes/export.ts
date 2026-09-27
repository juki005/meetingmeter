import { Router, Response } from 'express';
import { db } from '../db/database.ts';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.ts';
import { computeLiveMeetingState } from '../services/calculation.ts';

const router = Router();
router.use(authMiddleware);

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

router.get('/:id/csv', (req: AuthenticatedRequest, res: Response): void => {
  const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ? AND user_id = ?`).get(req.params.id, req.user!.id) as any;
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  const user = db.prepare(`SELECT name, email FROM users WHERE id = ?`).get(meeting.user_id) as any;
  const state = computeLiveMeetingState(req.params.id);
  if (!state) {
    res.status(404).json({ error: 'State computation failed' });
    return;
  }

  const lines: string[] = [];
  lines.push(`"MeetingMeter Fiscal Receipt Export"`);
  lines.push(`"Meeting Title",${JSON.stringify(meeting.title)}`);
  lines.push(`"Organizer",${JSON.stringify(user.name)}`);
  lines.push(`"Status",${JSON.stringify(meeting.status)}`);
  lines.push(`"Created At",${JSON.stringify(meeting.created_at)}`);
  lines.push(`"Started At",${JSON.stringify(meeting.started_at || '')}`);
  lines.push(`"Ended At",${JSON.stringify(meeting.ended_at || '')}`);
  lines.push(`"Total Duration",${JSON.stringify(formatDuration(state.elapsed_seconds))}`);
  lines.push(`"Final Estimated Cost",${JSON.stringify(state.accumulated_cost + ' ' + meeting.currency)}`);
  lines.push(`"Unknown Cost Participants",${state.unknown_cost_count}`);
  lines.push(``);
  lines.push(`"Participant","Type","Role","Organization","State","Hourly Rate","Measured Time","Calculated Cost (${meeting.currency})"`);

  for (const p of state.participants) {
    const rateStr = p.rate_known && p.hourly_rate_snapshot !== null ? p.hourly_rate_snapshot.toFixed(2) : 'UNKNOWN';
    const costStr = p.rate_known && p.calculated_cost !== null ? p.calculated_cost.toFixed(2) : 'UNKNOWN';
    lines.push([
      JSON.stringify(p.name),
      JSON.stringify(p.is_guest ? 'Guest' : 'Internal'),
      JSON.stringify(p.role || '-'),
      JSON.stringify(p.organization || '-'),
      JSON.stringify(p.state),
      JSON.stringify(rateStr),
      JSON.stringify(formatDuration(p.measured_seconds)),
      JSON.stringify(costStr),
    ].join(','));
  }

  lines.push(``);
  lines.push(`"Disclaimer: MeetingMeter estimated calculation only. Not an official financial or payroll document."`);

  const csvContent = lines.join('\r\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="meetingmeter-${meeting.id}.csv"`);
  res.send(csvContent);
});

export default router;
