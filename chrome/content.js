(async function () {
  'use strict';

  if (globalThis.__cashbackOptimizerExtensionLoaded) return;
  globalThis.__cashbackOptimizerExtensionLoaded = true;

  const DEFAULT_EXCLUDED_DOMAINS = [
    'bing.', 'duckduckgo.', 'kleinanzeigen.de',
    'copilot.microsoft.com/', 'mydealz.de', 'pepper.pl',
    'preisvergleich.', 'idealo.', 'brickmerge.de', 'amazon.',
    'netflix.com/watch', 'netflix.com/browse', 'kartenwelt.rewe.de',
    'kartenwelt.penny.de',
    'signin.ebay.', 'my.ebay.', 'cart.ebay.', 'accounts.ebay.', 'checkout.ebay.', 'secure.ebay.'
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

  // PAYBACK-Shop-IDs (lp…) für Shops mit „Payback“-Zeile auf cashback-optimizer.de.
  // Schlüssel: normalisierter Shopname. Regenerieren: node tools/payback-shop-ids.mjs
  const PAYBACK_SHOP_IDS = {
    "otherstories": "lp713076", // & Other Stories → & Other Stories
    "11": "lp731048", // 1&1 → 1&1
    "3pagen": "lp712451", // 3Pagen → 3PAGEN
    "43einhalb": "lp766595", // 43einhalb → 43einhalb
    "aboutyou": "lp620473", // About You → ABOUT YOU
    "acer": "lp631008", // Acer → Acer
    "adidas": "lp573967", // Adidas → adidas
    "adticket": "lp752966", // ADticket → ADticket
    "aeg": "lp721225", // AEG → AEG
    "agoda": "lp717770", // Agoda → Agoda
    "aktionmensch": "lp765893", // Aktion Mensch → Aktion Mensch
    "aktivshop": "lp516459", // Aktivshop → aktivshop
    "aliexpress": "lp634353", // AliExpress → AliExpress
    "all4golf": "lp707471", // All4Golf → all4golf
    "alsahundewelt": "lp571216", // Alsa Hundewelt → alsa-hundewelt
    "amazon": "lp717463", // Amazon → Amazon
    "ambientedirect": "lp712239", // Ambiente Direct → AmbienteDirect
    "ameropa": "lp721699", // Ameropa → Ameropa
    "amorelie": "lp627651", // Amorelie → AMORELIE
    "angelplatzde": "lp627785", // Angelplatz.de → Angelplatz
    "anker": "lp721243", // Anker → Anker
    "ankersolix": "lp753209", // Anker SOLIX → Anker Solix
    "ankerkraut": "lp766642", // Ankerkraut → Ankerkraut
    "aosom": "lp713382", // Aosom → Aosom
    "apodiscounter": "lp721742", // apodiscounter → apodiscounter
    "apollo": "lp18", // Apollo → Apollo-Optik
    "apple": "lp604886", // Apple → Apple
    "aral": "lp181", // Aral → Aral
    "asambeauty": "lp736", // ASAMBEAUTY → Asambeauty
    "asgoodasnew": "lp717774", // Asgoodasnew → asgoodasnew
    "asics": "lp717771", // Asics → ASICS
    "asmc": "lp623656", // ASMC → ASMC
    "asos": "lp518176", // Asos → asos
    "ateliergoldner": "lp616682", // Atelier GOLDNER → GOLDNER
    "autodoc": "lp718492", // AUTODOC → Autodoc
    "avena": "lp632962", // Avena → Avena
    "avocadostore": "lp732974", // Avocadostore → avocadostore
    "bbhotels": "lp713400", // B&B Hotels → B&B HOTELS
    "babista": "lp625955", // BABISTA → Babista
    "babyartikelde": "lp731138", // Babyartikel.de → babyartikel_de
    "babymarkt": "lp495130", // Babymarkt → babymarkt
    "bader": "lp10024026", // Bader → Bader
    "baldurgarten": "lp483546", // Baldur Garten → BALDUR-Garten
    "baerschuhe": "lp709114", // Bär Schuhe → BÄR Schuhe
    "bauknecht": "lp716032", // Bauknecht → Bauknecht
    "baur": "lp562", // Baur → BAUR
    "bergemeer": "lp787", // Berge & Meer → Berge & Meer
    "bergfreunde": "lp608126", // Bergfreunde → Bergfreunde
    "bergzeit": "lp634827", // Bergzeit → bergzeit
    "bershka": "lp730308", // Bershka → BERSHKA
    "bestwestern": "lp309", // Best Western → Best Western Hotels
    "bett1": "lp717927", // Bett1 → bett1
    "bettmer": "lp627429", // BETTMER → Bettmer
    "bettybarclay": "lp533385", // Betty Barclay → Betty Barclay
    "bild": "lp610935", // Bild+ → BILDplus
    "billigermietwagende": "lp721514", // billiger-mietwagen.de → Billiger-Mietwagen
    "bitdefender": "lp534037", // Bitdefender → Bitdefender
    "blaude": "lp718623", // Blau.de → Blau
    "bloomwild": "lp702586", // Bloom & Wild → Bloom&Wild
    "bluetomato": "lp516538", // Blue Tomato → Blue Tomato
    "blume2000": "lp10024023", // Blume2000 → BLUME2000
    "blutsgeschwister": "lp706633", // Blutsgeschwister → Blutsgeschwister
    "boc24": "lp499017", // boc24 → Boc24
    "bodyattack": "lp634221", // Body Attack → Body Attack
    "bogner": "lp622598", // Bogner → Bogner
    "bonprix": "lp615005", // Bonprix → bonprix
    "bose": "lp702823", // Bose → Bose
    "braun": "lp721241", // Braun → Braun
    "brax": "lp623116", // BRAX → Brax
    "bstn": "lp718496", // BSTN → BSTN
    "buecherde": "lp475", // Bücher.de → bücher.de
    "buerostuhl24": "lp516478", // Buerostuhl24 → Buerostuhl24
    "burga": "lp732176", // BURGA → BURGA
    "bueroshop24": "lp483497", // Büroshop24 → Büroshop24
    "buttinette": "lp627382", // Buttinette → buttinette
    "ca": "lp710", // C&A → C&A Online Shop
    "cairo": "lp731284", // Cairo → Cairo
    "calida": "lp625577", // Calida → CALIDA
    "calumet": "lp623704", // Calumet → Calumet Photo Video
    "calvinklein": "lp700823", // Calvin Klein → Calvin Klein
    "calzedonia": "lp730309", // Calzedonia → Calzedonia
    "camperdays": "lp713088", // CamperDays → CamperDays
    "canon": "lp626343", // Canon → Canon
    "carreratoyscom": "lp731451", // carrera-toys.com → Carrera-Toys
    "centerparcs": "lp516560", // Center Parcs → Center Parcs
    "charlestyrwhitt": "lp492809", // Charles Tyrwhitt → Charles Tyrwhitt
    "charlottetilbury": "lp731285", // Charlotte Tilbury → Charlotte Tilbury
    "christ": "lp536404", // Christ → CHRIST
    "clubofwine": "lp718619", // Club of Wine → Club of Wine
    "columbia": "lp716126", // Columbia → Columbia
    "comma": "lp610589", // comma → comma-store
    "computeruniverse": "lp516470", // Computeruniverse → computeruniverse
    "condor": "lp534051", // Condor → Condor
    "congstar": "lp436", // Congstar → congstar
    "connox": "lp495131", // Connox → connox
    "conrad": "lp473360", // Conrad → Conrad
    "consorsbank": "lp750764", // Consorsbank → Consorsbank
    "coolblue": "lp711647", // Coolblue → Coolblue
    "cosmosdirekt": "lp712328", // CosmosDirekt → CosmosDirekt
    "crazyfactory": "lp718708", // Crazy Factory → Crazy Factory
    "crocs": "lp516391", // Crocs → Crocs
    "cupshe": "lp717611", // Cupshe → CUPSHE
    "cyberport": "lp483551", // Cyberport → Cyberport
    "dadirekt": "lp701852", // DA Direkt → DA Direkt
    "dallmayr": "lp473355", // Dallmayr → Dallmayr
    "dazn": "lp634814", // DAZN → DAZN
    "dehner": "lp408", // Dehner → Dehner Online Shop
    "delife": "lp539502", // DELIFE → DELIFE
    "dell": "lp475351", // Dell → Dell Technologies
    "deubaxxl": "lp706024", // DeubaXXL → Deuba XXL
    "diemodernehausfrau": "lp617853", // Die moderne Hausfrau → Die moderne Hausfrau
    "directferries": "lp760187", // Direct Ferries → Direct Ferries
    "disneystore": "lp538809", // Disney Store → Disney store
    "disney": "lp704057", // Disney+ → Disney+
    "disneylandparis": "lp702824", // Disneyland Paris → Disneyland® Paris
    "dm": "lp54", // dm → dm
    "doncarne": "lp721049", // Don Carne → Don Carne
    "douglas": "lp703660", // Douglas → Douglas
    "drmartens": "lp718597", // Dr. Martens → Dr. Martens
    "dreame": "lp754732", // Dreame → DREAME
    "dressforless": "lp483521", // Dress-for-Less → dress-for-less
    "dyson": "lp628499", // Dyson → Dyson
    "ewieeinfach": "lp721058", // E WIE EINFACH → E WIE EINFACH
    "eon": "lp722", // E.ON → E.ON
    "eazy": "lp768855", // eazy → eazy
    "ebay": "lp604887", // Ebay → eBay
    "ebike24com": "lp753210", // ebike-24.com → EBIKE-24
    "edekareisen": "lp763", // Edeka Reisen → EDEKA Reisen
    "edreams": "lp750766", // eDreams → eDreams
    "eisde": "lp634342", // Eis.de → EIS
    "eismann": "lp704273", // Eismann → eismann
    "elvelektronik": "lp492790", // ELV Elektronik → ELV - Das Elektronik-Versandhaus
    "emmamatratze": "lp721961", // Emma Matratze → Emma Matratze
    "emp": "lp10024030", // EMP → EMP
    "enbw": "lp720871", // EnBW → EnBW
    "engelhorn": "lp571214", // Engelhorn → engelhorn
    "ernstingsfamily": "lp496550", // Ernsting's Family → Ernsting's family
    "erwinmueller": "lp495685", // Erwin Müller → Erwin Müller
    "eschuhede": "lp704274", // eschuhe.de → eschuhe
    "esetcybersecurity": "lp767701", // ESET Cybersecurity → ESET
    "esmcomputer": "lp754701", // ESM-Computer → ESM-Computer
    "esn": "lp721435", // ESN → ESN
    "etsy": "lp623600", // Etsy → Etsy
    "euroflorist": "lp486150", // Euroflorist → Euroflorist
    "euromaster": "lp712", // Euromaster → EUROMASTER
    "euronics": "lp605210", // Euronics → EURONICS
    "europcar": "lp747703", // Europcar → Europcar
    "eurowings": "lp717767", // Eurowings → Eurowings
    "eurowingsholidays": "lp713013", // Eurowings Holidays → Eurowings Holidays
    "eventim": "lp10024022", // Eventim → eventim
    "everdrop": "lp713402", // Everdrop → everdrop
    "expedia": "lp604878", // Expedia → Expedia
    "expert": "lp792", // Expert → expert
    "fackelmann": "lp704892", // Fackelmann → Fackelmann
    "fafit24": "lp731230", // FaFit24 → FaFit24
    "fahrradxxl": "lp760450", // Fahrrad XXL → FahrradXXL
    "falke": "lp499009", // Falke → Falke Shop
    "farfetch": "lp717", // Farfetch → FARFETCH
    "fcmoto": "lp699170", // FC-Moto → FC-Moto
    "feelgoodshop": "lp622301", // Feelgood Shop → Feelgood-Shop
    "ferienwohnungende": "lp753016", // ferienwohnungen.de → ferienwohnungen
    "fewodirekt": "lp706026", // Fewo-direkt → FeWo-direkt
    "finn": "lp721962", // FINN → FINN
    "fleurop": "lp501768", // Fleurop → Fleurop
    "flexispot": "lp713380", // FlexiSpot → FlexiSpot
    "flixbusflixtrain": "lp625601", // FlixBus & FlixTrain → FlixBus
    "floraprima": "lp483502", // FloraPrima → Flora Prima
    "fluegede": "lp721343", // Fluege.de → Fluege-de
    "footlocker": "lp713888", // Foot Locker → Foot Locker
    "fressnapf": "lp430", // Fressnapf → Fressnapf
    "gstarraw": "lp604348", // G-Star RAW → G-STAR
    "galaxus": "lp702825", // Galaxus → Galaxus
    "galeria": "lp773", // Galeria → GALERIA
    "gardena": "lp755073", // Gardena → GARDENA
    "gartenfreizeit": "lp712989", // Garten & Freizeit → Garten & Freizeit
    "gesundde": "lp753", // gesund.de → gesund.de
    "getyourguide": "lp703657", // GetYourGuide → GetYourGuide
    "glow25": "lp766681", // Glow25 → glow25
    "goodwheel": "lp706748", // Goodwheel → Goodwheel
    "googlestore": "lp763248", // Google Store → Google Store
    "groupon": "lp624735", // Groupon → Groupon
    "grover": "lp708597", // Grover → Grover
    "gymondo": "lp627650", // Gymondo → GYMONDO
    "gymshark": "lp631023", // Gymshark → Gymshark
    "hm": "lp633944", // H&M → H&M
    "haba": "lp721437", // Haba → HABA
    "hagebau": "lp473362", // Hagebau → hagebau
    "halara": "lp754361", // Halara → Halara
    "hawesko": "lp573914", // Hawesko → Hawesko
    "heine": "lp781", // Heine → heine
    "hellofresh": "lp559835", // HelloFresh → HelloFresh
    "hemdende": "lp611040", // Hemden.de → Hemden.de
    "herrenausstatter": "lp446", // Herrenausstatter → Herrenausstatter
    "hessnatur": "lp535326", // Hess Natur → hessnatur
    "hirmer": "lp539418", // Hirmer → HIRMER
    "hoffmanngermany": "lp755031", // Hoffmann Germany → Hoffmann Germany
    "holidaycheck": "lp706323", // HolidayCheck → HolidayCheck
    "holidu": "lp718711", // Holidu → Holidu
    "holy": "lp765355", // Holy → HOLY
    "hoodde": "lp721945", // Hood.de → Hood
    "hotelde": "lp721328", // Hotel.de → HOTEL DE
    "hotelscom": "lp706025", // Hotels.com → Hotels.com
    "hp": "lp10024025", // HP → HP
    "hrs": "lp708932", // HRS → HRS
    "hse": "lp473367", // HSE → HSE
    "huawei": "lp705555", // Huawei → Huawei
    "hugendubel": "lp721312", // Hugendubel → Hugendubel
    "hunkemoeller": "lp540024", // Hunkemöller → Hunkemöller
    "iherb": "lp754362", // iHerb → iHerb
    "ihghotelsresorts": "lp788", // IHG Hotels & Resorts → IHG Hotels & Resorts
    "impericon": "lp702423", // Impericon → Impericon
    "intersport": "lp627737", // Intersport → INTERSPORT
    "intimissimi": "lp730311", // Intimissimi → Intimissimi
    "jackjones": "lp627786", // Jack & Jones → JACK & JONES
    "jackwolfskin": "lp714144", // Jack Wolfskin → Jack Wolfskin
    "jackery": "lp718481", // Jackery → Jackery
    "jako": "lp704341", // Jako → Jako
    "janvanderstorm": "lp625488", // JAN VANDERSTORM → Jan Vanderstorm
    "jdsports": "lp666124", // JD Sports → JD Sports
    "jeansfritz": "lp618356", // Jeans Fritz → Jeans Fritz
    "jochenschweizer": "lp560", // Jochen Schweizer → Jochen Schweizer
    "joom": "lp721060", // Joom → JOOM
    "jotex": "lp762599", // Jotex → Jotex
    "journaway": "lp733055", // journaway → journaway
    "joyn": "lp516438", // Joyn → Joyn
    "juskys": "lp732931", // Juskys → JUSKYS
    "kaptenson": "lp626487", // Kapten & Son → Kapten & Son
    "kaercher": "lp738532", // Kärcher → Kärcher
    "karllagerfeld": "lp754857", // Karl Lagerfeld → KARL LAGERFELD
    "kfzteile24": "lp701800", // kfzteile24 → kfzteile24
    "kiehls": "lp718127", // Kiehl's → Kiehl's
    "kinguin": "lp718128", // Kinguin → KINGUIN
    "kitchenaid": "lp713012", // KitchenAid → KitchenAid
    "klarmobil": "lp720888", // klarmobil → klarmobil
    "kleineskraftwerk": "lp721392", // Kleines Kraftwerk → Kleines Kraftwerk
    "koffercom": "lp540145", // koffer.com → koffer.com
    "loccitane": "lp572521", // L'Occitane → L'OCCITANE
    "laminatdepot": "lp747453", // LaminatDEPOT → LaminatDEPOT
    "lampenwelt": "lp492804", // Lampenwelt → Lampenwelt
    "landsend": "lp483540", // Lands End → Lands' End
    "lascana": "lp735", // Lascana → LASCANA
    "lastminutede": "lp706321", // lastminute.de → lastminute.de
    "lebara": "lp752986", // Lebara → Lebara
    "lebkuchenschmidt": "lp717997", // Lebkuchen-Schmidt → Lebkuchen Schmidt
    "lego": "lp605212", // Lego → LEGO
    "leifheit": "lp713011", // Leifheit → Leifheit
    "lenovo": "lp555509", // Lenovo → Lenovo
    "lensbest": "lp718520", // Lensbest → Lensbest
    "lenstore": "lp711669", // Lenstore → Lenstore
    "leonardohotels": "lp721678", // Leonardo Hotels → Leonardo Hotels
    "levis": "lp732972", // Levis → Levi's®
    "lgelectronics": "lp721452", // LG Electronics → LG Electronics
    "lichtblick": "lp713069", // LichtBlick → LichtBlick
    "liebeskindberlin": "lp621389", // Liebeskind Berlin → LIEBESKIND Berlin
    "livefresh": "lp721438", // LiveFresh → LiveFresh
    "lloydshoes": "lp633943", // Lloyd Shoes → LLOYD
    "loberon": "lp610398", // Loberon → LOBERON
    "lookfantastic": "lp664443", // Lookfantastic → lookfantastic
    "ltur": "lp713201", // ltur → ltur
    "luckybike": "lp533870", // Lucky Bike → Lucky Bike
    "ludwigvonkapff": "lp718620", // Ludwig von Kapff → Ludwig von Kapff
    "lufthansa": "lp616686", // Lufthansa → Lufthansa AG
    "lululemon": "lp718618", // Lululemon → lululemon
    "lusini": "lp754372", // LUSINI → LUSINI
    "mactrade": "lp610399", // MacTrade → MacTrade
    "mango": "lp536712", // Mango → MANGO
    "manomano": "lp705794", // ManoMano → ManoMano
    "marcopolo": "lp608866", // Marc O Polo → Marc O'Polo
    "marktkauf": "lp758", // Marktkauf → MARKTKAUF Online-Shop
    "marktkaufreisen": "lp764", // Marktkauf Reisen → MARKTKAUF-Reisen
    "marriottbonvoyhotels": "lp720876", // Marriott Bonvoy Hotels → Marriott Bonvoy
    "matratzenconcord": "lp763862", // Matratzen Concord → Matratzen Concord
    "mediamarkt": "lp628164", // Media Markt → MediaMarkt Online
    "mediamarkttarifwelt": "lp718021", // MediaMarkt Tarifwelt → MediaMarktSaturn Tarifwelt
    "medimops": "lp539843", // Medimops → Medimops
    "medion": "lp499603", // Medion → MEDION
    "megabad": "lp754858", // Megabad → MEGABAD
    "mepal": "lp752985", // Mepal → Mepal
    "mey": "lp610408", // mey → mey
    "michaelkors": "lp721395", // Michael Kors → Michael Kors
    "miles": "lp767", // MILES → MILES
    "modivo": "lp718516", // Modivo → Modivo
    "moemax": "lp666097", // mömax → mömax
    "momoxfashion": "lp721522", // momox fashion → momox fashion
    "motointegrator": "lp718714", // Motointegrator → Motointegrator
    "moeve": "lp721183", // MÖVE → Möve
    "muji": "lp616273", // MUJI → MUJI
    "mydays": "lp104", // mydays → mydays Online Shop
    "mymuesli": "lp718412", // myMuesli → mymuesli
    "myprotein": "lp615006", // Myprotein → Myprotein
    "nespresso": "lp713070", // Nespresso → Nespresso
    "netto": "lp756", // Netto MD → Netto Online-Shop
    "nettoreisen": "lp757", // Netto Reisen → Netto-Reisen
    "newbalance": "lp700369", // New Balance → New Balance
    "next": "lp753783", // NEXT → NEXT
    "nichebeauty": "lp712815", // Niche Beauty → Niche Beauty
    "nike": "lp625932", // Nike → Nike
    "nkd": "lp536361", // NKD → NKD
    "nordvpn": "lp702703", // NordVPN → NordVPN
    "notebooksbilliger": "lp499578", // Notebooksbilliger → notebooksbilliger
    "notino": "lp707645", // Notino → Notino
    "o2": "lp721723", // O2 → o2
    "obi": "lp754375", // Obi → OBI
    "octopusenergy": "lp778", // Octopus Energy → Octopus Energy
    "odlo": "lp618322", // Odlo → Odlo
    "officediscount": "lp623117", // Office Discount → office discount
    "officepartner": "lp627045", // Office Partner → Office-Partner
    "olight": "lp718522", // Olight → Olight
    "olymp": "lp483513", // Olymp → OLYMP
    "only": "lp698962", // Only → ONLY
    "opodo": "lp750765", // Opodo → Opodo
    "otto": "lp516490", // Otto → Otto
    "ottooffice": "lp516451", // Otto Office → OTTO Office
    "outletcity": "lp571213", // Outletcity → OUTLETCITY
    "parfumdreams": "lp499568", // Parfumdreams → Parfumdreams
    "parship": "lp731254", // Parship → Parship
    "paulmann": "lp625295", // Paulmann → Paulmann Licht
    "peterhahn": "lp604346", // Peter Hahn → Peter Hahn
    "petsdeli": "lp731436", // Pets Deli → Pets Deli
    "pflanzenkoelle": "lp721804", // Pflanzen-Kölle → Pflanzen-Kölle
    "philipshue": "lp721346", // Philips Hue → Philips hue
    "poco": "lp718339", // Poco → POCO
    "pollinelectronic": "lp634222", // Pollin Electronic → Pollin Electronic
    "printus": "lp623194", // Printus → Printus
    "prophete": "lp731232", // Prophete → Prophete
    "proshop": "lp718226", // Proshop → Proshop
    "puma": "lp502181", // Puma → Puma
    "purish": "lp762131", // Purish → PURISH
    "qatarairways": "lp753567", // Qatar Airways → Qatar Airways
    "quelle": "lp574461", // Quelle → QUELLE
    "quirion": "lp718230", // Quirion → Quirion
    "rabotenergy": "lp752969", // Rabot Energy → Rabot Energy
    "radissonhotels": "lp753246", // Radisson Hotels → Radisson Hotels
    "radweltshop": "lp709273", // RADWELT Shop → RADWELT-Shop
    "ralphlauren": "lp618774", // Ralph Lauren → Ralph Lauren
    "ravensburger": "lp492805", // Ravensburger → Ravensburger
    "readly": "lp718415", // Readly → Readly
    "rebuy": "lp534041", // reBuy → rebuy
    "reicheltelektronik": "lp536749", // Reichelt Elektronik → reichelt elektronik
    "reisenaktuell": "lp762132", // Reisen Aktuell → ReisenAKTUELL
    "reservix": "lp750762", // Reservix → reservix
    "roadsurfer": "lp731425", // Roadsurfer → roadsurfer
    "roastmarket": "lp706491", // Roastmarket → roastmarket
    "rtl": "lp706527", // RTL+ → RTL+
    "soliver": "lp478395", // s.Oliver → s.Oliver
    "samsung": "lp706812", // Samsung → Samsung
    "saturn": "lp574478", // Saturn → SATURN Online
    "saturntarifwelt": "lp718021", // Saturn Tarifwelt → MediaMarktSaturn Tarifwelt
    "schaefershop": "lp485623", // Schäfer Shop → Schäfer Shop
    "scheppachshop": "lp754363", // Scheppach Shop → Scheppach
    "schiesser": "lp539447", // Schiesser → Schiesser
    "schleich": "lp705049", // schleich → Schleich
    "schuhede": "lp765380", // schuhe.de → schuhe.de
    "schulranzenonlineshopde": "lp534173", // schulranzen-onlineshop.de → Schulranzen-Onlineshop
    "secretescapes": "lp718380", // Secret Escapes → Secret Escapes
    "seidensticker": "lp518269", // Seidensticker → seidensticker
    "selected": "lp765841", // Selected → Selected
    "sephora": "lp704343", // Sephora → Sephora
    "sharkninja": "lp718413", // SharkNinja → SharkNinja
    "sheego": "lp492795", // Sheego → Sheego
    "shein": "lp706477", // SHEIN → SHEIN
    "shop4runners": "lp703658", // Shop4Runners → Shop4runners
    "silkesweinkeller": "lp702391", // Silkes Weinkeller → Silkes Weinkeller
    "simde": "lp754986", // sim.de → sim. de
    "sixt": "lp365", // Sixt → SIXT Online Shop
    "skechers": "lp732178", // Skechers → SKECHERS
    "sky": "lp703", // Sky → Sky
    "smartsteuer": "lp707262", // Smartsteuer → smartsteuer
    "sonnenklartv": "lp708598", // sonnenklar.tv → sonnenklar.tv
    "sonos": "lp701630", // Sonos → SONOS
    "sony": "lp720887", // Sony → Sony
    "sportscheck": "lp573949", // Sport Scheck → SportScheck
    "sportsdirect": "lp765783", // Sports Direct → Sports Direct
    "spreadshirt": "lp499569", // Spreadshirt → Spreadshirt
    "stanley1913": "lp762311", // Stanley 1913 → Stanley 1913
    "stihl": "lp764686", // STIHL → STIHL
    "stylevana": "lp752218", // Stylevana → Stylevana
    "superdry": "lp536296", // Superdry → Superdry
    "surfsharkvpn": "lp712629", // Surfshark VPN → Surfshark
    "swarovski": "lp538140", // Swarovski → Swarovski
    "tado": "lp665264", // tado → Tado
    "takko": "lp625831", // Takko → Takko
    "tamaris": "lp712630", // Tamaris → Tamaris
    "tassimo": "lp667085", // Tassimo → Tassimo
    "tchibo": "lp473364", // Tchibo → Tchibo
    "tefal": "lp718594", // Tefal → Tefal
    "telekom": "lp733", // Telekom → Telekom
    "tempur": "lp717613", // Tempur → TEMPUR
    "temu": "lp721453", // Temu → Temu
    "tennispoint": "lp605215", // Tennis-Point → Tennis-Point
    "teppichde": "lp768840", // teppich.de → teppich.de
    "terracanis": "lp539897", // Terra Canis → Terra Canis
    "tezenis": "lp730312", // Tezenis → Tezenis
    "thalia": "lp423", // Thalia → Thalia
    "thenorthface": "lp702903", // The North Face → The North Face
    "ticketmaster": "lp708939", // Ticketmaster → Ticketmaster
    "timberland": "lp703982", // Timberland → Timberland
    "tink": "lp703983", // Tink → tink
    "tirendode": "lp565997", // Tirendo.de → Tirendo
    "tischwelt": "lp718228", // Tischwelt → Tischwelt
    "tkmaxx": "lp721290", // TK Maxx → TK Maxx
    "tomtailor": "lp573960", // Tom Tailor → Tom Tailor
    "tommyhilfiger": "lp483542", // Tommy Hilfiger → Tommy Hilfiger
    "tourlane": "lp721289", // Tourlane → Tourlane
    "treatwell": "lp721068", // Treatwell → treatwell
    "tripcom": "lp731437", // Trip.com → Trip.com
    "triumph": "lp536744", // Triumph → Triumph
    "trotec": "lp747532", // Trotec → Trotec
    "tui": "lp712423", // TUI → TUI
    "ugg": "lp620474", // UGG → UGG
    "ullapopken": "lp574917", // Ulla Popken → Ulla Popken
    "underarmour": "lp627022", // Under Armour → Under Armour
    "urbanoutfitters": "lp540143", // Urban Outfitters → Urban Outfitters
    "urlaubsguru": "lp738480", // Urlaubsguru → urlaubsguru
    "valmano": "lp618299", // valmano → VALMANO
    "vangraaf": "lp615008", // VAN GRAAF → VAN GRAAF
    "vans": "lp700909", // Vans → Vans
    "veromoda": "lp699120", // Vero Moda → VERO MODA
    "vertbaudet": "lp706634", // Vertbaudet → Vertbaudet
    "vidaxl": "lp733057", // vidaXL → VidaXL
    "viking": "lp483534", // Viking → Viking
    "vinos": "lp714028", // Vinos → Wein & Vinos
    "vistaprint": "lp475225", // VistaPrint → Vistaprint
    "vitaminexpress": "lp708074", // VitaminExpress → Vitaminexpress
    "vodafone": "lp718019", // Vodafone → Vodafone
    "voelkner": "lp537568", // Voelkner → voelkner
    "voghion": "lp731427", // Voghion → Voghion
    "waiputv": "lp721984", // Waipu.tv → waipu.tv
    "walbusch": "lp534715", // Walbusch → Walbusch
    "walzvital": "lp623055", // walzvital → walzvital
    "wegde": "lp706322", // Weg.de → weg.de
    "weinfreunde": "lp624791", // Weinfreunde → Weinfreunde
    "weloveholidays": "lp721348", // weloveholidays → weloveholidays
    "werkzeugstore24": "lp753782", // Werkzeugstore24 → Werkzeugstore24
    "westerndigitalwd": "lp709118", // Western Digital (WD) → Western Digital
    "westwing": "lp717413", // Westwing → Westwing
    "winsim": "lp754987", // winSIM → winSIM
    "wittweiden": "lp749", // Witt Weiden → Witt
    "wolt": "lp717856", // Wolt → Wolt
    "worldofsweets": "lp518349", // World of Sweets → World of Sweets
    "wow": "lp496548", // WOW → WOW
    "xiaomi": "lp721069", // Xiaomi → Xiaomi
    "xxxlutz": "lp617210", // XXXLutz → XXXLutz
    "yello": "lp742", // yello → YELLO
    "yfood": "lp712253", // yfood → yfood
    "yvesrocher": "lp473356", // Yves Rocher → Yves Rocher
    "zalandolounge": "lp627511", // Zalando Lounge → Lounge by Zalando
    "zero": "lp707622", // Zero → zero
    "zooplus": "lp731139", // Zooplus → zooplus
    "zurbrueggen": "lp718621", // Zurbrüggen → Zurbrüggen
    "zwilling": "lp766307", // Zwilling → ZWILLING
  };

  const SHOP_MCC = {
    "adidas": { mcc: "5655", channel: "Online", category: "Sportbekleidungsgeschäfte" },
    "agoda": { mcc: "4722", channel: "Online", category: "" },
    "aldi": { mcc: "5411", channel: "Offline", category: "Supermärkte / Discounter" },
    "aliexpress": { mcc: "5999", channel: "Online", category: "Online-Marktplatz" },
    "alternate": { mcc: "5045", channel: "Online", category: "Computer und Elektronik" },
    "alza": { mcc: "5311", channel: "Online", category: "Kaufhäuser / Elektronikversand" },
    "amazon": { mcc: "5399", channel: "Online", category: "Versandhandel / Gemischtwaren" },
    "apple": { mcc: "5818", channel: "Online", category: "Digitale Medien & Software" },
    "aral": { mcc: "5541", channel: "Offline", category: "Tankstelle" },
    "babywalz": { mcc: "5641", channel: "Online", category: "Bekleidung für Kinder und Babys" },
    "bahn": { mcc: "4111", channel: "Online", category: "Nahverkehr / Bahn" },
    "bauhaus": { mcc: "5211", channel: "Online", category: "Baumarkt & Heimwerkerbedarf" },
    "dm": { mcc: "5912", channel: "Offline", category: "Drogeriemärkte" },
    "docmorris": { mcc: "5912", channel: "Online", category: "Apotheke" },
    "ebay": { mcc: "5311", channel: "Online", category: "Kaufhäuser / Marktplatz" },
    "edeka": { mcc: "5411", channel: "Offline", category: "Supermärkte / Lebensmittelgeschäfte" },
    "edreams": { mcc: "4722", channel: "Online", category: "Reiseportal / Reisebüro" },
    "eneba": { mcc: "5816", channel: "Online", category: "Games / Digitale Güter" },
    "esso": { mcc: "5541", channel: "Offline", category: "Tankstelle" },
    "expert": { mcc: "5946", channel: "Online", category: "Foto- und Kameraausrüstung" },
    "fleurop": { mcc: "5992", channel: "Online", category: "Blumenläden" },
    "galaxus": { mcc: "5732", channel: "Online", category: "Elektronik / Online-Warenhaus" },
    "galeria": { mcc: "5311", channel: "Offline", category: "Kaufhäuser" },
    "groupon": { mcc: "7278", channel: "Online", category: "Einkaufsclubs & Gutscheine" },
    "hansimglueck": { mcc: "5812", channel: "Offline", category: "Restaurants" },
    "hellweg": { mcc: "5211", channel: "Offline", category: "Baumarkt" },
    "ikea": { mcc: "5712", channel: "Offline", category: "Möbel- und Einrichtungshäuser" },
    "jollyroom": { mcc: "5641", channel: "Online", category: "Kinder- und Babybedarf" },
    "joybuy": { mcc: "5311", channel: "Online", category: "Elektronik / Gemischtwaren" },
    "jysk": { mcc: "5712", channel: "Offline", category: "Möbel- und Einrichtungshäuser" },
    "kaufland": { mcc: "5411", channel: "Offline", category: "Supermärkte / Lebensmittelgeschäfte" },
    "kinguin": { mcc: "5816", channel: "Online", category: "Games / Digitale Güter" },
    "koro": { mcc: "5499", channel: "Online", category: "Spezialitätenlebensmittelhändler" },
    "lego": { mcc: "5945", channel: "Online", category: "Spielwaren & Einzelhandel" },
    "lidl": { mcc: "5411", channel: "Offline", category: "Supermärkte / Discounter" },
    "lieferando": { mcc: "5814", channel: "Online", category: "Schnellrestaurant / Lieferdienst" },
    "marktkauf": { mcc: "5411", channel: "Offline", category: "Lebensmittel / Supermarkt" },
    "mediamarkt": { mcc: "5732", channel: "Online", category: "Elektronikfachgeschäfte" },
    "mueller": { mcc: "5912", channel: "Offline", category: "Drogeriemärkte" },
    "netflix": { mcc: "4899", channel: "Online", category: "Digitale Medien / Streaming" },
    "nettomd": { mcc: "5399", channel: "Online", category: "Gemischtwarenversandhandel" },
    "obi": { mcc: "5251", channel: "Offline", category: "Baumarkt" },
    "opodo": { mcc: "4722", channel: "Online", category: "Reiseportal / Reisebüro" },
    "penny": { mcc: "5411", channel: "Offline", category: "Supermärkte / Discounter" },
    "reservix": { mcc: "7922", channel: "Online", category: "Ticket- und Konzertvermittlung" },
    "rewe": { mcc: "5411", channel: "Offline", category: "Supermärkte / Lebensmittelgeschäfte" },
    "rofu": { mcc: "5945", channel: "Online", category: "Spielwarengeschäfte" },
    "rossmann": { mcc: "5912", channel: "Offline", category: "Drogeriemärkte" },
    "ryd": { mcc: "5541", channel: "Online", category: "Tankstelle" },
    "saturn": { mcc: "5732", channel: "Online", category: "Elektronikfachgeschäfte" },
    "sharkninja": { mcc: "5311", channel: "Online", category: "Haushaltsgeräte & Kaufhäuser" },
    "shein": { mcc: "5999", channel: "Online", category: "Sonstiger Einzelhandel" },
    "shell": { mcc: "5541", channel: "Offline", category: "Tankstelle" },
    "smythstoys": { mcc: "5399", channel: "Online / Offline", category: "Spielwaren & Gemischtwaren" },
    "tchibo": { mcc: "5999", channel: "Offline", category: "Sonstiger Einzelhandel" },
    "temu": { mcc: "5311", channel: "Online", category: "Kaufhäuser / Online-Marktplatz" },
    "thalia": { mcc: "5999", channel: "Online", category: "Buchhandlungen / Einzelhandel" },
    "thomasphilipps": { mcc: "5311", channel: "Offline", category: "Kaufhäuser / Restpostenmärkte" },
    "toom": { mcc: "5200", channel: "Offline", category: "Baumarkt" },
    "totalenergies": { mcc: "5541", channel: "Offline", category: "Tankstelle" },
    "toysino": { mcc: "5945", channel: "Online", category: "Spielwarengeschäfte / Spielwaren" },
    "tripcom": { mcc: "4722", channel: "Online", category: "Reiseportal / Reisebüro" },
    "voelkner": { mcc: "5732", channel: "Online", category: "Elektronikfachgeschäfte" },
    "wow": { mcc: "4899", channel: "Online", category: "Pay-TV & Streaming-Dienste" },
    "zalando": { mcc: "5621", channel: "Online", category: "Damen- und Herrenbekleidungsgeschäfte" },
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
      "Payback": (searchName) => {
        const id = PAYBACK_SHOP_IDS[normalize(searchName)];
        return id
          ? `https://www.payback.de/shop/${id}`
          : `https://duckduckgo.com/?q=!ducky+${enc(searchName)}+site:payback.de/shop`;
      },
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

    const HEADER_SELECTOR = '.shop-area-header.filter-tag, .voucher-area-header.filter-tag, .item-name';
    const LINK_SELECTOR = 'a.optimizer-link';
    const shopNameOf = (el) => {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('.cb-mcc').forEach((node) => node.remove());
      return (clone.textContent || '').replace(/<.*%/, '').trim();
    };

    const addMccHint = (el, shopName) => {
      if (el.querySelector('.cb-mcc')) return;
      const info = SHOP_MCC[normalize(shopName)];
      if (!info) return;
      const span = document.createElement('span');
      span.className = 'cb-mcc';
      span.textContent = `MCC ${info.mcc}`;
      span.title = [info.mcc, info.channel, info.category].filter(Boolean).join(' · ');
      span.style.cssText = 'margin-left:6px;font-size:11px;font-weight:400;color:#8a8a8a;white-space:nowrap;';
      el.appendChild(span);
    };

    const enrich = (headers) => {
      headers.forEach(el => {
        if (el.classList.contains('shop-area-header')) {
          addMccHint(el, shopNameOf(el));
        }
        if (el.querySelector('a.optimizer-link')) return;

        const bubble = el.querySelector('.discountBanner');
        if (bubble && (bubble.hasAttribute('onclick') || typeof bubble.onclick === 'function')) {
          wireClickableHeader(el, bubble);
          return;
        }

        const isItem = el.classList.contains('item-name');
        const text = el.textContent.trim();
        const shopArea = el.closest('.shop-area, .voucher-area');
        const headerEl = shopArea?.querySelector('.filter-tag');
        const rawName = headerEl ? shopNameOf(headerEl) : "";
        const searchName = (rawName === "Netto MD") ? "Netto" : rawName;

        const isVoucherSection = getIsVoucherSection(el);
        const url = buildUrl(text, searchName, isVoucherSection, isItem);

        if (url) {
          const isInternal = url.includes(MAIN_DOMAIN);
          el.innerHTML = `<a href="${url}" target="${isInternal ? '_self' : '_blank'}" rel="noreferrer" class="optimizer-link" referrerpolicy="no-referrer" style="color:inherit !important; text-decoration:none !important; border-bottom:1px dotted gray !important;">${el.innerHTML}</a>`;
        }
      });
    };

    // Nur betroffene Überschriften sammeln; eigene Link-Mutationen überspringen.
    const pendingHeaders = new Set();
    let framePending = false;
    const queueHeader = (el) => {
      if (el && !el.querySelector(LINK_SELECTOR)) pendingHeaders.add(el);
    };
    const collectHeaders = (root) => {
      if (root.nodeType !== 1) return;
      if (root.matches(HEADER_SELECTOR)) queueHeader(root);
      root.querySelectorAll(HEADER_SELECTOR).forEach(queueHeader);
    };
    const flushHeaders = () => {
      framePending = false;
      const batch = [];
      for (const el of pendingHeaders) {
        pendingHeaders.delete(el);
        if (el.isConnected) batch.push(el);
        if (batch.length === 50) break;
      }
      enrich(batch);
      scheduleHeaders();
    };
    const scheduleHeaders = () => {
      if (!framePending && pendingHeaders.size) {
        framePending = true;
        requestAnimationFrame(flushHeaders);
      }
    };
    collectHeaders(document.body || document.documentElement);
    scheduleHeaders();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target.nodeType === 1
          ? mutation.target : mutation.target.parentElement;
        const header = target?.closest(HEADER_SELECTOR);
        if (header) {
          queueHeader(header);
        } else {
          mutation.addedNodes.forEach(collectHeaders);
        }
      }
      scheduleHeaders();
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
