const MAIN_DOMAIN = 'cashback-optimizer.de';
const DEFAULT_EXCLUDED_DOMAINS = [
  'bing.', 'duckduckgo.', 'kleinanzeigen.de',
  'copilot.microsoft.com/', 'mydealz.de', 'pepper.pl',
  'preisvergleich.', 'idealo.', 'brickmerge.de', 'amazon.',
  'netflix.com/watch', 'netflix.com/browse', 'ebay.', 'kartenwelt.rewe.de',
  'kartenwelt.penny.de'
];
const DEFAULTS = {
  enabled: true,
  cbPrefix: 'samsung',
  enableLinkEnricher: true,
  popupPrefetch: true,
  prefetchMode: 'idle',
  desktopIframePrefetch: true,
  displayMode: 'toolbar',
  excludedDomains: DEFAULT_EXCLUDED_DOMAINS
};
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

const elements = Object.fromEntries(Object.keys(DEFAULTS).map((id) => [id, document.getElementById(id)]));
const cashbackView = document.getElementById('cashbackView');
const settingsView = document.getElementById('settingsView');
const status = document.getElementById('status');
const shopSearch = document.getElementById('shopSearch');
const clearSearch = document.getElementById('clearSearch');
const searchResults = document.getElementById('searchResults');
const popularChips = document.getElementById('popularChips');

let currentFilterUrl = `https://${MAIN_DOMAIN}/`;
let cachedShopNames = [];
let detectedShop = null;
let selectedSearchIndex = -1;

function normalize(value) {
  return String(value || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
}
function normalizeShop(value) {
  return normalize(String(value || '').replace(/\.(de|com|eu|net|org|at|ch)$/i, ''));
}
function matchesDomain(host, domain) { return host === domain || host.endsWith(`.${domain}`); }
function isExcludedUrl(url, excludedDomains) {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (host === 'store.google.com' || host.endsWith('.store.google.com')) return false;
  if (/(^|\.)google\./i.test(host)) return true;
  const href = parsed.href.toLowerCase();
  return excludedDomains.some((entry) => href.includes(String(entry).toLowerCase()));
}
function findShopByHost(host, names) {
  for (const [domain, shop] of Object.entries(HOST_OVERRIDES)) if (matchesDomain(host, domain)) return shop;
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
async function requestText(url) {
  const result = await chrome.runtime.sendMessage({ type: 'cashbackOptimizerFetch', url });
  if (!result?.ok) throw new Error(result?.error || 'Abruf fehlgeschlagen');
  return result.responseText;
}
async function getShopNames() {
  if (cachedShopNames.length > 0) return cachedShopNames;
  const cache = await chrome.storage.local.get(['cb_optimizer_names', 'cb_optimizer_time']);
  if (cache.cb_optimizer_names && Date.now() - Number(cache.cb_optimizer_time || 0) < 86400000) {
    try {
      const names = JSON.parse(cache.cb_optimizer_names);
      if (Array.isArray(names) && names.length > 0) {
        cachedShopNames = names;
        return names;
      }
    } catch {}
  }
  const html = await requestText(`https://${MAIN_DOMAIN}/`);
  const pattern = /class=["'][^"']*\bshop-area-header\b[^"']*\bfilter-tag\b[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi;
  const names = [];
  for (const match of html.matchAll(pattern)) {
    const clean = match[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
    if (clean) names.push(clean);
  }
  const uniqueNames = [...new Set(names)];
  if (uniqueNames.length > 0) {
    cachedShopNames = uniqueNames;
    await chrome.storage.local.set({ cb_optimizer_names: JSON.stringify(uniqueNames), cb_optimizer_time: String(Date.now()) });
  }
  return uniqueNames;
}
function showSettings(show) {
  transitionViews(show ? cashbackView : settingsView, show ? settingsView : cashbackView);
}
function transitionViews(from, to) {
  if (from.classList.contains('hidden') || !to.classList.contains('hidden')) return;
  from.classList.add('view-leave');
  setTimeout(() => {
    from.classList.add('hidden');
    from.classList.remove('view-leave');
    to.classList.remove('hidden');
    to.classList.add('view-enter');
    setTimeout(() => to.classList.remove('view-enter'), 220);
  }, 110);
}
function renderSettings(settings) {
  for (const [key, value] of Object.entries(settings)) {
    const element = elements[key];
    if (!element) continue;
    if (element.type === 'checkbox') element.checked = Boolean(value);
    else if (key === 'excludedDomains') element.value = (value || []).join('\n');
    else element.value = value ?? '';
  }
  updateSettingsState();
}
function updateSettingsState() {
  elements.prefetchMode.disabled = !elements.popupPrefetch.checked;
  elements.desktopIframePrefetch.disabled = !elements.popupPrefetch.checked || elements.prefetchMode.value === 'click';
}
function readSettings() {
  return {
    enabled: elements.enabled.checked,
    cbPrefix: elements.cbPrefix.value.trim(),
    enableLinkEnricher: elements.enableLinkEnricher.checked,
    popupPrefetch: elements.popupPrefetch.checked,
    prefetchMode: elements.prefetchMode.value,
    desktopIframePrefetch: elements.desktopIframePrefetch.checked,
    displayMode: elements.displayMode.value,
    excludedDomains: elements.excludedDomains.value.split(/\r?\n/).map((value) => value.trim().toLowerCase()).filter(Boolean)
  };
}
async function openCurrentUrl() { await chrome.tabs.create({ url: currentFilterUrl }); }

function displayShop(shopName) {
  currentFilterUrl = `https://${MAIN_DOMAIN}/?filter=${encodeURIComponent(shopName)}`;
  document.getElementById('cashbackFrame').src = currentFilterUrl;
  document.getElementById('openTab').classList.remove('hidden');
  shopSearch.value = shopName;
  if (document.activeElement === shopSearch) {
    shopSearch.blur();
  }
  clearSearch.classList.remove('hidden');
  hideSearchResults();

  const loading = document.getElementById('loading');
  const unsupported = document.getElementById('unsupported');
  const panel = document.getElementById('cashbackPanel');
  if (!loading.classList.contains('hidden')) transitionViews(loading, panel);
  else if (!unsupported.classList.contains('hidden')) transitionViews(unsupported, panel);
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function filterShops(query) {
  const qNorm = normalize(query);
  if (!qNorm) return [];
  const starts = [];
  const contains = [];
  for (const name of cachedShopNames) {
    const nNorm = normalize(name);
    if (nNorm.startsWith(qNorm)) starts.push(name);
    else if (nNorm.includes(qNorm)) contains.push(name);
    if (starts.length + contains.length >= 10) break;
  }
  return [...starts, ...contains].slice(0, 10);
}

function highlightMatch(text, query) {
  const cleanQ = query.trim();
  if (!cleanQ) return text;
  const regex = new RegExp(`(${escapeRegex(cleanQ)})`, 'gi');
  return text.replace(regex, '<mark class="search-highlight">$1</mark>');
}

function renderSearchResults(matches, query) {
  selectedSearchIndex = -1;
  if (!matches.length) {
    searchResults.innerHTML = '<div class="search-empty-hint">Kein passender Shop gefunden</div>';
    searchResults.classList.remove('hidden');
    return;
  }
  searchResults.innerHTML = matches.map((shop, i) => `
    <div class="search-result-item" role="option" data-shop="${shop}" data-index="${i}">
      <span class="search-result-name">${highlightMatch(shop, query)}</span>
      <span class="search-result-badge">Cashback →</span>
    </div>
  `).join('');
  searchResults.classList.remove('hidden');
}

function hideSearchResults() {
  searchResults.classList.add('hidden');
  searchResults.innerHTML = '';
  selectedSearchIndex = -1;
}

function updateSelectedResult(items) {
  items.forEach((item, i) => {
    if (i === selectedSearchIndex) {
      item.classList.add('selected');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('selected');
    }
  });
}

function onSearchInput() {
  const query = shopSearch.value.trim();
  if (!query) {
    clearSearch.classList.add('hidden');
    hideSearchResults();
    return;
  }
  clearSearch.classList.remove('hidden');
  const matches = filterShops(query);
  renderSearchResults(matches, query);
}

searchResults.addEventListener('click', (e) => {
  const item = e.target.closest('.search-result-item');
  if (!item) return;
  const shop = item.dataset.shop;
  if (shop) displayShop(shop);
});

clearSearch.addEventListener('click', () => {
  shopSearch.value = '';
  clearSearch.classList.add('hidden');
  hideSearchResults();
  if (detectedShop) {
    displayShop(detectedShop);
  } else {
    const panel = document.getElementById('cashbackPanel');
    const unsupported = document.getElementById('unsupported');
    document.getElementById('openTab').classList.add('hidden');
    currentFilterUrl = `https://${MAIN_DOMAIN}/`;
    if (!panel.classList.contains('hidden')) transitionViews(panel, unsupported);
    shopSearch.focus();
  }
});

shopSearch.addEventListener('input', onSearchInput);
shopSearch.addEventListener('keydown', (e) => {
  const items = searchResults.querySelectorAll('.search-result-item');
  if (!items.length) {
    if (e.key === 'Enter') {
      const q = shopSearch.value.trim();
      if (q) displayShop(q);
    }
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedSearchIndex = (selectedSearchIndex + 1) % items.length;
    updateSelectedResult(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedSearchIndex = (selectedSearchIndex - 1 + items.length) % items.length;
    updateSelectedResult(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const targetItem = selectedSearchIndex >= 0 ? items[selectedSearchIndex] : items[0];
    if (targetItem && targetItem.dataset.shop) {
      displayShop(targetItem.dataset.shop);
    } else if (shopSearch.value.trim()) {
      displayShop(shopSearch.value.trim());
    }
  } else if (e.key === 'Escape') {
    hideSearchResults();
  }
});

document.addEventListener('click', (e) => {
  if (!shopSearch.contains(e.target) && !searchResults.contains(e.target)) {
    hideSearchResults();
  }
});

if (popularChips) {
  popularChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip && chip.dataset.shop) displayShop(chip.dataset.shop);
  });
}

function focusSearchInput() {
  requestAnimationFrame(() => {
    if (!detectedShop) {
      shopSearch.focus();
      setTimeout(() => {
        if (!detectedShop && document.activeElement !== shopSearch) {
          shopSearch.focus();
        }
      }, 50);
    }
  });
}

// Sofortige Fokussierung des Suchfelds, wenn kein '€'-Symbol an der Erweiterung angezeigt wird
chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  if (tab?.id !== undefined) {
    chrome.action.getBadgeText({ tabId: tab.id }).then((badgeText) => {
      if (!badgeText || badgeText !== '€') {
        focusSearchInput();
      }
    }).catch(() => focusSearchInput());
  } else {
    focusSearchInput();
  }
}).catch(() => {});

async function loadCashback() {
  const settings = await chrome.storage.sync.get({ ...DEFAULTS, extraExcludedDomains: [] });
  settings.excludedDomains = [...new Set([
    ...(Array.isArray(settings.excludedDomains) ? settings.excludedDomains : DEFAULT_EXCLUDED_DOMAINS),
    ...(Array.isArray(settings.extraExcludedDomains) ? settings.extraExcludedDomains : [])
  ])];
  renderSettings(settings);
  if (!settings.enabled) {
    document.querySelector('#unsupported strong').textContent = 'Die Erweiterung ist deaktiviert.';
    transitionViews(document.getElementById('loading'), document.getElementById('unsupported'));
    focusSearchInput();
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const allShopNames = await getShopNames();
    if (isExcludedUrl(tab.url, settings.excludedDomains)) {
      document.querySelector('#unsupported strong').textContent = 'Diese Seite ist ausgeschlossen.';
      transitionViews(document.getElementById('loading'), document.getElementById('unsupported'));
      focusSearchInput();
      return;
    }
    const host = new URL(tab.url).hostname.toLowerCase();
    const shop = findShopByHost(host, allShopNames);
    if (!shop) {
      transitionViews(document.getElementById('loading'), document.getElementById('unsupported'));
      focusSearchInput();
      return;
    }
    detectedShop = shop;
    displayShop(shop);
  } catch {
    transitionViews(document.getElementById('loading'), document.getElementById('unsupported'));
    focusSearchInput();
  }
}

document.getElementById('settingsButton').addEventListener('click', () => showSettings(true));
document.getElementById('backButton').addEventListener('click', () => showSettings(false));
document.getElementById('openMain').addEventListener('click', openCurrentUrl);
document.getElementById('openTab').addEventListener('click', openCurrentUrl);
document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.sync.set(readSettings());
  await chrome.storage.sync.remove('extraExcludedDomains');
  status.textContent = 'Gespeichert – offene Seiten neu laden.';
});
document.getElementById('reset').addEventListener('click', () => {
  renderSettings(DEFAULTS);
  status.textContent = 'Standardwerte eingesetzt – noch speichern.';
});
elements.popupPrefetch.addEventListener('change', updateSettingsState);
elements.prefetchMode.addEventListener('change', updateSettingsState);
loadCashback();

