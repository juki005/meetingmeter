import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function generateExports() {
  const exportDir = path.resolve(process.cwd(), 'evidence', 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const timestamp = Date.now();
  const email = `export_audit_${timestamp}@meetingmeter.io`;

  console.log('1. Registering user for export generation...');
  await page.goto('http://localhost:3000');
  await page.click('button:has-text("Create Account")');
  await page.fill('input[placeholder="e.g. Alex Morgan"]', 'Victoria Sterling');
  await page.fill('input[placeholder="e.g. VP Engineering"]', 'Managing Director');
  await page.fill('input[type="number"]', '250');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'Password123!');
  await page.click('button[type="submit"]');

  await page.waitForSelector('text=Welcome back, Victoria Sterling', { timeout: 10000 });

  console.log('2. Adding Roster Members...');
  await page.click('button:has-text("Roster")');
  await page.waitForSelector('text=Roster & Rate Directory');

  // Internal
  await page.click('button:has-text("Add Member / Guest")');
  await page.fill('input[placeholder="e.g. Jordan Lee"]', 'Dr. Alexander Vance');
  await page.fill('input[placeholder="e.g. Lead Architect / Product Manager"]', 'Principal Research Scientist');
  await page.fill('input[placeholder="120"]', '180');
  await page.click('button:has-text("Add to Roster")');
  await page.waitForSelector('text=Dr. Alexander Vance');

  // Guest (Unknown)
  await page.click('button:has-text("Add Member / Guest")');
  await page.click('button:has-text("External Guest")');
  await page.fill('input[placeholder="e.g. Jordan Lee"]', 'Hon. Claudia Ross');
  await page.fill('input[placeholder="e.g. Lead Architect / Product Manager"]', 'External Advisory Board');
  await page.fill('input[placeholder="e.g. Client Org / Agency / Acme Corp"]', 'Ross Global Advisory');
  await page.check('input[type="checkbox"]');
  await page.click('button:has-text("Add to Roster")');
  await page.waitForSelector('text=Hon. Claudia Ross');

  console.log('3. Configuring Meeting...');
  await page.click('button:has-text("New Meter")');
  await page.waitForSelector('text=Configure New Meeting Meter');
  await page.fill('input[placeholder="e.g. Q4 Executive Strategy Alignment"]', 'Executive Board Q3 Strategy Review');

  console.log('4. Starting Meeting...');
  await page.click('button:has-text("Start Meeting Meter")');
  await page.waitForSelector('text=LIVE METERING COCKPIT', { timeout: 10000 });

  // Let meter run for 3 seconds
  await page.waitForTimeout(3000);

  console.log('5. Ending Meeting...');
  await page.click('button:has-text("End Meeting")');
  await page.waitForSelector('text=Conclude Meeting & Freeze Cost?');
  await page.click('button:has-text("Yes, End & Generate Receipt")');

  await page.waitForSelector('text=*** MEETINGMETER ***', { timeout: 10000 });
  console.log('6. Receipt generated on screen.');

  // Extract meetingId from URL or receipt
  const sessionRefText = await page.locator('text=SESSION REF:').innerText();
  const meetingId = sessionRefText.replace('SESSION REF:', '').trim();
  console.log('Meeting ID:', meetingId);

  // 1. Export PNG
  console.log('Generating PNG image export...');
  const receiptElement = await page.$('#meeting-receipt-paper');
  if (receiptElement) {
    const pngPath = path.join(exportDir, 'sample-meeting-receipt.png');
    await receiptElement.screenshot({ path: pngPath });
    console.log(`Saved PNG export: ${pngPath}`);
  }

  // 2. Export CSV
  console.log('Generating CSV export...');
  const token = await page.evaluate(() => localStorage.getItem('meetingmeter_token'));
  const csvRes = await page.request.get(`http://localhost:3000/api/export/${meetingId}/csv`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const csvText = await csvRes.text();
  const csvPath = path.join(exportDir, 'sample-meeting-receipt.csv');
  fs.writeFileSync(csvPath, csvText, 'utf-8');
  console.log(`Saved CSV export: ${csvPath}`);

  // 3. Export PDF via browser print-to-pdf of receipt
  console.log('Generating PDF export...');
  // Using page.pdf or jsPDF canvas generation
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' }
  });
  const pdfPath = path.join(exportDir, 'sample-meeting-receipt.pdf');
  fs.writeFileSync(pdfPath, pdfBuffer);
  console.log(`Saved PDF export: ${pdfPath}`);

  await browser.close();
  console.log('Export evidence generation complete!');
}

generateExports().catch((err) => {
  console.error('Export generation error:', err);
  process.exit(1);
});
