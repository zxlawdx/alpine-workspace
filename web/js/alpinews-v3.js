(() => {
  'use strict';
  if (window.__ALPINE_WS_V3__) return;
  window.__ALPINE_WS_V3__ = true;

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtBytes = (n) => { n=Number(n||0); const u=['B','KB','MB','GB','TB']; let i=0; while(n>=1024&&i<u.length-1){n/=1024;i++} return `${n.toFixed(i?1:0)} ${u[i]}`; };
  const fmtUptime = (s) => { s=Number(s||0); const d=Math.floor(s/86400),h=Math.floor((s%86400)/3600),m=Math.floor((s%3600)/60); return d?`${d}d ${h}h ${m}m`:h?`${h}h ${m}m`:`${m}m`; };
  const pct = (used,total) => total ? Math.max(0,Math.min(100,(Number(used||0)/Number(total))*100)) : 0;

  function icon(name, cls='aws-ico') {
    const common=`class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
    const p={
      grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
      info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7h.01"/>',
      cpu:'<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
      disk:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h.01M11 15h6"/>',
      network:'<path d="M5 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM19 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM19 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/><path d="m7.7 17.3 8.6-10.6M8 19h8"/>',
      users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
      package:'<path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 17l8 4 8-4"/>',
      terminal:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12 15h5"/>',
      docker:'<rect x="3" y="10" width="5" height="4"/><rect x="9.5" y="10" width="5" height="4"/><rect x="9.5" y="5" width="5" height="4"/><rect x="16" y="10" width="5" height="4"/><path d="M3 16c2.5 4 13 5 18-1"/>',
      power:'<path d="M12 2v10"/><path d="M6.2 5.2a9 9 0 1 0 11.6 0"/>',
      folder:'<path d="M3 6h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
      key:'<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M15 8l3 3M17 6l3 3"/>',
      server:'<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><path d="M7 7h.01M7 17h.01"/>',
      hub:'<circle cx="12" cy="12" r="3"/><circle cx="4" cy="5" r="2"/><circle cx="20" cy="5" r="2"/><circle cx="4" cy="19" r="2"/><circle cx="20" cy="19" r="2"/><path d="m9.7 9.9-4.2-3.6m8.8 3.6 4.2-3.6M9.7 14.1l-4.2 3.6m8.8-3.6 4.2 3.6"/>',
      apps:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M17.5 14v7M14 17.5h7"/>',
      logs:'<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h4M9 12h6M9 16h6"/>',
      settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.09 14H3v-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63 1.7 1.7 0 0 0 10 3.09V3h4v.09A1.7 1.7 0 0 0 15 4.64a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9 1.7 1.7 0 0 0 20.91 10H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/>',
      search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
      bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
      user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
      menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
      copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
      refresh:'<path d="M20 6v5h-5M4 18v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.5-2.6L20 11M4 13l2.4 4.6A7 7 0 0 0 17.9 15"/>',
      play:'<path d="m8 5 11 7-11 7z"/>',
      close:'<path d="m6 6 12 12M18 6 6 18"/>',
      chevron:'<path d="m9 18 6-6-6-6"/>',
      shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
      activity:'<path d="M3 12h4l2-7 4 14 2-7h6"/>',
      code:'<path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/>',
      maximize:'<rect x="4" y="4" width="16" height="16" rx="2"/>',
      paste:'<path d="M9 5h6M9 3h6v4H9z"/><path d="M7 5H5v16h14V5h-2"/>',
      keyboard:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M7 17h10"/>'
    };
    return `<svg ${common}>${p[name]||p.info}</svg>`;
  }

  const navGroups = [
    ['Visão Geral', [['dashboard','Dashboard','grid']]],
    ['Sistema', [['sistema','Sistema & Risco','info'],['processos','Processos (htop)','cpu'],['armazenamento','Armazenamento & Disco','disk'],['rede','Rede (Interfaces & Portas)','network'],['usuarios','Usuários','users'],['pacotes-apk','Pacotes APK','package']]],
    ['Desenvolvimento', [['terminal-web','Terminal Web & SSH','terminal'],['codigo','Código','code'],['docker-containers','Docker & Containers','docker'],['servicos-openrc','Serviços (OpenRC)','power'],['arquivos','Arquivos (File Manager)','folder']]],
    ['Infraestrutura', [['acesso-ssh','Acesso SSH','key'],['proxmox-cluster','Proxmox (Cluster)','server'],['rede-privada','Rede Privada (VPN)','hub']]],
    ['Workspace', [['catalogo-aplicativos','Catálogo de Apps','apps'],['logs-centralizados','Logs Centralizados','logs'],['configuracoes','Configurações','settings']]]
  ];
  const appMap = {
    sistema:'system', processos:'terminal', armazenamento:'files', rede:'system', usuarios:'system', 'pacotes-apk':'packages',
    'terminal-web':'terminal', codigo:'code', 'docker-containers':'docker', 'servicos-openrc':'services', arquivos:'files',
    'acesso-ssh':'terminal', 'catalogo-aplicativos':'packages', 'logs-centralizados':'logs', configuracoes:'settings'
  };
  const labels = Object.fromEntries(navGroups.flatMap(g=>g[1]).map(x=>[x[0],x[1]]));
  const iconNames = Object.fromEntries(navGroups.flatMap(g=>g[1]).map(x=>[x[0],x[2]]));

  function logo(){return `<svg class="aws-logo" viewBox="0 0 40 40" fill="none" aria-label="Alpine Workspace"><rect width="40" height="40" rx="8" fill="#0B132B"/><path d="M9 30L20 10L31 30H24L20 22L16 30H9Z" fill="#38BDF8"/><path d="M20 22L23 28H17L20 22Z" fill="#0B132B"/><circle cx="28" cy="12" r="3" fill="#10B981"/></svg>`}

  function shellMarkup(){
    const groups = navGroups.map(([group,items])=>`<div class="aws-nav-group"><div class="aws-nav-label">${esc(group)}</div>${items.map(([id,label,ic])=>`<button class="aws-nav-item${id==='dashboard'?' active':''}" data-aws-path="${id}" type="button">${icon(ic)}<span>${esc(label)}</span></button>`).join('')}</div>`).join('');
    return `<div class="aws-shell" id="aws-shell">
      <div class="aws-drawer-scrim" id="aws-scrim"></div>
      <aside class="aws-sidebar"><div class="aws-brand">${logo()}<div class="aws-brand-copy"><div class="aws-brand-row"><span class="aws-brand-title">Alpine WS</span><span class="aws-version" id="aws-version">v3</span></div><span class="aws-brand-sub">Direto do navegador</span></div></div><div class="aws-nav-scroll">${groups}</div><div class="aws-sidebar-foot"><div class="aws-cli-chip"><span id="aws-cli-user">law@ssh-config:~$</span><span class="aws-dot"></span></div><div class="aws-foot-row"><span>OpenRC:</span><strong id="aws-openrc-status">verificando</strong></div><div class="aws-foot-row"><span>Didática CLI</span><strong class="aws-didactic">Ativo</strong></div></div></aside>
      <header class="aws-header"><div class="aws-header-left"><button class="aws-head-btn aws-mobile-menu" id="aws-menu-btn" aria-label="Menu">${icon('menu')}</button><div class="aws-host-chip" data-aws-path="dashboard"><span class="aws-dot"></span><span class="aws-hostname" id="aws-header-host">ssh-configuration</span><span class="aws-ip" id="aws-header-ip">127.0.0.1</span></div><div class="aws-mini-metrics"><div class="aws-mini"><label>CPU</label><strong id="aws-head-cpu">--</strong><span class="aws-mini-bar"><span class="aws-mini-fill" id="aws-head-cpu-bar"></span></span></div><div class="aws-mini"><label>RAM</label><strong id="aws-head-ram">--</strong><span class="aws-mini-bar"><span class="aws-mini-fill ram" id="aws-head-ram-bar"></span></span></div></div></div><div class="aws-header-right"><button class="aws-head-btn aws-search-btn" id="aws-search-btn">${icon('search')}<span class="aws-search-label">Pesquisar comandos...</span><kbd>Ctrl + K</kbd></button><button class="aws-head-btn aws-notify-btn" id="aws-notify-btn" aria-label="Notificações">${icon('bell')}<span class="aws-notify-badge"></span></button><div class="aws-user"><div class="aws-avatar">${icon('user')}</div><div class="aws-user-copy"><strong>law</strong><span>admin</span></div></div></div></header>
      <main class="aws-main" id="aws-main"></main>
      <div class="aws-overlay" id="aws-palette"><div class="aws-palette-box"><div class="aws-palette-search">${icon('search')}<input id="aws-palette-input" autocomplete="off" placeholder="Pesquisar apps, ferramentas e comandos..."/><kbd>Esc</kbd></div><div class="aws-palette-results" id="aws-palette-results"></div></div></div>
      <div class="aws-notification-panel" id="aws-notifications"><h3>Notificações</h3><div class="aws-notification-item"><strong>Alpine Workspace conectado</strong><br>Interface operando por túnel SSH local. Nenhuma porta administrativa foi exposta.</div></div>
      <div class="aws-info-dialog" id="aws-dialog"><div class="aws-dialog-box"><div class="aws-dialog-head"><h3 id="aws-dialog-title">Informação</h3><button id="aws-dialog-x" aria-label="Fechar">${icon('close')}</button></div><div class="aws-dialog-body" id="aws-dialog-body"></div><div class="aws-dialog-actions"><button id="aws-dialog-close">Fechar</button></div></div></div>
      <div class="aws-toast-host" id="aws-toast-host"></div>
    </div>`;
  }

  async function api(path){ const r=await fetch(path,{headers:{Accept:'application/json'}}); const j=await r.json(); if(!r.ok||j.ok===false)throw new Error(j.error?.message||j.error||`HTTP ${r.status}`); return j.data??j; }
  function toast(msg,kind='ok'){ const h=$('#aws-toast-host'); if(!h)return; const el=document.createElement('div');el.className='aws-toast';el.innerHTML=`${icon(kind==='error'?'info':'shield')}<span>${esc(msg)}</span>`;h.appendChild(el);setTimeout(()=>el.remove(),3200); }
  function copy(text){ if(navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(()=>toast('Comando copiado.')).catch(()=>fallbackCopy(text)); fallbackCopy(text); }
  function fallbackCopy(text){ const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');toast('Comando copiado.')}catch(_){toast('Não foi possível copiar.','error')}ta.remove(); }

  function getGreeting(){ const h=new Date().getHours(); return h<12?'Bom dia':h<18?'Boa tarde':'Boa noite'; }
  function unwrapSystem(d){ return d||{}; }
  function systemValues(d){
    d=unwrapSystem(d); const mem=d.memory||{},disk=d.disk||{};
    const cpuN=Number(d.cpu_percent ?? d.cpu?.percent ?? 0);
    const cpuLabel=Number.isFinite(cpuN)&&cpuN>0?`${cpuN.toFixed(0)}%`:`${d.cpu_count||d.cpu?.count||'?'} vCPU`;
    return {host:d.hostname||'ssh-configuration',os:d.os||d.platform||'Alpine Linux',kernel:d.kernel||'—',arch:d.architecture||d.arch||'—',uptime:fmtUptime(d.uptime),cpuPct:Number.isFinite(cpuN)?cpuN:0,cpuLabel,cores:d.cpu_count||d.cpu?.count||'—',memTotal:mem.total||0,memUsed:mem.used||0,memAvail:mem.available||0,memPct:pct(mem.used,mem.total),diskTotal:disk.total||0,diskUsed:disk.used||0,diskFree:disk.free||0,diskPct:pct(disk.used,disk.total),load:d.load||[]};
  }
  function normalizeServices(d){ return Array.isArray(d)?d:(d.services||[]); }
  function normalizeDocker(d){ return d||{}; }
  function normalizeLogs(d){ const t=typeof d==='string'?d:(d.text||'');return String(t).split('\n').filter(Boolean).slice(-6).reverse(); }

  function metricCard(ic,label,value,sub,p,kind,detail,cmd){ return `<article class="aws-metric-card"><div><div class="aws-metric-head"><span>${esc(label)}</span>${icon(ic)}</div><div class="aws-metric-value"><strong>${esc(value)}</strong><span>${esc(sub)}</span></div><div class="aws-progress ${kind||''}"><span style="width:${Math.max(0,Math.min(100,Number(p||0)))}%"></span></div><div class="aws-metric-detail">${detail}</div></div><div class="aws-command-ribbon"><span>${esc(cmd)}</span><button type="button" data-copy="${esc(cmd)}" title="Copiar comando">${icon('copy')}</button></div></article>`; }

  async function renderDashboard(){
    setActive('dashboard'); const main=$('#aws-main'); if(!main)return; if (!main.innerHTML.trim()) if (!main.innerHTML.trim()) main.innerHTML='<div class="aws-dashboard"><div class="aws-section aws-empty">Carregando estado real da VM...</div></div>';
    const results=await Promise.allSettled([api('/api/system'),api('/api/services'),api('/api/docker'),api('/api/logs'),api('/api/packages')]);
    const sys=systemValues(results[0].status==='fulfilled'?results[0].value:{}), services=normalizeServices(results[1].status==='fulfilled'?results[1].value:[]), docker=normalizeDocker(results[2].status==='fulfilled'?results[2].value:{}), logs=normalizeLogs(results[3].status==='fulfilled'?results[3].value:{}), packages=results[4].status==='fulfilled'?(Array.isArray(results[4].value)?results[4].value:[]):[];
    updateHeader(sys,services);
    const running=services.filter(s=>s.running).length; const containers=docker.containers||[]; const cRunning=containers.filter(c=>String(c.state||c.status||'').toLowerCase().includes('running')||String(c.status||'').toLowerCase().startsWith('up')).length;
    const load=Array.isArray(sys.load)?sys.load:[];
    main.innerHTML=`<div class="aws-dashboard">
      <section class="aws-section aws-host-banner"><div class="aws-host-banner-inner"><div><div class="aws-eyebrow"><span class="aws-status-badge"><span class="aws-dot"></span>Host Operacional</span><span class="aws-code-note">${esc(sys.os)}</span></div><h1 class="aws-title">${getGreeting()}, law</h1><p class="aws-subtitle">Aqui está o estado atual da sua máquina em ambiente acadêmico.</p></div><div class="aws-host-meta"><div class="aws-meta"><label>Hostname</label><strong class="primary">${esc(sys.host)}</strong></div><div class="aws-meta"><label>Workspace</label><strong>127.0.0.1:8765</strong></div><div class="aws-meta"><label>Uptime</label><strong class="ok">${esc(sys.uptime)}</strong></div><div class="aws-meta"><label>Kernel</label><strong>${esc(sys.kernel)}</strong></div></div></div></section>
      <section class="aws-metric-grid">
        ${metricCard('cpu','Processamento CPU',sys.cpuPct?`${sys.cpuPct.toFixed(0)}%`:sys.cpuLabel,`${sys.cores} vCPU`,sys.cpuPct,'',`<span>Arquitetura: <b>${esc(sys.arch)}</b></span><span>Load: <b>${esc(load.slice(0,3).join(' ')||'—')}</b></span>`,'top')}
        ${metricCard('cpu','Memória RAM',`${sys.memPct.toFixed(0)}%`,`${fmtBytes(sys.memUsed)} / ${fmtBytes(sys.memTotal)}`,sys.memPct,'ram',`<span>Disponível</span><span style="color:var(--aws-tertiary)">${fmtBytes(sys.memAvail)}</span>`,'free -m')}
        ${metricCard('disk','Armazenamento Root',`${sys.diskPct.toFixed(0)}%`,`${fmtBytes(sys.diskUsed)} / ${fmtBytes(sys.diskTotal)}`,sys.diskPct,'disk',`<span>/</span><span style="color:var(--aws-tertiary)">${fmtBytes(sys.diskFree)} Disp.</span>`,'df -h /')}
        ${metricCard('activity','Carga de Sistema',sys.uptime,'uptime',Math.min(100,(Number(load[0]||0)/(Number(sys.cores)||1))*100),'',`<span>Serviços: <b>${running}</b> ativos</span><span style="color:var(--aws-tertiary)">Operacional</span>`,'uptime && cat /proc/loadavg')}
      </section>
      <section class="aws-section aws-actions-section"><div class="aws-section-head"><span>Ações Rápidas de Operação</span><span>Atalhos Operacionais</span></div><div class="aws-action-grid">
        ${quick('terminal-web','terminal','Terminal','Alt+T',true)}${quick('docker-containers','docker','Docker',`${cRunning} Up`)}${quick('catalogo-aplicativos','apps','Instalar App','APK')}${quick('arquivos','folder','Explorar Disco','/')}${quick('usuarios','users','Usuários','local')}${quick('logs-centralizados','logs','Ver Logs','tail')}${quick('servicos-openrc','refresh','Serviços',`${running} on`)}
      </div></section>
      <div class="aws-workbench"><div class="aws-stack"><section class="aws-panel"><div class="aws-panel-title"><div class="aws-panel-title-left">${icon('power')}<div><h2>Serviços OpenRC</h2><small>Estado real dos serviços detectados</small></div></div><span class="aws-pill">rc-status</span></div><div class="aws-list">${services.slice(0,7).map(serviceRow).join('')||'<div class="aws-empty">Nenhum serviço retornado.</div>'}</div></section>
      <section class="aws-panel"><div class="aws-panel-title"><div class="aws-panel-title-left">${icon('network')}<div><h2>Camada de Rede & Acesso</h2><small>Workspace permanece restrito ao loopback</small></div></div><span class="aws-state ok">Link seguro</span></div><div class="aws-network-grid"><div class="aws-network-card"><div class="aws-kv"><span>Workspace</span><strong>127.0.0.1:8765</strong></div><div class="aws-kv"><span>Acesso externo</span><strong>SSH Local Forward</strong></div><div class="aws-kv"><span>SSH</span><strong>preservado</strong></div></div><div class="aws-network-card"><div class="aws-kv"><span>Hostname</span><strong>${esc(sys.host)}</strong></div><div class="aws-kv"><span>Kernel</span><strong>${esc(sys.kernel)}</strong></div><div class="aws-kv"><span>Arquitetura</span><strong>${esc(sys.arch)}</strong></div></div></div><div class="aws-ports"><label>Portas da arquitetura:</label><span class="aws-port"><span class="aws-dot"></span>22 SSH</span><span class="aws-port"><span class="aws-dot"></span>8765 Workspace/loopback</span></div></section></div>
      <div class="aws-stack"><section class="aws-panel"><div class="aws-panel-title"><div class="aws-panel-title-left">${icon('docker')}<div><h2>Containers Docker</h2><small>${docker.installed===false?'Docker não instalado':docker.running===false?'Daemon parado':'Daemon online'}</small></div></div><span class="aws-pill">docker ps</span></div><div class="aws-list">${containers.slice(0,5).map(containerRow).join('')||'<div class="aws-empty">Nenhum container encontrado.</div>'}</div></section>
      <section class="aws-panel aws-didactic-card"><div class="aws-didactic-title"><span>Comando Didático Subjacente</span><span>ash/sh</span></div><p class="aws-subtitle">A interface traduz o estado real da VM sem esconder os comandos Alpine.</p><div class="aws-didactic-code">cat /proc/loadavg &amp;&amp; free -m &amp;&amp; df -h</div></section>
      <section class="aws-panel"><div class="aws-panel-title"><div class="aws-panel-title-left">${icon('logs')}<div><h2>Atividade Recente</h2><small>/var/log / Workspace</small></div></div></div><div class="aws-log-list">${logs.map(l=>`<div class="aws-log-line">${esc(l)}</div>`).join('')||'<div class="aws-empty">Nenhum log disponível.</div>'}</div></section></div></div>
      <section class="aws-panel"><div class="aws-panel-title"><div class="aws-panel-title-left">${icon('package')}<div><h2>Catálogo monitorado</h2><small>Pacotes retornados pelo backend seguro/allowlist</small></div></div><span class="aws-pill">${packages.filter(p=>p.installed).length} instalados / ${packages.length} itens</span></div></section>
    </div>`;
    bindDashboard();
  }
  function quick(path,ic,label,badge,primary=false){return `<button class="aws-action${primary?' primary':''}" data-aws-path="${path}" type="button"><span class="aws-action-left">${icon(ic)}<span>${esc(label)}</span></span><span class="aws-action-badge${/up|on/i.test(badge)?' ok':''}">${esc(badge)}</span></button>`}
  function serviceRow(s){const id=String(s.id||s.name||'serviço'), protectedSvc=!!s.readonly||['sshd','networking','zerotier-one','pibic-workspace'].includes(id);return `<div class="aws-list-row"><div class="aws-row-main"><span class="aws-dot" style="background:${s.running?'var(--aws-tertiary)':'var(--aws-outline)'}"></span><div class="aws-row-copy"><strong>${esc(s.name||id)} ${protectedSvc?'<span class="aws-state protected">protegido</span>':''}</strong><small>rc-service ${esc(id)} status</small></div></div><span class="aws-state ${s.running?'ok':'off'}">${s.running?'Ativo':'Parado'}</span></div>`}
  function containerRow(c){const state=String(c.state||c.status||'').toLowerCase(),up=state.includes('running')||state.startsWith('up');return `<div class="aws-list-row"><div class="aws-row-main"><span class="aws-dot" style="background:${up?'var(--aws-tertiary)':'var(--aws-outline)'}"></span><div class="aws-row-copy"><strong>${esc(c.name||c.id||'container')}</strong><small>${esc(c.image||'')} · ${esc(c.status||c.state||'')}</small></div></div><span class="aws-state ${up?'ok':'off'}">${up?'Running':'Stopped'}</span></div>`}
  function bindDashboard(){ $$('[data-copy]',$('#aws-main')).forEach(b=>b.addEventListener('click',()=>copy(b.dataset.copy))); $$('[data-aws-path]',$('#aws-main')).forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.awsPath))); }
  function updateHeader(sys,services=[]){ $('#aws-header-host').textContent=sys.host; $('#aws-cli-user').textContent=`law@${sys.host}:~$`; const cpu=sys.cpuPct||0,ram=sys.memPct||0; $('#aws-head-cpu').textContent=sys.cpuPct?`${cpu.toFixed(0)}%`:`${sys.cores} vCPU`; $('#aws-head-ram').textContent=`${ram.toFixed(0)}%`; $('#aws-head-cpu-bar').style.width=`${Math.max(3,cpu)}%`; $('#aws-head-ram-bar').style.width=`${Math.max(3,ram)}%`; $('#aws-openrc-status').textContent=services.length?'rc-status: ok':'online'; }

  function setActive(path){ $$('.aws-nav-item').forEach(b=>b.classList.toggle('active',b.dataset.awsPath===path)); }
  function triggerApp(id){ const candidates=[`[data-app="${id}"]`,`[data-fav="${id}"]`]; let el=null; for(const s of candidates){el=$(s);if(el)break} if(!el){toast(`App ${id} não encontrado nesta instalação.`,'error');return false} el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window})); setTimeout(enhanceWindows,70); return true; }
  function closeMenu(){document.body.classList.remove('aws-menu-open')}
  function navigate(path){closeMenu();setActive(path);if(path==='dashboard'){renderDashboard().catch(e=>toast(e.message,'error'));return} if(path==='proxmox-cluster'){showInfo('Proxmox (Cluster)',`O acesso ao Proxmox pertence ao <strong>PIBIC LAB</strong>, que cria um forward SSH separado. Esta VM não recebe credenciais administrativas globais. Use o app local para abrir o cluster com segurança.`);return} if(path==='rede-privada'){showInfo('Rede Privada (VPN)',`O Workspace não altera ZeroTier, rotas, DNS ou interfaces. A rede privada continua sendo gerenciada fora desta UI para evitar perda de acesso remoto.`);return} const app=appMap[path]; if(app)triggerApp(app); }
  function showInfo(title,body){$('#aws-dialog-title').textContent=title;$('#aws-dialog-body').innerHTML=body;$('#aws-dialog').classList.add('open')}

  function paletteItems(){return navGroups.flatMap(([g,items])=>items.map(([id,label,ic])=>({id,label,ic,group:g}))).filter(x=>!['proxmox-cluster','rede-privada'].includes(x.id)).concat([{id:'cmd-htop',label:'Executar htop no Terminal',ic:'cpu',group:'Comando'},{id:'cmd-logs',label:'Abrir logs do sistema',ic:'logs',group:'Comando'},{id:'cmd-apk',label:'Abrir catálogo APK',ic:'package',group:'Comando'}])}
  function renderPalette(q=''){const r=$('#aws-palette-results'),query=q.toLowerCase().trim();const items=paletteItems().filter(x=>(x.label+' '+x.group).toLowerCase().includes(query));r.innerHTML=items.map((x,i)=>`<button class="aws-palette-item${i===0?' active':''}" data-palette-id="${x.id}">${icon(x.ic)}<span>${esc(x.label)}</span><small>${esc(x.group)}</small></button>`).join('')||'<div class="aws-empty">Nenhum resultado.</div>';$$('[data-palette-id]',r).forEach(b=>b.addEventListener('click',()=>activatePalette(b.dataset.paletteId)))}
  function openPalette(){const p=$('#aws-palette');p.classList.add('open');const input=$('#aws-palette-input');input.value='';renderPalette();setTimeout(()=>input.focus(),0)}
  function closePalette(){$('#aws-palette').classList.remove('open')}
  function activatePalette(id){closePalette();if(id==='cmd-htop'){navigate('terminal-web');toast('Terminal aberto. Execute: htop');return}if(id==='cmd-logs'){navigate('logs-centralizados');return}if(id==='cmd-apk'){navigate('catalogo-aplicativos');return}navigate(id)}

  function enhanceWindows(){
    $$('.window.visible').forEach(w=>{
      if(w.dataset.awsEnhanced==='1')return;w.dataset.awsEnhanced='1';
      const content=$('.window-content',w);if(!content)return;
      const title=($('.window-head strong',w)?.textContent||'Aplicativo').trim();
      const low=title.toLowerCase();let ic='apps',sub='Aplicativo local';
      if(low.includes('terminal')){ic='terminal';sub='PTY remoto · xterm.js'} else if(low.includes('código')||low.includes('codigo')){ic='code';sub='Editor na VM'} else if(low.includes('docker')){ic='docker';sub='daemon & containers'} else if(low.includes('pacote')){ic='package';sub='APK · allowlist'} else if(low.includes('servi')){ic='power';sub='OpenRC'} else if(low.includes('arquivo')){ic='folder';sub='File Manager'} else if(low.includes('log')){ic='logs';sub='Logs centralizados'} else if(low.includes('config')){ic='settings';sub='Workspace'} else if(low.includes('sistema')){ic='info';sub='Alpine Linux'};
      const ribbon=document.createElement('div');ribbon.className='aws-app-ribbon';ribbon.innerHTML=`<div class="aws-app-ribbon-left">${icon(ic)}<span class="aws-app-ribbon-title">${esc(sub)}</span></div><div class="aws-app-ribbon-right"><span class="aws-ribbon-pill">${esc(title)}</span></div>`;content.prepend(ribbon);
      if(low.includes('terminal')) enhanceTerminal(w,content,ribbon);
      if(low.includes('pacote')) enhancePackages(w,content,ribbon);
      if(low.includes('docker')) enhanceDocker(w,content,ribbon);
      if(low.includes('log')) enhanceLogs(w,content,ribbon);
    });
  }
  function xtermTextarea(w){return $('.xterm-helper-textarea',w)||$('textarea',w)}
  function fireKey(w,key,opts={}){const t=xtermTextarea(w);if(!t)return; t.focus(); t.dispatchEvent(new KeyboardEvent('keydown',{key,code:opts.code||'',ctrlKey:!!opts.ctrl,shiftKey:!!opts.shift,altKey:!!opts.alt,bubbles:true,cancelable:true}));t.dispatchEvent(new KeyboardEvent('keyup',{key,code:opts.code||'',ctrlKey:!!opts.ctrl,shiftKey:!!opts.shift,altKey:!!opts.alt,bubbles:true,cancelable:true}))}
  function enhanceTerminal(w,content,ribbon){const right=$('.aws-app-ribbon-right',ribbon);right.insertAdjacentHTML('afterbegin',`<button class="aws-ribbon-button" data-term-copy>${icon('copy')}Copiar</button><button class="aws-ribbon-button" data-term-paste>${icon('paste')}Colar</button><button class="aws-ribbon-button" data-term-full>${icon('maximize')}Tela cheia</button>`);const macros=document.createElement('div');macros.className='aws-terminal-macros';macros.innerHTML='<button data-k="Escape">ESC</button><button data-k="Tab">TAB</button><button data-c="c">Ctrl+C</button><button data-c="d">Ctrl+D</button><button data-c="z">Ctrl+Z</button><button data-k="ArrowUp">↑</button><button data-k="ArrowDown">↓</button><button data-k="ArrowLeft">←</button><button data-k="ArrowRight">→</button><button data-k="Enter">ENTER</button>';ribbon.after(macros);$('[data-term-copy]',ribbon)?.addEventListener('click',()=>fireKey(w,'c',{ctrl:true,shift:true}));$('[data-term-paste]',ribbon)?.addEventListener('click',async()=>{try{const txt=await navigator.clipboard.readText();const t=xtermTextarea(w);if(t){t.focus();const dt=new DataTransfer();dt.setData('text/plain',txt);t.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}))}}catch(_){fireKey(w,'v',{ctrl:true,shift:true})}});$('[data-term-full]',ribbon)?.addEventListener('click',()=>w.classList.toggle('aws-fullscreen'));$$('[data-k]',macros).forEach(b=>b.addEventListener('click',()=>fireKey(w,b.dataset.k)));$$('[data-c]',macros).forEach(b=>b.addEventListener('click',()=>fireKey(w,b.dataset.c,{ctrl:true})))}
  function enhancePackages(w,content,ribbon){
    const left=$('.aws-app-ribbon-left',ribbon);left.insertAdjacentHTML('beforeend','<span class="aws-ribbon-pill">Catálogo de Aplicativos</span>');
    const search=document.createElement('input');search.placeholder='Pesquisar pacote...';search.style.maxWidth='220px';$('.aws-app-ribbon-right',ribbon).prepend(search);
    const filters=document.createElement('div');filters.className='aws-terminal-macros aws-package-filters';filters.innerHTML='<button class="aws-state ok" data-pkg-cat="all">Todos</button><button data-pkg-cat="db">Bancos de Dados</button><button data-pkg-cat="dev">Desenvolvimento</button><button data-pkg-cat="containers">Containers & Docker</button><button data-pkg-cat="web">Rede & Web</button><button data-pkg-cat="research">IA & Pesquisa</button>';ribbon.after(filters);
    const items=()=>{const rows=$$('.row',content).filter(x=>!x.closest('.aws-app-ribbon')&&!x.closest('.aws-package-filters'));return rows.length?rows:Array.from(content.children).filter(x=>x!==ribbon&&x!==filters)};
    let cat='all';
    const matchCat=(txt,c)=>c==='all'||(c==='db'&&/postgres|redis|maria|sqlite|database|banco/i.test(txt))||(c==='dev'&&/python|pip|git|node|npm|vim|nano|code/i.test(txt))||(c==='containers'&&/docker|container|compose/i.test(txt))||(c==='web'&&/nginx|curl|wget|network|web/i.test(txt))||(c==='research'&&/jupyter|python|numpy|scipy|ml|ia|notebook/i.test(txt));
    const apply=()=>{const q=search.value.toLowerCase().trim();items().forEach(el=>{const t=el.textContent||'';el.style.display=((!q||t.toLowerCase().includes(q))&&matchCat(t,cat))?'':'none'})};
    search.addEventListener('input',apply);$$('[data-pkg-cat]',filters).forEach(b=>b.addEventListener('click',()=>{cat=b.dataset.pkgCat;$$('[data-pkg-cat]',filters).forEach(x=>x.classList.toggle('aws-state',x===b));apply()}));
  }
  function enhanceDocker(w,content,ribbon){api('/api/docker').then(d=>{const containers=d.containers||[],running=containers.filter(c=>String(c.state||c.status||'').toLowerCase().includes('running')||String(c.status||'').toLowerCase().startsWith('up')).length;$('.aws-app-ribbon-right',ribbon)?.insertAdjacentHTML('afterbegin',`<span class="aws-ribbon-pill" style="color:var(--aws-tertiary)">${running} ativos / ${containers.length} total</span>`)}).catch(()=>{})}
  function enhanceLogs(w,content,ribbon){const right=$('.aws-app-ribbon-right',ribbon);right?.insertAdjacentHTML('afterbegin',`<button class="aws-ribbon-button" data-log-refresh>${icon('refresh')}Atualizar</button>`);$('[data-log-refresh]',ribbon)?.addEventListener('click',()=>{w.dataset.awsEnhanced='';const existing=$('.aws-app-ribbon',content);if(existing)existing.remove();const orig=$$('.window-head button',w).find(b=>/refresh|atual/i.test(b.title||b.textContent||''));if(orig)orig.click();setTimeout(enhanceWindows,100)})}

  function initEvents(){
    document.addEventListener('click',e=>{const p=e.target.closest('[data-aws-path]');if(p&&p.closest('#aws-shell')){e.preventDefault();navigate(p.dataset.awsPath)}});
    $('#aws-menu-btn').addEventListener('click',()=>document.body.classList.toggle('aws-menu-open'));$('#aws-scrim').addEventListener('click',closeMenu);$('#aws-search-btn').addEventListener('click',openPalette);$('#aws-palette').addEventListener('click',e=>{if(e.target===$('#aws-palette'))closePalette()});$('#aws-palette-input').addEventListener('input',e=>renderPalette(e.target.value));$('#aws-palette-input').addEventListener('keydown',e=>{if(e.key==='Enter'){const a=$('.aws-palette-item.active');if(a)activatePalette(a.dataset.paletteId)}});$('#aws-notify-btn').addEventListener('click',()=>$('#aws-notifications').classList.toggle('open'));$('#aws-dialog-x').addEventListener('click',()=>$('#aws-dialog').classList.remove('open'));$('#aws-dialog-close').addEventListener('click',()=>$('#aws-dialog').classList.remove('open'));
    window.addEventListener('keydown',e=>{const target=e.target;const typing=target&&(['INPUT','TEXTAREA','SELECT'].includes(target.tagName)||target.isContentEditable||target.classList?.contains('xterm-helper-textarea'));if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!typing){e.preventDefault();openPalette()}if(e.altKey&&e.key.toLowerCase()==='t'&&!typing){e.preventDefault();navigate('terminal-web')}if(e.key==='Escape'){closePalette();$('#aws-dialog').classList.remove('open');$('#aws-notifications').classList.remove('open');closeMenu()}});
    const mo=new MutationObserver(()=>enhanceWindows());mo.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  }
  function boot(){document.documentElement.classList.add('aws-v3');document.body.insertAdjacentHTML('beforeend',shellMarkup());initEvents();renderPalette();renderDashboard().catch(e=>{$('#aws-main').innerHTML=`<div class="aws-dashboard"><div class="aws-section aws-empty">${esc(e.message)}</div></div>`});/* PIBIC hotfix: full Dashboard auto-render removido; dados nao devem destruir/recriar a view por timer. */enhanceWindows();toast('Alpine Workspace UI v3 carregada.');}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
