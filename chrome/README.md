# Cashback-Optimizer Suite 1.4.7

Chrome öffnen: `chrome://extensions` → Entwicklermodus → **Entpackte Erweiterung laden** → diesen Ordner auswählen.

Das goldene Erweiterungssymbol in der Chrome-Toolbar anheften. Ein Klick darauf erkennt den aktuellen Shop und zeigt die passenden Cashback-Möglichkeiten. Ist für die aktuelle Seite kein Shop erkannt (kein `€`-Symbol an der Erweiterung), ist der Cursor beim Öffnen des Menüs automatisch im **Suchfeld** fokussiert, sodass sofort getippt werden kann. Über die integrierte **Schnellsuche** im Popup können alle 1.300+ unterstützten Shops direkt durchsucht und aufgerufen werden. Das Zahnrad öffnet die Einstellungen.

Markiert man auf einer beliebigen Webseite Text (z. B. einen Shop-Namen), lässt sich per **Rechtsklick → „Im Cashback-Optimizer nach … suchen“** direkt ein neuer Tab mit dem passenden Filter öffnen.

Ein goldenes `€`-Badge am Symbol zeigt an, dass für den aktuellen Shop Cashback gefunden wurde. Die Einstellungen listen alle standardmäßig ausgeschlossenen Seiten auf.

Unter **Shop-Liste** in den Einstellungen stehen die Anzahl der geladenen Shops und das Alter der Liste. Wird ein Shop nicht erkannt, dort **Neu laden** drücken und die Shopseite aktualisieren. Wird ein Host nicht erkannt, lädt die Erweiterung die Liste zusätzlich selbst einmal frisch nach (höchstens alle 10 Minuten), damit neue Shops nicht bis zum Ablauf des 24-Stunden-Caches fehlen.

Unter **Anzeige** kann alternativ das bisherige Popup unten rechts auf der Webseite aktiviert werden.

Das bisherige Tampermonkey-Script deaktivieren, damit die Funktionen nicht doppelt ausgeführt werden. Nach Einstellungsänderungen offene Shopseiten neu laden.

Version 1.4.7: Dynamische Link-Ergänzungen verarbeiten nur geänderte Überschriften, gebündelt in maximal 50 Elementen pro Browser-Frame.

Performance-/Regressionsprüfung (Ego Lite): `ego-browser nodejs < tools/verify-link-performance.mjs` aus dem Repository. Der Test vergleicht den Linker mit Commit `24bfc70` auf einer isolierten Testseite mit 1.300 Anbieterüberschriften. Bei zehn fremden DOM-Änderungen sinkt die Zahl erneut geprüfter Überschriften von 13.010 auf 0; dies ist eine Aufwandsmessung, keine Messung der gesamten Ladezeit. Geprüft werden außerdem neue Container, Text-Ersetzungen, entfernte Knoten und doppelte Links in Erweiterung, Userscript und Android-Asset.
