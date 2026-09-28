import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/server/app.ts';
import db from '../src/server/db/database.ts';

describe('MeetingMeter Technical QA Test Suite (v1.1 Extended)', () => {
  beforeEach(() => {
    db.exec(`
      DELETE FROM measurement_intervals;
      DELETE FROM meeting_participants;
      DELETE FROM meeting_external_costs;
      DELETE FROM cost_library_items;
      DELETE FROM meetings;
      DELETE FROM people;
      DELETE FROM users;
    `);
  });

  it('1. Authentication & Profile Persistence', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'alice@example.com',
        password: 'password123',
        name: 'Alice Organizer',
        job_title: 'Engineering Director',
        hourly_rate: 150,
        currency: 'EUR',
      });

    expect(regRes.status).toBe(201);
    expect(regRes.body.token).toBeDefined();
    expect(regRes.body.user.name).toBe('Alice Organizer');
    expect(regRes.body.user.hourly_rate).toBe(150);

    const token = regRes.body.token;

    // Fetch Profile
    const profRes = await request(app)
      .get('/api/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(profRes.status).toBe(200);
    expect(profRes.body.user.hourly_rate).toBe(150);

    // Update Profile
    const updateRes = await request(app)
      .put('/api/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Alice O.',
        job_title: 'VP Engineering',
        hourly_rate: 180,
        currency: 'EUR',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.user.hourly_rate).toBe(180);
    expect(updateRes.body.user.name).toBe('Alice O.');
  });

  it('2. People & Guest Persistence with known vs unknown rates', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'organizer@example.com',
      password: 'password123',
      name: 'Organizer',
      hourly_rate: 100,
    });
    const token = reg.body.token;

    // Create Internal Person (known rate)
    const p1 = await request(app)
      .post('/api/people')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'internal',
        name: 'Bob Engineer',
        role: 'Senior Developer',
        hourly_rate: 120,
      });
    expect(p1.status).toBe(201);
    expect(p1.body.person.hourly_rate).toBe(120);
    expect(p1.body.person.rate_known).toBe(true);

    // Create Guest with known rate
    const p2 = await request(app)
      .post('/api/people')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'guest',
        name: 'Carol Client',
        role: 'Stakeholder',
        organization: 'Acme Corp',
        hourly_rate: 200,
        rate_known: true,
      });
    expect(p2.status).toBe(201);
    expect(p2.body.person.hourly_rate).toBe(200);
    expect(p2.body.person.rate_known).toBe(true);

    // Create Guest with UNKNOWN rate (must not be zero)
    const p3 = await request(app)
      .post('/api/people')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'guest',
        name: 'Dave Unknown',
        role: 'Specialist',
        organization: 'Partner Inc',
        rate_known: false,
      });
    expect(p3.status).toBe(201);
    expect(p3.body.person.hourly_rate).toBeNull();
    expect(p3.body.person.rate_known).toBe(false);
  });

  it('3. Meeting Lifecycle: Prepared -> Start -> Pause -> Resume -> Leave -> End', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'host@example.com',
      password: 'password123',
      name: 'Host',
      hourly_rate: 100,
    });
    const token = reg.body.token;

    // Create Meeting in PREPARED status
    const mRes = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Sprint Planning',
        currency: 'EUR',
        status: 'PREPARED',
        participants: [
          { name: 'Host (Self)', hourly_rate: 120, rate_known: true, selected: true },
          { name: 'Alice Engineer', hourly_rate: 120, rate_known: true, selected: true },
          { name: 'Bob Guest Known', is_guest: true, hourly_rate: 180, rate_known: true, selected: true },
          { name: 'Charlie Guest Unknown', is_guest: true, rate_known: false, selected: true },
        ],
      });

    expect(mRes.status).toBe(201);
    const meetingId = mRes.body.meeting.id;
    expect(mRes.body.meeting.status).toBe('PREPARED');
    expect(mRes.body.meeting.total_estimated_cost).toBe(0);
    expect(mRes.body.meeting.unknown_cost_count).toBe(1);

    const parts = mRes.body.meeting.participants;
    expect(parts.length).toBe(4);
    const pAlice = parts.find((p: any) => p.name === 'Alice Engineer');
    const pBob = parts.find((p: any) => p.name === 'Bob Guest Known');

    // 1. Explicit Start
    const startRes = await request(app)
      .post(`/api/meetings/${meetingId}/start`)
      .set('Authorization', `Bearer ${token}`);

    expect(startRes.status).toBe(200);
    expect(startRes.body.meeting.status).toBe('LIVE');
    expect(startRes.body.meeting.started_at).toBeDefined();

    // 2. Pause Alice
    const pauseRes = await request(app)
      .post(`/api/meetings/${meetingId}/pause`)
      .set('Authorization', `Bearer ${token}`)
      .send({ participant_id: pAlice.id });

    expect(pauseRes.status).toBe(200);
    const pausedAlice = pauseRes.body.meeting.participants.find((p: any) => p.id === pAlice.id);
    expect(pausedAlice.state).toBe('PAUSED');

    // 3. Resume Alice
    const resumeRes = await request(app)
      .post(`/api/meetings/${meetingId}/resume`)
      .set('Authorization', `Bearer ${token}`)
      .send({ participant_id: pAlice.id });

    expect(resumeRes.status).toBe(200);
    const resumedAlice = resumeRes.body.meeting.participants.find((p: any) => p.id === pAlice.id);
    expect(resumedAlice.state).toBe('ACTIVE');

    // 4. Bob leaves early
    const leaveRes = await request(app)
      .post(`/api/meetings/${meetingId}/leave`)
      .set('Authorization', `Bearer ${token}`)
      .send({ participant_id: pBob.id });

    expect(leaveRes.status).toBe(200);
    const leftBob = leaveRes.body.meeting.participants.find((p: any) => p.id === pBob.id);
    expect(leftBob.state).toBe('LEFT');
    expect(leftBob.left_at).toBeDefined();

    // 5. End Meeting
    const endRes = await request(app)
      .post(`/api/meetings/${meetingId}/end`)
      .set('Authorization', `Bearer ${token}`);

    expect(endRes.status).toBe(200);
    expect(endRes.body.meeting.status).toBe('ENDED');
    expect(endRes.body.meeting.ended_at).toBeDefined();
    expect(endRes.body.meeting.unknown_cost_count).toBe(1);

    // 6. Final Receipt endpoint
    const receiptRes = await request(app)
      .get(`/api/meetings/${meetingId}/receipt`)
      .set('Authorization', `Bearer ${token}`);

    expect(receiptRes.status).toBe(200);
    expect(receiptRes.body.receipt.title).toBe('Sprint Planning');
    expect(receiptRes.body.receipt.final_estimated_cost).toBeGreaterThanOrEqual(0);
    expect(receiptRes.body.receipt.unknown_cost_count).toBe(1);
    expect(receiptRes.body.receipt.estimate_disclaimer).toContain('Not an official accounting');
  });

  it('4. Immutability of Final Results: Profile rate edits do not change historical meetings', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'history@example.com',
      password: 'password123',
      name: 'History Tester',
      hourly_rate: 100,
    });
    const token = reg.body.token;

    // Create and End a meeting immediately
    const mRes = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Retro',
        participants: [
          { name: 'History Tester', hourly_rate: 100, rate_known: true, selected: true },
        ],
      });
    const mId = mRes.body.meeting.id;

    await request(app).post(`/api/meetings/${mId}/start`).set('Authorization', `Bearer ${token}`);
    const endRes = await request(app).post(`/api/meetings/${mId}/end`).set('Authorization', `Bearer ${token}`);
    const originalCost = endRes.body.meeting.accumulated_cost;

    // Now user changes profile rate to 500
    await request(app).put('/api/profile').set('Authorization', `Bearer ${token}`).send({
      name: 'History Tester',
      hourly_rate: 500,
      currency: 'EUR',
    });

    // Fetch the meeting again
    const fetchAgain = await request(app).get(`/api/meetings/${mId}`).set('Authorization', `Bearer ${token}`);
    expect(fetchAgain.body.meeting.accumulated_cost).toBe(originalCost);
    expect(fetchAgain.body.meeting.status).toBe('ENDED');
  });

  it('5. Privacy & Cross-User Authorization Protection', async () => {
    const reg1 = await request(app).post('/api/auth/register').send({
      email: 'user1@example.com',
      password: 'password123',
      name: 'User One',
      hourly_rate: 100,
    });
    const token1 = reg1.body.token;

    const reg2 = await request(app).post('/api/auth/register').send({
      email: 'user2@example.com',
      password: 'password123',
      name: 'User Two',
      hourly_rate: 100,
    });
    const token2 = reg2.body.token;

    // User 1 creates a meeting
    const m1 = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        title: 'Secret User 1 Meeting',
        participants: [{ name: 'User 1', hourly_rate: 100, rate_known: true }],
      });
    const m1Id = m1.body.meeting.id;

    // User 2 attempts to read User 1 meeting -> 404
    const u2Read = await request(app)
      .get(`/api/meetings/${m1Id}`)
      .set('Authorization', `Bearer ${token2}`);
    expect(u2Read.status).toBe(404);

    // User 2 attempts to start/end User 1 meeting -> 404
    const u2End = await request(app)
      .post(`/api/meetings/${m1Id}/end`)
      .set('Authorization', `Bearer ${token2}`);
    expect(u2End.status).toBe(404);

    // User 2 meeting list does not contain User 1 meeting
    const u2List = await request(app)
      .get('/api/meetings')
      .set('Authorization', `Bearer ${token2}`);
    expect(u2List.body.meetings.length).toBe(0);
  });

  it('6. CSV Export contains required receipt schema with v1.1 totals and external items', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'csv@example.com',
      password: 'password123',
      name: 'CSV Export Tester',
      hourly_rate: 100,
    });
    const token = reg.body.token;

    const m = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'CSV Review Meeting',
        participants: [
          { name: 'Internal 1', hourly_rate: 150, rate_known: true },
          { name: 'Guest Unknown', is_guest: true, rate_known: false },
        ],
        external_costs: [
          { name: 'Catering & Coffee', amount: 75.0, currency: 'EUR' }
        ],
      });
    const mId = m.body.meeting.id;
    await request(app).post(`/api/meetings/${mId}/start`).set('Authorization', `Bearer ${token}`);
    await request(app).post(`/api/meetings/${mId}/end`).set('Authorization', `Bearer ${token}`);

    const csvRes = await request(app)
      .get(`/api/export/${mId}/csv`)
      .set('Authorization', `Bearer ${token}`);

    expect(csvRes.status).toBe(200);
    expect(csvRes.header['content-type']).toContain('text/csv');
    expect(csvRes.text).toContain('MeetingMeter Fiscal Telemetry Receipt Export');
    expect(csvRes.text).toContain('CSV Review Meeting');
    expect(csvRes.text).toContain('Catering & Coffee');
    expect(csvRes.text).toContain('75.00');
    expect(csvRes.text).toContain('Guest Unknown');
    expect(csvRes.text).toContain('UNKNOWN');
    expect(csvRes.text).toContain('Disclaimer: MeetingMeter estimated calculation only.');
  });

  it('7. State transition edge-cases: Cannot resume an active participant or start twice', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'edge@example.com',
      password: 'password123',
      name: 'Edge Tester',
      hourly_rate: 100,
    });
    const token = reg.body.token;

    const m = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Edge Cases Meeting',
        participants: [{ name: 'Participant A', hourly_rate: 100, rate_known: true }],
      });
    const mId = m.body.meeting.id;
    const pId = m.body.meeting.participants[0].id;

    // Start meeting
    await request(app).post(`/api/meetings/${mId}/start`).set('Authorization', `Bearer ${token}`);

    // Cannot start again
    const reStart = await request(app).post(`/api/meetings/${mId}/start`).set('Authorization', `Bearer ${token}`);
    expect(reStart.status).toBe(400);

    // Cannot resume an active participant
    const badResume = await request(app)
      .post(`/api/meetings/${mId}/resume`)
      .set('Authorization', `Bearer ${token}`)
      .send({ participant_id: pId });
    expect(badResume.status).toBe(400);

    // Cannot pause a paused participant
    await request(app).post(`/api/meetings/${mId}/pause`).set('Authorization', `Bearer ${token}`).send({ participant_id: pId });
    const badPause = await request(app)
      .post(`/api/meetings/${mId}/pause`)
      .set('Authorization', `Bearer ${token}`)
      .send({ participant_id: pId });
    expect(badPause.status).toBe(400);

    // Leave
    await request(app).post(`/api/meetings/${mId}/leave`).set('Authorization', `Bearer ${token}`).send({ participant_id: pId });
    
    // Cannot leave again
    const badLeave = await request(app)
      .post(`/api/meetings/${mId}/leave`)
      .set('Authorization', `Bearer ${token}`)
      .send({ participant_id: pId });
    expect(badLeave.status).toBe(400);
  });

  it('8. Prepared Meetings: Creation, Rescheduling, Deletion, and Start', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'prepared@example.com',
      password: 'password123',
      name: 'Planner',
      hourly_rate: 120,
    });
    const token = reg.body.token;

    // 1. Create PREPARED meeting with planned date/time
    const createRes = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Future Roadmap Alignment',
        status: 'PREPARED',
        planned_date: '2026-10-15',
        planned_time: '14:00',
        is_recurring: true,
        participants: [
          { name: 'Planner (Self)', hourly_rate: 120, rate_known: true, selected: true },
          { name: 'Architect Bob', hourly_rate: 150, rate_known: true, selected: true },
        ],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.meeting.status).toBe('PREPARED');
    expect(createRes.body.meeting.planned_date).toBe('2026-10-15');
    expect(createRes.body.meeting.is_recurring).toBe(true);
    expect(createRes.body.meeting.total_estimated_cost).toBe(0);

    const mId = createRes.body.meeting.id;

    // 2. Reschedule and update title
    const updateRes = await request(app)
      .put(`/api/meetings/${mId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Future Roadmap Alignment - Rescheduled',
        planned_date: '2026-10-16',
        planned_time: '15:30',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.meeting.title).toBe('Future Roadmap Alignment - Rescheduled');
    expect(updateRes.body.meeting.planned_date).toBe('2026-10-16');
    expect(updateRes.body.meeting.planned_time).toBe('15:30');

    // 3. Start the prepared meeting
    const startRes = await request(app)
      .post(`/api/meetings/${mId}/start`)
      .set('Authorization', `Bearer ${token}`);

    expect(startRes.status).toBe(200);
    expect(startRes.body.meeting.status).toBe('LIVE');
    expect(startRes.body.meeting.started_at).toBeDefined();

    // 4. Create another prepared meeting and delete it
    const delTarget = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Meeting to Delete',
        status: 'PREPARED',
        participants: [{ name: 'Planner', hourly_rate: 120, rate_known: true }],
      });
    const delId = delTarget.body.meeting.id;

    const delRes = await request(app)
      .delete(`/api/meetings/${delId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(200);

    const checkDel = await request(app).get(`/api/meetings/${delId}`).set('Authorization', `Bearer ${token}`);
    expect(checkDel.status).toBe(404);
  });

  it('9. Missed / Not Held Meetings Classification', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'missed@example.com',
      password: 'password123',
      name: 'Missed Planner',
      hourly_rate: 100,
    });
    const token = reg.body.token;

    // Create a prepared meeting in the PAST
    const mRes = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Yesterday Alignment',
        status: 'PREPARED',
        planned_date: '2020-01-01',
        planned_time: '10:00',
        participants: [{ name: 'Planner', hourly_rate: 100, rate_known: true }],
      });

    expect(mRes.status).toBe(201);

    // List meetings -> verify is_missed = true
    const listRes = await request(app)
      .get('/api/meetings')
      .set('Authorization', `Bearer ${token}`);

    const missedMeeting = listRes.body.meetings.find((m: any) => m.id === mRes.body.meeting.id);
    expect(missedMeeting.is_missed).toBe(true);
    expect(missedMeeting.status).toBe('PREPARED');
    expect(missedMeeting.total_estimated_cost).toBe(0);
  });

  it('10. Recurring Meeting Duplication', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'recurring@example.com',
      password: 'password123',
      name: 'Recurring Host',
      hourly_rate: 100,
    });
    const token = reg.body.token;

    // Create source recurring meeting with external costs
    const mRes = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Weekly Standup Template',
        status: 'PREPARED',
        is_recurring: true,
        participants: [
          { name: 'Dev 1', hourly_rate: 100, rate_known: true },
          { name: 'Dev 2', hourly_rate: 150, rate_known: true },
        ],
        external_costs: [
          { name: 'Breakfast Bagels', amount: 30.0, currency: 'EUR' }
        ],
      });
    const origId = mRes.body.meeting.id;

    // Duplicate
    const dupRes = await request(app)
      .post(`/api/meetings/${origId}/duplicate`)
      .set('Authorization', `Bearer ${token}`);

    expect(dupRes.status).toBe(201);
    expect(dupRes.body.meeting.id).not.toBe(origId);
    expect(dupRes.body.meeting.title).toContain('Recurring Copy');
    expect(dupRes.body.meeting.status).toBe('PREPARED');
    expect(dupRes.body.meeting.participants.length).toBe(2);
    expect(dupRes.body.meeting.external_costs.length).toBe(1);
    expect(dupRes.body.meeting.external_costs[0].name).toBe('Breakfast Bagels');
  });

  it('11. Manual Entry: Creation, Validation (0 <= dur <= meeting_dur), Provenance, and Editing', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'manual@example.com',
      password: 'password123',
      name: 'Manual Reconstructor',
      hourly_rate: 120,
    });
    const token = reg.body.token;

    // 1. Validation failure: participant duration > meeting duration
    const badReq = await request(app)
      .post('/api/meetings/manual')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Offline Strategic Workshop',
        planned_date: '2026-09-20',
        meeting_duration_seconds: 3600, // 1 hour
        participants: [
          { name: 'Overtime Dave', hourly_rate: 100, rate_known: true, manual_duration_seconds: 5000 },
        ],
      });
    expect(badReq.status).toBe(400);
    expect(badReq.body.error).toContain('must be between 0 and meeting duration');

    // 2. Successful Manual Entry creation
    const manualRes = await request(app)
      .post('/api/meetings/manual')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Offline Strategic Workshop',
        planned_date: '2026-09-20',
        planned_time: '09:00',
        meeting_duration_seconds: 3600, // 1 hour
        manual_reason: 'Forgot to start live timer during board workshop',
        currency: 'EUR',
        participants: [
          { name: 'Director Alice', hourly_rate: 180, rate_known: true, manual_duration_seconds: 3600 }, // 1 hr = 180 EUR
          { name: 'Lead Bob', hourly_rate: 120, rate_known: true, manual_duration_seconds: 1800 }, // 0.5 hr = 60 EUR
          { name: 'Zero Participant', hourly_rate: 100, rate_known: true, manual_duration_seconds: 0 }, // 0 EUR
          { name: 'Guest Unknown', is_guest: true, rate_known: false, manual_duration_seconds: 3600 }, // Unknown
        ],
        external_costs: [
          { name: 'Conference Room Rental', amount: 200.0, currency: 'EUR' },
        ],
      });

    expect(manualRes.status).toBe(201);
    expect(manualRes.body.meeting.provenance).toBe('MANUAL_ENTRY');
    expect(manualRes.body.meeting.status).toBe('ENDED');
    expect(manualRes.body.meeting.manual_reason).toBe('Forgot to start live timer during board workshop');
    expect(manualRes.body.meeting.participant_cost_total).toBe(240); // 180 + 60
    expect(manualRes.body.meeting.external_cost_total).toBe(200);
    expect(manualRes.body.meeting.total_estimated_cost).toBe(440); // 240 + 200
    expect(manualRes.body.meeting.unknown_cost_count).toBe(1);

    const mId = manualRes.body.meeting.id;

    // 3. Edit Manual Entry and recalculate
    const editManual = await request(app)
      .put(`/api/meetings/${mId}/manual`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Offline Strategic Workshop (Revised)',
        planned_date: '2026-09-20',
        meeting_duration_seconds: 3600,
        manual_reason: 'Updated catering bill',
        participants: [
          { name: 'Director Alice', hourly_rate: 180, rate_known: true, manual_duration_seconds: 3600 }, // 180
          { name: 'Lead Bob', hourly_rate: 120, rate_known: true, manual_duration_seconds: 3600 }, // 120
        ],
        external_costs: [
          { name: 'Conference Room Rental', amount: 250.0, currency: 'EUR' },
        ],
      });

    expect(editManual.status).toBe(200);
    expect(editManual.body.meeting.title).toBe('Offline Strategic Workshop (Revised)');
    expect(editManual.body.meeting.participant_cost_total).toBe(300); // 180 + 120
    expect(editManual.body.meeting.external_cost_total).toBe(250);
    expect(editManual.body.meeting.total_estimated_cost).toBe(550);
  });

  it('12. Cost Library: CRUD, Default Copying, and Independent Per-Meeting Override', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'library@example.com',
      password: 'password123',
      name: 'Library Admin',
      hourly_rate: 100,
    });
    const token = reg.body.token;

    // 1. Create Cost Library Item
    const createLib = await request(app)
      .post('/api/cost-library')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Executive Catering Lunch',
        default_amount: 150.0,
        currency: 'EUR',
      });

    expect(createLib.status).toBe(201);
    expect(createLib.body.item.name).toBe('Executive Catering Lunch');
    expect(createLib.body.item.default_amount).toBe(150);
    const libId = createLib.body.item.id;

    // 2. List Cost Library
    const listLib = await request(app)
      .get('/api/cost-library')
      .set('Authorization', `Bearer ${token}`);
    expect(listLib.body.items.length).toBe(1);

    // 3. Create meeting copying the Cost Library item with a meeting-specific override
    const mRes = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Meeting with Overridden Catering',
        participants: [{ name: 'Admin', hourly_rate: 100, rate_known: true }],
        external_costs: [
          {
            cost_library_id: libId,
            name: 'Executive Catering Lunch',
            amount: 120.0, // Override price from 150 to 120
            currency: 'EUR',
            is_overridden: true,
          }
        ],
      });

    expect(mRes.status).toBe(201);
    expect(mRes.body.meeting.external_cost_total).toBe(120);

    // 4. Update the Cost Library default to 200
    await request(app)
      .put(`/api/cost-library/${libId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Executive Catering Lunch',
        default_amount: 200.0,
      });

    // 5. Verify meeting applied amount remains 120 and was NOT overwritten by library update
    const checkMeeting = await request(app)
      .get(`/api/meetings/${mRes.body.meeting.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(checkMeeting.body.meeting.external_cost_total).toBe(120);
    expect(checkMeeting.body.meeting.external_costs[0].amount).toBe(120);
    expect(checkMeeting.body.meeting.external_costs[0].is_overridden).toBe(true);
  });

  it('13. Post-End External-Cost Mutation: Recalculates total while keeping participant measurement locked', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'postend@example.com',
      password: 'password123',
      name: 'Auditor',
      hourly_rate: 120,
    });
    const token = reg.body.token;

    // Create and End a live meeting
    const mRes = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Client Strategy Session',
        status: 'LIVE',
        participants: [
          { name: 'Auditor', hourly_rate: 120, rate_known: true, selected: true },
        ],
        external_costs: [
          { name: 'Initial Taxi Fare', amount: 35.0, currency: 'EUR' },
        ],
      });

    const mId = mRes.body.meeting.id;
    const endRes = await request(app).post(`/api/meetings/${mId}/end`).set('Authorization', `Bearer ${token}`);
    expect(endRes.body.meeting.status).toBe('ENDED');
    const lockedParticipantCost = endRes.body.meeting.participant_cost_total;
    const initialCostId = endRes.body.meeting.external_costs[0].id;

    // 1. Add post-End external cost (e.g. late catering invoice)
    const addCostRes = await request(app)
      .post(`/api/meetings/${mId}/external-costs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Late Catering Invoice',
        amount: 85.0,
        currency: 'EUR',
      });

    expect(addCostRes.status).toBe(201);
    expect(addCostRes.body.meeting.status).toBe('ENDED'); // Still ENDED
    expect(addCostRes.body.meeting.participant_cost_total).toBe(lockedParticipantCost); // Participant cost unchanged
    expect(addCostRes.body.meeting.external_cost_total).toBe(120); // 35 + 85
    expect(addCostRes.body.meeting.total_estimated_cost).toBe(lockedParticipantCost + 120);

    // 2. Edit existing cost
    const editCostRes = await request(app)
      .put(`/api/meetings/${mId}/external-costs/${initialCostId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Initial Taxi Fare (Adjusted)',
        amount: 40.0, // 35 -> 40
        currency: 'EUR',
      });

    expect(editCostRes.status).toBe(200);
    expect(editCostRes.body.meeting.external_cost_total).toBe(125); // 40 + 85
    expect(editCostRes.body.meeting.total_estimated_cost).toBe(lockedParticipantCost + 125);
    expect(editCostRes.body.meeting.updated_at).toBeDefined();

    // 3. Delete cost
    const delCostRes = await request(app)
      .delete(`/api/meetings/${mId}/external-costs/${initialCostId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(delCostRes.status).toBe(200);
    expect(delCostRes.body.meeting.external_cost_total).toBe(85);
    expect(delCostRes.body.meeting.total_estimated_cost).toBe(lockedParticipantCost + 85);
  });
});
