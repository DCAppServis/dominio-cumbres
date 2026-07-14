const { chromium } = require('playwright');
const path = require('path');

const SCR = '/tmp/claude-0/-home-user-dominio-cumbres/3b15f029-e5d7-576c-b191-d3afe61b0109/scratchpad';

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    headless: true,
    args: ['--no-sandbox']
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  const consoleLogs = [];
  page.on('console', msg => {
    const t = msg.type(), text = msg.text();
    if (t === 'error') consoleErrors.push(text);
    consoleLogs.push('[' + t + '] ' + text);
  });
  page.on('pageerror', err => consoleErrors.push('[pageerror] ' + err.message));

  const url = 'file://' + path.resolve('/home/user/dominio-cumbres/index.html');
  await page.goto(url, { waitUntil: 'networkidle' });

  // Mock auth state so the app thinks we are logged in
  await page.evaluate(() => {
    localStorage.setItem('dcuserTipo', 'vecino');
    localStorage.setItem('dcuser', 'Test User');
    localStorage.setItem('dcuserEstado', 'activo');
    window._fbAuth = { currentUser: { uid: 'test-uid-123', displayName: 'Test User' } };
  });

  // Wait for app to set the initial active view
  await page.waitForTimeout(1500);

  // Ensure there's an active view; if not, activate v-splash first
  await page.evaluate(() => {
    if (!document.querySelector('.view.active')) {
      var splash = document.getElementById('v-splash') || document.getElementById('v-loading');
      if (splash) {
        splash.classList.remove('go-left','go-right');
        splash.classList.add('active');
      }
    }
  });

  // Navigate to v-plaza
  await page.evaluate(() => { window.go('v-plaza', 'right'); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: SCR + '/02-plaza-empty.png' });
  console.log('[STEP 1] Navigated to v-plaza');

  // Inject mock store list
  const mockStores = [
    { _id: 'store-001', nombrePublico: 'Tienda El Progreso', descripcionPublica: 'Todo para el hogar', estadoOp: 'activo', categoria: 'supermercado', fotoPerfil: '', ratingPromedio: 4.5, ratingTotal: 12 },
    { _id: 'store-002', nombrePublico: 'Farmacia San José', descripcionPublica: 'Medicamentos y más', estadoOp: 'activo', categoria: 'farmacia', fotoPerfil: '', ratingPromedio: 4.0, ratingTotal: 8 }
  ];
  await page.evaluate((stores) => {
    window._plazaDocsCache = stores;
    window._plazaFiltro = 'todos';
    window._plazaRenderLista && window._plazaRenderLista(stores);
  }, mockStores);
  await page.waitForTimeout(400);
  await page.screenshot({ path: SCR + '/03-plaza-list.png' });

  const cardCount = await page.evaluate(() => document.querySelectorAll('#plaza-lista .plaza-card').length);
  console.log('[STEP 2] Store cards rendered: ' + cardCount);

  if (cardCount === 0) { console.error('FAIL: No store cards rendered'); await browser.close(); return; }

  // Click first store
  await page.click('#plaza-lista .plaza-card:first-child');
  await page.waitForTimeout(700);
  await page.screenshot({ path: SCR + '/04-store-opened.png' });
  const activeView = await page.evaluate(() => {
    for (const v of document.querySelectorAll('.view')) {
      if (!v.className.includes('go-left') && !v.className.includes('go-right')) return v.id;
    }
    return null;
  });
  console.log('[STEP 3] Active view after clicking store: ' + activeView);

  // Inject mock products
  const mockProducts = [
    { _id: 'prod-001', nombre: 'Leche Entera 1L', descripcion: 'Leche entera pasteurizada', precio: 25, categoria: 'Lácteos', disponible: true, foto: '' },
    { _id: 'prod-002', nombre: 'Pan Integral', descripcion: 'Pan integral de caja', precio: 35, categoria: 'Panadería', disponible: true, foto: '' },
    { _id: 'prod-003', nombre: 'Producto Agotado', descripcion: 'No disponible', precio: 50, categoria: 'General', disponible: false, foto: '' }
  ];
  await page.evaluate((prods) => {
    window._plazaProdDocsCache = prods;
    window._plazaProdFiltro = 'todos';
    window._plazaRenderProductos && window._plazaRenderProductos();
  }, mockProducts);
  await page.waitForTimeout(400);
  await page.screenshot({ path: SCR + '/05-store-products.png' });

  const prodCount = await page.evaluate(() => document.querySelectorAll('#plaza-prod-lista .plaza-card').length);
  console.log('[STEP 4] Product cards rendered: ' + prodCount);

  // Open product 1
  const cards = await page.$$('#plaza-prod-lista .plaza-card');
  if (!cards.length) { console.error('FAIL: No product cards found'); await browser.close(); return; }
  await cards[0].click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: SCR + '/06-product1-detail.png' });

  const ov1 = await page.evaluate(() => {
    const ov = document.getElementById('plaza-prod-det-ov');
    const name = document.querySelector('#plaza-prod-det-card div[style*="font-size:18px"]');
    return { display: ov ? ov.style.display : 'not found', name: name ? name.textContent.trim() : 'not found' };
  });
  console.log('[STEP 5] Product 1 overlay: ' + ov1.display + ', name: "' + ov1.name + '"');

  // Add product 1 to cart — use JS click to bypass any overlay intercept
  const addResult1 = await page.evaluate(() => {
    const btn = document.querySelector('#plaza-prod-det-card button[onclick*="plazaAgregarAlCarritoDetalle"]');
    if (!btn) return 'button not found';
    btn.click();
    return 'clicked: ' + btn.textContent.trim();
  });
  console.log('[STEP 6] Add-to-cart click result: ' + addResult1);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SCR + '/07-after-add-prod1.png' });
  const cart1 = await page.evaluate(() => ({ count: document.getElementById('dcf-cart-count')?.textContent, display: document.getElementById('dcf-cart-bar')?.style.display }));
  console.log('[STEP 6b] Cart count: ' + cart1.count + ', bar display: ' + cart1.display);

  // Close overlay and open product 2
  await page.evaluate(() => { window.plazaCerrarProductoDetalle && window.plazaCerrarProductoDetalle(); });
  await page.waitForTimeout(400);

  const cards2 = await page.$$('#plaza-prod-lista .plaza-card');
  console.log('[STEP 7] Product cards now: ' + cards2.length);

  if (cards2.length >= 2) {
    await cards2[1].click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: SCR + '/08-product2-detail.png' });

    const ov2 = await page.evaluate(() => {
      const ov = document.getElementById('plaza-prod-det-ov');
      const name = document.querySelector('#plaza-prod-det-card div[style*="font-size:18px"]');
      return { display: ov ? ov.style.display : 'not found', name: name ? name.textContent.trim() : 'not found' };
    });
    console.log('[STEP 7b] Product 2 overlay: ' + ov2.display + ', name: "' + ov2.name + '"');

    const addResult2 = await page.evaluate(() => {
      const btn = document.querySelector('#plaza-prod-det-card button[onclick*="plazaAgregarAlCarritoDetalle"]');
      if (!btn) return 'button not found';
      btn.click();
      return 'clicked: ' + btn.textContent.trim();
    });
    console.log('[STEP 8] Add-to-cart click result: ' + addResult2);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: SCR + '/09-after-add-prod2.png' });
    const cart2 = await page.evaluate(() => ({ count: document.getElementById('dcf-cart-count')?.textContent, display: document.getElementById('dcf-cart-bar')?.style.display }));
    console.log('[STEP 8b] Cart count: ' + cart2.count + ', bar display: ' + cart2.display);
  } else {
    console.log('[PROBE] Only ' + cards2.length + ' cards visible — cannot open product 2 separately');
  }

  await page.screenshot({ path: SCR + '/10-final.png' });

  console.log('\n=== CONSOLE ERRORS ===');
  if (consoleErrors.length === 0) console.log('(none)');
  else consoleErrors.forEach(e => console.log('  ERROR: ' + e));

  console.log('\n=== NON-LOG CONSOLE LINES ===');
  consoleLogs.filter(l => !l.startsWith('[log]')).slice(0, 30).forEach(l => console.log(' ', l));

  await browser.close();
})();
