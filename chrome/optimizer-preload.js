(() => {
  'use strict';

  // 1. Spezielles Styling nur innerhalb des Overlays (Iframe):
  // - Großes Logo (#top-logo, .general-center) ausblenden
  // - Klobige Browser-Scrollbar durch native, transparente Gold-Scrollbar ersetzen
  // - Runde Ecken unten für einen nahtlosen Abschluss
  if (window.top !== window.self) {
    const iframeOverlayStyle = document.createElement('style');
    iframeOverlayStyle.id = 'cb-optimizer-iframe-overlay-style';
    iframeOverlayStyle.textContent = `
      .general-center, #top-logo {
        display: none !important;
      }
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
      ::-webkit-scrollbar {
        width: 6px !important;
        height: 6px !important;
      }
      ::-webkit-scrollbar-track {
        background: transparent !important;
      }
      ::-webkit-scrollbar-thumb {
        background: rgba(193, 162, 98, 0.45) !important;
        border-radius: 10px !important;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: rgba(193, 162, 98, 0.85) !important;
      }
      ::-webkit-scrollbar-corner {
        background: transparent !important;
      }
    `;

    const injectOverlayStyle = () => {
      if (document.documentElement) {
        document.documentElement.append(iframeOverlayStyle);
        return true;
      }
      return false;
    };

    if (!injectOverlayStyle()) {
      const obs = new MutationObserver(() => {
        if (injectOverlayStyle()) obs.disconnect();
      });
      obs.observe(document, { childList: true });
    }
  }

  // 2. Weißes Flackern beim Auto-Scroll zum Filter-Tag auf Desktop verhindern
  if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) return;
  if (!new URLSearchParams(location.search).has('filter')) return;

  const style = document.createElement('style');
  style.id = 'cb-optimizer-prehide';
  style.textContent = 'html{visibility:hidden!important}';

  const install = () => {
    if (document.documentElement) {
      document.documentElement.append(style);
      return true;
    }
    return false;
  };

  if (!install()) {
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document, { childList: true });
  }

  setTimeout(() => document.getElementById(style.id)?.remove(), 3000);
})();
