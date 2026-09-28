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
  lines.push(`"MeetingMeter Fiscal Telemetry Receipt Export"`);
  lines.push(`"Meeting Title",${JSON.stringify(meeting.title)}`);
  lines.push(`"Organizer",${JSON.stringify(user.name)}`);
  lines.push(`"Status",${JSON.stringify(meeting.status)}`);
  lines.push(`"Provenance",${JSON.stringify(state.provenance)}`);
  if (state.planned_date) {
    lines.push(`"Planned Date",${JSON.stringify(state.planned_date)}`);
  }
  if (state.planned_time) {
    lines.push(`"Planned Time",${JSON.stringify(state.planned_time)}`);
  }
  if (state.manual_reason) {
    lines.push(`"Manual Entry Reason",${JSON.stringify(state.manual_reason)}`);
  }
  lines.push(`"Created At",${JSON.stringify(meeting.created_at)}`);
  lines.push(`"Started At",${JSON.stringify(meeting.started_at || '')}`);
  lines.push(`"Ended At",${JSON.stringify(meeting.ended_at || '')}`);
  lines.push(`"Last Updated",${JSON.stringify(state.updated_at)}`);
  lines.push(`"Total Duration",${JSON.stringify(formatDuration(state.elapsed_seconds))}`);
  lines.push(`"Participant Cost Total",${JSON.stringify(state.participant_cost_total.toFixed(2) + ' ' + (meeting.currency || 'EUR'))}`);
  lines.push(`"External Cost Total",${JSON.stringify(state.external_cost_total.toFixed(2) + ' ' + (meeting.currency || 'EUR'))}`);
  lines.push(`"Final Estimated Cost",${JSON.stringify(state.total_estimated_cost.toFixed(2) + ' ' + (meeting.currency || 'EUR'))}`);
  lines.push(`"Unknown Cost Participants",${state.unknown_cost_count}`);
  lines.push(``);

  // Participants table
  lines.push(`"PARTICIPANT BREAKDOWN"`);
  lines.push(`"Participant","Type","Role","Organization","State","Hourly Rate","Participation Time","Calculated Cost (${meeting.currency || 'EUR'})"`);

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

  // External costs table if present
  if (state.external_costs && state.external_costs.length > 0) {
    lines.push(``);
    lines.push(`"EXTERNAL COSTS BREAKDOWN"`);
    lines.push(`"Item Description","Amount (${meeting.currency || 'EUR'})","Source / Override"`);
    for (const ec of state.external_costs) {
      lines.push([
        JSON.stringify(ec.name),
        JSON.stringify(ec.amount.toFixed(2)),
        JSON.stringify(ec.is_overridden ? 'Overridden' : ec.cost_library_id ? 'Cost Library' : 'Custom'),
      ].join(','));
    }
  }

  lines.push(``);
  lines.push(`"Disclaimer: MeetingMeter estimated calculation only. Not an official financial or payroll document."`);

  const csvContent = lines.join('\r\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="meetingmeter-${meeting.id}.csv"`);
  res.send(csvContent);
});

export default router;
