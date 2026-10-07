(async function () {
  'use strict';

  if (globalThis.__cashbackOptimizerExtensionLoaded) return;
  globalThis.__cashbackOptimizerExtensionLoaded = true;

  const DEFAULT_EXCLUDED_DOMAINS = [
    'bing.', 'duckduckgo.', 'kleinanzeigen.de',
    'copilot.microsoft.com/', 'mydealz.de', 'pepper.pl',
    'preisvergleich.', 'idealo.', 'brickmerge.de', 'amazon.',
    'netflix.com/watch', 'netflix.com/browse', 'ebay.', 'kartenwelt.rewe.de',
    'kartenwelt.penny.de'
  ];
  const DEFAULT_SETTINGS = {
    enabled: true,
    cbPrefix: 'samsung',
    enableLinkEnricher: true,
    popupPrefetch: true,
    prefetchMode: 'idle',
    desktopIframePrefetch: true,
    displayMode: 'toolbar',
    excludedDomains: DEFAULT_EXCLUDED_DOMAINS,
    extraExcludedDomains: []
  };

  const SETTINGS = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  if (!SETTINGS.enabled) return;

  const LOCAL_STORAGE_CACHE = await chrome.storage.local.get(null);
  const ENABLE_LINK_ENRICHER = SETTINGS.enableLinkEnricher;
  const CB_PREFIX = String(SETTINGS.cbPrefix || '').trim();
  const MAIN_DOMAIN = "cashback-optimizer.de";

  const POPUP_PREFETCH = SETTINGS.popupPrefetch;
  const POPUP_PREFETCH_DELAY_MS = 500;
  const POPUP_PREFETCH_IDLE_TIMEOUT_MS = 1200;
  const DESKTOP_IFRAME_PREFETCH = SETTINGS.desktopIframePrefetch;

  const EXCLUDED_DOMAINS = [...new Set([
    ...(Array.isArray(SETTINGS.excludedDomains) ? SETTINGS.excludedDomains : DEFAULT_EXCLUDED_DOMAINS),
    ...(Array.isArray(SETTINGS.extraExcludedDomains) ? SETTINGS.extraExcludedDomains : [])
  ].map((entry) => String(entry).trim().toLowerCase()).filter(Boolean))];

  const ICON_URL = `https://${MAIN_DOMAIN}/favicons/favicon.svg`;
  const CSP_SITES = ['rossmann.de', 'lidl.de', 'eon.de'];
  const STORAGE_PREFIX = "cb_optimizer_";
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

  function isCashbackOptimizerContext() {
    return (
      location.hostname.includes(MAIN_DOMAIN) ||
      location.href.includes("kolateeprojects.gitlab.io/cashback_optimizer")
    );
  }

  function isExcludedPage() {
    const host = location.hostname.toLowerCase();
    if (host === 'store.google.com' || host.endsWith('.store.google.com')) return false;
    if (/(^|\.)google\./i.test(host)) return true;
    // Nur Host und Pfad prüfen – Query-Parameter wie ?utm_source=mydealz.de
    // dürfen die Erkennung auf der Zielseite nicht abschalten.
    const target = (location.hostname + location.pathname).toLowerCase();
    return EXCLUDED_DOMAINS.some((entry) => target.includes(entry));
  }

  function findShopByHost(host, names) {
    for (const [domain, shopName] of Object.entries(HOST_OVERRIDES)) {
      if (host === domain || host.endsWith(`.${domain}`)) return shopName;
    }
    if (!names?.length) return null;
    const hostWithoutWww = host.replace(/^www\./, '');
    const directDomainMatch = names.find((name) => normalize(name) === normalize(hostWithoutWww));
    if (directDomainMatch) return directDomainMatch;

    const segments = host.split('.').filter((part) => !['www', 'de', 'com', 'net', 'shop', 'online', 'at', 'ch'].includes(part));
    for (const segment of segments) {
      const match = names.find((name) => {
        const normName = normalize(name);
        const normShop = normalize(String(name || '').replace(/\.(de|com|eu|net|org|at|ch)$/i, ''));
        const normSeg = normalize(segment);
        return normShop === normSeg || normName === normSeg;
      });
      if (match) return match;
    }
    return null;
  }

  function setStorage(k, v) {
    const key = STORAGE_PREFIX + k;
    LOCAL_STORAGE_CACHE[key] = v;
    chrome.storage.local.set({ [key]: v }).catch(() => {});
  }

  function getStorage(k) {
    return LOCAL_STORAGE_CACHE[STORAGE_PREFIX + k];
  }

  function requestText(url, cache = 'default') {
    return chrome.runtime.sendMessage({ type: 'cashbackOptimizerFetch', url, cache })
      .then((result) => {
        if (!result?.ok) throw new Error(result?.error || 'Abruf fehlgeschlagen');
        return result.responseText;
      });
  }

  function normalize(s) {
    return s
      ? s.toLowerCase()
          .replace(/ä/g, 'ae')
          .replace(/ö/g, 'oe')
          .replace(/ü/g, 'ue')
          .replace(/ß/g, 'ss')
          .replace(/[^a-z0-9]/g, '')
      : '';
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function isMobileUA() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  }

  function enc(x) {
    return encodeURIComponent(x ?? "");
  }

  function buildNormalizedMap(obj) {
    const map = new Map();
    for (const [k, v] of Object.entries(obj)) {
      map.set(normalize(k), v);
    }
    return map;
  }

  function warmCache(url) {
    if (!POPUP_PREFETCH) return;

    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (c && c.saveData) return;

    const urls = [
      `https://${MAIN_DOMAIN}/`,
      url
    ];

    for (const u of urls) requestText(u, 'force-cache').catch(() => {});
  }

  const directLinks = {
    "Benefit Buddy": "https://www.benefitbuddy.de/",
    "Hanseatic Vorteilswelt": "https://meine.hanseaticbank.de/?redirect=voucherPortal",
    "Vip District / MIVO": "https://mitarbeitervorteile.de/",
    "O2 Priority": "https://www.o2online.de/priority/vorteile/priority-vorteilswelt",
    "Cadooz (MyDealz)": "https://www.mydealz.de/deals/mydealz-cadooz-vorteilswelt-jetzt-fur-alle-zb-bestchoice-classic-50eur-5eur-i-adidas-12-cyberport-4-eterna-15-lieferando-5-etc-2353520",
    "Cadooz (Sparwelt)": "https://www.sparwelt.de/themenwelten/sparwelt-vorteilswelt",
    "Cadooz (AmEx)": "https://m.amex/amexofferslp2024",
    "Sovendus": `https://${MAIN_DOMAIN}/sovendus/`,
    "Allianz Vorteilswelt": "https://vorteile.allianz.de/einkaufsvorteile",
    "AmEx Offers": "https://m.amex/amexofferslp2024",
    "benefitforme": CB_PREFIX ? `https://${CB_PREFIX}.meinebenefits.de/` : "https://meinebenefits.de/",
    "Miles & More": "https://www.miles-and-more.com/de/de/earn/shopping/shopping-platform.html?l=de",
    "Payback Gutscheine": "https://www.payback.de/coupons?partnerId=lp741",
    "Payback Prämienshop": "https://www.payback.de/praemien/kategorie/gutscheine",
    "Geschenkkartenwelt.de": "https://www.geschenkkartenwelt.de/",
    "Netto Kartenwelt": "https://www.netto-online.de/geschenk-gutscheinkarten/",
    "Marktkauf Kartenwelt": "https://www.marktkauf.de/geschenk-gutscheinkarten/kat-M0740",
    "MeinMagenta": "https://www.telekom.de/magenta-moments",
    "Samsung Members": "https://www.samsung.com/de/apps/samsung-members/",
    "EveryWish": "https://app.everywish.de/#:~:text=Suchen-,Top%20Auswahl,-%E2%80%B9",
    "Fashioncheque": "https://www.fashioncheque.com/de-de/shopfinder"
  };

  const bcLinks = {
    "BestChoice Classic": "https://ace-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
    "BestChoice Premium": "https://premium-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&locale=default&sortBy=alpha&ptg=vou",
    "BestChoice Aktion": "https://bc-aktion-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&locale=default&sortBy=alpha&ptg=vou",
    "BestChoice Plus": "https://plus-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&locale=default&sortBy=alpha&ptg=vou",
    "BestChoice BenefitBuddy": "https://bestchoice-ace-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
    "BestChoice Birthday & Party": "https://birthday-party-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
    "BestChoice Style & Beauty": "https://style-beauty-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
    "BestChoice Home & Office": "https://home-office-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
    "BestChoice Kids & Play": "https://kids-play-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
    "BestChoice Fit & Healthy": "https://fit-healthy-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
    "BestChoice Drive & Ride": "https://drive-ride-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
    "BestChoice DIY & Garden": "https://diy-garden-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
    "BestChoice Food & Drinks": "https://food-drinks-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
    "BestChoice Home & Living": "https://home-living-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
    "BestChoice Tech & Media": "https://tech-media-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
    "BestChoice Travel & Adventure": "https://travel-adventure-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
    "BestChoice Sport & Hobby": "https://sport-hobby-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
    "BestChoice Streaming & Entertainment": "https://streaming-entertainment-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
    "Wunschgutschein": "https://www.wunschgutschein.de/pages/beliebtesten-einloesepartner",
    "Wunschgutschein Beauty": "https://app.wunschgutschein.de/beauty#:~:text=GUTSCHEIN%20EINL%C3%96SEN-,Top%20Auswahl,-%E2%80%B9",
    "Wunschgutschein Home & Living": "https://app.wunschgutschein.de/homeandliving#:~:text=GUTSCHEIN%20EINL%C3%96SEN-,Top%20Auswahl,-%E2%80%B9",
    "Wunschgutschein Fashion": "https://app.wunschgutschein.de/fashion#:~:text=GUTSCHEIN%20EINL%C3%96SEN-,Top%20Auswahl,-%E2%80%B9",
    "Wunschgutschein Shopping": "https://app.wunschgutschein.de/shopping#:~:text=GUTSCHEIN%20EINL%C3%96SEN-,Top%20Auswahl,-%E2%80%B9",
    "Wunschgutschein Sport": "https://app.wunschgutschein.de/sport#:~:text=GUTSCHEIN%20EINL%C3%96SEN-,Top%20Auswahl,-%E2%80%B9",
    "Wunschgutschein Mobilität": "https://app.wunschgutschein.de/mobilitaet#:~:text=GUTSCHEIN%20EINL%C3%96SEN-,Top%20Auswahl,-%E2%80%B9",
    "Wunschgutschein Kids & Fun": "https://app.wunschgutschein.de/kids#:~:text=GUTSCHEIN%20EINL%C3%96SEN-,Top%20Auswahl,-%E2%80%B9",
    "Wunschgutschein Tanken": "https://app.wunschgutschein.de/tanken#:~:text=GUTSCHEIN%20EINL%C3%96SEN-,Top%20Auswahl,-%E2%80%B9",
    "Gutscheingold": "https://www.gutscheingold.de/grusskarten/#einloesepartner",
    "Gutscheingold Beauty": "https://www.gutscheingold.de/beauty/#einloesepartner",
    "Gutscheingold Kids": "https://www.gutscheingold.de/kids/#einloesepartner",
    "Gutscheingold Fashion": "https://www.gutscheingold.de/fashion/#einloesepartner",
    "Gutscheingold Home": "https://www.gutscheingold.de/home/#einloesepartner",
    "Gutscheingold Entertainment": "https://www.gutscheingold.de/entertainment/#einloesepartner"
  };

  const luckyDomains = {
    "BSW": "bsw.de",
    "Shoop": "shoop.de",
    "Bestshopping": "bestshopping.com",
    "Shopback": "shopback.de",
    "Budgey": "budgey.de",
    "Zave.it": "zave.it",
    "Unidays": "myunidays.com",
    "DeutschlandCard": "deutschlandcard.de/partner",
    "Studentbeans": "studentbeans.com",
    "Wondercashback": "wondercashback.de",
    "Shopmate": "shopmate.eu",
    "mycashbacks": "mycashbacks.com"
  };

  const directLinksMap = buildNormalizedMap(directLinks);
  const bcLinksMap = buildNormalizedMap(bcLinks);
  const luckyDomainsMap = buildNormalizedMap(luckyDomains);

  function findLinkInMap(map, val) {
    return map.get(normalize(val)) || null;
  }

  function runLinker() {
    if (!isCashbackOptimizerContext()) return;

    if (window.top !== window.self && !document.getElementById('cb-optimizer-iframe-overlay-style')) {
      const overlayStyle = document.createElement('style');
      overlayStyle.id = 'cb-optimizer-iframe-overlay-style';
      overlayStyle.textContent = `
        .general-center, #top-logo { display: none !important; }
        body {
          margin: 0 !important;
          padding: 0 !important;
        }
        .content-wrapper {
          padding-top: 4px !important;
          margin-left: auto !important;
          margin-right: auto !important;
          width: calc(100% - 24px) !important;
          max-width: 580px !important;
          box-sizing: border-box !important;
        }
        .filter {
          margin-top: 4px !important;
          margin-bottom: 6px !important;
          margin-left: auto !important;
          margin-right: auto !important;
        }
        html {
          overflow-y: auto !important;
          scrollbar-width: thin !important;
          scrollbar-color: rgba(193, 162, 98, 0.45) transparent !important;
        }
        ::-webkit-scrollbar { width: 6px !important; height: 6px !important; }
        ::-webkit-scrollbar-track { background: transparent !important; }
        ::-webkit-scrollbar-thumb { background: rgba(193, 162, 98, 0.45) !important; border-radius: 10px !important; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(193, 162, 98, 0.85) !important; }
        ::-webkit-scrollbar-corner { background: transparent !important; }
      `;
      (document.head || document.documentElement).appendChild(overlayStyle);
    }

    if (!isMobileUA()) {
      const filterTerm = new URLSearchParams(window.location.search).get('filter');
      if (filterTerm) {
        const revealPage = () => document.getElementById('cb-optimizer-prehide')?.remove();
        const scrollToFilter = () => {
          const target = Array.from(document.querySelectorAll('.shop-area-header.filter-tag, .voucher-area-header.filter-tag, .item-name'))
            .find(el => (el.textContent || "").toLowerCase().includes(filterTerm.toLowerCase()));
          if (target) {
            const y = target.getBoundingClientRect().top + window.pageYOffset - 12;
            window.scrollTo({ top: y, behavior: 'auto' });
            requestAnimationFrame(revealPage);
            return true;
          }
          return false;
        };

        if (!scrollToFilter()) {
          const scrollObserver = new MutationObserver(() => {
            if (scrollToFilter()) scrollObserver.disconnect();
          });
          scrollObserver.observe(document.documentElement, { childList: true, subtree: true });
          setTimeout(() => {
            scrollObserver.disconnect();
            revealPage();
          }, 2500);
        }
      }
    }

    const getIsVoucherSection = (el) => {
      let prev = el.previousElementSibling;
      while (prev) {
        if (prev.classList.contains('type-area')) {
          return prev.textContent.trim() === "Gutscheine";
        }
        prev = prev.previousElementSibling;
      }
      return false;
    };

    const urlBuilders = {
      "Newsletter": (searchName) => `https://duckduckgo.com/?q=!ducky+${enc(searchName)}+Newsletter`,
      "Corporate Benefits": (searchName) => {
        const domain = CB_PREFIX ? `${CB_PREFIX}.mitarbeiterangebote.de` : "mitarbeiterangebote.de";
        return `https://${domain}/search?s=${enc(searchName)}`;
      },
      "benefits.me": (searchName) => {
        const domain = CB_PREFIX ? `${CB_PREFIX}.benefits.me` : "benefits.me";
        return `https://${domain}/search/${enc(searchName)}`;
      },
      "Shopbuddies": (searchName, isVoucher) =>
        isVoucher
          ? `https://duckduckgo.com/?q=!ducky+${enc(searchName)}+site:shopbuddies.de/giftcards-shop/products`
          : `https://www.shopbuddies.de/cashback/search?query=${enc(searchName)}`,
      "TopCashback": (searchName, isVoucher) =>
        isVoucher
          ? "https://www.topcashback.de/EarnCashback.aspx?mpurl=topcashback-geschenkkarten"
          : `https://duckduckgo.com/?q=!ducky+${enc(searchName)}+site:topcashback.de`,
      "Klarna": (searchName) => `https://www.klarna.com/de/store/?search=${enc(searchName)}`,
      "iGraal": (searchName) => `https://de.igraal.com/search/results?term=${enc(searchName)}`,
      "WEB.Cent": (searchName) => `https://shopping.web.de/webcent?q=${enc(searchName)}`,
      "Opera Cashback": (searchName) => `https://duckduckgo.com/?q=!ducky+${enc(searchName)}+site:cashback.opera.com/de/shops`,
      "Penny Kartenwelt": (searchName) => `https://kartenwelt.penny.de/catalogsearch/result/?q=${enc(searchName)}`,
      "REWE Kartenwelt": (searchName) => `https://kartenwelt.rewe.de/catalogsearch/result/?q=${enc(searchName)}`,
      "Payback": (searchName) => `https://duckduckgo.com/?q=!ducky+${enc(searchName)}+site:payback.de/shop`,
    };

    const buildUrl = (text, searchName, isVoucherSection, isItem) => {
      const lowerText = text.toLowerCase();

      // NEU: Bestchoice ergänzt und Filter-Term für "Gutscheingold Grußkarten" angepasst
      if (isItem && (lowerText.includes("wunschgutschein") || lowerText.includes("gutscheingold") || lowerText.includes("bestchoice"))) {
        let filterTerm = text;
        if (lowerText.includes("gutscheingold") && (lowerText.includes("grußkarten") || lowerText.includes("grusskarten"))) {
          filterTerm = "Gutscheingold";
        }
        return `https://${MAIN_DOMAIN}/?filter=${enc(filterTerm)}`;
      }

      let url = findLinkInMap(bcLinksMap, text) || findLinkInMap(directLinksMap, text);
      if (url) return url;

      if (urlBuilders[text]) return urlBuilders[text](searchName, isVoucherSection);
      if (text.includes("Dealwise")) return `https://www.dealwise.de/results/${enc(searchName)}`;

      const lucky = findLinkInMap(luckyDomainsMap, text);
      if (lucky) return `https://duckduckgo.com/?q=!ducky+${enc(searchName)}+site:${lucky}`;

      if (isVoucherSection) return `https://${MAIN_DOMAIN}/?filter=${enc(text)}`;
      return null;
    };

    const wireClickableHeader = (el, bubbleEl) => {
      if (el.querySelector('a.optimizer-link')) return;
      const content = el.innerHTML;

      el.innerHTML = `<a href="#" class="optimizer-link" style="color:inherit !important; text-decoration:none !important; border-bottom:1px dotted gray !important; cursor:pointer;">${content}</a>`;
      const newLink = el.querySelector('.optimizer-link');

      newLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { bubbleEl.click(); }
        catch {
          const ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
          bubbleEl.dispatchEvent(ev);
        }
      });
    };

    const enrich = () => {
      document.querySelectorAll('.shop-area-header.filter-tag, .voucher-area-header.filter-tag, .item-name')
        .forEach(el => {
          if (el.querySelector('a.optimizer-link')) return;

          const bubble = el.querySelector('.discountBanner');
          if (bubble && (bubble.hasAttribute('onclick') || typeof bubble.onclick === 'function')) {
            wireClickableHeader(el, bubble);
            return;
          }

          const isItem = el.classList.contains('item-name');
          const text = el.textContent.trim();
          const shopArea = el.closest('.shop-area, .voucher-area');
          const rawName = shopArea?.querySelector('.filter-tag')?.textContent.replace(/<.*%/, '').trim() || "";
          const searchName = (rawName === "Netto MD") ? "Netto" : rawName;

          const isVoucherSection = getIsVoucherSection(el);
          const url = buildUrl(text, searchName, isVoucherSection, isItem);

          if (url) {
            const isInternal = url.includes(MAIN_DOMAIN);
            el.innerHTML = `<a href="${url}" target="${isInternal ? '_self' : '_blank'}" rel="noreferrer" class="optimizer-link" referrerpolicy="no-referrer" style="color:inherit !important; text-decoration:none !important; border-bottom:1px dotted gray !important;">${el.innerHTML}</a>`;
          }
        });
    };

    enrich();

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length) { enrich(); break; }
      }
    });

    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  const SHOP_CACHE_VERSION = '2';

  function getShopNames(force = false) {
    const CACHE_KEY = "names";
    const TIME_KEY = "time";
    const VERSION_KEY = "namesVersion";
    const LIFE = 86400000;

    const cached = getStorage(CACHE_KEY);
    const time = Number(getStorage(TIME_KEY) || 0);
    const versionOk = getStorage(VERSION_KEY) === SHOP_CACHE_VERSION;

    if (!force && cached && versionOk && (Date.now() - time < LIFE)) {
      try {
        const names = JSON.parse(cached);
        if (Array.isArray(names) && names.length > 0) return Promise.resolve(names);
      }
      catch (e) {
        setStorage(CACHE_KEY, "");
        setStorage(TIME_KEY, "0");
      }
    }

    return new Promise((resolve) => {
      const url = `https://${MAIN_DOMAIN}/`;
      const handler = (r) => {
        try {
          const html = (typeof r === 'string') ? r : r.responseText;
          const names = Array.from(
            new DOMParser().parseFromString(html, "text/html")
              .querySelectorAll(".shop-area-header.filter-tag")
          ).map(h => h.textContent.trim());

          if (names.length > 0) {
            setStorage(CACHE_KEY, JSON.stringify(names));
            setStorage(TIME_KEY, String(Date.now()));
            setStorage(VERSION_KEY, SHOP_CACHE_VERSION);
          }
          resolve(names);
        } catch (e) {
          resolve([]);
        }
      };

      requestText(url).then(handler).catch(() => resolve([]));
    });
  }

  let shopNamesPromise = null;
  function loadShopNames(force = false) {
    if (!shopNamesPromise || force) {
      shopNamesPromise = getShopNames(force).then((names) => {
        // Leere Ergebnisse nicht merken, damit der nächste Versuch neu laden darf.
        if (!Array.isArray(names) || names.length === 0) shopNamesPromise = null;
        return names;
      });
    }
    return shopNamesPromise;
  }

  // Erster Versuch aus dem Cache, bei Fehltreffer einmal frisch nachladen.
  async function resolveShop(host) {
    const shop = findShopByHost(host, await loadShopNames());
    if (shop) return shop;
    return findShopByHost(host, await loadShopNames(true));
  }

  function runPopup() {
    const host = location.hostname.toLowerCase();

    if (window.top !== window.self || isExcludedPage()) return;

    resolveShop(host).then(shop => {
      if (!shop) return;

      const id = "cb_" + Math.random().toString(36).substring(2, 7);
      const filterUrl = `https://${MAIN_DOMAIN}/?filter=${enc(shop)}`;
      const isMobile = isMobileUA();
      const headerH = "50px";

      const transition = "opacity 0.2s ease, width 0.4s cubic-bezier(0.4, 0, 0.2, 1), height 0.4s cubic-bezier(0.4, 0, 0.2, 1), right 0.4s cubic-bezier(0.4, 0, 0.2, 1), bottom 0.4s cubic-bezier(0.4, 0, 0.2, 1), top 0.4s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
      const desktopInitStyle = `width:260px;height:${headerH};right:20px;bottom:20px;border-radius:14px;`;
      const mobileInitStyle = `width:56px;height:56px;right:20px;bottom:85px;border-radius:50%;`;

      const setCspMode = () => {
        const wrapObj = document.getElementById(id);
        const linkIcon = document.getElementById(`${id}_link_icon`);
        if (wrapObj) wrapObj.setAttribute('csp', '1');
        if (linkIcon) linkIcon.style.display = 'block';
      };

      const onSPV = (e) => {
        if (e.blockedURI && String(e.blockedURI).includes(MAIN_DOMAIN)) setCspMode();
      };
      document.addEventListener("securitypolicyviolation", onSPV);

      const onEsc = (e) => {
        if (e.key === 'Escape') {
          const wrapObj = document.getElementById(id);
          if (wrapObj) wrapObj.remove();
        }
      };
      document.addEventListener('keydown', onEsc);

      const safeShop = escapeHtml(shop);

      // desktop: header and content are separate blocks so iframe prefetch won't affect header layout
      const desktopHtml = `
        <div id="${id}" style="position:fixed !important; z-index:2147483647 !important; opacity:0; pointer-events:none; font-family:-apple-system,BlinkMacSystemFont,sans-serif !important; transition:${transition}; ${desktopInitStyle} background:transparent; display:flex; flex-direction:column; box-sizing:border-box !important; overflow:visible !important;">
          <div id="${id}_headerWrap" style="width:100%; height:${headerH}; flex-shrink:0;">
            <div id="${id}_h" style="width:100%; height:${headerH}; display:flex; align-items:center; box-sizing:border-box !important; padding:0 14px; background:#fffbe7; border:1px solid #e0c200; border-radius:14px; box-shadow:0 10px 30px rgba(0,0,0,0.2); cursor:pointer;">
              <div id="${id}_icowrap" style="width:26px; height:26px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                <img id="${id}_i" src="${ICON_URL}" style="width:26px; height:26px; display:none;">
                <span id="${id}_fallback" style="display:block; width:26px; height:26px; font-weight:900; color:#b1a100; font-size:14px; line-height:26px; text-align:center;">CO</span>
              </div>
              <div id="${id}_t" style="flex:1; height:${headerH}; font-weight:700; color:#b1a100; font-size:15px !important; margin-left:12px; display:flex; visibility:visible; pointer-events:auto; align-items:center; min-width:0; -webkit-font-smoothing:antialiased;">
                <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.2;">${safeShop} Cashback</div>
                <div id="${id}_link_icon" style="display:none; margin-left:5px; font-weight:bold; font-size:16px; flex-shrink:0; line-height:1;">↗</div>
              </div>
              <div id="${id}_x" style="width:32px; height:32px; margin-left:8px; display:flex; visibility:visible; pointer-events:auto; align-items:center; justify-content:center; flex-shrink:0; font-size:28px; line-height:1; color:#b1a100; padding:0 0 3px 0;">×</div>
            </div>
          </div>
          <div id="${id}_contentWrap" style="width:100%; height:0; opacity:0; overflow:hidden; transition:height 0.3s ease, opacity 0.2s ease; margin-top:8px;">
            <div style="width:100%; height:100%; background:#fffbe7; border:1px solid #e0c200; border-radius:14px; box-shadow:0 10px 30px rgba(0,0,0,0.2); overflow:hidden;">
              <iframe id="${id}_f" loading="eager" src="about:blank" data-src="${filterUrl}" style="width:100%; height:100%; border:none; background:transparent;"></iframe>
            </div>
          </div>
        </div>
      `;

      const mobileHtml = `
        <div id="${id}" style="position:fixed !important; z-index:2147483647 !important; opacity:0; pointer-events:none; font-family:-apple-system,BlinkMacSystemFont,sans-serif !important; transition:${transition}; ${mobileInitStyle} background:transparent; display:flex; flex-direction:column; box-sizing:border-box !important; overflow:visible !important;">
          <div id="${id}_mx" style="position:absolute; top:-4px; right:-4px; width:22px; height:22px; background:#e0c200; color:#fff; border-radius:50%; font-size:16px; display:flex; align-items:center; justify-content:center; box-sizing:border-box; z-index:2147483647; border:1.5px solid #fff; font-weight:bold; cursor:pointer; box-shadow:0 2px 5px rgba(0,0,0,0.3); line-height:22px; padding-bottom:2px;">×</div>
          <div id="${id}_clipper" style="width:100%; height:100%; overflow:hidden; border-radius:inherit; background:#fffbe7; border:1px solid #e0c200; box-shadow:0 10px 30px rgba(0,0,0,0.2); display:flex; flex-direction:column; position:relative;">
            <div id="${id}_h" style="display:flex; align-items:center; justify-content:center; height:100%; min-height:56px; padding:0; cursor:pointer; flex-shrink:0; box-sizing:border-box !important; position:relative;">
              <div id="${id}_icowrap" style="width:26px; height:26px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                <img id="${id}_i" src="${ICON_URL}" style="width:26px; height:26px; display:none;">
                <span id="${id}_fallback" style="display:block; width:26px; height:26px; font-weight:900; color:#b1a100; font-size:14px; line-height:26px; text-align:center;">CO</span>
              </div>
              <div id="${id}_t" style="flex:1; height:${headerH}; font-weight:700; color:#b1a100; font-size:15px !important; margin-left:12px; display:none; pointer-events:none; align-items:center; min-width:0; -webkit-font-smoothing:antialiased;">
                <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.2;">${safeShop} Cashback</div>
                <div id="${id}_link_icon" style="display:none; margin-left:5px; font-weight:bold; font-size:16px; flex-shrink:0; line-height:1;">↗</div>
              </div>
              <div id="${id}_x" style="width:32px; height:32px; margin-left:8px; display:none; pointer-events:none; align-items:center; justify-content:center; flex-shrink:0; font-size:28px; line-height:1; color:#b1a100; padding:0 0 3px 0;">×</div>
            </div>
            <iframe id="${id}_f" loading="eager" src="about:blank" data-src="${filterUrl}" style="opacity:0; pointer-events:none; transition:opacity 0.3s ease; width:100%; height:calc(100% - ${headerH}); border:none; background:transparent;"></iframe>
          </div>
        </div>
      `;

      document.documentElement.insertAdjacentHTML('beforeend', isMobile ? mobileHtml : desktopHtml);

      const wrap = document.getElementById(id);
      const head = document.getElementById(`${id}_h`);
      const frame = document.getElementById(`${id}_f`);
      const label = document.getElementById(`${id}_t`);
      const closeX = document.getElementById(`${id}_x`);
      const mobX = document.getElementById(`${id}_mx`);
      const favicon = document.getElementById(`${id}_i`);
      const fallback = document.getElementById(`${id}_fallback`);
      const contentWrap = document.getElementById(`${id}_contentWrap`);

      const cleanup = () => {
        document.removeEventListener("securitypolicyviolation", onSPV);
        document.removeEventListener("keydown", onEsc);
      };

      const removeWrap = () => {
        if (wrap) wrap.remove();
        cleanup();
      };

      const ensureFrameLoaded = () => {
        if (!frame) return;
        const target = frame.dataset?.src;
        if (target && frame.src !== target) frame.src = target;
      };

      const prefetchOnce = (() => {
        let done = false;
        return () => {
          if (done || !POPUP_PREFETCH) return;
          done = true;

          if (isMobile) {
            warmCache(filterUrl);
            return;
          }

          if (DESKTOP_IFRAME_PREFETCH) {
            ensureFrameLoaded();
          } else {
            warmCache(filterUrl);
          }
        };
      })();

      if (SETTINGS.prefetchMode !== 'click') {
        head.addEventListener('mouseenter', prefetchOnce, { passive: true });
        head.addEventListener('touchstart', prefetchOnce, { passive: true });
      }

      const scheduleIdlePrefetch = () => {
        const run = () => {
          if (!document.getElementById(id)) return;
          prefetchOnce();
        };

        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(run, { timeout: POPUP_PREFETCH_IDLE_TIMEOUT_MS });
        } else {
          setTimeout(run, POPUP_PREFETCH_DELAY_MS);
        }
      };

      frame.addEventListener('error', () => setCspMode());

      setTimeout(() => {
        if (wrap) {
          wrap.style.opacity = "1";
          wrap.style.pointerEvents = "auto";
        }
        if (SETTINGS.prefetchMode === 'idle') scheduleIdlePrefetch();
      }, 100);

      favicon.onload = () => { favicon.style.display = 'block'; fallback.style.display = 'none'; };
      favicon.onerror = () => { favicon.style.display = 'none'; fallback.style.display = 'block'; setCspMode(); };
      favicon.src = ICON_URL;

      if (CSP_SITES.some(s => host.includes(s))) setCspMode();

      const minimize = () => {
        if (isMobile) {
          frame.style.opacity = "0";
          frame.style.pointerEvents = "none";
          setTimeout(() => {
            label.style.display = "none";
            label.style.visibility = "hidden";
            label.style.pointerEvents = "none";
            closeX.style.display = "none";
            closeX.style.visibility = "hidden";
            closeX.style.pointerEvents = "none";
            if (mobX) mobX.style.display = "flex";
            head.style.padding = "0";
            head.style.height = "100%";
            wrap.style.cssText = `position:fixed !important; z-index:2147483647 !important; ${mobileInitStyle} background:transparent; opacity:1; overflow:visible !important; transition:${transition};`;
          }, 50);
        } else {
          if (contentWrap) {
            contentWrap.style.opacity = "0";
            contentWrap.style.height = "0";
          }
          wrap.style.width = "260px";
          wrap.style.height = headerH;
        }
      };

      document.addEventListener('mousedown', (e) => {
        const openNow = isMobile ? frame.style.opacity === "1" : (contentWrap && contentWrap.style.height !== "0px" && contentWrap.style.height !== "0");
        if (wrap && !wrap.contains(e.target) && openNow) minimize();
      });

      if (mobX) {
        mobX.onclick = (e) => { e.stopPropagation(); removeWrap(); };
      }

      head.onclick = (e) => {
        if (e.target.id === `${id}_x`) { removeWrap(); return; }

        const isClosed = isMobile
          ? frame.style.opacity === "0"
          : (!contentWrap || contentWrap.style.height === "0px" || contentWrap.style.height === "0" || contentWrap.style.height === "");

        if (wrap.getAttribute('csp') === '1' && isClosed) {
          window.open(filterUrl, '_blank');
          return;
        }

        if (isClosed) {
          ensureFrameLoaded();

          if (isMobile) {
            if (mobX) mobX.style.display = "none";
            head.style.padding = "0 14px";
            head.style.height = headerH;
            wrap.style.cssText += "width:100vw !important; height:calc(100vh - env(safe-area-inset-top, 20px)) !important; top:env(safe-area-inset-top, 20px) !important; bottom:0 !important; right:0 !important; border-radius:0 !important; opacity:1;";
            setTimeout(() => {
              frame.style.opacity = "1";
              frame.style.pointerEvents = "auto";
              label.style.display = "flex";
              label.style.visibility = "visible";
              label.style.pointerEvents = "auto";
              closeX.style.display = "flex";
              closeX.style.visibility = "visible";
              closeX.style.pointerEvents = "auto";
            }, 100);
          } else {
            wrap.style.width = "420px";
            wrap.style.height = "508px";
            if (contentWrap) {
              contentWrap.style.height = "450px";
              contentWrap.style.opacity = "1";
            }
          }
        } else {
          if (e.target.id === `${id}_t` || e.target.closest(`#${id}_t`)) {
            window.open(filterUrl, '_blank');
          } else {
            minimize();
          }
        }
      };
    });
  }

  if (isCashbackOptimizerContext()) {
    if (ENABLE_LINK_ENRICHER) runLinker();
  } else {
    if (SETTINGS.displayMode === 'page') runPopup();
  }
})();
