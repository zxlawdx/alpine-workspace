(() => {
  'use strict';
  if (window.__ALPINE_WS_V4__) return;
  window.__ALPINE_WS_V4__ = true;

  const VERSION = '4.1.0';
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtBytes = value => {
    let n = Number(value || 0);
    const units = ['B','KiB','MiB','GiB','TiB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i ? (n >= 10 ? 1 : 2) : 0)} ${units[i]}`;
  };
  const fmtUptime = value => {
    let s = Math.max(0, Number(value || 0));
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60);
    return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m`;
  };
  const clamp = n => Math.max(0, Math.min(100, Number(n || 0)));

  function icon(name) {
    const paths = {
      refresh:'<path d="M20 6v5h-5M4 18v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.5-2.6L20 11M4 13l2.4 4.6A7 7 0 0 0 17.9 15"/>',
      terminal:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12 15h5"/>',
      code:'<path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/>',
      folder:'<path d="M3 6h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
      docker:'<rect x="3" y="10" width="5" height="4"/><rect x="9.5" y="10" width="5" height="4"/><rect x="9.5" y="5" width="5" height="4"/><rect x="16" y="10" width="5" height="4"/><path d="M3 16c2.5 4 13 5 18-1"/>',
      package:'<path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 17l8 4 8-4"/>',
      info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
      network:'<circle cx="5" cy="12" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="m7 11 10-4M7 13l10 4"/>',
      users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
      disk:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h.01M11 15h6"/>',
      cpu:'<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/>',
      play:'<path d="m8 5 11 7-11 7z"/>',
    };
    return `<svg class="aws-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
  }

  let currentPath = 'dashboard';
  let dashboardTimer = null;
  let processTimer = null;
  let sessionRecovery = null;

  async function recoverSession() {
    if (!sessionRecovery) {
      sessionRecovery = fetch('/', {credentials:'same-origin', cache:'no-store'})
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); })
        .finally(() => { sessionRecovery = null; });
    }
    return sessionRecovery;
  }

  async function apiGet(path, retry=true) {
    let response = await fetch(path, {
      method:'GET',
      credentials:'same-origin',
      cache:'no-store',
      headers:{Accept:'application/json'},
    });
    if (response.status === 401 && retry) {
      await recoverSession();
      response = await fetch(path, {
        method:'GET', credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json'},
      });
    }
    let data = null;
    try { data = await response.json(); } catch (_) { data = null; }
    if (!response.ok || data?.ok === false) {
      const message = data?.error?.message || data?.detail?.message || data?.detail || `HTTP ${response.status}`;
      throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
    }
    return data || {};
  }

  function systemOf(data) { return data?.system || data?.metrics || data?.data?.system || data?.data?.metrics || data || {}; }
  function servicesOf(data) { return Array.isArray(data) ? data : (data?.services || data?.data?.services || []); }
  function dockerOf(data) { return data?.docker || data?.data?.docker || data || {}; }
  function isRunning(service) { return service?.running === true || String(service?.status || '').toLowerCase() === 'running'; }
  function main() { return $('#aws-main'); }

  function setActive(path) {
    currentPath = path;
    $$('.aws-nav-item').forEach(item => item.classList.toggle('active', item.dataset.awsPath === path));
    document.body.classList.remove('aws-menu-open');
  }

  function pageHeader(title, subtitle, actions='') {
    return `<div class="aws-page-head"><div><h1 class="aws-page-title">${esc(title)}</h1><p class="aws-page-subtitle">${esc(subtitle)}</p></div><div class="aws-page-actions">${actions}</div></div>`;
  }

  function refreshButton(id='v4-refresh') {
    return `<button class="aws-v4-button" type="button" id="${id}">${icon('refresh')}Atualizar</button>`;
  }

  function errorBlock(error) {
    return `<div class="aws-v4-error">${esc(error?.message || error || 'Falha ao carregar informações.')}</div>`;
  }

  function updateHeader(system) {
    const host = system.hostname || 'ssh-configuration';
    const cpu = clamp(system.cpu_percent);
    const ram = clamp(system.memory?.percent);
    const hostEl = $('#aws-header-host'); if (hostEl) hostEl.textContent = host;
    const cli = $('#aws-cli-user'); if (cli) cli.textContent = `law@${host}:~$`;
    const cpuEl = $('#aws-head-cpu'); if (cpuEl) cpuEl.textContent = `${cpu.toFixed(0)}%`;
    const ramEl = $('#aws-head-ram'); if (ramEl) ramEl.textContent = `${ram.toFixed(0)}%`;
    const cpuBar = $('#aws-head-cpu-bar'); if (cpuBar) cpuBar.style.width = `${Math.max(2,cpu)}%`;
    const ramBar = $('#aws-head-ram-bar'); if (ramBar) ramBar.style.width = `${Math.max(2,ram)}%`;
    const version = $('#aws-version'); if (version) version.textContent = `v${VERSION}`;
  }

  function metricCard(label, idValue, idSub, idBar, kind, command) {
    return `<article class="aws-v4-card"><div class="muted">${esc(label)}</div><div class="big" id="${idValue}">--</div><div class="muted aws-v4-code" id="${idSub}">carregando</div><div class="aws-v4-meter ${kind || ''}"><span id="${idBar}" style="width:0%"></span></div><div class="muted aws-v4-code">${esc(command)}</div></article>`;
  }

  async function renderDashboard() {
    setActive('dashboard');
    const root = main();
    root.innerHTML = `<div class="aws-page">
      ${pageHeader('Dashboard','Estado real da VM Alpine, atualizado sem recarregar a interface.', refreshButton('v4-dashboard-refresh'))}
      <section class="aws-v4-grid">
        ${metricCard('CPU','v4-cpu','v4-cpu-sub','v4-cpu-bar','','cat /proc/stat')}
        ${metricCard('Memória RAM','v4-ram','v4-ram-sub','v4-ram-bar','ram','cat /proc/meminfo')}
        ${metricCard('Armazenamento /','v4-disk','v4-disk-sub','v4-disk-bar','disk','df -h /')}
        ${metricCard('Uptime / Load','v4-uptime','v4-load','v4-load-bar','','uptime')}
      </section>
      <section class="aws-v4-section"><div class="aws-v4-section-head"><div><h2>Host</h2><small>Informações do sistema operacional</small></div><span class="aws-v4-pill ok"><span class="aws-v4-dot ok"></span>Workspace local</span></div><div class="aws-v4-body"><div class="aws-v4-kv" id="v4-host-kv"></div></div></section>
      <section class="aws-v4-section"><div class="aws-v4-section-head"><div><h2>Serviços OpenRC</h2><small>Resumo dos serviços detectados</small></div><span class="aws-v4-pill" id="v4-service-count">--</span></div><div class="aws-v4-list" id="v4-services"><div class="aws-v4-empty">Carregando...</div></div></section>
      <section class="aws-v4-section"><div class="aws-v4-section-head"><div><h2>Docker</h2><small>Daemon e containers</small></div><button class="aws-v4-button" data-v4-open="docker">${icon('docker')}Abrir Docker</button></div><div class="aws-v4-body" id="v4-docker">Carregando...</div></section>
    </div>`;
    $('#v4-dashboard-refresh')?.addEventListener('click', () => refreshDashboard(true));
    $('#v4-docker')?.addEventListener('click', () => {});
    await refreshDashboard(true);
  }

  async function refreshDashboard(includeLists=false) {
    if (currentPath !== 'dashboard') return;
    try {
      const system = systemOf(await apiGet('/api/system'));
      updateHeader(system);
      const cpu = clamp(system.cpu_percent), ram = clamp(system.memory?.percent), disk = clamp(system.disk?.percent);
      const load = Array.isArray(system.load_average) ? system.load_average : [];
      $('#v4-cpu').textContent = `${cpu.toFixed(1)}%`;
      $('#v4-cpu-sub').textContent = `${system.vcpus || 1} vCPU · ${system.architecture || '—'}`;
      $('#v4-cpu-bar').style.width = `${cpu}%`;
      $('#v4-ram').textContent = `${ram.toFixed(1)}%`;
      $('#v4-ram-sub').textContent = `${fmtBytes(system.memory?.used)} / ${fmtBytes(system.memory?.total)} · livre ${fmtBytes(system.memory?.available)}`;
      $('#v4-ram-bar').style.width = `${ram}%`;
      $('#v4-disk').textContent = `${disk.toFixed(1)}%`;
      $('#v4-disk-sub').textContent = `${fmtBytes(system.disk?.used)} / ${fmtBytes(system.disk?.total)} · livre ${fmtBytes(system.disk?.free)}`;
      $('#v4-disk-bar').style.width = `${disk}%`;
      $('#v4-uptime').textContent = fmtUptime(system.uptime_seconds);
      $('#v4-load').textContent = `load ${load.join(' · ') || '—'}`;
      $('#v4-load-bar').style.width = `${clamp((Number(load[0] || 0) / Math.max(1, Number(system.vcpus || 1))) * 100)}%`;
      $('#v4-host-kv').innerHTML = [
        ['Hostname',system.hostname],['Sistema',system.os],['Versão',system.version || '—'],['Kernel',system.kernel],
        ['Arquitetura',system.architecture],['Workspace','127.0.0.1:8765'],['Acesso','SSH local forward'],['Atualizado',new Date().toLocaleTimeString()],
      ].map(([k,v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('');
    } catch (error) {
      const host = $('#v4-host-kv'); if (host) host.innerHTML = `<span>Erro</span><span>${esc(error.message)}</span>`;
      return;
    }

    if (!includeLists && $('#v4-services')?.dataset.loaded === '1') return;
    const [servicesResult,dockerResult,containersResult] = await Promise.allSettled([
      apiGet('/api/services'), apiGet('/api/docker'), apiGet('/api/docker/containers'),
    ]);
    if (currentPath !== 'dashboard') return;

    if (servicesResult.status === 'fulfilled') {
      const services = servicesOf(servicesResult.value);
      const running = services.filter(isRunning).length;
      $('#v4-service-count').textContent = `${running} ativos / ${services.length}`;
      const box = $('#v4-services'); box.dataset.loaded = '1';
      box.innerHTML = services.slice(0,10).map(service => {
        const on = isRunning(service);
        return `<div class="aws-v4-row"><div class="aws-v4-row-main"><span class="aws-v4-dot ${on?'ok':''}"></span><div class="aws-v4-row-copy"><strong>${esc(service.name)}</strong><small>rc-service ${esc(service.name)} status</small></div></div><span class="aws-v4-pill ${on?'ok':''}">${esc(service.status || 'unknown')}</span></div>`;
      }).join('') || '<div class="aws-v4-empty">Nenhum serviço detectado.</div>';
    }

    const dockerBox = $('#v4-docker');
    if (dockerResult.status === 'fulfilled') {
      const info = dockerOf(dockerResult.value);
      const containers = containersResult.status === 'fulfilled' ? (containersResult.value.containers || []) : [];
      const running = containers.filter(c => String(c.state || '').toLowerCase() === 'running').length;
      dockerBox.innerHTML = info.installed === false
        ? '<span class="aws-v4-pill">Docker não instalado</span>'
        : `<div class="aws-v4-kv"><span>Daemon</span><span>${info.daemon ? 'online' : 'indisponível'}</span><span>Containers</span><span>${running} ativos / ${containers.length} total</span><span>Versão</span><span>${esc(info.server_version || '—')}</span></div>`;
    } else dockerBox.innerHTML = errorBlock(dockerResult.reason);
  }

  async function renderSystem() {
    setActive('sistema');
    const root = main();
    root.innerHTML = `<div class="aws-page">${pageHeader('Sistema & Risco','Resumo do Alpine e sinais de exposição de rede.',refreshButton())}<div id="v4-system-body" class="aws-v4-loading">Carregando...</div></div>`;
    const load = async () => {
      try {
        const [systemData,networkData] = await Promise.all([apiGet('/api/system'),apiGet('/api/system/network')]);
        const s = systemOf(systemData), ports = networkData.listening_ports || [];
        const exposed = ports.filter(p => /0\.0\.0\.0:|\[::\]:|\*:/i.test(String(p.local || '')));
        $('#v4-system-body').className = '';
        $('#v4-system-body').innerHTML = `<section class="aws-v4-grid">
          <div class="aws-v4-card"><div class="muted">CPU</div><div class="big">${clamp(s.cpu_percent).toFixed(1)}%</div><div class="muted">${s.vcpus} vCPU</div></div>
          <div class="aws-v4-card"><div class="muted">RAM</div><div class="big">${clamp(s.memory?.percent).toFixed(1)}%</div><div class="muted">${fmtBytes(s.memory?.used)} / ${fmtBytes(s.memory?.total)}</div></div>
          <div class="aws-v4-card"><div class="muted">Disco</div><div class="big">${clamp(s.disk?.percent).toFixed(1)}%</div><div class="muted">${fmtBytes(s.disk?.free)} livres</div></div>
          <div class="aws-v4-card"><div class="muted">Sockets amplos</div><div class="big">${exposed.length}</div><div class="muted">Escutando em wildcard; isso não significa acesso pela Internet.</div></div>
        </section>
        <section class="aws-v4-section"><div class="aws-v4-section-head"><div><h2>Identidade do host</h2><small>Leitura local</small></div></div><div class="aws-v4-body"><div class="aws-v4-kv">${[
          ['Hostname',s.hostname],['Sistema',s.os],['Versão',s.version],['Kernel',s.kernel],['Arquitetura',s.architecture],['Uptime',fmtUptime(s.uptime_seconds)],['Workspace','127.0.0.1:8765'],['Modelo de acesso','SSH local forward'],
        ].map(([k,v])=>`<span>${esc(k)}</span><span>${esc(v || '—')}</span>`).join('')}</div></div></section>
        <div class="aws-v4-note">O Workspace continua preso ao <code>127.0.0.1:8765</code>. A lista de portas abaixo é observacional; esta tela não abre, fecha ou reconfigura firewall, SSH, DNS, interfaces ou ZeroTier.</div>
        <section class="aws-v4-section"><div class="aws-v4-section-head"><div><h2>Portas em escuta</h2><small>${ports.length} socket(s) detectado(s)</small></div></div>${portsTable(ports)}</section>`;
      } catch (error) { $('#v4-system-body').className=''; $('#v4-system-body').innerHTML=errorBlock(error); }
    };
    $('#v4-refresh')?.addEventListener('click',load); await load();
  }

  function portsTable(ports) {
    if (!ports.length) return '<div class="aws-v4-empty">Nenhuma porta retornada; o utilitário ss pode não estar disponível.</div>';
    return `<div class="aws-v4-table-wrap"><table class="aws-v4-table"><thead><tr><th>Proto</th><th>Estado</th><th>Endereço local</th></tr></thead><tbody>${ports.map(p=>`<tr><td>${esc(p.protocol)}</td><td>${esc(p.state)}</td><td class="aws-v4-code">${esc(p.local)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  async function renderProcesses() {
    setActive('processos');
    const root = main();
    root.innerHTML = `<div class="aws-page">${pageHeader('Processos','Processos ordenados pelo maior consumo de memória RSS.',refreshButton())}<section class="aws-v4-section"><div class="aws-v4-table-wrap" id="v4-process-table"><div class="aws-v4-loading">Carregando...</div></div></section></div>`;
    const load = async () => {
      try {
        const data = await apiGet('/api/system/processes?limit=50');
        const rows = data.processes || [];
        $('#v4-process-table').innerHTML = `<table class="aws-v4-table"><thead><tr><th>PID</th><th>Processo</th><th>UID</th><th>RSS</th><th>Comando</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${p.pid}</td><td>${esc(p.name)}</td><td>${p.uid ?? '—'}</td><td>${fmtBytes(p.rss)}</td><td class="aws-v4-code">${esc(p.command)}</td></tr>`).join('')}</tbody></table>`;
      } catch (error) { $('#v4-process-table').innerHTML=errorBlock(error); }
    };
    $('#v4-refresh')?.addEventListener('click',load); await load();
    clearInterval(processTimer); processTimer = setInterval(()=>{ if(currentPath==='processos') load(); },7000);
  }

  async function renderStorage() {
    setActive('armazenamento');
    const root=main();
    root.innerHTML=`<div class="aws-page">${pageHeader('Armazenamento & Disco','Mounts reais visíveis para o processo do Workspace.',refreshButton())}<section class="aws-v4-section"><div id="v4-storage"><div class="aws-v4-loading">Carregando...</div></div></section></div>`;
    const load=async()=>{try{const d=await apiGet('/api/system/storage');const mounts=d.mounts||[];$('#v4-storage').innerHTML=mounts.length?`<div class="aws-v4-table-wrap"><table class="aws-v4-table"><thead><tr><th>Mount</th><th>Origem</th><th>FS</th><th>Uso</th><th>Usado</th><th>Total</th><th>Livre</th></tr></thead><tbody>${mounts.map(x=>`<tr><td class="aws-v4-code">${esc(x.mountpoint)}</td><td class="aws-v4-code">${esc(x.source)}</td><td>${esc(x.fstype)}</td><td>${x.percent}%</td><td>${fmtBytes(x.used)}</td><td>${fmtBytes(x.total)}</td><td>${fmtBytes(x.free)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="aws-v4-empty">Nenhum mount retornado.</div>'}catch(e){$('#v4-storage').innerHTML=errorBlock(e)}};
    $('#v4-refresh')?.addEventListener('click',load);await load();
  }

  async function renderNetwork() {
    setActive('rede');
    const root=main();
    root.innerHTML=`<div class="aws-page">${pageHeader('Rede','Interfaces, endereços, rotas e portas em modo somente leitura.',refreshButton())}<div id="v4-network"><div class="aws-v4-loading">Carregando...</div></div></div>`;
    const load=async()=>{try{const d=await apiGet('/api/system/network');const interfaces=d.interfaces||[],routes=d.routes||[],ports=d.listening_ports||[];$('#v4-network').innerHTML=`
      <section class="aws-v4-section"><div class="aws-v4-section-head"><div><h2>Interfaces</h2><small>${interfaces.length} interface(s)</small></div><span class="aws-v4-pill">DNS: ${esc((d.dns_servers||[]).join(', ')||'—')}</span></div><div class="aws-v4-list">${interfaces.map(i=>`<div class="aws-v4-row"><div class="aws-v4-row-main"><span class="aws-v4-dot ${i.state==='up'?'ok':''}"></span><div class="aws-v4-row-copy"><strong>${esc(i.name)} · ${esc(i.state)}</strong><small>${esc((i.addresses||[]).map(a=>a.address).join(' · ')||'sem endereço')} · MTU ${i.mtu||'—'} · MAC ${esc(i.mac||'—')}</small></div></div><span class="aws-v4-pill">RX ${fmtBytes(i.rx_bytes)} · TX ${fmtBytes(i.tx_bytes)}</span></div>`).join('')||'<div class="aws-v4-empty">Nenhuma interface.</div>'}</div></section>
      <section class="aws-v4-section"><div class="aws-v4-section-head"><div><h2>Rotas</h2><small>Tabela de roteamento</small></div></div><div class="aws-v4-table-wrap"><table class="aws-v4-table"><thead><tr><th>Destino</th><th>Gateway</th><th>Interface</th><th>Origem</th><th>Protocolo</th></tr></thead><tbody>${routes.map(r=>`<tr><td class="aws-v4-code">${esc(r.dst)}</td><td class="aws-v4-code">${esc(r.gateway||'—')}</td><td>${esc(r.dev)}</td><td class="aws-v4-code">${esc(r.prefsrc||'—')}</td><td>${esc(r.protocol||'—')}</td></tr>`).join('')}</tbody></table></div></section>
      <section class="aws-v4-section"><div class="aws-v4-section-head"><div><h2>Portas em escuta</h2><small>Somente observação</small></div></div>${portsTable(ports)}</section>`}catch(e){$('#v4-network').innerHTML=errorBlock(e)}};
    $('#v4-refresh')?.addEventListener('click',load);await load();
  }

  async function renderUsers() {
    setActive('usuarios');
    const root=main();
    root.innerHTML=`<div class="aws-page">${pageHeader('Usuários','Contas locais lidas de /etc/passwd. Esta tela não altera senhas ou permissões.',refreshButton())}<section class="aws-v4-section"><div id="v4-users"><div class="aws-v4-loading">Carregando...</div></div></section></div>`;
    const load=async()=>{try{const d=await apiGet('/api/system/users');const users=d.users||[];$('#v4-users').innerHTML=`<div class="aws-v4-table-wrap"><table class="aws-v4-table"><thead><tr><th>Usuário</th><th>UID</th><th>GID</th><th>Home</th><th>Shell</th><th>Tipo</th></tr></thead><tbody>${users.map(u=>`<tr><td>${esc(u.name)} ${u.active?'<span class="aws-v4-pill ok">ativo</span>':''}</td><td>${u.uid}</td><td>${u.gid}</td><td class="aws-v4-code">${esc(u.home)}</td><td class="aws-v4-code">${esc(u.shell||'—')}</td><td>${u.uid===0?'root':u.system?'sistema':u.interactive?'interativo':'serviço'}</td></tr>`).join('')}</tbody></table></div>`}catch(e){$('#v4-users').innerHTML=errorBlock(e)}};
    $('#v4-refresh')?.addEventListener('click',load);await load();
  }

  async function renderSsh() {
    setActive('acesso-ssh');
    const root=main();
    root.innerHTML=`<div class="aws-page">${pageHeader('Acesso SSH','Diagnóstico somente leitura do caminho usado para chegar ao Workspace.',refreshButton())}<div id="v4-ssh"><div class="aws-v4-loading">Carregando...</div></div></div>`;
    const load=async()=>{try{const [sdata,ndata]=await Promise.all([apiGet('/api/system'),apiGet('/api/system/network')]);const s=systemOf(sdata),ports=ndata.listening_ports||[],ssh=ports.filter(p=>/:22$/.test(String(p.local||'')));$('#v4-ssh').innerHTML=`<section class="aws-v4-grid"><div class="aws-v4-card"><div class="muted">Host</div><div class="big">${esc(s.hostname)}</div><div class="muted">${esc(s.os)}</div></div><div class="aws-v4-card"><div class="muted">SSH :22</div><div class="big">${ssh.length?'Detectado':'Não visto'}</div><div class="muted">${esc(ssh.map(x=>x.local).join(' · ')||'ss não retornou listener :22')}</div></div><div class="aws-v4-card"><div class="muted">Workspace</div><div class="big">8765</div><div class="muted">127.0.0.1 somente</div></div><div class="aws-v4-card"><div class="muted">Forward usado no celular</div><div class="big">18765</div><div class="muted aws-v4-code">18765 → 127.0.0.1:8765</div></div></section><div class="aws-v4-note">Comando típico do cliente: <code>ssh -N -L 18765:127.0.0.1:8765 USUARIO@IP_ZEROTIER</code>. Esta página não edita <code>sshd_config</code> nem reinicia o SSH.</div>`}catch(e){$('#v4-ssh').innerHTML=errorBlock(e)}};
    $('#v4-refresh')?.addEventListener('click',load);await load();
  }

  async function renderPrivateNetwork() {
    setActive('rede-privada');
    const root=main();
    root.innerHTML=`<div class="aws-page">${pageHeader('Rede Privada (VPN)','Estado observado das interfaces; nenhuma rota ou configuração é alterada.',refreshButton())}<div id="v4-vpn"><div class="aws-v4-loading">Carregando...</div></div></div>`;
    const load=async()=>{try{const d=await apiGet('/api/system/network');const zt=(d.interfaces||[]).filter(i=>/^zt/i.test(i.name));$('#v4-vpn').innerHTML=zt.length?`<section class="aws-v4-section"><div class="aws-v4-section-head"><div><h2>Interfaces ZeroTier detectadas</h2><small>Leitura do kernel</small></div></div><div class="aws-v4-list">${zt.map(i=>`<div class="aws-v4-row"><div class="aws-v4-row-main"><span class="aws-v4-dot ${i.state==='up'?'ok':''}"></span><div class="aws-v4-row-copy"><strong>${esc(i.name)} · ${esc(i.state)}</strong><small>${esc((i.addresses||[]).map(a=>a.address).join(' · ')||'sem endereço')}</small></div></div><span class="aws-v4-pill">RX ${fmtBytes(i.rx_bytes)} · TX ${fmtBytes(i.tx_bytes)}</span></div>`).join('')}</div></section>`:'<div class="aws-v4-note">Nenhuma interface com prefixo <code>zt</code> foi detectada. Isso não instala, inicia ou reconfigura ZeroTier.</div>'}catch(e){$('#v4-vpn').innerHTML=errorBlock(e)}};
    $('#v4-refresh')?.addEventListener('click',load);await load();
  }

  function renderProxmox() {
    setActive('proxmox-cluster');
    main().innerHTML=`<div class="aws-page">${pageHeader('Proxmox (Cluster)','O cluster continua separado deste Workspace.')}<section class="aws-v4-section"><div class="aws-v4-body"><div class="aws-v4-note">O acesso administrativo ao Proxmox permanece no aplicativo local PIBIC LAB por um forward SSH separado. O Alpine Workspace não armazena credenciais globais do cluster e não abre a porta 8006 diretamente.</div></div></section></div>`;
  }

  function legacyPage(path, appId, title, subtitle) {
    setActive(path);
    main().innerHTML=`<div class="aws-page">${pageHeader(title,subtitle,`<button class="aws-v4-button primary" data-v4-open="${appId}">${icon('play')}Abrir aplicativo</button>`)}<section class="aws-v4-section"><div class="aws-v4-body"><div class="aws-v4-note">Este módulo usa o aplicativo funcional já existente do Workspace. Ele será aberto em uma janela sobre esta área, preservando as funções reais do backend.</div></div></section></div>`;
    openLegacy(appId);
  }

  function openLegacy(appId) {
    const button = $(`#desktop-area [data-app="${CSS.escape(appId)}"]`);
    if (!button) return;
    button.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
    requestAnimationFrame(()=>{
      const windows=$$('#window-layer .app-window');
      const target=[...windows].reverse().find(w=>w.dataset.app===appId) || windows.at(-1);
      if(target){target.classList.remove('minimized');target.style.zIndex='9001';}
    });
  }

  const routes = {
    dashboard:renderDashboard,
    sistema:renderSystem,
    processos:renderProcesses,
    armazenamento:renderStorage,
    rede:renderNetwork,
    usuarios:renderUsers,
    'pacotes-apk':()=>legacyPage('pacotes-apk','packages','Pacotes APK','Catálogo seguro com allowlist e jobs do backend.'),
    'terminal-web':()=>legacyPage('terminal-web','terminal','Terminal Web & SSH','PTY real da VM com xterm.js e atalhos de clipboard.'),
    codigo:()=>legacyPage('codigo','code','Código','Editor local da VM com salvar, executar e terminal integrado.'),
    'docker-containers':()=>legacyPage('docker-containers','docker','Docker & Containers','Gerenciamento do daemon e containers permitido pelo backend.'),
    'servicos-openrc':()=>legacyPage('servicos-openrc','services','Serviços OpenRC','Serviços protegidos continuam somente leitura.'),
    arquivos:()=>legacyPage('arquivos','files','Arquivos','Gerenciador de arquivos da VM com operações controladas.'),
    'acesso-ssh':renderSsh,
    'proxmox-cluster':renderProxmox,
    'rede-privada':renderPrivateNetwork,
    'catalogo-aplicativos':()=>legacyPage('catalogo-aplicativos','packages','Catálogo de Apps','Aplicativos permitidos para o ambiente Alpine.'),
    'logs-centralizados':()=>legacyPage('logs-centralizados','logs','Logs Centralizados','Visualização dos logs permitidos pelo Workspace.'),
    configuracoes:()=>legacyPage('configuracoes','settings','Configurações','Preferências locais de interface, terminal e editor.'),
  };

  function navigate(path) {
    clearInterval(processTimer); processTimer=null;
    const fn=routes[path] || routes.dashboard;
    Promise.resolve(fn()).catch(error=>{const root=main();if(root)root.innerHTML=`<div class="aws-page">${errorBlock(error)}</div>`;});
  }

  function bindGlobalEvents() {
    document.addEventListener('click', event => {
      const open=event.target.closest('[data-v4-open]');
      if(open){event.preventDefault();event.stopImmediatePropagation();openLegacy(open.dataset.v4Open);return;}
      const target=event.target.closest('[data-aws-path]');
      if(!target || !target.closest('#aws-shell')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      navigate(target.dataset.awsPath);
    }, true);
  }

  async function boot() {
    const shell=$('#aws-shell'),root=main();
    if(!shell||!root){setTimeout(boot,50);return;}
    document.documentElement.classList.add('aws-v4');
    bindGlobalEvents();
    try { await apiGet('/api/session'); } catch (_) { }
    await renderDashboard();
    clearInterval(dashboardTimer);
    dashboardTimer=setInterval(()=>{if(currentPath==='dashboard')refreshDashboard(false)},5000);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});
  else setTimeout(boot,0);
})();
