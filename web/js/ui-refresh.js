(function(){
  function textOf(el){
    return (el.innerText || el.textContent || "").trim().toLowerCase();
  }

  function isPrimaryLabel(t){
    return /^(salvar|save|conectar|connect|executar|run|instalar|install|criar|create|abrir|open|iniciar|start|atualizar|update|aplicar|apply|entrar|login|new|novo)/i.test(t);
  }

  function isDangerLabel(t){
    return /^(remover|remove|excluir|delete|parar|stop|desabilitar|disable|desconectar|disconnect|fechar tudo|apagar)/i.test(t);
  }

  function enhanceButtons(root){
    root.querySelectorAll('button, input[type="button"], input[type="submit"], .btn, .button, [role="button"]').forEach(function(btn){
      var t = textOf(btn);
      btn.classList.remove('ui-btn-primary','ui-btn-danger','ui-btn-ghost');

      if (isDangerLabel(t)) {
        btn.classList.add('ui-btn-danger');
      } else if (isPrimaryLabel(t)) {
        btn.classList.add('ui-btn-primary');
      } else {
        btn.classList.add('ui-btn-ghost');
      }

      if (btn.textContent && btn.textContent.trim().length <= 1) {
        btn.classList.add('icon-btn');
      }
    });
  }

  function enhanceFields(root){
    root.querySelectorAll('input, select, textarea').forEach(function(el){
      el.classList.add('ui-field');
    });
  }

  function enhanceWindows(root){
    root.querySelectorAll('.window, .wm-window, .app-window, [data-window]').forEach(function(w){
      w.classList.add('ui-window');
    });

    root.querySelectorAll('.window-header, .wm-titlebar, .title-row, .app-header, .panel-header, .modal-header').forEach(function(h){
      h.classList.add('ui-window-header');
    });
  }

  function enhanceTables(root){
    root.querySelectorAll('table').forEach(function(t){
      t.classList.add('ui-table');
    });
  }

  function enhance(root){
    root = root || document;
    enhanceButtons(root);
    enhanceFields(root);
    enhanceWindows(root);
    enhanceTables(root);
  }

  function ensureOverlay(){
    var overlay = document.getElementById('ui-refresh-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'ui-refresh-overlay';
    overlay.innerHTML =
      '<div class="box">' +
        '<div class="spinner"></div>' +
        '<div class="msg">Processando...</div>' +
      '</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function showOverlay(msg){
    var overlay = ensureOverlay();
    var box = overlay.querySelector('.msg');
    if (box) box.textContent = msg || 'Processando...';
    overlay.classList.add('show');
  }

  function hideOverlay(){
    var overlay = document.getElementById('ui-refresh-overlay');
    if (overlay) overlay.classList.remove('show');
  }

  function ensureToastHost(){
    var host = document.querySelector('.ui-toast-host');
    if (host) return host;
    host = document.createElement('div');
    host.className = 'ui-toast-host';
    document.body.appendChild(host);
    return host;
  }

  function toast(msg, kind){
    var host = ensureToastHost();
    var el = document.createElement('div');
    el.className = 'ui-toast ' + (kind || 'info');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function(){
      el.remove();
    }, 2600);
  }

  var pending = 0;

  function startAsync(msg){
    pending += 1;
    showOverlay(msg || 'Carregando...');
  }

  function endAsync(){
    pending = Math.max(0, pending - 1);
    if (!pending) hideOverlay();
    setTimeout(function(){ enhance(document); }, 40);
  }

  if (window.fetch) {
    var _fetch = window.fetch.bind(window);
    window.fetch = function(){
      startAsync('Carregando...');
      return _fetch.apply(null, arguments)
        .then(function(resp){
          if (!resp.ok) {
            toast('Ação concluída com alerta (' + resp.status + ')', 'error');
          }
          return resp;
        })
        .catch(function(err){
          toast('Falha na operação', 'error');
          throw err;
        })
        .finally(function(){
          endAsync();
        });
    };
  }

  document.addEventListener('click', function(e){
    var btn = e.target.closest('button, input[type="button"], input[type="submit"], .btn, .button, [role="button"]');
    if (!btn || btn.disabled) return;

    btn.classList.add('is-loading');
    setTimeout(function(){
      btn.classList.remove('is-loading');
    }, 6000);
  }, true);

  var mo = new MutationObserver(function(){
    enhance(document);
  });

  window.addEventListener('load', function(){
    enhance(document);
    ensureOverlay();
    ensureToastHost();

    if (document.documentElement) {
      mo.observe(document.documentElement, {childList:true, subtree:true});
    }

    toast('Tema UI carregado', 'success');
  });

  enhance(document);
})();
