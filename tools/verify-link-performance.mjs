// Browser-Regressionsprüfung mit 1.300 Überschriften und Vergleich gegen den Stand vor der Optimierung.
// Aufruf: ego-browser nodejs < tools/verify-link-performance.mjs
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const baselineRef = '24bfc70';
const repo = '/Users/family/Developer/cashback-optimizer';
const task = await taskSpace('Cashback Performance 2026-10-26');
const page = task.page('p1');
const files = ['chrome/content.js', 'userscript/cashback-optimizer.user.js', 'android/app/src/main/assets/userscript.js'];
for (const file of files) {
  const versions = {
    baseline: execFileSync('git', ['show', `${baselineRef}:${file}`], { cwd: repo, encoding: 'utf8' }),
    optimized: await readFile(`${repo}/${file}`, 'utf8'),
  };
  const results = {};
  for (const [version, original] of Object.entries(versions)) {
    await page.goto('about:blank');
    await page.evaluate(() => {
      const area = document.createElement('section');
      area.className = 'shop-area';
      area.innerHTML = '<h2 class="shop-area-header filter-tag">Testshop</h2>' +
        '<div class="item-name">Klarna</div>'.repeat(1300);
      document.body.append(area);
      window.chrome = { storage: {
        sync: { get: async defaults => defaults },
        local: { get: async () => ({}), set: async () => {} },
      } };
      window.__counts = { scans: 0, candidates: 0 };
      for (const prototype of [Document.prototype, Element.prototype]) {
        const query = prototype.querySelectorAll;
        prototype.querySelectorAll = function(selector) {
          const result = query.call(this, selector);
          if (selector.includes('.shop-area-header.filter-tag')) {
            window.__counts.scans++;
            window.__counts.candidates += result.length;
          }
          return result;
        };
      }
    });
    // Nur den echten Linker ausführen, ohne Shop-Erkennung/Netzwerk.
    const source = file.startsWith('chrome/')
      ? original.replace('if (!isCashbackOptimizerContext()) return;', '').replace(/  if \(isCashbackOptimizerContext\(\)\) \{[\s\S]*?\n\}\)\(\);\s*$/, '  runLinker();\n})();')
      : original.replace('if (location.href.includes(MAIN_DOMAIN)) runLinker();\n    else runPopup();', 'runLinker();');
    await page.evaluate(source);
    await page.waitForFunction(() => document.querySelectorAll('.item-name a').length === 1300, undefined, { timeout: 15000 });
    await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.__counts = { scans: 0, candidates: 0 };
      // Fremde UI-Änderungen dürfen nicht die Shop-Liste erneut durchsuchen.
      for (let i = 0; i < 10; i++) {
        const node = document.createElement('div');
        node.textContent = 'Status';
        document.body.append(node);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    });
    results[version] = await page.evaluate(() => ({ ...window.__counts }));
    await page.evaluate(() => {
      const area = document.querySelector('.shop-area');
      const wrapper = document.createElement('div');
      wrapper.innerHTML = '<div class="item-name" id="dynamic">iGraal</div>';
      area.append(wrapper);
      const unknown = document.createElement('div');
      unknown.className = 'item-name'; unknown.id = 'replacement';
      unknown.textContent = 'Unbekannter Anbieter'; area.append(unknown);
    });
    await page.waitForFunction(() => !!document.querySelector('#dynamic a'));
    await page.evaluate(() => {
      document.querySelector('#replacement').textContent = 'Klarna';
      document.querySelector('#dynamic').innerHTML = '<span>Payback</span>';
      // Vor dem Flush entfernte Knoten müssen gefahrlos übersprungen werden.
      const removed = document.createElement('div');
      removed.className = 'item-name'; removed.textContent = 'Klarna';
      document.body.append(removed); removed.remove();
    });
    await page.waitForFunction(() =>
      document.querySelector('#replacement a')?.href.includes('klarna.com') &&
      document.querySelector('#dynamic a')?.href.includes('payback.de'));
    assert.equal(await page.evaluate(() => document.querySelectorAll('.item-name a a').length), 0);
  }
  assert.ok(results.baseline.candidates >= 13000, JSON.stringify(results));
  assert.equal(results.optimized.candidates, 0, JSON.stringify(results));
  console.log(JSON.stringify({ file, unrelatedMutations: 10, ...results, regression: 'OK' }));
}
await task.finish({ keep: [] });
