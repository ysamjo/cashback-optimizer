// ==UserScript==
// @name         Cashback-Optimizer Suite (v4.59 - TLD Recognition & DDG Ducky)
// @namespace    http://tampermonkey.net/
// @version      4.59
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

    function normalizePaybackName(value) {
        return String(value || '').toLowerCase()
            .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
            .replace(/[^a-z0-9]/g, '');
    }

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

        const HEADER_SELECTOR = '.shop-area-header.filter-tag, .voucher-area-header.filter-tag, .item-name';
        const LINK_SELECTOR = 'a';

        function shopNameOf(el) {
            const clone = el.cloneNode(true);
            clone.querySelectorAll('.cb-mcc').forEach(node => node.remove());
            return (clone.textContent || '').replace(/<.*%/, '').trim();
        }

        function addMccHint(el, shopName) {
            if (el.querySelector('.cb-mcc')) return;
            const info = SHOP_MCC[normalizePaybackName(shopName)];
            if (!info) return;
            const span = document.createElement('span');
            span.className = 'cb-mcc';
            span.textContent = `MCC ${info.mcc}`;
            span.title = [info.mcc, info.channel, info.category].filter(Boolean).join(' · ');
            span.style.cssText = 'margin-left:6px;font-size:11px;font-weight:400;color:#8a8a8a;white-space:nowrap;';
            el.appendChild(span);
        }

        function enrich(headers) {
            headers.forEach(el => {
                if (el.classList.contains('shop-area-header')) {
                    addMccHint(el, shopNameOf(el));
                }
                if (el.querySelector('a')) return;
                const text = el.textContent.trim();
                const shopArea = el.closest('.shop-area, .voucher-area');
                const headerEl = shopArea?.querySelector('.shop-area-header.filter-tag, .voucher-area-header.filter-tag');
                const rawShopName = headerEl ? shopNameOf(headerEl) : "";
                const searchName = (rawShopName === "Netto MD") ? "Netto" : rawShopName;
                const cleanPart = searchName.toLowerCase().replace(/[^a-z0-9]/g, '');

                let url = bcLinks[text] || directLinks[text];

                if (!url) {
                    if (text === "Penny Kartenwelt") url = `https://kartenwelt.penny.de/catalogsearch/result/?q=${encodeURIComponent(searchName)}`;
                    else if (text === "REWE Kartenwelt") url = `https://kartenwelt.rewe.de/catalogsearch/result/?q=${encodeURIComponent(searchName)}`;
                    else if (text === "Payback") {
                        const id = PAYBACK_SHOP_IDS[normalizePaybackName(searchName)];
                        url = id
                            ? `https://www.payback.de/shop/${id}`
                            : `https://duckduckgo.com/?q=!ducky+${encodeURIComponent(searchName)}+site:payback.de/shop`;
                    }
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