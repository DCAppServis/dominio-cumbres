const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const scr = '/tmp/claude-0/-home-user-dominio-cumbres/3b15f029-e5d7-576c-b191-d3afe61b0109/scratchpad';
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    headless: true,
    args: ['--no-sandbox']
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }
  });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push('[pageerror] ' + err.message));

  const url = 'file://' + path.resolve('/home/user/dominio-cumbres/index.html');
  console.log('Opening:', url);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: scr + '/01-home.png' });
  console.log('Screenshot 01: home loaded');

  // Look for Plaza / Negocio entry point
  const bodyHTML = await page.evaluate(() => document.body.innerHTML.substring(0, 2000));
  console.log('Body snippet:', bodyHTML.substring(0, 500));

  // Find buttons/links to plaza
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, [onclick], a')).map(el => ({
      text: el.textContent.trim().substring(0, 60),
      id: el.id,
      onclick: el.getAttribute('onclick') || ''
    })).filter(b => b.text || b.id).slice(0, 30);
  });
  console.log('Buttons:', JSON.stringify(buttons, null, 2));

  await browser.close();
})();
