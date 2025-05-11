const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { mkdirp } = require('mkdirp');
const { URL } = require('url');

const OUTPUT_DIR = 'offline-copy';
const TARGET_URL = 'https://www.photopea.com/'; // Replace with your PWA's URL
const RUN_BUTTON = 'div#cap > button[onclick]';
const AD_PANEL = '.flexrow.app > div:nth-child(2)';

/**
 * @param {string} requestUrl
 * @returns {string}
 */
function urlToFilePath(requestUrl) {
  const { hostname, pathname } = new URL(requestUrl);
  const cleanPath = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
  return path.join(OUTPUT_DIR, hostname, decodeURIComponent(cleanPath));
}

/**
 * @param {puppeteer.HTTPRequest} request
 * @param {Buffer<ArrayBufferLike>} responseBuffer
 * @returns {Promise<void>}
 */
async function saveResponse(request, responseBuffer) {
  const filePath = urlToFilePath(request.url());
  await mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, responseBuffer);
  console.log(`✔ Saved: ${request.url()} → ${filePath}`);
}

/**
 * @param {number} milliseconds
 * @returns {Promise<void>}
 */
async function waitForTimeout(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Intercept and save every response
  await page.setRequestInterception(true);

  page.on('request', request => {
    // Skip data:, about:, etc.
    if (['data', 'about'].includes(new URL(request.url()).protocol.slice(0, -1))) {
      return request.abort();
    }
    request.continue();
  });

  page.on('response', async response => {
    try {
      const request = response.request();
      const url = request.url();

      if (!url.includes('photopea')) return;

      // Ignore things like fonts or tracking pixels if you want
      if (!['document', 'stylesheet', 'script', 'image', 'xhr', 'fetch'].includes(request.resourceType())) {
        return;
      }

      const buffer = await response.buffer();
      await saveResponse(request, buffer);
    } catch (err) {
      console.warn(`⚠ Failed to save response: ${err instanceof Error ? err.message : err}`);
    }
  });

  console.log(`🌐 Visiting ${TARGET_URL}...`);
  await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

  await page.waitForSelector(RUN_BUTTON);
  await page.click(RUN_BUTTON);
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForSelector(AD_PANEL);
  await page.evaluate(AD_PANEL => {
    document.querySelector(AD_PANEL)?.remove();
  }, AD_PANEL);
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  // Optionally wait longer for dynamic requests or simulate user interaction here
  // await page.waitForTimeout(5000);
  await waitForTimeout(5000);

  await browser.close();
  console.log('✅ Done. All files saved to:', OUTPUT_DIR);
})();
