// ==UserScript==
// @name         Cashback-Optimizer Suite (v4.55 - TLD Recognition & DDG Ducky)
// @namespace    http://tampermonkey.net/
// @version      4.55
// @description  TLD Recognition, DuckDuckGo Ducky Links, Dark Mode Support, iOS Stable, Full Link Support
// @author       ruler
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// @allFrames    true
// ==/UserScript==

(function() {
    'use strict';

    // -------------------------
    // STORAGE HELPER (Safari Fix)
    // -------------------------
    function setStorage(k,v){ try{GM_setValue(k,v)}catch(e){localStorage.setItem(k,v)} }
    function getStorage(k){ try{return GM_getValue(k)}catch(e){return localStorage.getItem(k)} }

    const CB_PREFIX = "l-bank";
    const MAIN_DOMAIN = "cashback-optimizer.de";
    const ICON_URL = `https://${MAIN_DOMAIN}/favicons/favicon.svg`;

    // -------------------------
    // 1. VOLLSTÄNDIGE LINK-KONFIGURATION
    // -------------------------
    const directLinks = {
        "Sovendus": `https://${MAIN_DOMAIN}/sovendus/`,
        "Allianz Vorteilswelt": "https://vorteile.allianz.de/einkaufsvorteile",
        "AmEx Offers": "https://m.amex/amexofferslp2024",
        "Cadooz (AmEx)": "https://m.amex/amexofferslp2024",
        "Vip District / MIVO": "https://mitarbeitervorteile.de/",
        "Miles & More": "https://www.miles-and-more.com/de/de/earn/shopping/shopping-platform.html?l=de",
        "Corporate Benefits": CB_PREFIX ? `https://${CB_PREFIX}.mitarbeiterangebote.de/` : "https://mitarbeiterangebote.de/",
        "benefitforme": CB_PREFIX ? `https://${CB_PREFIX}.benefits.me/` : "https://benefits.me/",
        "BestChoice BenefitBuddy": "https://www.benefitbuddy.de/",
        "Benefit Buddy": "https://www.benefitbuddy.de/",
        "Cadooz (MyDealz)": "https://www.mydealz.de/deals/mydealz-cadooz-vorteilswelt-jetzt-fur-alle-zb-bestchoice-classic-50eur-5eur-i-adidas-12-cyberport-4-eterna-15-lieferando-5-etc-2353520",
        "Cadooz (Sparwelt)": "https://www.sparwelt.de/themenwelten/sparwelt-vorteilswelt",
        "Payback Prämienshop": "https://www.payback.de/praemien/kategorie/gutscheine",
        "O2 Priority": "https://www.o2online.de/priority/vorteile/priority-vorteilswelt",
        "Netto Kartenwelt": "https://www.netto-online.de/geschenk-gutscheinkarten/",
        "Marktkauf Kartenwelt": "https://www.marktkauf.de/geschenk-gutscheinkarten/kat-M0740",
        "Hanseatic Vorteilswelt": "https://meine.hanseaticbank.de/?redirect=voucherPortal",
        "MeinMagenta": "https://www.telekom.de/magenta-moments",
        "Samsung Members": "https://www.samsung.com/de/apps/samsung-members/"
    };

    const bcLinks = {
        "BestChoice Classic": "https://bestchoice-ace-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&locale=default&sortBy=alpha&ptg=vou",
        "BestChoice Premium": "https://premium-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&locale=default&sortBy=alpha&ptg=vou",
        "BestChoice Aktion": "https://bc-aktion-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&locale=default&sortBy=alpha&ptg=vou",
        "BestChoice Plus": "https://plus-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&locale=default&sortBy=alpha&ptg=vou",
        "BestChoice Birthday & Party": "https://birthday-party-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
        "BestChoice Style & Beauty": "https://style-beauty-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
        "BestChoice Fit & Healthy": "https://fit-healthy-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
        "BestChoice Drive & Ride": "https://drive-ride-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
        "BestChoice DIY & Garden": "https://diy-garden-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
        "BestChoice Food & Drinks": "https://food-drinks-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
        "BestChoice Home & Living": "https://home-living-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
        "BestChoice Home & Office": "https://home-office-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
        "BestChoice Kids & Play": "https://kids-play-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
        "BestChoice Sport & Hobby": "https://sport-hobby-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
        "BestChoice Streaming & Entertainment": "https://streaming-entertainment-catalog.cadooz.com",
        "BestChoice Tech & Media": "https://tech-media-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
        "BestChoice Travel & Adventure": "https://travel-adventure-catalog.cadooz.com/frontend/cat/view.do?view=custom_view&lt=default&sortBy=alpha&ptg=vou",
        "BestChoice Charity & Giving": "https://charity-giving-catalog.cadooz.com",
        "BestChoice Europe": "https://europe-catalog.cadooz.com",
        "BestChoice Europe Premium": "https://europe-premium-catalog.cadooz.com",
        "Wunschgutschein": "https://www.wunschgutschein.de/pages/beliebtesten-einloesepartner",
        "Wunschgutschein Beauty": "https://app.wunschgutschein.de/beauty",
        "Wunschgutschein Home & Living": "https://app.wunschgutschein.de/homeandliving",
        "Wunschgutschein Fashion": "https://app.wunschgutschein.de/fashion",
        "Wunschgutschein Shopping": "https://app.wunschgutschein.de/shopping",
        "Wunschgutschein Sport": "https://app.wunschgutschein.de/sport",
        "Wunschgutschein Mobilität": "https://app.wunschgutschein.de/mobility",
        "Wunschgutschein Tanken": "https://app.wunschgutschein.de/mobility",
        "Wunschgutschein Kids & Fun": "https://app.wunschgutschein.de/kidsandfun",
        "Gutscheingold": "https://www.gutscheingold.de/grusskarten/#einloesepartner",
        "Gutscheingold Beauty": "https://www.gutscheingold.de/beauty/#einloesepartner",
        "Gutscheingold Kids": "https://www.gutscheingold.de/kids/#einloesepartner",
        "Gutscheingold Fashion": "https://www.gutscheingold.de/fashion/#einloesepartner",
        "Gutscheingold Home": "https://www.gutscheingold.de/home/#einloesepartner",
        "Gutscheingold Entertainment": "https://www.gutscheingold.de/entertainment/#einloesepartner"
    };

    const duckyDomains = {
        "Shoop": "shoop.de", "Bestshopping": "bestshopping.com",
        "mycashbacks": "mycashbacks.com", "Wondercashback": "wondercashback.de", "Shopback": "shopback.de",
        "Shopmate": "shopmate.eu", "Budgey": "budgey.de", "Zave.it": "zave.it", "Unidays": "myunidays.com",
        "Studentbeans": "studentbeans.com", "DeutschlandCard": "deutschlandcard.de/partner", "BSW": "bsw.de",
        "Geschenkkartenwelt.de": "geschenkkartenwelt.de"
    };

    // -------------------------
    // 2. LINK ENRICHER
    // -------------------------
    function runLinker() {
        const style = document.createElement('style');
        style.textContent = `
            ${window.top !== window.self
                ? `.general-center, #top-logo, #tagBar, #impressumToggle { display: none !important; } .content-wrapper { padding-top: 5px !important; } .filter { margin-top: 0 !important; margin-bottom: 5px !important; }`
                : `#top-logo { padding-top: 12px !important; padding-bottom: 0 !important; }`}
            @media (prefers-color-scheme: dark) {
                body {
                    --voucherColor: #1a2433 !important;
                    --shopColor: #1a2433 !important;
                    --voucherFontColor: #e8eaed !important;
                    --shopFontColor: #e8eaed !important;
                    --fontColor: #e8eaed !important;
                    --linkColor: #8ab4f8 !important;
                    --linkColorVisited: #c1a262 !important;
                    --generalLinkColor: #e8eaed !important;
                    --generalLinkColorVisited: #aaa !important;
                }
                input#textFilter {
                    background-color: #1a2433 !important;
                    color: #fff !important;
                    border-color: #4a5d78 !important;
                }
            }
        `;
        document.head.appendChild(style);

        const linkStyle = "color:inherit; text-decoration:none; border-bottom: 1px dotted gray;";

        function enrich() {
            document.querySelectorAll('.shop-area-header.filter-tag, .voucher-area-header.filter-tag, .item-name').forEach(el => {
                if (el.querySelector('a')) return;
                const text = el.textContent.trim();
                const shopArea = el.closest('.shop-area, .voucher-area');
                const rawShopName = shopArea?.querySelector('.shop-area-header.filter-tag, .voucher-area-header.filter-tag')?.textContent.replace(/<.*%/, '').trim() || "";
                const searchName = (rawShopName === "Netto MD") ? "Netto" : rawShopName;
                const cleanPart = searchName.toLowerCase().replace(/[^a-z0-9]/g, '');

                let url = bcLinks[text] || directLinks[text];

                if (!url) {
                    if (text === "Penny Kartenwelt") url = `https://kartenwelt.penny.de/catalogsearch/result/?q=${encodeURIComponent(searchName)}`;
                    else if (text === "REWE Kartenwelt") url = `https://kartenwelt.rewe.de/catalogsearch/result/?q=${encodeURIComponent(searchName)}`;
                    else if (text === "Payback") url = `https://duckduckgo.com/?q=!ducky+${encodeURIComponent(searchName)}+site:payback.de/shop`;
                    else if (text === "iGraal") url = `https://de.igraal.com/search/results?term=${encodeURIComponent(searchName)}`;
                    else if (text === "Opera Cashback") url = `https://duckduckgo.com/?q=!ducky+${encodeURIComponent(searchName)}+site:cashback.opera.com/de/shops`;
                    else if (text === "WEB.Cent") url = `https://shopping.web.de/webcent?q=${encodeURIComponent(searchName)}&comp=web_start_sf#.cbk.nav.suche`;
                    else if (text === "Dealwise" || text === "Dealwise (ING)") url = `https://www.dealwise.de/results/${encodeURIComponent(searchName)}`;
                    else if (text === "Shopbuddies") url = `https://shopbuddies.de/cashback/search?query=${encodeURIComponent(searchName)}`;
                    else if (text === "Klarna") url = `https://www.klarna.com/de/store/?search=${encodeURIComponent(searchName).replace(/%20/g, '+')}`;

                    // TOPCASHBACK LOGIK (Query Fix)
                    else if (text === "TopCashback") {
                        const prev = el.previousElementSibling;
                        const isVoucherArea = (prev && prev.textContent.trim().toLowerCase().includes("gutscheine")) || el.closest('.voucher-area');
                        if (isVoucherArea) {
                            url = `https://geschenkkarten.topcashback.de/search.php?search_query=${encodeURIComponent(searchName)}`;
                        } else {
                            url = `https://duckduckgo.com/?q=!ducky+${encodeURIComponent(searchName)}+site:topcashback.de`;
                        }
                    }
                    else if (duckyDomains[text]) {
                        url = `https://duckduckgo.com/?q=!ducky+${encodeURIComponent(searchName)}+site:${duckyDomains[text]}`;
                    }
                }

                if (url) el.innerHTML = `<a href="${url}" target="_blank" style="${linkStyle}">${text}</a>`;
            });
        }
        enrich();
        new MutationObserver(enrich).observe(document.body, { childList: true, subtree: true });
    }

    // -------------------------
    // 3. POPUP LOGIK
    // -------------------------
    function runPopup() {
        if (window.top !== window.self) return;
        const ignore = [MAIN_DOMAIN, "google.", "bing.", "localhost", "127.0.0.1"];
        if (ignore.some(d => location.href.includes(d))) return;

        function normalize(s) { return s ? s.toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').replace(/[^a-z0-9]/g,'') : ''; }
        function normalizeShop(s) { return normalize(String(s || '').replace(/\.(de|com|eu|net|org|at|ch)$/i, '')); }

        async function getShopNames() {
            const CACHE_KEY = "cb_opt_names", TIME_KEY = "cb_opt_time", LIFE = 86400000;
            const cached = getStorage(CACHE_KEY);
            const time = getStorage(TIME_KEY) || 0;
            if (cached && (Date.now() - time < LIFE)) return JSON.parse(cached);

            const url = `https://${MAIN_DOMAIN}/`;
            return new Promise((resolve) => {
                const useFetch = (typeof GM_xmlhttpRequest === 'undefined');
                if (!useFetch) {
                    GM_xmlhttpRequest({
                        method: "GET", url: url,
                        onload: r => {
                            const names = Array.from(new DOMParser().parseFromString(r.responseText, "text/html").querySelectorAll(".shop-area-header.filter-tag")).map(h => h.textContent.trim());
                            setStorage(CACHE_KEY, JSON.stringify(names)); setStorage(TIME_KEY, Date.now()); resolve(names);
                        },
                        onerror: () => resolve([])
                    });
                } else {
                    fetch(url).then(r => r.text()).then(html => {
                        const names = Array.from(new DOMParser().parseFromString(html, "text/html").querySelectorAll(".shop-area-header.filter-tag")).map(h => h.textContent.trim());
                        setStorage(CACHE_KEY, JSON.stringify(names)); setStorage(TIME_KEY, Date.now()); resolve(names);
                    }).catch(() => resolve([]));
                }
            });
        }

        getShopNames().then(names => {
            if (!names || names.length === 0) return;
            const host = location.hostname.toLowerCase();
            const pageTitle = normalize(document.title);
            let shop = null;

            if (host.includes('netto-online.de')) shop = "Netto MD";
            else if (host.includes('baur.de')) shop = "Baur";
            else if (host.includes('g-star.com')) shop = "G-Star RAW";
            else if (host === 'netto.de') return;

            if (!shop) {
                const hostWithoutWww = host.replace(/^www\./, '');
                const directMatch = names.find(n => normalize(n) === normalize(hostWithoutWww));
                if (directMatch) shop = directMatch;
            }

            if (!shop) {
                const blacklist = ['www', 'shop', 'online', 'store', 'de', 'com', 'net', 'at', 'ch', 'eu', 'org'];
                const segments = host.split('.').filter(s => !blacklist.includes(s));
                for (const seg of segments) {
                    const target = normalize(seg);
                    shop = names.find(n => normalizeShop(n) === target || normalize(n) === target);
                    if (shop) break;
                }
            }
            if (!shop) shop = names.find(n => normalize(n).length > 3 && pageTitle.includes(normalize(n)));

            if (!shop) return;
            const filterUrl = `https://${MAIN_DOMAIN}/?filter=${encodeURIComponent(shop)}`;
            const id = "cbopt" + Math.floor(Math.random() * 9999);
            const isMobile = /iphone|ipad|android/i.test(navigator.userAgent);
            const bottom = isMobile ? "80px" : "20px";

            document.body.insertAdjacentHTML("beforeend", `
                <div id="${id}" style="position:fixed;bottom:${bottom};right:20px;z-index:2147483647">
                    <div id="${id}box" style="width:260px;height:54px;background:#fffbe7;border-radius:14px;box-shadow:0 4px 15px rgba(0,0,0,0.2);border:1px solid #e0c200;overflow:hidden;transition:.4s">
                        <div id="${id}head" style="display:flex;align-items:center;height:54px;padding:0 12px;cursor:pointer">
                            <img id="${id}img" src="${ICON_URL}" onerror="this.closest('#${id}box').setAttribute('csp','1'); this.style.display='none';" style="width:22px;margin-right:10px">
                            <div id="${id}label" style="flex:1;font-weight:600;color:#b1a100;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${shop} Cashback</div>
                            <div id="${id}close" style="font-size:24px;color:#b1a100">×</div>
                        </div>
                        <iframe id="${id}frame" src="${filterUrl}" style="display:none;width:420px;height:326px;border:none;background:transparent"></iframe>
                    </div>
                </div>
            `);

            const box = document.getElementById(`${id}box`);
            const head = document.getElementById(`${id}head`);
            const frame = document.getElementById(`${id}frame`);
            const close = document.getElementById(`${id}close`);

            head.onclick = e => {
                if(e.target === close) return;
                if(box.getAttribute('csp') === '1') { window.open(filterUrl, "_blank"); return; }
                if(frame.style.display === "none"){
                    frame.style.display = "block";
                    box.style.width = "420px";
                    box.style.height = "380px";
                } else {
                    if(e.target.id === `${id}label`) window.open(filterUrl, "_blank");
                    else { frame.style.display="none"; box.style.width="260px"; box.style.height="54px"; }
                }
            }
            close.onclick = e => { e.stopPropagation(); document.getElementById(id).remove(); }
            document.addEventListener('mousedown', (e) => { if (box && !box.contains(e.target) && frame.style.display !== "none") { frame.style.display="none"; box.style.width="260px"; box.style.height="54px"; } });
        });
    }

    if (location.href.includes(MAIN_DOMAIN)) runLinker();
    else runPopup();
})();