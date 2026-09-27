import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../src/server/app.ts';
import db from '../src/server/db/database.ts';

describe('MeetingMeter Technical QA Test Suite', () => {
  beforeEach(() => {
    db.exec(`
      DELETE FROM measurement_intervals;
      DELETE FROM meeting_participants;
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

  it('3. Meeting Lifecycle: Configured -> Start -> Pause -> Resume -> Leave -> End', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'host@example.com',
      password: 'password123',
      name: 'Host',
      hourly_rate: 100,
    });
    const token = reg.body.token;

    // Create Meeting in CONFIGURED status
    const mRes = await request(app)
      .post('/api/meetings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Sprint Planning',
        currency: 'EUR',
        participants: [
          { name: 'Host (Self)', hourly_rate: 120, rate_known: true, selected: true },
          { name: 'Alice Engineer', hourly_rate: 120, rate_known: true, selected: true },
          { name: 'Bob Guest Known', is_guest: true, hourly_rate: 180, rate_known: true, selected: true },
          { name: 'Charlie Guest Unknown', is_guest: true, rate_known: false, selected: true },
        ],
      });

    expect(mRes.status).toBe(201);
    const meetingId = mRes.body.meeting.id;
    expect(mRes.body.meeting.status).toBe('CONFIGURED');
    expect(mRes.body.meeting.accumulated_cost).toBe(0);
    expect(mRes.body.meeting.unknown_cost_count).toBe(1);

    const parts = mRes.body.meeting.participants;
    expect(parts.length).toBe(4);
    const pHost = parts.find((p: any) => p.name === 'Host (Self)');
    const pAlice = parts.find((p: any) => p.name === 'Alice Engineer');
    const pBob = parts.find((p: any) => p.name === 'Bob Guest Known');
    const pCharlie = parts.find((p: any) => p.name === 'Charlie Guest Unknown');

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
    // User 1
    const reg1 = await request(app).post('/api/auth/register').send({
      email: 'user1@example.com',
      password: 'password123',
      name: 'User One',
      hourly_rate: 100,
    });
    const token1 = reg1.body.token;

    // User 2
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

  it('6. CSV Export contains required receipt schema', async () => {
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
      });
    const mId = m.body.meeting.id;
    await request(app).post(`/api/meetings/${mId}/start`).set('Authorization', `Bearer ${token}`);
    await request(app).post(`/api/meetings/${mId}/end`).set('Authorization', `Bearer ${token}`);

    const csvRes = await request(app)
      .get(`/api/export/${mId}/csv`)
      .set('Authorization', `Bearer ${token}`);

    expect(csvRes.status).toBe(200);
    expect(csvRes.header['content-type']).toContain('text/csv');
    expect(csvRes.text).toContain('MeetingMeter Fiscal Receipt Export');
    expect(csvRes.text).toContain('CSV Review Meeting');
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
});
