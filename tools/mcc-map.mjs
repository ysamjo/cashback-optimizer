// Erzeugt aus data/mcc-merchants.tsv die Händler-MCC-Zuordnung für die
// Shop-Header auf cashback-optimizer.de.
//
// Aufrufe:
//   node tools/mcc-map.mjs            # JS-Literal ausgeben
//   node tools/mcc-map.mjs --report   # Treffer/Lücken gegen cashback-optimizer.de
//   node tools/mcc-map.mjs --check    # drei Client-Dateien vergleichen
//
// Regeln:
//   - Ein exakter Namestreffer hat Vorrang vor einem Alias.
//   - Innerhalb einer Stufe gewinnt der Online-Eintrag; sonst der erste Eintrag.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TSV = path.join(ROOT, 'data/mcc-merchants.tsv');
const CLIENT_FILES = [
  'chrome/content.js',
  'userscript/cashback-optimizer.user.js',
  'android/app/src/main/assets/userscript.js',
];
const MAP_START = 'const SHOP_MCC = {';
const UA = { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };

// Tabellennamen, die auf einen anderen cashback-optimizer-Shop zeigen.
const ALIASES = {
  'Deutsche Bahn (Nahverkehr)': ['Bahn'],
  'Deutsche Bahn (Fernverkehr)': ['Bahn'],
  'Edeka / Scheck-In Center': ['Edeka'],
  'Bauhaus Online': ['Bauhaus'],
  'Media Markt / Saturn': ['Media Markt', 'Saturn'],
  'www.netto-online.de': ['Netto MD'],
  'Apple.com/Bill': ['Apple'],
  'Fleurop AG': ['Fleurop'],
  'Rofu Online': ['ROFU'],
  'Rofu Kinderland': ['ROFU'],
  'Alza.cz a.s.': ['Alza'],
  'Temu.com': ['Temu'],
  'Thomas Philipps GmbH u. C': ['Thomas Philipps'],
  'Expert Eco': ['Expert'],
  'Reservix GmbH': ['Reservix'],
  'Hellweg WF': ['Hellweg'],
  'Wow TV': ['WOW'],
  'Thalia Buecher': ['Thalia'],
  'Lidl SNC': ['Lidl'],
  'Marktkauf (Imbisstheke)': ['Marktkauf'],
  'IKEA (Schwedenbistro)': ['Ikea'],
  'Ebay De': ['Ebay'],
  'Amazon.de': ['Amazon'],
  'Amazon EU Sarl': ['Amazon'],
  'Amazon (Guthaben)': ['Amazon'],
  'Amazon PRIME Abo': ['Amazon'],
  'AMZN Mktp DE': ['Amazon'],
};

const normalize = (value) => String(value || '').toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]/g, '');

function readRows() {
  return fs.readFileSync(TSV, 'utf8').split(/\r?\n/).slice(1)
    .filter((line) => line.trim())
    .map((line) => {
      const [name, channel, mcc, category] = line.split('\t');
      return { name: name.trim(), channel: (channel || '').trim(), mcc: (mcc || '').trim(), category: (category || '').trim() };
    })
    .filter((row) => row.name && /^\d+$/.test(row.mcc));
}

function preferOnline(rows) {
  if (!rows.length) return null;
  return rows.find((row) => row.channel.toLowerCase().includes('online')) || rows[0];
}

function build() {
  const rows = readRows();
  const byName = new Map();
  for (const row of rows) {
    if (!byName.has(row.name)) byName.set(row.name, []);
    byName.get(row.name).push(row);
  }

  const exactCandidates = new Map();
  for (const [name, group] of byName) {
    const key = normalize(name);
    if (!exactCandidates.has(key)) exactCandidates.set(key, []);
    exactCandidates.get(key).push(preferOnline(group));
  }

  const aliasCandidates = new Map();
  for (const [name, targets] of Object.entries(ALIASES)) {
    const group = byName.get(name);
    if (!group) continue;
    const best = preferOnline(group);
    for (const target of targets) {
      const key = normalize(target);
      if (!aliasCandidates.has(key)) aliasCandidates.set(key, []);
      aliasCandidates.get(key).push(best);
    }
  }

  return { rows, exactCandidates, aliasCandidates };
}

async function cboShopNames() {
  const response = await fetch('https://cashback-optimizer.de/', { headers: UA });
  if (!response.ok) throw new Error(`cashback-optimizer.de: HTTP ${response.status}`);
  const html = await response.text();
  return [...new Set([...html.matchAll(/shop-area-header filter-tag">([^<]+)/g)]
    .map((match) => match[1].replace(/&amp;/g, '&').trim()))];
}

function resolveMap(shops) {
  const { exactCandidates, aliasCandidates } = build();
  const map = {};
  const matchedRows = new Set();
  for (const shop of shops) {
    const key = normalize(shop);
    const exact = exactCandidates.get(key);
    const alias = aliasCandidates.get(key);
    const source = (exact && exact.length ? exact : alias) || [];
    const best = preferOnline(source);
    if (!best) continue;
    map[key] = { mcc: best.mcc, channel: best.channel, category: best.category };
    matchedRows.add(best.name);
  }
  return { map, matchedRows };
}

function render(map) {
  const lines = Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, info]) => `    ${JSON.stringify(key)}: { mcc: ${JSON.stringify(info.mcc)}, channel: ${JSON.stringify(info.channel)}, category: ${JSON.stringify(info.category)} },`);
  return `const SHOP_MCC = {\n${lines.join('\n')}\n  };`;
}

function extractEmbeddedBlock(file) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const start = source.indexOf(MAP_START);
  if (start < 0) throw new Error(`${file}: ${MAP_START} nicht gefunden`);
  const end = source.indexOf('};', start);
  if (end < 0) throw new Error(`${file}: Ende des Map-Blocks nicht gefunden`);
  return source.slice(start, end + 2);
}

function parseEmbeddedMcc(block) {
  const entries = new Map();
  for (const match of block.matchAll(/"([a-z0-9]+)":\s*\{\s*mcc:\s*"(\d+)"/g)) {
    entries.set(match[1], match[2]);
  }
  return entries;
}

function check() {
  const maps = CLIENT_FILES.map((file) => ({ file, entries: parseEmbeddedMcc(extractEmbeddedBlock(file)) }));
  let failed = false;
  for (let i = 1; i < maps.length; i += 1) {
    const base = maps[0];
    const other = maps[i];
    const onlyBase = [...base.entries.keys()].filter((key) => !other.entries.has(key));
    const onlyOther = [...other.entries.keys()].filter((key) => !base.entries.has(key));
    const different = [...base.entries.keys()].filter((key) => other.entries.has(key) && base.entries.get(key) !== other.entries.get(key));
    if (onlyBase.length || onlyOther.length || different.length) {
      failed = true;
      console.error(`${base.file} ↔ ${other.file}:`);
      if (onlyBase.length) console.error(`  nur in ${base.file}: ${onlyBase.join(', ')}`);
      if (onlyOther.length) console.error(`  nur in ${other.file}: ${onlyOther.join(', ')}`);
      if (different.length) console.error(`  abweichende MCCs: ${different.map((key) => `${key} (${base.entries.get(key)} vs ${other.entries.get(key)})`).join(', ')}`);
    }
  }
  if (failed) {
    console.error('MCC-Map ist nicht konsistent.');
    process.exitCode = 1;
    return;
  }
  console.log(`MCC-Map konsistent: ${maps[0].entries.size} Einträge in ${maps.length} Dateien.`);
}

const mode = process.argv[2];
if (mode === '--check') {
  check();
} else {
  const shops = await cboShopNames();
  const { map, matchedRows } = resolveMap(shops);
  if (mode === '--report') {
    const rows = readRows();
    const unused = rows.filter((row) => !matchedRows.has(row.name));
    console.log(`cashback-optimizer-Shops: ${shops.length} | MCC-Zuordnungen: ${Object.keys(map).length}`);
    console.log(`Treffer: ${[...matchedRows].sort((a, b) => a.localeCompare(b, 'de')).join(', ')}`);
    console.log(`\nOhne Treffer (${unused.length}): ${unused.map((row) => row.name).join(', ')}`);
  } else {
    console.log(render(map));
  }
}
