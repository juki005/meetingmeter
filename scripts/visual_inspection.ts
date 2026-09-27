import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const screenshotsDir = path.resolve(__dirname, '../screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

async function runInspection() {
  const browser = await chromium.launch({ headless: true });

  // 1. Desktop Viewport (1280x800)
  const contextDesktop = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await contextDesktop.newPage();

  console.log('Inspecting Desktop Flow...');

  // 1a. Auth Page - Login & Register
  await page.goto('http://localhost:3000');
  await page.screenshot({ path: path.join(screenshotsDir, '01_desktop_auth_login.png'), fullPage: true });

  await page.click('button:has-text("Create Account")');
  await page.screenshot({ path: path.join(screenshotsDir, '02_desktop_auth_register.png'), fullPage: true });

  const email = `inspection_${Date.now()}@meetingmeter.io`;
  await page.fill('input[placeholder="e.g. Alex Morgan"]', 'Elena Rostova');
  await page.fill('input[placeholder="e.g. VP Engineering"]', 'Head of Product Operations');
  await page.fill('input[type="number"]', '175');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'Inspection123!');
  await page.click('button[type="submit"]');

  // 1b. Dashboard Cockpit
  await page.waitForSelector('text=Welcome back, Elena Rostova');
  await page.screenshot({ path: path.join(screenshotsDir, '03_desktop_dashboard_empty.png'), fullPage: true });

  // 1c. People Directory & Add Guest Modal
  await page.click('button:has-text("Roster")');
  await page.waitForSelector('text=Roster & Rate Directory');
  await page.screenshot({ path: path.join(screenshotsDir, '04_desktop_people_empty.png'), fullPage: true });

  // Add internal colleague
  await page.click('button:has-text("Add Member / Guest")');
  await page.fill('input[placeholder="e.g. Jordan Lee"]', 'David Chen');
  await page.fill('input[placeholder="e.g. Lead Architect / Product Manager"]', 'Senior Cloud Architect');
  await page.fill('input[placeholder="120"]', '150');
  await page.click('button:has-text("Add to Roster")');
  await page.waitForSelector('text=David Chen');

  // Add guest with unknown rate
  await page.click('button:has-text("Add Member / Guest")');
  await page.click('button:has-text("External Guest")');
  await page.fill('input[placeholder="e.g. Jordan Lee"]', 'Sarah Sterling');
  await page.fill('input[placeholder="e.g. Lead Architect / Product Manager"]', 'Managing Partner');
  await page.fill('input[placeholder="e.g. Client Org / Agency / Acme Corp"]', 'Sterling Partners');
  await page.check('input[type="checkbox"]');
  await page.screenshot({ path: path.join(screenshotsDir, '05_desktop_add_guest_modal.png') });
  await page.click('button:has-text("Add to Roster")');
  await page.waitForSelector('text=Sarah Sterling');
  await page.screenshot({ path: path.join(screenshotsDir, '06_desktop_people_populated.png'), fullPage: true });

  // 1d. Profile Page
  await page.click('button[data-testid="profile-btn"]');
  await page.waitForSelector('text=Personal Profile & Rate');
  await page.screenshot({ path: path.join(screenshotsDir, '07_desktop_profile.png'), fullPage: true });

  // 1e. Meeting Configuration Page
  await page.click('button:has-text("New Meter")');
  await page.waitForSelector('text=Configure New Meeting Meter');
  await page.fill('input[placeholder="e.g. Q4 Executive Strategy Alignment"]', 'Executive Roadmap & Budget Review');
  await page.screenshot({ path: path.join(screenshotsDir, '08_desktop_meeting_config.png'), fullPage: true });

  // 1f. Live Metering Cockpit
  await page.click('button:has-text("Start Meeting Meter")');
  await page.waitForSelector('text=LIVE METERING COCKPIT');
  await page.waitForTimeout(2500); // Allow ticker to accumulate
  await page.screenshot({ path: path.join(screenshotsDir, '09_desktop_live_meter_running.png'), fullPage: true });

  // Pause a participant
  const davidRow = page.locator('text=David Chen').locator('xpath=ancestor::div[contains(@class, "rounded-xl")]').first();
  await davidRow.locator('button[aria-label="Pause participant"]').click();
  await page.waitForSelector('text=PAUSED');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(screenshotsDir, '10_desktop_live_meter_paused.png'), fullPage: true });

  // 1g. End Meeting & Modal
  await page.click('button:has-text("End Meeting")');
  await page.waitForSelector('text=Conclude Meeting & Freeze Cost?');
  await page.screenshot({ path: path.join(screenshotsDir, '11_desktop_end_meeting_modal.png') });
  await page.click('button:has-text("Yes, End & Generate Receipt")');

  // 1h. Post-Meeting Fiscal Receipt
  await page.waitForSelector('text=*** MEETINGMETER ***');
  await page.screenshot({ path: path.join(screenshotsDir, '12_desktop_fiscal_receipt.png'), fullPage: true });

  // 1i. History Page
  await page.click('button:has-text("All History")');
  await page.waitForSelector('text=Private Meeting History');
  await page.screenshot({ path: path.join(screenshotsDir, '13_desktop_history_populated.png'), fullPage: true });

  // 2. Tablet Viewport (768x1024)
  console.log('Inspecting Tablet Viewport...');
  const contextTablet = await browser.newContext({
    viewport: { width: 768, height: 1024 },
  });
  const pageTablet = await contextTablet.newPage();
  await pageTablet.goto('http://localhost:3000');
  // Login with same user
  await pageTablet.fill('input[type="email"]', email);
  await pageTablet.fill('input[type="password"]', 'Inspection123!');
  await pageTablet.click('button[type="submit"]');
  await pageTablet.waitForSelector('text=Welcome back, Elena Rostova');
  await pageTablet.screenshot({ path: path.join(screenshotsDir, '14_tablet_dashboard.png'), fullPage: true });

  await pageTablet.click('button:has-text("History")');
  await pageTablet.waitForSelector('text=Private Meeting History');
  await pageTablet.screenshot({ path: path.join(screenshotsDir, '15_tablet_history.png'), fullPage: true });

  // 3. Mobile Viewport (375x667)
  console.log('Inspecting Mobile Viewport...');
  const contextMobile = await browser.newContext({
    viewport: { width: 375, height: 667 },
  });
  const pageMobile = await contextMobile.newPage();
  await pageMobile.goto('http://localhost:3000');
  await pageMobile.fill('input[type="email"]', email);
  await pageMobile.fill('input[type="password"]', 'Inspection123!');
  await pageMobile.click('button[type="submit"]');
  await pageMobile.waitForSelector('text=Welcome back, Elena Rostova');
  await pageMobile.screenshot({ path: path.join(screenshotsDir, '16_mobile_dashboard.png'), fullPage: true });

  // Mobile New Meter Config
  await pageMobile.click('button:has-text("New Meter")');
  await pageMobile.waitForSelector('text=Configure New Meeting Meter');
  await pageMobile.fill('input[placeholder="e.g. Q4 Executive Strategy Alignment"]', 'Mobile Standup');
  await pageMobile.screenshot({ path: path.join(screenshotsDir, '17_mobile_meeting_config.png'), fullPage: true });

  // Mobile Live Cockpit
  await pageMobile.click('button:has-text("Start Meeting Meter")');
  await pageMobile.waitForSelector('text=LIVE METERING COCKPIT');
  await pageMobile.waitForTimeout(2000);
  await pageMobile.screenshot({ path: path.join(screenshotsDir, '18_mobile_live_meter.png'), fullPage: true });

  // Mobile Receipt
  await pageMobile.click('button:has-text("End Meeting")');
  await pageMobile.waitForSelector('text=Conclude Meeting & Freeze Cost?');
  await pageMobile.click('button:has-text("Yes, End & Generate Receipt")');
  await pageMobile.waitForSelector('text=*** MEETINGMETER ***');
  await pageMobile.screenshot({ path: path.join(screenshotsDir, '19_mobile_receipt.png'), fullPage: true });

  await browser.close();
  console.log('Visual Inspection captures completed successfully.');
}

runInspection().catch(console.error);
