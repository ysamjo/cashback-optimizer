const MAIN_URL = 'https://cashback-optimizer.de/';
const DEFAULT_EXCLUDED_DOMAINS = [
  'bing.', 'duckduckgo.', 'kleinanzeigen.de',
  'copilot.microsoft.com/', 'mydealz.de', 'pepper.pl',
  'preisvergleich.', 'idealo.', 'brickmerge.de', 'amazon.',
  'netflix.com/watch', 'netflix.com/browse', 'ebay.', 'kartenwelt.rewe.de',
  'kartenwelt.penny.de'
];
const HOST_OVERRIDES = {
  'store.google.com': 'Google Store',
  'netto-online.de': 'Netto MD',
  'baur.de': 'Baur',
  'g-star.com': 'G-Star RAW',
  'otto.de': 'Otto',
  'rossmann.de': 'Rossmann',
  'snipes.com': 'SNIPES',
  'store.steampowered.com': 'Steam',
  'booking.com': 'Booking.com'
};

let namesPromise = null;
const badgeGenerations = new Map();

function normalize(value) {
  return String(value || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeShop(value) {
  return normalize(String(value || '').replace(/\.(de|com|eu|net|org|at|ch)$/i, ''));
}

function matchesDomain(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

function findShopByHost(host, names) {
  for (const [domain, shop] of Object.entries(HOST_OVERRIDES)) {
    if (matchesDomain(host, domain)) return shop;
  }
  const hostWithoutWww = host.replace(/^www\./, '');
  const directDomainMatch = names.find((name) => normalize(name) === normalize(hostWithoutWww));
  if (directDomainMatch) return directDomainMatch;

  const segments = host.split('.').filter((part) => !['www', 'de', 'com', 'net', 'shop', 'online', 'at', 'ch'].includes(part));
  for (const segment of segments) {
    const match = names.find((name) => normalizeShop(name) === normalize(segment) || normalize(name) === normalize(segment));
    if (match) return match;
  }
  return null;
}

function decodeHtml(value) {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#039;/g, "'")
    .replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü')
    .replace(/&Auml;/g, 'Ä').replace(/&Ouml;/g, 'Ö').replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß').replace(/&nbsp;/g, ' ')
    .trim();
}

function parseShopNames(html) {
  const names = [];
  const pattern = /class=["'][^"']*\bshop-area-header\b[^"']*\bfilter-tag\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi;
  for (const match of html.matchAll(pattern)) {
    const name = decodeHtml(match[1]);
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

async function getShopNames() {
  if (namesPromise) return namesPromise;
  namesPromise = (async () => {
    const cache = await chrome.storage.local.get(['cb_optimizer_names', 'cb_optimizer_time']);
    if (cache.cb_optimizer_names && Date.now() - Number(cache.cb_optimizer_time || 0) < 86400000) {
      try {
        const names = JSON.parse(cache.cb_optimizer_names);
        if (Array.isArray(names) && names.length > 0) return names;
      } catch {}
    }
    const response = await fetch(MAIN_URL, { credentials: 'omit', cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const names = parseShopNames(await response.text());
    if (names.length > 0) {
      await chrome.storage.local.set({
        cb_optimizer_names: JSON.stringify(names),
        cb_optimizer_time: String(Date.now())
      });
    }
    return names;
  })().catch(() => []);
  return namesPromise;
}

async function getSettings() {
  const settings = await chrome.storage.sync.get({
    enabled: true,
    excludedDomains: DEFAULT_EXCLUDED_DOMAINS,
    extraExcludedDomains: []
  });
  settings.excludedDomains = [...new Set([
    ...(Array.isArray(settings.excludedDomains) ? settings.excludedDomains : DEFAULT_EXCLUDED_DOMAINS),
    ...(Array.isArray(settings.extraExcludedDomains) ? settings.extraExcludedDomains : [])
  ].map((entry) => String(entry).trim().toLowerCase()).filter(Boolean))];
  return settings;
}

function isExcludedUrl(url, excludedDomains) {
  let parsed;
  try { parsed = new URL(url); } catch { return true; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return true;
  const host = parsed.hostname.toLowerCase();
  if (matchesDomain(host, 'store.google.com')) return false;
  if (/(^|\.)google\./i.test(host)) return true;
  return excludedDomains.some((entry) => parsed.href.toLowerCase().includes(entry));
}

async function setBadge(tabId, shop) {
  await Promise.all([
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#b5964c' }),
    chrome.action.setBadgeText({ tabId, text: shop ? '€' : '' }),
    chrome.action.setTitle({ tabId, title: shop ? `${shop}: Cashback verfügbar` : 'Cashback-Optimizer' })
  ]);
}

async function updateBadgeForTab(tabId, url) {
  const generation = (badgeGenerations.get(tabId) || 0) + 1;
  badgeGenerations.set(tabId, generation);
  await setBadge(tabId, null).catch(() => {});
  const settings = await getSettings();
  if (!settings.enabled || isExcludedUrl(url, settings.excludedDomains)) return;

  const host = new URL(url).hostname.toLowerCase();
  const directShop = findShopByHost(host, []);
  const shop = directShop || findShopByHost(host, await getShopNames());
  if (generation !== badgeGenerations.get(tabId)) return;
  await setBadge(tabId, shop).catch(() => {});
}

async function refreshAllTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => tab.id !== undefined && tab.url
    ? updateBadgeForTab(tab.id, tab.url)
    : Promise.resolve()));
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'cashbackOptimizerFetch') return false;

  let url;
  try { url = new URL(message.url); }
  catch {
    sendResponse({ ok: false, error: 'Ungültige URL' });
    return false;
  }
  if (url.origin !== new URL(MAIN_URL).origin) {
    sendResponse({ ok: false, error: 'Domain nicht erlaubt' });
    return false;
  }
  fetch(url.href, { method: 'GET', credentials: 'omit', cache: message.cache || 'default' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      sendResponse({ ok: true, responseText: await response.text() });
    })
    .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') setBadge(tabId, null).catch(() => {});
  if (changeInfo.url || changeInfo.status === 'complete') {
    updateBadgeForTab(tabId, changeInfo.url || tab.url).catch(() => {});
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  if (tab.url) updateBadgeForTab(tabId, tab.url).catch(() => {});
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') return;
  if (changes.enabled || changes.excludedDomains || changes.extraExcludedDomains) refreshAllTabs().catch(() => {});
});

const CONTEXT_MENU_SEARCH_ID = 'search_cashback';

function setupContextMenu() {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_SEARCH_ID,
      title: 'Im Cashback-Optimizer nach „%s“ suchen',
      contexts: ['selection']
    }, () => {
      if (chrome.runtime.lastError) {}
    });
  });
}

chrome.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_SEARCH_ID) return;
  const selection = String(info.selectionText || '').trim();
  if (!selection) return;

  const targetUrl = `https://cashback-optimizer.de/?filter=${encodeURIComponent(selection)}`;
  if (tab && tab.id !== undefined) {
    chrome.tabs.create({ url: targetUrl, index: tab.index + 1 });
  } else {
    chrome.tabs.create({ url: targetUrl });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu();
  refreshAllTabs().catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  setupContextMenu();
  refreshAllTabs().catch(() => {});
});
