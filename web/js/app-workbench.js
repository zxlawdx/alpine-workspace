(() => {
  'use strict';
  if (window.__ALPINE_WS_APP_WORKBENCH__) return;
  window.__ALPINE_WS_APP_WORKBENCH__ = true;

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];

  function latestWindow(app){
    const list=$$(`#window-layer .app-window[data-app="${CSS.escape(app)}"]`);
    return list[list.length-1]||null;
  }

  function markFileKinds(root){
    $$('.file-item',root).forEach(item=>{
      const use=item.querySelector('svg use');
      const href=use?.getAttribute('href')||use?.getAttribute('xlink:href')||'';
      if(href.includes('i-folder')) item.dataset.type='directory';
      else if(href.includes('i-file')) item.dataset.type='file';
    });
  }

  function enhanceFiles(win){
    if(!win||win.dataset.workbenchFiles==='1')return;
    const root=$('.file-app',win);if(!root)return;
    win.dataset.workbenchFiles='1';
    const toolbar=$('.toolbar',root),search=$('[data-search]',root),searchButton=$('[data-f="search"]',root),refresh=$('[data-f="refresh"]',root),pathInput=$('[data-path]',root),view=$('.file-view',root),bread=$('.breadcrumb',root),sidebar=$('.file-sidebar',root),status=$('[data-status]',root);
    if(!toolbar||!search||!searchButton||!refresh)return;

    search.placeholder='Buscar nesta pasta e subpastas';
    search.setAttribute('aria-label','Buscar arquivos nesta pasta e subpastas');
    search.title='Busca recursiva a partir da pasta atual';
    searchButton.title='Pesquisar agora';

    const clear=document.createElement('button');
    clear.type='button';clear.className='file-search-clear';clear.dataset.fileSearchClear='1';clear.title='Limpar pesquisa';clear.setAttribute('aria-label','Limpar pesquisa');clear.textContent='×';
    searchButton.after(clear);
    const hint=document.createElement('span');hint.className='file-search-hint';hint.textContent='busca recursiva';clear.after(hint);

    let timer=null,lastQuery='';
    const setSearching=q=>{hint.classList.toggle('active',!!q);hint.textContent=q?'buscando em subpastas':'busca recursiva'};
    const perform=()=>{
      const q=search.value.trim();
      clearTimeout(timer);setSearching(q);
      if(!q){lastQuery='';refresh.click();return}
      lastQuery=q;searchButton.click();
    };
    search.addEventListener('input',()=>{
      const q=search.value.trim();setSearching(q);clearTimeout(timer);
      if(!q){timer=setTimeout(()=>{lastQuery='';refresh.click()},180);return}
      if(q.length<2)return;
      timer=setTimeout(()=>{if(search.value.trim()===q){lastQuery=q;searchButton.click()}},420);
    });
    search.addEventListener('keydown',e=>{
      if(e.key==='Enter'){e.preventDefault();perform()}
      else if(e.key==='Escape'&&search.value){e.preventDefault();search.value='';perform();search.focus()}
    });
    clear.addEventListener('click',()=>{search.value='';perform();search.focus()});

    const updatePlaces=()=>{
      const p=pathInput?.value||'';
      $$('[data-place]',sidebar).forEach(b=>{
        let target=b.dataset.place||'';
        const active=target==='~'?(/^\/home\/[^/]+\/?$/.test(p)):p===target||p.startsWith(target.replace(/\/$/,'')+'/');
        b.classList.toggle('aws-place-active',active);
      });
    };
    bread&&new MutationObserver(()=>{updatePlaces();markFileKinds(root)}).observe(bread,{childList:true,subtree:true});
    view&&new MutationObserver(()=>markFileKinds(root)).observe(view,{childList:true,subtree:true});
    status&&new MutationObserver(()=>{
      const text=status.textContent||'';
      if(/resultado\(s\)/i.test(text))hint.textContent=lastQuery?`resultados para “${lastQuery}”`:'resultados';
      else if(!search.value.trim())hint.textContent='busca recursiva';
    }).observe(status,{childList:true,characterData:true,subtree:true});
    updatePlaces();markFileKinds(root);
  }

  function enhanceCode(win){
    if(!win||win.dataset.workbenchCode==='1')return;
    const root=$('.code-app',win);if(!root)return;
    win.dataset.workbenchCode='1';
    const tree=$('[data-tree]',root);
    if(tree)new MutationObserver(()=>{
      $$('.tree-node',tree).forEach(n=>n.title=n.dataset.path||n.textContent.trim());
    }).observe(tree,{childList:true,subtree:true});
  }

  function enhanceGeneric(win){
    if(!win||win.dataset.workbenchGeneric==='1')return;
    win.dataset.workbenchGeneric='1';
    const app=win.dataset.app;
    const ribbon=$('.aws-v4-ribbon',win);
    if(ribbon){
      const label={packages:'Pacotes APK',services:'Serviços OpenRC',docker:'Docker',logs:'Logs',settings:'Configurações',terminal:'Terminal',code:'Código',files:'Arquivos'}[app];
      if(label){const b=$('b',ribbon);if(b)b.textContent=label}
    }
  }

  function enhanceWindow(win){
    if(!win)return;
    enhanceGeneric(win);
    if(win.dataset.app==='files')enhanceFiles(win);
    if(win.dataset.app==='code')enhanceCode(win);
  }

  function dispatchPaste(pane,text){
    try{
      const dt=new DataTransfer();dt.setData('text/plain',text);
      pane.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
      return true;
    }catch(_){return false}
  }

  function configurePostgresTerminal(win){
    if(!win)return;
    win.dataset.workbenchProfile='postgresql';
    const title=$('.window-title',win);if(title)title.textContent='PostgreSQL';
    const appIcon=$('.window-titlebar .app-icon',win);if(appIcon)appIcon.title='PostgreSQL';
    const rename=()=>{
      const tab=$('.terminal-tab span:not(.terminal-tab-close)',win)||$('.terminal-tab span',win);if(tab)tab.textContent='psql';
      const ribbon=$('.aws-v4-ribbon',win);if(ribbon){const b=$('b',ribbon);if(b)b.textContent='PostgreSQL';const s=$('span',ribbon);if(s)s.textContent='psql · VM local'}
    };
    rename();setTimeout(rename,100);setTimeout(rename,350);

    const command="if ! command -v psql >/dev/null 2>&1; then printf '\\npsql nao esta instalado. Instale PostgreSQL pelo Workspace.\\n'; elif command -v doas >/dev/null 2>&1; then printf '\\nAbrindo PostgreSQL (psql) como usuario postgres. O doas pode solicitar sua senha Linux.\\n\\n'; doas -u postgres psql -d postgres; else printf '\\nAbrindo psql com o usuario atual.\\n\\n'; psql -d postgres; fi\r";
    const started=Date.now();let sent=false;
    const trySend=()=>{
      if(sent||!win.isConnected)return;
      const pane=$('.terminal-pane',win);const screen=$('.xterm-rows',win)?.textContent||'';
      const ready=screen.includes('$')||screen.includes('#')||Date.now()-started>900;
      if(pane&&ready){sent=dispatchPaste(pane,command);if(sent)return}
      if(Date.now()-started<5000)setTimeout(trySend,120);
    };
    setTimeout(trySend,120);
  }

  function openPostgresTerminal(){
    const button=$('#desktop-area [data-app="terminal"]');
    if(!button)return false;
    const before=new Set($$('#window-layer .app-window[data-app="terminal"]'));
    button.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
    const find=()=>{
      const candidates=$$('#window-layer .app-window[data-app="terminal"]');
      const win=candidates.find(w=>!before.has(w))||candidates[candidates.length-1];
      if(win){configurePostgresTerminal(win);return}
      setTimeout(find,30);
    };
    find();return true;
  }

  /* The launcher represents the real PostgreSQL package. A click should therefore
   * enter psql, not open an unrelated generic shell. We keep privilege elevation
   * interactive through doas; no password is stored by the Workspace. */
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-launcher-app="postgresql"]');
    if(!b)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    openPostgresTerminal();
  },true);

  function install(){
    const layer=$('#window-layer');
    if(layer){
      $$('.app-window',layer).forEach(enhanceWindow);
      new MutationObserver(()=>$$('.app-window',layer).forEach(enhanceWindow)).observe(layer,{childList:true,subtree:true});
    }
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',install,{once:true}):install();
})();
