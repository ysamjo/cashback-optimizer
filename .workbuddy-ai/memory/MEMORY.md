# Cashback-Optimizer — Projektnotizen

## Architektur

Monorepo mit drei Clients, **eine** Detektionslogik:

| Pfad | Client |
| --- | --- |
| `chrome/` | MV3-Extension (Quelle der Wahrheit) |
| `userscript/` | Tampermonkey (eigene Kopie, v4.55, weicht ab) |
| `android/` | WebView-App (`MainActivity.java` + `assets/userscript.js`) |
| `releases/` | `Cashback-Optimizer-Extension-<ver>.zip`, `Cashback-Optimizer-Android-<ver>.apk` |

**Es gibt keine lokale Shop-Liste.** Alle Clients scrapen zur Laufzeit
`https://cashback-optimizer.de/` (`div.shop-area-header.filter-tag`, ~1300
Einträge, alphabetisch sortiert) und matchen den Host gegen die Namen
(`findShopByHost`: HOST_OVERRIDES → exakter Domain-Match → Host-Segmente).
Ein fehlender Shop kann deshalb nur drei Ursachen haben: veralteter/unvollständiger
Cache, fehlgeschlagener Abruf, oder ein anderer Client läuft.

## Konventionen

- Cache: `chrome.storage.local`, Schlüssel `cb_optimizer_names` /
  `cb_optimizer_time` / `cb_optimizer_cache_version`, TTL 24 h.
  `SHOP_CACHE_VERSION` steht in `background.js`, `popup.js` und `content.js` —
  bei Änderungen an der Extraktion **überall** erhöhen (erzwingt Neuladen).
- Ausschlussliste: geprüft werden **nur Host + Pfad**, niemals Query oder
  Fragment. Grund: Affiliate-Links (`?utm_source=mydealz.de`) dürfen die
  Erkennung auf der Zielseite nicht abschalten. Die Regel steht an drei Stellen
  (`background.js` `isExcludedUrl`, `popup.js` `isExcludedUrl`, `content.js`
  `isExcludedPage`) — immer alle drei ändern.
- Release: `manifest.json` + `README.md` Version bumpen, dann
  `cd chrome && zip -q -r ../releases/Cashback-Optimizer-Extension-<ver>.zip . -x ".*"`.
- Userscript deaktivieren, wenn die Extension läuft (README-Warnung).
- Alles außer der Extension ist Handarbeit — kein Build-Schritt, keine Tests.

## Testen

Immer im echten Browser, nicht im Quelltext lesen. Werkzeug ist **ego lite**:
dort ist `chrome/` bereits entpackt geladen (`location: 4` in
`~/Library/Application Support/Citro Labs/ego lite/Default/Secure Preferences`),
mit Andreas' echtem Profil.

```
~/.local/bin/ego-browser nodejs < tools/verify-extension.mjs
```

`tools/verify-extension.mjs` prüft das €-Badge je URL, inklusive
Affiliate-Parameter-Fall und Gegenproben (`mydealz.de` bleibt ausgeschlossen,
`example.com` ohne Badge). Exit-Code 1 bei Abweichung. Rezept + Fallen:
Skill `chrome-extension-verify`.

Eine Extension-Behauptung wird **im echten Browser** geprüft, nicht im Quelltext
gelesen. Scheitert nur ein Teil der Fälle, zuerst URL- und State-Logik verdächtigen
(Query-Parameter, Cache), nicht den Matcher.
