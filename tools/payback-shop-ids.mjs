// Ermittelt die PAYBACK-Shop-IDs (lp…) für alle Shops, für die
// cashback-optimizer.de eine „Payback“-Zeile anzeigt.
//
// Aufrufe:
//   node tools/payback-shop-ids.mjs            # Literal erzeugen (Standard)
//   node tools/payback-shop-ids.mjs --check     # drei Client-Dateien vergleichen
//   node tools/payback-shop-ids.mjs --verify    # eingebettete lp-IDs gegen payback.de prüfen
//
// Quellen:
//   - https://www.payback.de/online-shopping/shops-a-z (Partnerliste als RSC-Payload)
//   - https://www.payback.de/shop/<slug> (Bestätigung + partnerId)
//   - https://cashback-optimizer.de/ (Shopnamen mit Payback-Zeile)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_FILES = [
  'chrome/content.js',
  'userscript/cashback-optimizer.user.js',
  'android/app/src/main/assets/userscript.js',
];

const UA = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
};

const normalize = (value) => String(value || '').toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]/g, '');

function decodeEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;|&apos;/gi, (entity) => (entity.toLowerCase() === '&quot;' ? '"' : "'"))
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ');
}

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

// Kein eindeutiger PAYBACK-Shop: Laufzeit-Fallback auf DuckDuckGo.
const NO_DIRECT_SHOP = new Set(['Boohoo', 'Check24', 'Edeka']);

const MAP_START = 'const PAYBACK_SHOP_IDS = {';

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
      names.push(decodeEntities(header[1]).trim());
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
  const title = decodeEntities((html.match(/<title>([^<]*)/) || [])[1] || slug);
  const name = title.split(' » ')[0].trim();
  return { id, name, slug };
}

async function generate() {
  const paybackShops = parsePaybackShops(await fetchText('https://www.payback.de/online-shopping/shops-a-z'));

  const byKey = new Map();
  const paybackCollisions = new Map();
  for (const shop of paybackShops) {
    for (const key of new Set([normalize(shop.name), normalize(shop.slug)])) {
      if (!key) continue;
      if (!byKey.has(key)) {
        byKey.set(key, shop);
      } else if (byKey.get(key).id !== shop.id) {
        if (!paybackCollisions.has(key)) paybackCollisions.set(key, new Set([byKey.get(key).id]));
        paybackCollisions.get(key).add(shop.id);
      }
    }
  }
  if (paybackCollisions.size) {
    const details = [...paybackCollisions].map(([key, ids]) => `${key}: ${[...ids].join(', ')}`);
    throw new Error(`Mehrdeutige PAYBACK-Normalisierung:\n${details.join('\n')}`);
  }

  const cashbackHtml = await fetchText('https://cashback-optimizer.de/');
  const shopNames = parseShopsWithPayback(cashbackHtml);
  const result = {};
  const unresolved = [];
  const cashbackCollisions = new Map();

  for (const rawName of shopNames) {
    const searchName = rawName === 'Netto MD' ? 'Netto' : rawName;
    const key = normalize(searchName);
    if (cashbackCollisions.has(key) && cashbackCollisions.get(key) !== rawName) {
      throw new Error(`Mehrdeutige Shop-Normalisierung: ${cashbackCollisions.get(key)} und ${rawName} → ${key}`);
    }
    cashbackCollisions.set(key, rawName);

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

  return { paybackShops, shopNames, result, unresolved };
}

function render(result) {
  const lines = Object.entries(result)
    .sort((a, b) => a[1].rawName.localeCompare(b[1].rawName, 'de'))
    .map(([key, shop]) => `    ${JSON.stringify(key)}: ${JSON.stringify(shop.id)}, // ${shop.rawName} → ${shop.name}`);
  return `const PAYBACK_SHOP_IDS = {\n${lines.join('\n')}\n  };`;
}

function extractEmbeddedBlock(file) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const start = source.indexOf(MAP_START);
  if (start < 0) throw new Error(`${file}: ${MAP_START} nicht gefunden`);
  const end = source.indexOf('};', start);
  if (end < 0) throw new Error(`${file}: Ende des Map-Blocks nicht gefunden`);
  return source.slice(start, end + 2);
}

function parseEmbeddedEntries(block) {
  const entries = new Map();
  const re = /"([a-z0-9]+)":\s*"(lp\d+)",\s*\/\/\s*(.+?)\s*→\s*(.+?)\s*$/gm;
  for (const match of block.matchAll(re)) {
    entries.set(match[1], { id: match[2], rawName: match[3], name: match[4] });
  }
  return entries;
}

function check() {
  const maps = CLIENT_FILES.map((file) => ({ file, entries: parseEmbeddedEntries(extractEmbeddedBlock(file)) }));
  let failed = false;
  for (let i = 1; i < maps.length; i += 1) {
    const base = maps[0];
    const other = maps[i];
    const onlyBase = [...base.entries.keys()].filter((key) => !other.entries.has(key));
    const onlyOther = [...other.entries.keys()].filter((key) => !base.entries.has(key));
    const different = [...base.entries.keys()].filter((key) => other.entries.has(key) && base.entries.get(key).id !== other.entries.get(key).id);
    if (onlyBase.length || onlyOther.length || different.length) {
      failed = true;
      console.error(`${base.file} ↔ ${other.file}:`);
      if (onlyBase.length) console.error(`  nur in ${base.file}: ${onlyBase.join(', ')}`);
      if (onlyOther.length) console.error(`  nur in ${other.file}: ${onlyOther.join(', ')}`);
      if (different.length) console.error(`  abweichende IDs: ${different.map((key) => `${key} (${base.entries.get(key).id} vs ${other.entries.get(key).id})`).join(', ')}`);
    }
  }
  if (failed) {
    console.error('PAYBACK-Map ist nicht konsistent.');
    process.exitCode = 1;
    return;
  }
  console.log(`PAYBACK-Map konsistent: ${maps[0].entries.size} Einträge in ${maps.length} Dateien.`);
}

async function mapLimit(items, limit, fn) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      await fn(items[current], current);
    }
  });
  await Promise.all(workers);
}

async function verify() {
  const entries = parseEmbeddedEntries(extractEmbeddedBlock(CLIENT_FILES[0]));
  const items = [...entries].filter(([, entry]) => entry.name);
  const failures = [];
  let done = 0;

  await mapLimit(items, 8, async ([key, entry]) => {
    try {
      const response = await fetch(`https://www.payback.de/shop/${entry.id}`, { headers: UA });
      if (!response.ok) {
        failures.push(`${key} (${entry.id}): HTTP ${response.status}`);
        return;
      }
      const html = await response.text();
      const title = decodeEntities((html.match(/<title>([^<]*)/) || [])[1] || '');
      const actual = normalize(title.split(' » ')[0]);
      const expected = normalize(entry.name);
      if (!actual.includes(expected) && !expected.includes(actual)) {
        failures.push(`${key} (${entry.id}): erwartet „${entry.name}“, Titel „${title.split(' » ')[0]}“`);
      }
    } catch (error) {
      failures.push(`${key} (${entry.id}): ${error.message}`);
    } finally {
      done += 1;
      if (done % 50 === 0) console.error(`  ${done}/${items.length} geprüft`);
    }
  });

  if (failures.length) {
    console.error(`\n${failures.length} von ${items.length} PAYBACK-IDs fehlerhaft:`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${items.length} PAYBACK-IDs erfolgreich gegen payback.de geprüft.`);
}

const mode = process.argv[2];
if (mode === '--check') {
  check();
} else if (mode === '--verify') {
  await verify();
} else {
  const { paybackShops, shopNames, result, unresolved } = await generate();
  console.error(`PAYBACK-Shops: ${paybackShops.length} | Shops mit Payback-Zeile: ${shopNames.length}`);
  console.error(`Direkt verlinkt: ${Object.keys(result).length} | Fallback auf DuckDuckGo: ${unresolved.length}${unresolved.length ? ` (${unresolved.join(', ')})` : ''}`);
  console.log(render(result));
}
