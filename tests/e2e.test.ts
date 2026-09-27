import { test, expect } from '@playwright/test';

test.describe('MeetingMeter Browser Verification & End-to-End Flow', () => {
  const timestamp = Date.now();
  const testEmail = `director_${timestamp}@meetingmeter.io`;
  const testPassword = 'Password123!';
  const testName = 'Sarah Director';

  test('1. Full Lifecycle & Telemetry HUD Verification (Desktop 1280x800)', async ({ page }) => {
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
    await page.click('button:has-text("Roster")');
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
    await page.click('button:has-text("New Meter")');
    await expect(page.locator('text=Configure New Meeting Meter')).toBeVisible();

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
    await expect(page.locator('text=FINAL ESTIMATED COST:')).toBeVisible();
    await expect(page.locator('text=Export PDF')).toBeVisible();
    await expect(page.locator('text=Export Image')).toBeVisible();
    await expect(page.locator('text=Download CSV')).toBeVisible();

    // 11. Navigate to History & Verify
    await page.click('button:has-text("All History")');
    await expect(page.locator('text=Private Meeting History')).toBeVisible();
    await expect(page.locator('text=Q3 Cross-Functional Alignment')).toBeVisible();
    await expect(page.locator('button:has-text("Receipt")')).toBeVisible();

    // 12. Navigate to Profile, Update Rate & Verify Rate Snapshot Immutability
    await page.click('button[data-testid="profile-btn"]');
    await expect(page.locator('text=Personal Profile & Rate')).toBeVisible();
    await page.locator('input[type="number"]').fill('999');
    await page.locator('button:has-text("Save Profile Changes")').click();
    await expect(page.locator('text=Profile and hourly rate updated successfully!')).toBeVisible();

    // Return to History & Receipt -> Verify snapshot remained 160.00/hr
    await page.getByRole('button', { name: 'History', exact: true }).click();
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
    await page.click('button:has-text("Roster")');
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
    await page.click('button:has-text("New Meter")');
    await expect(page.locator('text=Configure New Meeting Meter')).toBeVisible();

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
    await page.click('button:has-text("Roster")');
    await expect(page.locator('text=Roster & Rate Directory')).toBeVisible();
    await page.click('button:has-text("Add Member / Guest")');
    await page.fill('input[placeholder="e.g. Jordan Lee"]', 'Tablet Guest Colleague');
    await page.fill('input[placeholder="e.g. Lead Architect / Product Manager"]', 'Lead Designer');
    await page.fill('input[placeholder="120"]', '135');
    await page.click('button:has-text("Add to Roster")');
    await expect(page.locator('text=Tablet Guest Colleague')).toBeVisible();

    // 3. Configure and Start Meeting on tablet
    await page.click('button:has-text("New Meter")');
    await expect(page.locator('text=Configure New Meeting Meter')).toBeVisible();
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
    await page.click('button:has-text("All History")');
    await expect(page.locator('text=Private Meeting History')).toBeVisible();
    await expect(page.locator('text=Tablet Product Strategy Sync')).toBeVisible();
  });

  test('4. Mobile Viewport (375x667) Responsiveness', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Login on mobile viewport
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');

    await expect(page.locator(`text=Welcome back, ${testName}`)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("New Meter")')).toBeVisible();
    await expect(page.locator('button:has-text("Roster")')).toBeVisible();
    await expect(page.getByRole('button', { name: 'History', exact: true })).toBeVisible();
  });
});
