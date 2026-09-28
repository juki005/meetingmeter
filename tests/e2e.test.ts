import { test, expect } from '@playwright/test';

test.describe('MeetingMeter Browser Verification & End-to-End Flow', () => {
  test('1. Full Lifecycle & Telemetry HUD Verification (Desktop 1280x800)', async ({ page }) => {
    const timestamp = Date.now();
    const testEmail = `director_${timestamp}@meetingmeter.io`;
    const testPassword = 'Password123!';
    const testName = 'Sarah Director';

    // 1. Visit landing / login page
    await page.goto('/');
    await expect(page.locator('text=MeetingMeter')).toBeVisible();

    // 2. Switch to Create Account tab
    await page.click('button:has-text("Create Account")');
    await page.fill('input[placeholder="e.g. Alex Morgan"]', testName);
    await page.fill('input[placeholder="e.g. VP Engineering"]', 'Director of Engineering');
    await page.fill('input[type="number"]', '160');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');

    // 3. Verify Dashboard Cockpit loaded
    await expect(page.locator(`text=Welcome back, ${testName}`)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Personal Base Rate')).toBeVisible();

    // 4. Navigate to Roster & Rates
    await page.click('[data-testid="nav-people"]');
    await expect(page.locator('text=Roster & Rate Directory')).toBeVisible();

    // 4a. Add an Internal Colleague
    await page.click('button:has-text("Add Member / Guest")');
    await page.fill('input[placeholder="e.g. Jordan Lee"]', 'Marcus Lead Dev');
    await page.fill('input[placeholder="e.g. Lead Architect / Product Manager"]', 'Principal Engineer');
    await page.fill('input[placeholder="120"]', '140');
    await page.click('button:has-text("Add to Roster")');
    await expect(page.locator('text=Marcus Lead Dev')).toBeVisible();

    // 4b. Add an External Guest with Unknown Rate
    await page.click('button:has-text("Add Member / Guest")');
    await page.click('button:has-text("External Guest")');
    await page.fill('input[placeholder="e.g. Jordan Lee"]', 'Emma Client Partner');
    await page.fill('input[placeholder="e.g. Lead Architect / Product Manager"]', 'VP Client Operations');
    await page.fill('input[placeholder="e.g. Client Org / Agency / Acme Corp"]', 'Acme Global');
    // Check unknown rate
    await page.check('input[type="checkbox"]');
    await page.click('button:has-text("Add to Roster")');
    await expect(page.locator('text=Emma Client Partner')).toBeVisible();
    await expect(page.locator('text=Unknown (Not Zero)')).toBeVisible();

    // 5. Navigate to New Meter / Configure Meeting
    await page.click('[data-testid="nav-config"]');
    await expect(page.locator('text=Configure / Prepare Meeting')).toBeVisible();

    await page.fill('input[placeholder="e.g. Q4 Executive Strategy Alignment"]', 'Q3 Cross-Functional Alignment');
    // Verify roster attendees are listed
    await expect(page.locator('text=Marcus Lead Dev')).toBeVisible();
    await expect(page.locator('text=Emma Client Partner')).toBeVisible();

    // 6. Explicit Start Action
    await page.click('button:has-text("Start Meeting Meter")');

    // 7. Verify Live Cockpit
    await expect(page.locator('text=LIVE METERING COCKPIT')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Q3 Cross-Functional Alignment')).toBeVisible();
    await expect(page.locator('text=Estimated Total Meeting Cost')).toBeVisible();
    await expect(page.locator('text=+ 1 participant with unknown cost')).toBeVisible();

    // Wait 2 seconds for ticker progression
    await page.waitForTimeout(2000);

    // 8. Test Participant Pause / Resume
    const marcusRow = page.locator('text=Marcus Lead Dev').locator('xpath=ancestor::div[contains(@class, "rounded-xl")]').first();
    const pauseBtn = marcusRow.locator('button[aria-label="Pause participant"]');
    await pauseBtn.click();
    await expect(marcusRow.locator('text=PAUSED')).toBeVisible();

    // Resume Marcus
    const resumeBtn = marcusRow.locator('button[aria-label="Resume participant"]');
    await resumeBtn.click();
    await expect(marcusRow.locator('text=ACTIVE')).toBeVisible();

    // 9. Conclude Meeting
    await page.click('button:has-text("End Meeting")');
    await expect(page.locator('text=Conclude Meeting & Freeze Cost?')).toBeVisible();
    await page.click('button:has-text("Yes, End & Generate Receipt")');

    // 10. Verify Post-Meeting Fiscal Receipt
    await expect(page.locator('text=*** MEETINGMETER ***')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Q3 Cross-Functional Alignment')).toBeVisible();
    await expect(page.locator('text=FINAL ESTIMATED MEETING COST:')).toBeVisible();
    await expect(page.locator('text=Export PDF')).toBeVisible();
    await expect(page.locator('text=Export Image')).toBeVisible();
    await expect(page.locator('text=Download CSV')).toBeVisible();

    // 11. Navigate to History & Verify
    await page.click('[data-testid="nav-history"]');
    await expect(page.locator('text=Private Meeting Archives')).toBeVisible();
    await expect(page.locator('text=Q3 Cross-Functional Alignment')).toBeVisible();
    await expect(page.locator('button:has-text("Receipt")')).toBeVisible();

    // 12. Navigate to Profile, Update Rate & Verify Rate Snapshot Immutability
    await page.click('button[data-testid="profile-btn"]');
    await expect(page.locator('text=Personal Profile & Rate')).toBeVisible();
    await page.locator('input[type="number"]').fill('999');
    await page.locator('button:has-text("Save Profile Changes")').click();
    await expect(page.locator('text=Profile and hourly rate updated successfully!')).toBeVisible();

    // Return to History & Receipt -> Verify snapshot remained 160.00/hr
    await page.click('[data-testid="nav-history"]');
    await page.click('button:has-text("Receipt")');
    await expect(page.locator('text=*** MEETINGMETER ***')).toBeVisible();
    await expect(page.locator('text=€160.00/hr')).toBeVisible();
  });

  test('2. AC-07 Select All & Dynamic Selection Behavior Verification', async ({ page }) => {
    // Register unique user for roster selection testing
    const selectEmail = `select_all_${Date.now()}@meetingmeter.io`;
    await page.goto('/');
    await page.click('button:has-text("Create Account")');
    await page.fill('input[placeholder="e.g. Alex Morgan"]', 'Arthur Pendelton');
    await page.fill('input[placeholder="e.g. VP Engineering"]', 'Chief Operations Officer');
    await page.fill('input[type="number"]', '200');
    await page.fill('input[type="email"]', selectEmail);
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Welcome back, Arthur Pendelton')).toBeVisible({ timeout: 10000 });

    // Add 2 roster members
    await page.click('[data-testid="nav-people"]');
    await page.waitForSelector('text=Roster & Rate Directory');

    // Member 1: Rate 150
    await page.click('button:has-text("Add Member / Guest")');
    await page.fill('input[placeholder="e.g. Jordan Lee"]', 'Dev Lead Alice');
    await page.fill('input[placeholder="e.g. Lead Architect / Product Manager"]', 'Tech Lead');
    await page.fill('input[placeholder="120"]', '150');
    await page.click('button:has-text("Add to Roster")');
    await expect(page.locator('text=Dev Lead Alice')).toBeVisible();

    // Member 2: Rate 100
    await page.click('button:has-text("Add Member / Guest")');
    await page.fill('input[placeholder="e.g. Jordan Lee"]', 'Dev Bob');
    await page.fill('input[placeholder="e.g. Lead Architect / Product Manager"]', 'Frontend Eng');
    await page.fill('input[placeholder="120"]', '100');
    await page.click('button:has-text("Add to Roster")');
    await expect(page.locator('text=Dev Bob')).toBeVisible();

    // Navigate to Meeting Config
    await page.click('[data-testid="nav-config"]');
    await expect(page.locator('text=Configure / Prepare Meeting')).toBeVisible();

    // Initially: All 3 attendees selected (Arthur €200, Alice €150, Bob €100 = €450.00/hr)
    await expect(page.locator('text=€450.00/hr')).toBeVisible();
    await expect(page.locator('text=3 participants selected')).toBeVisible();
    await expect(page.locator('button:has-text("Deselect All")')).toBeVisible();

    // 1. Click "Deselect All"
    await page.click('button:has-text("Deselect All")');
    await expect(page.locator('text=€0.00/hr')).toBeVisible();
    await expect(page.locator('text=0 participants selected')).toBeVisible();
    await expect(page.locator('button:has-text("Select All")')).toBeVisible();

    // Verify Start button is disabled when 0 participants selected
    const startBtn = page.locator('button:has-text("Start Meeting Meter")');
    await expect(startBtn).toBeDisabled();

    // 2. Click "Select All"
    await page.click('button:has-text("Select All")');
    await expect(page.locator('text=€450.00/hr')).toBeVisible();
    await expect(page.locator('text=3 participants selected')).toBeVisible();
    await expect(page.locator('button:has-text("Deselect All")')).toBeVisible();
    await expect(startBtn).toBeEnabled();

    // 3. Individually uncheck Alice (€150)
    await page.click('text=Dev Lead Alice');
    // Burn rate should now be Arthur €200 + Bob €100 = €300.00/hr
    await expect(page.locator('text=€300.00/hr')).toBeVisible();
    await expect(page.locator('text=2 participants selected')).toBeVisible();
    // Button should now read "Select All" because not all are selected
    await expect(page.locator('button:has-text("Select All")')).toBeVisible();

    // 4. Click "Select All" to restore all participants
    await page.click('button:has-text("Select All")');
    await expect(page.locator('text=€450.00/hr')).toBeVisible();
    await expect(page.locator('text=3 participants selected')).toBeVisible();
    await expect(page.locator('button:has-text("Deselect All")')).toBeVisible();

    // 5. Fill title and launch to confirm starting with selected roster works
    await page.fill('input[placeholder="e.g. Q4 Executive Strategy Alignment"]', 'Sprint Retro 42');
    await page.click('button:has-text("Start Meeting Meter")');
    await expect(page.locator('text=LIVE METERING COCKPIT')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=€450.00/hr')).toBeVisible();
  });

  test('3. Tablet Viewport (768x1024) Responsiveness & Full Flow Coverage', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });

    const tabletEmail = `tablet_${Date.now()}@meetingmeter.io`;
    await page.goto('/');

    // 1. Register on Tablet Viewport
    await page.click('button:has-text("Create Account")');
    await page.fill('input[placeholder="e.g. Alex Morgan"]', 'Helena Tablet User');
    await page.fill('input[placeholder="e.g. VP Engineering"]', 'Principal Product Manager');
    await page.fill('input[type="number"]', '175');
    await page.fill('input[type="email"]', tabletEmail);
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Welcome back, Helena Tablet User')).toBeVisible({ timeout: 10000 });

    // 2. Add Roster member on tablet
    await page.click('[data-testid="nav-people"]');
    await expect(page.locator('text=Roster & Rate Directory')).toBeVisible();
    await page.click('button:has-text("Add Member / Guest")');
    await page.fill('input[placeholder="e.g. Jordan Lee"]', 'Tablet Guest Colleague');
    await page.fill('input[placeholder="e.g. Lead Architect / Product Manager"]', 'Lead Designer');
    await page.fill('input[placeholder="120"]', '135');
    await page.click('button:has-text("Add to Roster")');
    await expect(page.locator('text=Tablet Guest Colleague')).toBeVisible();

    // 3. Configure and Start Meeting on tablet
    await page.click('[data-testid="nav-config"]');
    await expect(page.locator('text=Configure / Prepare Meeting')).toBeVisible();
    await page.fill('input[placeholder="e.g. Q4 Executive Strategy Alignment"]', 'Tablet Product Strategy Sync');
    await page.click('button:has-text("Start Meeting Meter")');

    // 4. Verify Live Meter HUD on tablet
    await expect(page.locator('text=LIVE METERING COCKPIT')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Tablet Product Strategy Sync')).toBeVisible();
    await expect(page.locator('text=Estimated Total Meeting Cost')).toBeVisible();
    await expect(page.locator('button:has-text("End Meeting")')).toBeVisible();

    // 5. Pause & Resume on tablet
    const colleagueRow = page.locator('text=Tablet Guest Colleague').locator('xpath=ancestor::div[contains(@class, "rounded-xl")]').first();
    await colleagueRow.locator('button[aria-label="Pause participant"]').click();
    await expect(colleagueRow.locator('text=PAUSED')).toBeVisible();
    await colleagueRow.locator('button[aria-label="Resume participant"]').click();
    await expect(colleagueRow.locator('text=ACTIVE')).toBeVisible();

    // 6. Conclude Meeting & Verify Receipt on tablet
    await page.click('button:has-text("End Meeting")');
    await page.click('button:has-text("Yes, End & Generate Receipt")');
    await expect(page.locator('text=*** MEETINGMETER ***')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Tablet Product Strategy Sync')).toBeVisible();
    await expect(page.locator('text=Export PDF')).toBeVisible();
    await expect(page.locator('text=Export Image')).toBeVisible();
    await expect(page.locator('text=Download CSV')).toBeVisible();

    // 7. Verify History on tablet
    await page.click('[data-testid="nav-history"]');
    await expect(page.locator('text=Private Meeting Archives')).toBeVisible();
    await expect(page.locator('text=Tablet Product Strategy Sync')).toBeVisible();
  });

  test('4. Mobile Viewport (375x667) Responsiveness', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const mobileEmail = `mobile_${Date.now()}@meetingmeter.io`;

    await page.goto('/');

    // Register on mobile viewport
    await page.click('button:has-text("Create Account")');
    await page.fill('input[placeholder="e.g. Alex Morgan"]', 'Mobile Test User');
    await page.fill('input[placeholder="e.g. VP Engineering"]', 'Mobile VP');
    await page.fill('input[type="number"]', '150');
    await page.fill('input[type="email"]', mobileEmail);
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Welcome back, Mobile Test User')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="nav-config"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-people"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-history"]')).toBeVisible();
  });

  test('5. Cost Library Management & Attached Meeting External Costs', async ({ page }) => {
    const costUserEmail = `cost_user_${Date.now()}@meetingmeter.io`;
    await page.goto('/');
    await page.click('button:has-text("Create Account")');
    await page.fill('input[placeholder="e.g. Alex Morgan"]', 'Finance Lead Chris');
    await page.fill('input[placeholder="e.g. VP Engineering"]', 'Director of Finance');
    await page.fill('input[type="number"]', '190');
    await page.fill('input[type="email"]', costUserEmail);
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Welcome back, Finance Lead Chris')).toBeVisible({ timeout: 10000 });

    // 1. Navigate to Cost Library
    await page.click('[data-testid="nav-cost-library"]');
    await expect(page.getByRole('heading', { name: 'Cost Library' })).toBeVisible();

    // 2. Add a new Library Item
    await page.click('button:has-text("New Library Item")');
    await page.fill('input[placeholder="e.g. Executive Lunch Catering / Studio Rental"]', 'Catering & Beverages');
    const defaultPrice = page.locator('input[type="number"]').first();
    await defaultPrice.fill('250.00');
    await page.click('button:has-text("Save to Library")');
    await expect(page.locator('text=Catering & Beverages')).toBeVisible();
    await expect(page.locator('text=€250.00')).toBeVisible();

    // 3. Configure a meeting and attach the library cost item with override
    await page.click('[data-testid="nav-config"]');
    await expect(page.locator('text=Configure / Prepare Meeting')).toBeVisible();
    await page.fill('input[placeholder="e.g. Q4 Executive Strategy Alignment"]', 'Board Quarterly Review');

    // Attach from Cost Library
    await page.click('button:has-text("Add Cost")');
    await page.selectOption('select', { label: 'Catering & Beverages (€250.00)' });
    // Override amount to 320
    const amtInput = page.locator('input[placeholder="Amount €"]');
    await amtInput.fill('320');
    await page.click('button:has-text("Attach Cost")');
    await expect(page.getByText('€320.00', { exact: true }).first()).toBeVisible();

    // 4. Start meeting and verify external costs in live HUD
    await page.click('button:has-text("Start Meeting Meter")');
    await expect(page.locator('text=LIVE METERING COCKPIT')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=External Fixed Costs')).toBeVisible();
    await expect(page.locator('text=€320.00').first()).toBeVisible();

    // 5. Conclude meeting and verify thermal receipt breakdown
    await page.click('button:has-text("End Meeting")');
    await page.click('button:has-text("Yes, End & Generate Receipt")');
    await expect(page.locator('text=*** MEETINGMETER ***')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Catering & Beverages')).toBeVisible();
    await expect(page.locator('text=EXTERNAL FIXED COSTS:')).toBeVisible();
  });

  test('6. Prepared Meeting Lifecycle, Missed Detection, and Recurring Duplication', async ({ page }) => {
    const prepEmail = `prepared_${Date.now()}@meetingmeter.io`;
    await page.goto('/');
    await page.click('button:has-text("Create Account")');
    await page.fill('input[placeholder="e.g. Alex Morgan"]', 'Planner Riley');
    await page.fill('input[placeholder="e.g. VP Engineering"]', 'Executive Assistant');
    await page.fill('input[type="number"]', '100');
    await page.fill('input[type="email"]', prepEmail);
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Welcome back, Planner Riley')).toBeVisible({ timeout: 10000 });

    // 1. Prepare a meeting in advance
    await page.click('[data-testid="nav-config"]');
    await expect(page.locator('text=Configure / Prepare Meeting')).toBeVisible();
    await page.click('button:has-text("Save as Prepared Meeting")');

    await page.fill('input[placeholder="e.g. Q4 Executive Strategy Alignment"]', 'Weekly Leadership Standup');
    await page.fill('input[type="date"]', '2026-10-15');
    await page.fill('input[type="time"]', '09:00');

    // Toggle recurring
    await page.click('text=Mark as Recurring Template');

    // Save prepared meeting
    await page.click('button:has-text("Save Prepared Meeting")');

    // 2. Verify meeting appears in Dashboard's Prepared Meetings table
    await expect(page.locator('text=Upcoming Prepared Meetings')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Weekly Leadership Standup')).toBeVisible();
    await expect(page.locator('text=Recurring')).toBeVisible();

    // 3. Duplicate recurring meeting
    await page.click('button[title="Duplicate Occurrence"]');
    // Verify 2 prepared meetings exist
    await expect(page.locator('text=Weekly Leadership Standup')).toHaveCount(2);

    // 4. Launch the first prepared meeting live
    await page.locator('button:has-text("Start Meter")').first().click();
    await expect(page.locator('text=LIVE METERING COCKPIT')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Weekly Leadership Standup')).toBeVisible();

    // Conclude it
    await page.click('button:has-text("End Meeting")');
    await page.click('button:has-text("Yes, End & Generate Receipt")');
    await expect(page.locator('text=*** MEETINGMETER ***')).toBeVisible({ timeout: 10000 });
  });

  test('7. Post-Hoc Manual Entry Creation & Post-End External Cost Recalculation', async ({ page }) => {
    const manualEmail = `manual_${Date.now()}@meetingmeter.io`;
    await page.goto('/');
    await page.click('button:has-text("Create Account")');
    await page.fill('input[placeholder="e.g. Alex Morgan"]', 'Auditor Taylor');
    await page.fill('input[placeholder="e.g. VP Engineering"]', 'Senior Operations Auditor');
    await page.fill('input[type="number"]', '180');
    await page.fill('input[type="email"]', manualEmail);
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Welcome back, Auditor Taylor')).toBeVisible({ timeout: 10000 });

    // 1. Navigate to Manual Entry
    await page.click('[data-testid="nav-manual"]');
    await expect(page.locator('text=Manual Entry Reconstruction')).toBeVisible();

    // 2. Fill Manual Meeting form
    await page.fill('input[placeholder="e.g. Executive Strategy & Offsite Retro"]', 'Past Strategic Architecture Review');
    await page.fill('input[placeholder="e.g. Offline board meeting / Forgot to run live timer"]', 'Offline executive dinner session');
    const meetingDurationInput = page.locator('input[type="number"]').first();
    await meetingDurationInput.fill('90'); // 90 minutes

    // Attach External Cost
    await page.click('button:has-text("Add External Cost")');
    await page.fill('input[placeholder="Description (e.g. Conference Catering)"]', 'Private Dining Room');
    const costAmt = page.locator('input[placeholder="Amount €"]');
    await costAmt.fill('450');
    await page.click('button:has-text("Add Cost")');

    // 3. Save Manual Meeting Entry
    await page.click('button:has-text("Save & View Fiscal Receipt")');

    // 4. Verify Thermal Receipt has MANUAL ENTRY provenance and combined costs
    await expect(page.locator('text=*** MEETINGMETER ***')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=PROVENANCE: MANUAL ENTRY')).toBeVisible();
    await expect(page.locator('text=Private Dining Room')).toBeVisible();
    await expect(page.locator('#meeting-receipt-paper').locator('text=€450.00').first()).toBeVisible();
    // 90 min (1.5 hr) * €180/hr = €270 participant cost. €270 + €450 = €720.00 total
    await expect(page.locator('#meeting-receipt-paper').locator('text=€720.00')).toBeVisible();

    // 5. Test Post-End External Cost Editing (BR-36 / BR-37)
    await page.click('button:has-text("Edit External Costs")');
    await expect(page.locator('text=Edit Post-End External Costs')).toBeVisible();

    // Add another cost item
    await page.fill('input[placeholder="Item name (e.g. Lunch Catering)"]', 'AV Presentation Rig');
    const newAmt = page.locator('input[type="number"]').last();
    await newAmt.fill('100');
    await page.click('button:has-text("Add Cost to List")');
    await page.click('button:has-text("Recalculate & Save")');

    // Verify recalculated receipt has updated total: €720 + €100 = €820.00
    await expect(page.locator('text=€820.00')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=AV Presentation Rig')).toBeVisible();
    await expect(page.locator('text=LAST UPDATED:')).toBeVisible();
  });
});
