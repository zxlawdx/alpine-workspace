(() => {
  'use strict';
  if (window.__ALPINE_WS_LAUNCHER__) return;
  window.__ALPINE_WS_LAUNCHER__ = true;

  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const FAVORITES_KEY='alpinews-launcher-favorites-v1';
  const PATH='catalogo-aplicativos';
  let apps=[];
  let filter='all';
  let query='';
  let session=null;
  let csrf='';
  let longPressTimer=null;
  let suppressNextClick=false;

  const BUILTINS=[
    {id:'ws-terminal',name:'Terminal',categories:['development','system'],icon:'terminal',launch:'terminal',source:'Alpine Workspace',version:'integrado'},
    {id:'ws-code',name:'Código',categories:['development'],icon:'code',launch:'code',source:'Alpine Workspace',version:'integrado'},
    {id:'ws-files',name:'Arquivos',categories:['system'],icon:'files',launch:'files',source:'Alpine Workspace',version:'integrado'},
    {id:'ws-settings',name:'Configurações',categories:['system'],icon:'settings',launch:'settings',source:'Alpine Workspace',version:'integrado'},
  ];

  const META={
    git:{name:'Git',categories:['development'],icon:'git',launch:'terminal'},
    python:{name:'Python 3',categories:['development'],icon:'python',launch:'code'},
    pip:{name:'pip',categories:['development'],icon:'pip',launch:'terminal'},
    docker:{name:'Docker',categories:['development','system'],icon:'docker',launch:'docker'},
    compose:{name:'Docker Compose',categories:['development','system'],icon:'docker',launch:'docker'},
    postgresql:{name:'PostgreSQL',categories:['data','development'],icon:'postgresql',launch:'terminal'},
    nginx:{name:'Nginx',categories:['web','system'],icon:'nginx',launch:'services'},
    curl:{name:'curl',categories:['web','development'],icon:'curl',launch:'terminal'},
    wget:{name:'wget',categories:['web','development'],icon:'wget',launch:'terminal'},
    nano:{name:'nano',categories:['development'],icon:'nano',launch:'code'},
    vim:{name:'Vim',categories:['development'],icon:'vim',launch:'code'},
    htop:{name:'htop',categories:['system'],icon:'htop',launch:'terminal'},
    nodejs:{name:'Node.js',categories:['development'],icon:'nodejs',launch:'code'},
    npm:{name:'npm',categories:['development'],icon:'npm',launch:'terminal'},
  };

  function lineIcon(path){return `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`}
  function appIcon(name,label=''){
    const logos={
      terminal:`<svg viewBox="0 0 64 64"><defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#202735"/><stop offset="1" stop-color="#0b0f16"/></linearGradient></defs><rect x="5" y="8" width="54" height="46" rx="12" fill="url(#t)" stroke="#3e484f"/><path d="m17 23 9 9-9 9" fill="none" stroke="#56e5a9" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M31 41h15" stroke="#8ed5ff" stroke-width="4" stroke-linecap="round"/></svg>`,
      code:`<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="14" fill="#15202b" stroke="#31506a"/><path d="m25 20-12 12 12 12M39 20l12 12-12 12M37 15 27 49" fill="none" stroke="#38bdf8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      files:`<svg viewBox="0 0 64 64"><path d="M7 18c0-4 3-7 7-7h13l6 7h17c4 0 7 3 7 7v25c0 4-3 7-7 7H14c-4 0-7-3-7-7V18Z" fill="#2082c8"/><path d="M7 26h50v24c0 4-3 7-7 7H14c-4 0-7-3-7-7V26Z" fill="#38bdf8"/><path d="M7 34h50v16c0 4-3 7-7 7H14c-4 0-7-3-7-7V34Z" fill="#56e5a9" opacity=".2"/></svg>`,
      settings:lineIcon('<circle cx="32" cy="32" r="8"/><path d="M52 38a6 6 0 0 0 1-6l5-4-5-9-6 2a24 24 0 0 0-6-4l-1-7H24l-1 7a24 24 0 0 0-6 4l-6-2-5 9 5 4a20 20 0 0 0 0 7l-5 4 5 9 6-2a24 24 0 0 0 6 4l1 7h16l1-7a24 24 0 0 0 6-4l6 2 5-9-6-5Z"/>'),
      docker:`<svg viewBox="0 0 64 64"><g fill="#2496ed"><rect x="8" y="26" width="9" height="8" rx="1"/><rect x="19" y="26" width="9" height="8" rx="1"/><rect x="30" y="26" width="9" height="8" rx="1"/><rect x="19" y="16" width="9" height="8" rx="1"/><rect x="30" y="16" width="9" height="8" rx="1"/><rect x="30" y="6" width="9" height="8" rx="1"/><rect x="41" y="26" width="9" height="8" rx="1"/><path d="M7 37h45c4 0 7-1 9-4-1 8-5 14-11 18-6 4-14 6-23 6-12 0-19-5-22-15-1-2 0-4 2-5Z"/><path d="M53 29c3-3 7-4 11-2-2 4-5 6-9 7l-2-5Z"/></g></svg>`,
      python:`<svg viewBox="0 0 128 128"><path d="M63.3 4C33.2 4 35.1 17.1 35.1 17.1l.1 13.5H64v4.2H24.3C4.2 34.8 4 52.8 4 52.8l.1 14C4.1 82.2 16.5 83.1 16.5 83.1h8.8V71.2c0-13.6 11.8-13.6 11.8-13.6h27.1c11.6 0 12.3-11.1 12.3-11.1V16.7C76.5 2.7 63.3 4 63.3 4Z" fill="#387eb8"/><circle cx="48.6" cy="19.7" r="6.8" fill="#fff"/><path d="M64.7 124c30.1 0 28.2-13.1 28.2-13.1l-.1-13.5H64v-4.2h39.7c20.1 0 20.3-18 20.3-18l-.1-14c0-15.4-12.4-16.3-12.4-16.3h-8.8v11.9c0 13.6-11.8 13.6-11.8 13.6H63.8c-11.6 0-12.3 11.1-12.3 11.1v29.8c0 14 13.2 12.7 13.2 12.7Z" fill="#ffe052"/><circle cx="79.4" cy="108.3" r="6.8" fill="#fff"/></svg>`,
      pip:`<svg viewBox="0 0 64 64"><rect x="5" y="8" width="54" height="48" rx="13" fill="#3776ab"/><path d="M18 21h19c9 0 14 5 14 13 0 9-5 14-14 14h-7v9H18V21Zm12 10v8h7c2 0 3-1 3-4 0-2-1-4-3-4h-7Z" fill="#ffd343"/></svg>`,
      git:`<svg viewBox="0 0 128 128"><path d="M124.7 57.3 70.7 3.3C68.6 1.2 65.2 0 61.8 0S55 1.2 52.9 3.3L3.3 52.9c-4.4 4.4-4.4 11.4 0 15.8l54 54c2.1 2.1 5.5 3.3 8.9 3.3s6.8-1.2 8.9-3.3l49.6-49.6c4.4-4.4 4.4-11.5 0-15.8Z" fill="#f05032"/><path d="M86 67c-3-2-6-3-9-2L66 53V39c3-1 5-4 5-8 0-5-4-9-9-9s-9 4-9 9c0 4 3 7 6 8v15L44 69c-1-1-3-1-4-1-5 0-9 4-9 9s4 9 9 9 9-4 9-9c0-2-1-4-2-5l17-17 11 14c-1 1-1 2-1 4 0 5 4 9 9 9s9-4 9-9c0-3-2-5-6-6Z" fill="#fff"/></svg>`,
      postgresql:`<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#336791"/><path d="M21 19c5-6 19-6 23 2 3 6 1 16-4 21-1 2-2 6 1 8-5 2-8-1-9-6-2 4-6 7-11 5 3-3 4-7 3-11-6-4-8-13-3-19Z" fill="#fff"/><path d="M29 26c1-2 4-2 5 0M39 25c1-2 3-2 4 0" fill="none" stroke="#336791" stroke-width="2" stroke-linecap="round"/><path d="M35 31c0 8-2 15-7 19" fill="none" stroke="#336791" stroke-width="3" stroke-linecap="round"/></svg>`,
      nginx:`<svg viewBox="0 0 64 64"><path d="M32 4 56 18v28L32 60 8 46V18L32 4Z" fill="#009639"/><path d="M20 19h8l16 22V19h7v29h-8L27 26v22h-7V19Z" fill="#fff"/></svg>`,
      nodejs:`<svg viewBox="0 0 64 64"><path d="M32 3 57 17v30L32 61 7 47V17L32 3Z" fill="#43853d"/><path d="M20 22h7v17c0 4 2 5 5 5 4 0 5-2 5-6V22h7v17c0 8-4 12-12 12-7 0-12-4-12-12V22Z" fill="#fff"/></svg>`,
      npm:`<svg viewBox="0 0 64 64"><rect x="4" y="15" width="56" height="34" rx="3" fill="#cb3837"/><path d="M13 39V25h29v14h-7V30h-6v9h-7v-9h-3v9h-6Z" fill="#fff"/></svg>`,
      redis:`<svg viewBox="0 0 64 64"><path d="m32 6 26 12-26 12L6 18 32 6Z" fill="#dc382d"/><path d="m6 30 26 12 26-12-6-3-20 9-20-9-6 3Z" fill="#b32821"/><path d="m6 42 26 12 26-12-6-3-20 9-20-9-6 3Z" fill="#8f1f19"/></svg>`,
      jupyter:`<svg viewBox="0 0 64 64"><path d="M12 26c4-12 14-20 27-20 6 0 11 2 15 5-5 0-10 2-13 5-4 4-6 9-6 15-8-4-16-5-23-5Z" fill="#f37626"/><path d="M52 38c-4 12-14 20-27 20-6 0-11-2-15-5 5 0 10-2 13-5 4-4 6-9 6-15 8 4 16 5 23 5Z" fill="#767677"/><circle cx="14" cy="13" r="4" fill="#767677"/><circle cx="50" cy="51" r="3" fill="#767677"/></svg>`,
      vscode:`<svg viewBox="0 0 100 100"><path d="M72 94 94 83c3-1 4-4 4-7V24c0-3-1-6-4-7L72 6c-2-1-4 0-5 1L28 45 14 34c-2-1-4-1-6 0l-5 4c-2 1-3 3-2 5s2 4 4 4l15 2L5 53c-2 0-3 2-4 4s0 4 2 5l5 4c2 1 4 1 6 0l14-11 39 38c1 1 3 2 5 1Z" fill="#0065a9"/><path d="m72 94-44-39L67 7c1-1 3-2 5-1l22 11c3 1 4 4 4 7v52c0 3-1 6-4 7L72 94Z" fill="#007acc"/><path d="m74 23-36 27 36 27V23Z" fill="#1f9cf0"/></svg>`,
      firefox:`<svg viewBox="0 0 64 64"><defs><linearGradient id="ff" x1="8" y1="6" x2="54" y2="57"><stop stop-color="#ff9400"/><stop offset=".55" stop-color="#ff3a00"/><stop offset="1" stop-color="#b5007d"/></linearGradient></defs><path d="M51 13c-6-6-16-9-25-6 4 1 7 3 9 7-10-2-20 2-25 10-7 12-3 27 9 34 12 6 27 2 34-9 7-13 3-27-7-34 2 5 1 9-2 13-4-5-10-7-16-5-6 2-10 8-9 14 1 7 7 12 14 12 5 0 9-2 12-6-1 8-8 14-17 14-12 0-21-9-21-21 0-9 6-17 14-20-4 4-5 8-4 12 3-10 13-17 24-17 4 0 7 1 10 2Z" fill="url(#ff)"/></svg>`,
      chromium:`<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#1a73e8"/><path d="M32 4a28 28 0 0 1 24 14H32a14 14 0 0 0-12 7L12 11A28 28 0 0 1 32 4Z" fill="#ea4335"/><path d="M8 18a28 28 0 0 0 24 42l7-14a14 14 0 0 1-19-6L8 18Z" fill="#fbbc05"/><circle cx="32" cy="32" r="12" fill="#fff"/><circle cx="32" cy="32" r="9" fill="#4285f4"/></svg>`,
      htop:lineIcon('<polyline points="4 34 14 34 21 13 31 52 40 26 46 34 60 34"/>'),
      vim:`<svg viewBox="0 0 64 64"><path d="M32 3 61 32 32 61 3 32 32 3Z" fill="#019833"/><path d="M17 18h15v6h-5l8 18 8-18h-5v-6h14v6h-4L35 50h-7L16 24h-4v-6h5Z" fill="#fff"/></svg>`,
      nano:`<svg viewBox="0 0 64 64"><rect x="7" y="7" width="50" height="50" rx="12" fill="#294c60"/><path d="M18 43V21h7l14 14V21h7v22h-7L25 29v14h-7Z" fill="#8ed5ff"/></svg>`,
      curl:`<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="#17212b" stroke="#8ed5ff" stroke-width="3"/><path d="M43 21c-3-3-7-5-12-5-9 0-16 7-16 16s7 16 16 16c5 0 9-2 12-5" fill="none" stroke="#8ed5ff" stroke-width="6" stroke-linecap="round"/><path d="m40 39 9 0-5 7" fill="none" stroke="#56e5a9" stroke-width="3"/></svg>`,
      wget:`<svg viewBox="0 0 64 64"><rect x="7" y="7" width="50" height="50" rx="14" fill="#263746"/><path d="M18 21h7l4 22 4-16h6l4 16 4-22h7l-7 29h-8l-3-13-3 13h-8l-7-29Z" fill="#89ceff"/></svg>`,
      libreoffice:`<svg viewBox="0 0 64 64"><path d="M15 5h27l10 10v44H15V5Z" fill="#fff"/><path d="M42 5v12h12" fill="none" stroke="#777" stroke-width="4"/><path d="M22 28h23M22 36h23M22 44h17" stroke="#18a303" stroke-width="4" stroke-linecap="round"/></svg>`,
      thunderbird:`<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#0a84ff"/><path d="M15 37c4-13 15-20 30-18-5 2-8 6-8 11 5 1 9 5 10 10-6-3-12-2-17 2-5 4-11 5-15-5Z" fill="#fff" opacity=".95"/><path d="m21 30 11 8 12-8" fill="none" stroke="#0a84ff" stroke-width="3"/></svg>`,
    };
    if(logos[name])return logos[name];
    const initials=(label||'?').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase().slice(0,2);
    return `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="15" fill="#202630" stroke="#3e484f"/><text x="32" y="38" text-anchor="middle" fill="#8ed5ff" font-size="18" font-weight="700" font-family="system-ui,sans-serif">${esc(initials)}</text></svg>`;
  }

  function uiIcon(name){
    const p={search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',refresh:'<path d="M20 6v5h-5M4 18v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.5-2.6L20 11M4 13l2.4 4.6A7 7 0 0 0 17.9 15"/>',star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',external:'<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',empty:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M8 8l5 5M13 8l-5 5"/>'};
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p[name]||p.info}</svg>`;
  }

  async function ensureSession(force=false){
    if(session&&!force)return session;
    const r=await fetch('/api/session',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
    if(!r.ok)throw new Error(`Sessão indisponível (HTTP ${r.status})`);
    const j=await r.json();session=j;csrf=j.csrf||'';return j;
  }
  async function api(path){
    await ensureSession();
    let r=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
    if(r.status===401){session=null;await ensureSession(true);r=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}})}
    const j=await r.json().catch(()=>({}));
    if(!r.ok||j.ok===false)throw new Error(j?.error?.message||j?.detail||`HTTP ${r.status}`);
    return j;
  }

  function packageCategories(id){return META[id]?.categories||['system']}
  function buildApps(packages){
    const installed=(packages||[]).filter(p=>p.installed).map(p=>{
      const m=META[p.id]||{};
      return {
        id:p.id,name:m.name||p.name,categories:m.categories||['system'],icon:m.icon||'generic',launch:m.launch||'terminal',
        source:'Alpine Linux',version:p.installed_version||'instalado',package:(p.packages||[]).join(', ')||p.id,
        service:p.id==='docker'?'docker':p.id==='postgresql'?'postgresql':p.id==='nginx'?'nginx':null,protected:!!p.protected,
      };
    });
    const seen=new Set();
    return [...BUILTINS,...installed].filter(a=>!seen.has(a.id)&&seen.add(a.id));
  }

  function favorites(){try{return JSON.parse(localStorage.getItem(FAVORITES_KEY)||'null')||['ws-terminal','ws-code','ws-files','docker','python','git']}catch(_){return ['ws-terminal','ws-code','ws-files','docker','python','git']}}
  function saveFavorites(ids){localStorage.setItem(FAVORITES_KEY,JSON.stringify(ids.slice(0,12)))}
  function isFavorite(id){return favorites().includes(id)}
  function toggleFavorite(id){const list=favorites();const i=list.indexOf(id);if(i>=0)list.splice(i,1);else list.unshift(id);saveFavorites(list);renderGrids();toast(i>=0?'Removido dos fixados.':'Adicionado aos fixados.')}

  function setActive(){
    $$('.aws-nav-item').forEach(x=>x.classList.toggle('active',x.dataset.awsPath===PATH));
    document.body.classList.remove('aws-menu-open');
  }
  function renameNav(){const n=$(`[data-aws-path="${PATH}"] span:last-child`);if(n)n.textContent='Aplicativos'}

  function appButton(a){return `<button class="aws-launcher-app" type="button" data-launcher-app="${esc(a.id)}" title="${esc(a.name)}"><span class="aws-launcher-app-icon">${appIcon(a.icon,a.name)}</span><span class="aws-launcher-app-name">${esc(a.name)}</span></button>`}
  function matches(a){const q=query.trim().toLowerCase();const cat=filter==='all'||a.categories.includes(filter);return cat&&(!q||a.name.toLowerCase().includes(q)||String(a.package||'').toLowerCase().includes(q))}

  function renderGrids(){
    const visible=apps.filter(matches);
    const favOrder=favorites();
    const pinned=favOrder.map(id=>apps.find(a=>a.id===id)).filter(Boolean).filter(matches).slice(0,6);
    const pinSection=$('#aws-launcher-pinned');const pinGrid=$('#aws-launcher-pinned-grid');
    const searching=query.trim()||filter!=='all';
    if(pinSection)pinSection.hidden=!!searching||!pinned.length;
    if(pinGrid)pinGrid.innerHTML=pinned.map(appButton).join('');
    const grid=$('#aws-launcher-all-grid'),empty=$('#aws-launcher-empty');
    if(grid)grid.innerHTML=visible.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR',{sensitivity:'base'})).map(appButton).join('');
    if(empty)empty.hidden=visible.length>0;
  }

  function shell(){
    return `<div class="aws-app-launcher-page">
      <div class="aws-app-launcher-head"><h1>Aplicativos</h1><button class="aws-app-launcher-status" id="aws-launcher-refresh" type="button"><span class="dot"></span><span class="status-copy" id="aws-launcher-status">verificando aplicativos</span>${uiIcon('refresh')}</button></div>
      <div class="aws-launcher-discovery"><div class="aws-launcher-search-wrap">${uiIcon('search')}<input id="aws-launcher-search" class="aws-launcher-search" type="search" autocomplete="off" placeholder="Pesquisar aplicativos"><kbd class="aws-launcher-search-kbd">Ctrl + K</kbd></div>
        <div class="aws-launcher-filters" id="aws-launcher-filters"><button class="aws-launcher-filter active" data-launcher-filter="all">Todos</button><button class="aws-launcher-filter" data-launcher-filter="development">Desenvolvimento</button><button class="aws-launcher-filter" data-launcher-filter="system">Sistema</button><button class="aws-launcher-filter" data-launcher-filter="web">Web</button><button class="aws-launcher-filter" data-launcher-filter="data">Dados</button></div></div>
      <section class="aws-launcher-section" id="aws-launcher-pinned"><div class="aws-launcher-section-title">Fixados</div><div class="aws-launcher-grid" id="aws-launcher-pinned-grid"></div></section>
      <section class="aws-launcher-section"><div class="aws-launcher-section-title">Todos os aplicativos</div><div class="aws-launcher-grid" id="aws-launcher-all-grid"></div><div class="aws-launcher-empty" id="aws-launcher-empty" hidden>${uiIcon('empty')}<strong>Nenhum aplicativo encontrado</strong><span>Tente pesquisar com outro termo.</span></div></section>
      <div class="aws-launcher-context hidden" id="aws-launcher-context"></div>
      <div class="aws-launcher-info-backdrop hidden" id="aws-launcher-info"><div class="aws-launcher-info" role="dialog" aria-modal="true" aria-labelledby="aws-launcher-info-name"><div class="aws-launcher-info-top"><span class="aws-launcher-app-icon" id="aws-launcher-info-icon"></span><div class="aws-launcher-info-title"><h2 id="aws-launcher-info-name"></h2><span id="aws-launcher-info-source"></span></div><button class="aws-launcher-info-close" id="aws-launcher-info-close" aria-label="Fechar">${uiIcon('close')}</button></div><div class="aws-launcher-info-list" id="aws-launcher-info-list"></div></div></div>
    </div>`;
  }

  async function loadApps(){
    const status=$('#aws-launcher-status'),refresh=$('#aws-launcher-refresh');
    refresh?.classList.add('refreshing');if(status)status.textContent='verificando…';
    try{
      const d=await api('/api/packages');apps=buildApps(d.packages||[]);renderGrids();
      if(status)status.textContent=`${apps.length} disponíveis · atualizado agora`;
    }catch(e){if(status)status.textContent='falha ao atualizar';toast(e.message||'Não foi possível carregar os aplicativos.')}
    finally{refresh?.classList.remove('refreshing')}
  }

  function renderLauncher(){
    setActive();renameNav();const main=$('#aws-main');if(!main)return;
    filter='all';query='';main.innerHTML=shell();bindLauncher();loadApps();
  }

  function openLegacy(appId){
    const b=$(`#desktop-area [data-app="${CSS.escape(appId)}"], [data-app="${CSS.escape(appId)}"]`);
    if(!b){toast('Este destino não está disponível nesta instalação.');return false}
    b.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
    return true;
  }
  function launch(a){if(!a)return;openLegacy(a.launch||'terminal')}
  function launchNewTab(a){if(!a)return;window.open(`${location.origin}${location.pathname}#launch=${encodeURIComponent(a.id)}`,'_blank','noopener')}

  function showInfo(a){
    if(!a)return;closeContext();
    $('#aws-launcher-info-icon').innerHTML=appIcon(a.icon,a.name);$('#aws-launcher-info-name').textContent=a.name;$('#aws-launcher-info-source').textContent=a.source||'Alpine Linux';
    const rows=[['Versão',a.version||'—'],['Pacote APK',a.package||'—'],['Serviço OpenRC',a.service||'—'],['Categoria',(a.categories||[]).map(c=>({development:'Desenvolvimento',system:'Sistema',web:'Web',data:'Dados'}[c]||c)).join(', ')],['Destino',a.launch||'terminal']];
    $('#aws-launcher-info-list').innerHTML=rows.map(([k,v])=>`<span>${esc(k)}</span><span>${esc(v)}</span>`).join('');$('#aws-launcher-info').classList.remove('hidden');
  }
  function closeInfo(){$('#aws-launcher-info')?.classList.add('hidden')}

  function openContext(a,x,y){
    const m=$('#aws-launcher-context');if(!m||!a)return;const fav=isFavorite(a.id);m.innerHTML=`<button data-context-action="favorite">${uiIcon('star')}${fav?'Desafixar':'Favoritar'}</button><button data-context-action="info">${uiIcon('info')}Informações</button><button data-context-action="newtab">${uiIcon('external')}Abrir em nova guia</button>`;
    m.dataset.app=a.id;m.classList.remove('hidden');const pad=10,w=205,h=120;m.style.left=`${Math.max(pad,Math.min(x,innerWidth-w-pad))}px`;m.style.top=`${Math.max(pad,Math.min(y,innerHeight-h-pad))}px`;
  }
  function closeContext(){$('#aws-launcher-context')?.classList.add('hidden')}

  function bindLauncher(){
    $('#aws-launcher-refresh')?.addEventListener('click',loadApps);
    $('#aws-launcher-search')?.addEventListener('input',e=>{query=e.target.value||'';renderGrids()});
    $('#aws-launcher-filters')?.addEventListener('click',e=>{const b=e.target.closest('[data-launcher-filter]');if(!b)return;filter=b.dataset.launcherFilter;$$('.aws-launcher-filter').forEach(x=>x.classList.toggle('active',x===b));renderGrids()});
    const main=$('#aws-main');
    main?.addEventListener('click',e=>{
      if(suppressNextClick){suppressNextClick=false;e.preventDefault();return}
      const b=e.target.closest('[data-launcher-app]');if(!b)return;launch(apps.find(a=>a.id===b.dataset.launcherApp));
    });
    main?.addEventListener('contextmenu',e=>{const b=e.target.closest('[data-launcher-app]');if(!b)return;e.preventDefault();openContext(apps.find(a=>a.id===b.dataset.launcherApp),e.clientX,e.clientY)});
    main?.addEventListener('touchstart',e=>{const b=e.target.closest('[data-launcher-app]');if(!b)return;const t=e.touches[0];clearTimeout(longPressTimer);longPressTimer=setTimeout(()=>{suppressNextClick=true;openContext(apps.find(a=>a.id===b.dataset.launcherApp),t.clientX,t.clientY)},520)},{passive:true});
    main?.addEventListener('touchend',()=>clearTimeout(longPressTimer),{passive:true});main?.addEventListener('touchmove',()=>clearTimeout(longPressTimer),{passive:true});
    $('#aws-launcher-context')?.addEventListener('click',e=>{const b=e.target.closest('[data-context-action]');if(!b)return;const a=apps.find(x=>x.id===$('#aws-launcher-context').dataset.app);if(b.dataset.contextAction==='favorite')toggleFavorite(a.id);if(b.dataset.contextAction==='info')showInfo(a);if(b.dataset.contextAction==='newtab')launchNewTab(a);closeContext()});
    $('#aws-launcher-info-close')?.addEventListener('click',closeInfo);$('#aws-launcher-info')?.addEventListener('click',e=>{if(e.target.id==='aws-launcher-info')closeInfo()});
  }

  function toast(message){const old=$('.aws-launcher-toast');old?.remove();const n=document.createElement('div');n.className='aws-launcher-toast';n.textContent=message;document.body.appendChild(n);setTimeout(()=>n.remove(),2200)}

  function routeCapture(e){const b=e.target.closest(`[data-aws-path="${PATH}"]`);if(!b||!b.closest('#aws-shell'))return;e.preventDefault();e.stopImmediatePropagation();renderLauncher()}
  function keyCapture(e){
    const visible=$('#aws-launcher-search')&&$(`[data-aws-path="${PATH}"]`)?.classList.contains('active');if(!visible)return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();e.stopPropagation();$('#aws-launcher-search').focus();$('#aws-launcher-search').select()}
    if(e.key==='Escape'){closeContext();closeInfo()}
  }

  async function launchFromHash(){
    const m=location.hash.match(/^#launch=(.+)$/);if(!m)return;
    try{const d=await api('/api/packages');apps=buildApps(d.packages||[]);const a=apps.find(x=>x.id===decodeURIComponent(m[1]));history.replaceState(null,'',location.pathname+location.search);if(a)setTimeout(()=>launch(a),250)}catch(_){ }
  }

  function install(){
    renameNav();document.addEventListener('click',routeCapture,true);document.addEventListener('keydown',keyCapture,true);document.addEventListener('click',e=>{if(!e.target.closest('#aws-launcher-context'))closeContext()});
    launchFromHash();
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',install,{once:true}):install();
})();
