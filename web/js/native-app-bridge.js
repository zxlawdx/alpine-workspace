(() => {
  'use strict';

  if (window.__ALPINE_NATIVE_APP_BRIDGE__) return;
  window.__ALPINE_NATIVE_APP_BRIDGE__ = true;

  // A shell AWS/Mint esconde a área de trabalho legada, mas os botões data-app
  // ainda são usados como ponte para o WindowManager real do desktop.js.
  // O refresh Mint removia parte deles e quebrava Packages/Services/Docker/Logs.
  const APP_IDS = [
    'system',
    'files',
    'terminal',
    'code',
    'packages',
    'services',
    'docker',
    'logs',
    'settings',
  ];

  function ensureBridgeButtons() {
    const area = document.querySelector('#desktop-area');
    if (!area) return false;

    for (const id of APP_IDS) {
      if (area.querySelector(`[data-app="${id}"]`)) continue;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'desktop-icon native-app-bridge-button';
      button.dataset.app = id;
      button.tabIndex = -1;
      button.setAttribute('aria-hidden', 'true');
      button.style.display = 'none';
      area.appendChild(button);
    }

    return true;
  }

  function install() {
    if (!ensureBridgeButtons()) return;

    const area = document.querySelector('#desktop-area');
    if (!area) return;

    // Se alguma camada visual tentar "enxugar" o desktop novamente, restaura
    // somente as pontes ausentes sem alterar as janelas ou a UI visível.
    const observer = new MutationObserver(() => ensureBridgeButtons());
    observer.observe(area, { childList: true });

    // Garante a ordem após os listeners de DOMContentLoaded do refresh Mint.
    queueMicrotask(ensureBridgeButtons);
    setTimeout(ensureBridgeButtons, 0);
    setTimeout(ensureBridgeButtons, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
