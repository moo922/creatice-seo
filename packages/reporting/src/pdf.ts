import { Logger } from '@nestjs/common';
import { chromium } from 'playwright';

const logger = new Logger('ReportPdf');

/**
 * Renders an HTML report to PDF using a locally installed Chromium via
 * Playwright. Fully self-hosted — no external rendering SaaS. When no Chromium
 * binary is available (e.g. `npx playwright install chromium` was not run),
 * this returns null so the report still saves its HTML version permanently.
 */
export async function htmlToPdf(html: string): Promise<Buffer | null> {
  let browser;
  try {
    browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
    await page.setContent(html, { waitUntil: 'networkidle' });
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
    });
    return buffer;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    logger.warn(`PDF rendering unavailable (install Chromium with "npx playwright install chromium"): ${message}`);
    return null;
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
