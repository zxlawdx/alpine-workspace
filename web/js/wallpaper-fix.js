(() => {
  'use strict';
  if (window.__ALPINE_WS_WALLPAPER_FIX__) return;
  window.__ALPINE_WS_WALLPAPER_FIX__ = true;

  const STORAGE = {
    preset: 'pibic-wallpaper',
    custom: 'pibic-wallpaper-custom',
    dim: 'pibic-wallpaper-dim',
    fit: 'pibic-wallpaper-fit',
  };
  const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
  const MAX_DATA_URL_CHARS = 3_200_000;

  const MIME_BY_EXT = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif'
  };

  function cssUrl(value) {
    const clean = String(value || '')
      .trim()
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/[\r\n]/g, '');
    return `url("${clean}")`;
  }

  function statusElement() {
    return document.querySelector('[data-mint-wallpaper] [data-wallpaper-status]');
  }

  function say(message, error = false) {
    const status = statusElement();
    if (!status) return;
    status.textContent = message;
    status.style.color = error ? '#ffb4ab' : 'var(--mint-muted)';
  }

  function markCustomActive() {
    const section = document.querySelector('[data-mint-wallpaper]');
    if (!section) return;
    section.querySelectorAll('[data-wallpaper]').forEach((button) => {
      button.classList.toggle('active', button.dataset.wallpaper === 'custom');
    });
  }

  function applyCustomWallpaper(value) {
    localStorage.setItem(STORAGE.preset, 'custom');
    localStorage.setItem(STORAGE.custom, value);
    const dim = Math.max(0, Math.min(60, Number(localStorage.getItem(STORAGE.dim) ?? 20)));
    const fit = localStorage.getItem(STORAGE.fit) || 'cover';
    const root = document.documentElement;
    root.style.setProperty('--mint-wallpaper-image', cssUrl(value));
    root.style.setProperty('--mint-wallpaper-overlay', `rgba(0,0,0,${(dim / 100).toFixed(2)})`);
    root.style.setProperty('--mint-wallpaper-size', fit);
    root.style.setProperty('--mint-wallpaper-position', 'center');
    markCustomActive();
  }

  function cleanupLegacyWallpaper() {
    document.querySelectorAll('[data-wallpaper-section]').forEach((section) => section.remove());
    const main = document.querySelector('#aws-main');
    if (main?.classList.contains('aws-wallpaper-active')) {
      main.classList.remove('aws-wallpaper-active');
      main.style.removeProperty('background-image');
    }
  }

  function installLegacyCleanup() {
    cleanupLegacyWallpaper();
    const main = document.querySelector('#aws-main');
    if (main) {
      new MutationObserver(() => {
        if (main.classList.contains('aws-wallpaper-active')) {
          main.classList.remove('aws-wallpaper-active');
          main.style.removeProperty('background-image');
        }
      }).observe(main, {attributes: true, attributeFilter: ['class', 'style']});
    }
    new MutationObserver(() => cleanupLegacyWallpaper()).observe(document.body, {childList: true, subtree: true});
  }

  function loadImage(source, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      let done = false;
      const finish = (fn, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        img.onload = null;
        img.onerror = null;
        fn(value);
      };
      const timer = setTimeout(() => finish(reject, new Error('A imagem demorou demais para carregar.')), timeoutMs);
      img.onload = () => {
        if (!img.naturalWidth || !img.naturalHeight) {
          finish(reject, new Error('O arquivo não possui dimensões de imagem válidas.'));
          return;
        }
        finish(resolve, img);
      };
      img.onerror = () => finish(reject, new Error('O navegador não conseguiu abrir essa imagem. Use JPG, PNG, WebP, GIF, BMP ou AVIF.'));
      img.src = source;
    });
  }

  async function validateRemoteWallpaper(value) {
    const source = String(value || '').trim();
    if (!source) throw new Error('Informe uma URL de imagem.');
    if (!/^https?:\/\//i.test(source) && !source.startsWith('data:image/')) {
      throw new Error('Use uma URL http(s) direta para uma imagem.');
    }
    await loadImage(source);
    return source;
  }

  function fileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('Falha ao ler o arquivo selecionado.'));
      reader.readAsDataURL(file);
    });
  }

  function inferredMime(file) {
    const declared = String(file?.type || '').toLowerCase();
    if (declared.startsWith('image/')) return declared;
    const ext = String(file?.name || '').split('.').pop()?.toLowerCase() || '';
    return MIME_BY_EXT[ext] || '';
  }

  function normalizeDataUrl(dataUrl, mime) {
    if (!mime || dataUrl.startsWith('data:image/')) return dataUrl;
    const comma = dataUrl.indexOf(',');
    if (comma < 0) return dataUrl;
    const meta = dataUrl.slice(0, comma);
    const suffix = meta.includes(';base64') ? ';base64' : '';
    return `data:${mime}${suffix}${dataUrl.slice(comma)}`;
  }

  function encodeCanvas(canvas, quality) {
    return canvas.toDataURL('image/jpeg', quality);
  }

  async function fileToWallpaper(file) {
    if (!file) throw new Error('Selecione um arquivo de imagem válido.');
    const mime = inferredMime(file);
    if (!mime) throw new Error('Formato não reconhecido. Use JPG, PNG, WebP, GIF, BMP ou AVIF.');
    if (file.size > MAX_SOURCE_BYTES) {
      throw new Error('A imagem é muito grande. Use um arquivo de até 20 MB.');
    }

    let source = await fileAsDataUrl(file);
    source = normalizeDataUrl(source, mime);
    const img = await loadImage(source);

    const maxW = 1920;
    const maxH = 1080;
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', {alpha: false});
    if (!ctx) throw new Error('O navegador não conseguiu preparar a imagem.');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    let data = encodeCanvas(canvas, 0.82);
    if (data.length > MAX_DATA_URL_CHARS) {
      const scale2 = Math.min(1, 1440 / width, 810 / height);
      const canvas2 = document.createElement('canvas');
      canvas2.width = Math.max(1, Math.round(width * scale2));
      canvas2.height = Math.max(1, Math.round(height * scale2));
      const ctx2 = canvas2.getContext('2d', {alpha: false});
      if (!ctx2) throw new Error('O navegador não conseguiu reduzir a imagem.');
      ctx2.fillStyle = '#111';
      ctx2.fillRect(0, 0, canvas2.width, canvas2.height);
      ctx2.drawImage(canvas, 0, 0, canvas2.width, canvas2.height);
      data = encodeCanvas(canvas2, 0.70);
    }
    if (data.length > MAX_DATA_URL_CHARS) {
      throw new Error('A imagem ficou grande demais para ser salva no navegador. Tente uma imagem menor.');
    }
    return data;
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest?.('[data-mint-wallpaper] [data-wallpaper-url-apply]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const section = button.closest('[data-mint-wallpaper]');
    const input = section?.querySelector('[data-wallpaper-url]');
    try {
      say('Validando a imagem…');
      const source = await validateRemoteWallpaper(input?.value);
      applyCustomWallpaper(source);
      say('Imagem por URL aplicada.');
    } catch (error) {
      say(error?.message || 'Não foi possível usar essa URL como wallpaper.', true);
    }
  }, true);

  document.addEventListener('change', async (event) => {
    const input = event.target.closest?.('[data-mint-wallpaper] [data-wallpaper-file]');
    if (!input) return;
    event.stopPropagation();
    event.stopImmediatePropagation();

    const file = input.files?.[0];
    if (!file) return;
    try {
      say('Preparando imagem…');
      const dataUrl = await fileToWallpaper(file);
      try {
        applyCustomWallpaper(dataUrl);
      } catch (error) {
        if (error?.name === 'QuotaExceededError') {
          throw new Error('O navegador ficou sem espaço para salvar o wallpaper. Tente uma imagem menor.');
        }
        throw error;
      }
      say(`Imagem "${file.name}" aplicada.`);
    } catch (error) {
      say(error?.message || 'Falha ao aplicar a imagem.', true);
    } finally {
      input.value = '';
    }
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installLegacyCleanup, {once: true});
  } else {
    installLegacyCleanup();
  }
})();
