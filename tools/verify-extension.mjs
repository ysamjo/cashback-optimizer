// End-to-End-Pruefung der Cashback-Optimizer-Extension in einem echten Browser
// (ego lite), inklusive Badge, Shop-Liste und Ausschlussliste.
//
// Aufruf aus dem Repo-Wurzelverzeichnis:
//   ~/.local/bin/ego-browser nodejs < tools/verify-extension.mjs
//
// Voraussetzungen:
//   - ego lite laeuft und die Extension liegt entpackt unter chrome/
//     (ego lite: chrome://extensions -> Entwicklermodus -> Entpackte Erweiterung laden)
//   - Optional: CB_EXT_DIR (Standard: <repo>/chrome), CB_EXT_ID als Override
//
// Geprueft wird das €-Badge je Tab. Ein leeres Badge auf einer Shop-URL ist der
// Fehlerfall. Genau daran ist travelcircus.de gescheitert: die Seite wurde ueber
// einen Affiliate-Link mit ?utm_source=mydealz.de geoeffnet, und die
// Ausschlusspruefung verglich die komplette URL statt nur Host und Pfad.
//
// Der Exit-Code ist 0, wenn alle Faelle stimmen, sonst 1.

import { createHash } from "node:crypto";

const EXT_DIR = process.env.CB_EXT_DIR || "/Users/family/Developer/cashback-optimizer/chrome";

// Chrome leitet die ID einer entpackten Erweiterung aus ihrem absoluten Pfad ab:
// erste 32 Hex-Zeichen von SHA-256(Pfad), 0-f auf a-p abgebildet.
function extensionIdFromPath(path) {
  const hex = createHash("sha256").update(path).digest("hex").slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
}

const EXT_ID = process.env.CB_EXT_ID || extensionIdFromPath(EXT_DIR);

const CASES = [
  { url: "https://www.travelcircus.de/", shop: "Travelcircus", note: "Basis-URL" },
  { url: "https://www.travelcircus.de/?utm_source=mydealz.de", shop: "Travelcircus", note: "Affiliate-Parameter darf nicht ausschliessen" },
  { url: "https://www.travelcircus.de/?utm_source=idealo.de", shop: "Travelcircus", note: "dito, anderer Partner" },
  { url: "https://www.otto.de/", shop: "Otto", note: "HOST_OVERRIDES-Pfad" },
  { url: "https://www.mydealz.de/", shop: null, note: "echter Ausschluss greift weiterhin" },
  { url: "https://www.amazon.de/", shop: null, note: "echter Ausschluss greift weiterhin" },
  { url: "https://example.com/", shop: null, note: "kein Shop in der Liste" },
];

const task = await taskSpace("Cashback-Extension verifizieren");
const shopPage = task.page("p1");
const extPage = await task.newPage();

async function readTab(exactUrl) {
  return extPage.evaluate(async (expected) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => t.url === expected);
    if (!tab) return { found: false };
    return {
      found: true,
      badge: await chrome.action.getBadgeText({ tabId: tab.id }),
      actionTitle: await chrome.action.getTitle({ tabId: tab.id }),
    };
  }, exactUrl);
}

async function waitForBadge(exactUrl, expectShop) {
  let info = { found: false };
  const attempts = expectShop ? 20 : 12;
  for (let i = 0; i < attempts; i++) {
    info = await readTab(exactUrl);
    if (info.found && info.badge) break;
    await shopPage.waitForTimeout(500);
  }
  return info;
}

let failures = 0;

try {
  await extPage.goto(`chrome-extension://${EXT_ID}/popup.html`);
  await extPage.waitForLoadState();
} catch (error) {
  console.log(`ABBRUCH: Extension ${EXT_ID} ist in ego lite nicht geladen.`);
  console.log(`Pfad: ${EXT_DIR}`);
  console.log(String(error && error.message ? error.message : error));
  await task.finish({ keep: [] }).catch(() => {});
  process.exit(1);
}

const setup = await extPage.evaluate(async () => {
  const sync = await chrome.storage.sync.get(null);
  const local = await chrome.storage.local.get(["cb_optimizer_names", "cb_optimizer_time", "cb_optimizer_cache_version"]);
  let shops = 0;
  try { shops = JSON.parse(local.cb_optimizer_names || "[]").length; } catch (e) {}
  return {
    version: chrome.runtime.getManifest().version,
    enabled: sync.enabled !== false,
    shops,
    cacheVersion: local.cb_optimizer_cache_version || null,
    cacheAgeMin: local.cb_optimizer_time ? Math.round((Date.now() - Number(local.cb_optimizer_time)) / 60000) : null,
  };
});

console.log(`Extension ${setup.version} | aktiv: ${setup.enabled} | Shops im Cache: ${setup.shops}`
  + ` | Cache-Version: ${setup.cacheVersion} | Alter: ${setup.cacheAgeMin} min`);
console.log("");

for (const [index, testCase] of CASES.entries()) {
  // Eindeutiges Fragment, damit der Tab sicher zuzuordnen ist. Host und Pfad
  // bleiben unveraendert, die Erkennung sieht also dieselbe URL.
  const target = `${testCase.url}#cbverify=${index}`;
  await shopPage.goto(target);
  await shopPage.waitForLoadState();

  const actual = await shopPage.url();
  const info = await waitForBadge(actual, testCase.shop !== null);

  const passed = info.found && (testCase.shop ? Boolean(info.badge) : !info.badge);
  if (!passed) failures += 1;

  const badge = info.found ? (info.badge || "(leer)") : "(Tab nicht gefunden)";
  console.log(`${passed ? "OK  " : "FEHL"} | ${testCase.url}`);
  console.log(`       erwartet: ${testCase.shop || "kein Badge"} | Badge: ${badge} | ${info.actionTitle || "-"}`);
  if (!passed) console.log(`       Hinweis: ${testCase.note}`);
}

console.log("");
console.log(failures === 0 ? `Alle ${CASES.length} Faelle bestanden.` : `${failures} von ${CASES.length} Faellen fehlgeschlagen.`);

await task.finish({ keep: [] }).catch(() => {});
process.exit(failures === 0 ? 0 : 1);
