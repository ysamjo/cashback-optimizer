// Ermittelt die PAYBACK-Shop-IDs (lp…) für alle Shops, für die
// cashback-optimizer.de eine „Payback“-Zeile anzeigt.
//
// Aufruf: node tools/payback-shop-ids.mjs
// Ausgabe: JavaScript-Objektliteral für chrome/content.js, userscript/ und android/.
//
// Quellen:
//   - https://www.payback.de/online-shopping/shops-a-z (Partnerliste als RSC-Payload)
//   - https://www.payback.de/shop/<slug> (Bestätigung + partnerId)
//   - https://cashback-optimizer.de/ (Shopnamen mit Payback-Zeile)

const UA = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
};

const normalize = (value) => String(value || '').toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]/g, '');

// Shopnamen, bei denen der PAYBACK-Pfad nicht aus dem Namen ableitbar ist.
const SLUG_OVERRIDES = {
  'Angelplatz.de': 'angelplatz',
  'Apollo': 'apollode',
  'Aral': 'aral',
  'Atelier GOLDNER': 'ateliergs',
  'Bild+': 'bildplus',
  'billiger-mietwagen.de': 'billiger-mietwagen',
  'Blau.de': 'blau',
  'C&A': 'cunda',
  'carrera-toys.com': 'carreratoys',
  'comma': 'comma-store',
  'Disney+': 'disneyplus',
  'ebike-24.com': 'ebike24',
  'Eis.de': 'eis',
  'ELV Elektronik': 'elv',
  'eschuhe.de': 'eschuhe',
  'ESET Cybersecurity': 'eset',
  'ferienwohnungen.de': 'ferienwohnungen',
  'FlixBus & FlixTrain': 'flixbus',
  'G-Star RAW': 'g-star',
  'Hood.de': 'hood',
  'Lloyd Shoes': 'lloyd',
  'Marktkauf': 'marktkauf-online',
  'Marriott Bonvoy Hotels': 'marriottbonvoy',
  'MediaMarkt Tarifwelt': 'mmtarifwelt',
  'Netto MD': 'netto-online',
  'Saturn Tarifwelt': 'mmtarifwelt',
  'Scheppach Shop': 'scheppach',
  'schulranzen-onlineshop.de': 'schulranzen-onlineshop',
  'Surfshark VPN': 'surfshark',
  'Tirendo.de': 'tirendo',
  'Western Digital (WD)': 'westerndigital',
  'Witt Weiden': 'witt',
};

// Kein eindeutiger PAYBACK-Shop: Laufzeit-Fallback auf die PAYBACK-Suche.
const NO_DIRECT_SHOP = new Set(['Boohoo', 'Check24', 'Edeka']);

async function fetchText(url) {
  const response = await fetch(url, { headers: UA });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

function parsePaybackShops(html) {
  const unescaped = html.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  const shops = [];
  for (const match of unescaped.matchAll(/\{"partnerShortName":"(lp\d+)","partnerDisplayName":"((?:[^"\\]|\\.)*)","partnerVanityName":"([^"]*)"/g)) {
    shops.push({ id: match[1], name: JSON.parse(`"${match[2]}"`), slug: match[3] });
  }
  return shops;
}

function parseShopsWithPayback(html) {
  const names = [];
  for (const area of html.split(/(?=<div class="shop-area">)/)) {
    const header = area.match(/shop-area-header filter-tag">([^<]+)/);
    if (header && /item-name">Payback</.test(area)) {
      names.push(header[1].replace(/&amp;/g, '&').trim());
    }
  }
  return [...new Set(names)];
}

function extractPartnerId(html) {
  const match = html.match(/"partnerId":"(lp\d+)"/)
    || html.match(/partnerId\\?":\\?"(lp\d+)/)
    || html.match(/shortname\\?":\\?"(lp\d+)/)
    || html.match(/shop-tile-(lp\d+)/);
  return match ? match[1] : null;
}

async function resolveBySlug(slug) {
  const response = await fetch(`https://www.payback.de/shop/${slug}`, { headers: UA });
  if (response.status !== 200) return null;
  const html = await response.text();
  const id = extractPartnerId(html);
  if (!id) return null;
  const title = (html.match(/<title>([^<]*)/) || [])[1] || slug;
  const name = title.replace(/&amp;/g, '&').split(' » ')[0].trim();
  return { id, name, slug };
}

const paybackShops = parsePaybackShops(await fetchText('https://www.payback.de/online-shopping/shops-a-z'));
const byKey = new Map();
for (const shop of paybackShops) {
  for (const key of new Set([normalize(shop.name), normalize(shop.slug)])) {
    if (!byKey.has(key)) byKey.set(key, shop);
  }
}

const cashbackHtml = await fetchText('https://cashback-optimizer.de/');
const shopNames = parseShopsWithPayback(cashbackHtml);
const result = {};
const unresolved = [];

for (const rawName of shopNames) {
  const searchName = rawName === 'Netto MD' ? 'Netto' : rawName;
  const key = normalize(searchName);
  let shop = NO_DIRECT_SHOP.has(rawName) ? null : byKey.get(key);
  if (!shop && !NO_DIRECT_SHOP.has(rawName) && SLUG_OVERRIDES[rawName]) {
    shop = await resolveBySlug(SLUG_OVERRIDES[rawName]);
  }
  if (shop) {
    result[key] = { rawName, id: shop.id, name: shop.name };
  } else {
    unresolved.push(rawName);
  }
}

const lines = Object.entries(result)
  .sort((a, b) => a[1].rawName.localeCompare(b[1].rawName, 'de'))
  .map(([key, shop]) => `    ${JSON.stringify(key)}: ${JSON.stringify(shop.id)}, // ${shop.rawName} → ${shop.name}`);

console.error(`PAYBACK-Shops: ${paybackShops.length} | Shops mit Payback-Zeile: ${shopNames.length}`);
console.error(`Direkt verlinkt: ${Object.keys(result).length} | Fallback auf Suche: ${unresolved.length}${unresolved.length ? ` (${unresolved.join(', ')})` : ''}`);
console.log(`const PAYBACK_SHOP_IDS = {\n${lines.join('\n')}\n  };`);
