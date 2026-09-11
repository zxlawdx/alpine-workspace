(() => {
  'use strict';
  if (window.__ALPINE_WS_V4__) return;
  window.__ALPINE_WS_V4__ = true;

  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bytes=n=>{n=Number(n||0);const u=['B','KiB','MiB','GiB','TiB'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return `${n.toFixed(i?1:0)} ${u[i]}`};
  const uptime=s=>{s=Number(s||0);const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return d?`${d}d ${h}h ${m}m`:h?`${h}h ${m}m`:`${m}m`};
  let csrf='', session=null, reloadTried=false;

  async function ensureSession(force=false){
    if(session&&!force)return session;
    const r=await fetch('/api/session',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
    if(r.status===401&&!reloadTried){reloadTried=true;location.reload();return new Promise(()=>{})}
    const j=await r.json().catch(()=>({}));
    if(!r.ok||j.ok===false)throw new Error(j?.error?.message||j?.detail||`HTTP ${r.status}`);
    csrf=j.csrf||'';session=j;return j;
  }
  async function api(path,opts={},retry=true){
    await ensureSession();
    const o={...opts,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(opts.headers||{})}};
    const method=String(o.method||'GET').toUpperCase();
    if(o.body&&typeof o.body!=='string'&&!(o.body instanceof FormData)){o.headers['Content-Type']='application/json';o.body=JSON.stringify(o.body)}
    if(['POST','PUT','PATCH','DELETE'].includes(method))o.headers['X-CSRF-Token']=csrf;
    const r=await fetch(path,o);
    if(r.status===401&&retry){session=null;await ensureSession(true);return api(path,opts,false)}
    const j=await r.json().catch(()=>({}));if(!r.ok||j.ok===false)throw new Error(j?.error?.message||j?.detail?.message||j?.detail||`HTTP ${r.status}`);return j;
  }

  function active(path){$$('.aws-nav-item').forEach(b=>b.classList.toggle('active',b.dataset.awsPath===path));document.body.classList.remove('aws-menu-open')}
  function page(title,sub,body){return `<div class="aws-v4-page"><header><h1>${esc(title)}</h1><p>${esc(sub)}</p></header>${body}</div>`}
  function card(label,value,sub=''){return `<article class="aws-v4-card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(sub)}</small></article>`}
  function table(head,rows){return `<div class="aws-v4-table-wrap"><table class="aws-v4-table"><thead><tr>${head.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`}
  function state(ok){return `<span class="aws-state ${ok?'ok':'off'}">${ok?'Ativo':'Parado'}</span>`}

  async function system(){return (await api('/api/system')).system||{}}

  async function hydrate(){
    if($('.aws-nav-item.active')?.dataset.awsPath!=='dashboard')return;
    try{
      const s=await system(),m=s.memory||{},d=s.disk||{},load=s.load_average||[],cpu=Number(s.cpu_percent||0),ram=Number(m.percent||0),disk=Number(d.percent||0),cores=Number(s.vcpus||1);
      $('#aws-header-host')&&($('#aws-header-host').textContent=s.hostname||'alpine');
      $('#aws-head-cpu')&&($('#aws-head-cpu').textContent=`${cpu.toFixed(0)}%`);$('#aws-head-ram')&&($('#aws-head-ram').textContent=`${ram.toFixed(0)}%`);
      $('#aws-head-cpu-bar')&&($('#aws-head-cpu-bar').style.width=`${Math.max(2,cpu)}%`);$('#aws-head-ram-bar')&&($('#aws-head-ram-bar').style.width=`${Math.max(2,ram)}%`);
      $('#aws-cli-user')&&($('#aws-cli-user').textContent=`law@${s.hostname||'alpine'}:~$`);
      const meta=$$('.aws-host-meta .aws-meta strong');if(meta[0])meta[0].textContent=s.hostname||'—';if(meta[2])meta[2].textContent=uptime(s.uptime_seconds);if(meta[3])meta[3].textContent=s.kernel||'—';
      const cards=$$('.aws-metric-card');
      const set=(c,val,sub,p,detail)=>{if(!c)return;$('.aws-metric-value strong',c).textContent=val;$('.aws-metric-value span',c).textContent=sub;$('.aws-progress>span',c).style.width=`${Math.max(0,Math.min(100,p))}%`;$('.aws-metric-detail',c).innerHTML=detail};
      set(cards[0],`${cpu.toFixed(0)}%`,`${cores} vCPU`,cpu,`<span>Arquitetura: <b>${esc(s.architecture||'—')}</b></span><span>Load: <b>${esc(load.join(' · ')||'—')}</b></span>`);
      set(cards[1],`${ram.toFixed(0)}%`,`${bytes(m.used)} / ${bytes(m.total)}`,ram,`<span>Disponível</span><span>${bytes(m.available)}</span>`);
      set(cards[2],`${disk.toFixed(0)}%`,`${bytes(d.used)} / ${bytes(d.total)}`,disk,`<span>/</span><span>${bytes(d.free)} livres</span>`);
      set(cards[3],uptime(s.uptime_seconds),'uptime',Math.min(100,(Number(load[0]||0)/cores)*100),`<span>Load</span><span>${esc(load.join(' · ')||'—')}</span>`);
    }catch(_){ }
  }

  function openApp(id,path){
    active(path);const b=$(`[data-app="${id}"]`);if(!b)return;
    b.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
  }

  async function info(path){
    active(path);const main=$('#aws-main');main.innerHTML=page('Carregando','Consultando a VM em tempo real.','<div class="aws-v4-loading">Carregando…</div>');
    try{
      const s=await system(),net=s.network||{},ssh=s.ssh||{},users=s.users||[],mounts=s.mounts||[],disk=s.disk||{};
      if(path==='sistema')main.innerHTML=page('Sistema & Risco','Estado real do Alpine e proteções do acesso remoto.',`<div class="aws-v4-grid">${card('Sistema',s.os||'Alpine',s.version)}${card('Kernel',s.kernel,s.architecture)}${card('vCPU',s.vcpus,`load ${(s.load_average||[]).join(' · ')}`)}${card('Uptime',uptime(s.uptime_seconds),s.hostname)}</div><section class="aws-v4-panel"><div class="aws-v4-risk"><div><b>Workspace</b><span>127.0.0.1:8765 somente</span></div><div><b>SSH</b><span>porta 22 preservada</span></div><div><b>Rede</b><span>somente leitura nesta tela</span></div><div><b>Privilégios</b><span>ações administrativas por allowlist</span></div></div></section>`);
      else if(path==='processos'){const p=(await api('/api/system/processes?limit=80')).processes||[];main.innerHTML=page('Processos (htop)','Processos reais de /proc, ordenados por memória.',`<section class="aws-v4-panel">${table(['PID','Processo','UID','RSS','Comando'],p.map(x=>`<tr><td>${x.pid}</td><td><b>${esc(x.name)}</b></td><td>${x.uid??'—'}</td><td>${bytes(x.rss)}</td><td><code>${esc(x.command)}</code></td></tr>`))}</section>`)}
      else if(path==='armazenamento')main.innerHTML=page('Armazenamento & Disco','Partições e montagens reais da VM.',`<div class="aws-v4-grid">${card('Root',`${Number(disk.percent||0).toFixed(0)}%`,`${bytes(disk.used)} / ${bytes(disk.total)}`)}${card('Livre',bytes(disk.free),'/')}${card('Montagens',mounts.length,'detectadas')}</div><section class="aws-v4-panel">${table(['Ponto','Dispositivo','FS','Uso','Livre'],mounts.map(x=>`<tr><td><b>${esc(x.mountpoint)}</b></td><td>${esc(x.device)}</td><td>${esc(x.filesystem||'—')}</td><td>${Number(x.percent||0).toFixed(1)}%</td><td>${bytes(x.free)}</td></tr>`))}</section>`);
      else if(path==='rede'){const ifs=net.interfaces||[],routes=net.routes||[],ports=net.listening||[];main.innerHTML=page('Rede (Interfaces & Portas)','Diagnóstico somente leitura.',`<div class="aws-v4-grid">${ifs.map(i=>card(i.name,(i.addresses||[]).map(a=>a.address).join(' · ')||'sem IP',`${i.state} · MTU ${i.mtu??'—'}`)).join('')}</div><section class="aws-v4-panel">${table(['Destino','Gateway','Interface','Origem'],routes.map(r=>`<tr><td>${esc(r.dst||'default')}</td><td>${esc(r.gateway||'—')}</td><td>${esc(r.dev||'—')}</td><td>${esc(r.prefsrc||'—')}</td></tr>`))}</section><section class="aws-v4-panel">${table(['Proto','Estado','Local'],ports.map(p=>`<tr><td>${esc(p.protocol)}</td><td>${esc(p.state)}</td><td><code>${esc(p.local||p.raw)}</code></td></tr>`))}</section>`)}
      else if(path==='usuarios')main.innerHTML=page('Usuários','Contas locais; nenhum hash de senha é exposto.',`<section class="aws-v4-panel">${table(['Usuário','UID','Grupo','Home','Shell'],users.map(u=>`<tr><td><b>${esc(u.name)}</b></td><td>${u.uid}</td><td>${esc(u.group)}</td><td><code>${esc(u.home)}</code></td><td><code>${esc(u.shell)}</code></td></tr>`))}</section>`);
      else if(path==='acesso-ssh')main.innerHTML=page('Acesso SSH','Acesso remoto protegido e somente leitura.',`<div class="aws-v4-grid">${card('sshd',ssh.running?'Ativo':'Não detectado',ssh.openrc_service?'OpenRC presente':'sem script OpenRC')}${card('Porta','22','preservada')}${card('Workspace','127.0.0.1:8765','via SSH Local Forward')}</div><section class="aws-v4-panel"><code>ssh -N -L 18765:127.0.0.1:8765 law@HOST</code></section>`);
      else if(path==='rede-privada'){const z=net.zerotier||{};main.innerHTML=page('Rede Privada (VPN)','ZeroTier em modo diagnóstico; nenhuma rota é alterada.',`<div class="aws-v4-grid">${card('Daemon',z.running?'Executando':'Não detectado',z.daemon||'zerotier-one')}${card('CLI',z.cli?'Disponível':'Ausente',z.cli||'—')}${card('OpenRC',z.openrc_service?'Configurado':'Não detectado','daemon pode estar ativo sem script')}</div>${(z.interfaces||[]).map(i=>`<section class="aws-v4-panel"><b>${esc(i.name)}</b> ${state(String(i.state).toLowerCase()==='up')}<div>${(i.addresses||[]).map(a=>`<code>${esc(a.address)}</code>`).join(' ')}</div></section>`).join('')}`)}
      else if(path==='proxmox-cluster')main.innerHTML=page('Proxmox (Cluster)','O cluster continua separado e é aberto com segurança pelo PIBIC LAB.',`<div class="aws-v4-risk"><div><b>Destino interno</b><span>10.99.0.59:8006</span></div><div><b>Forward</b><span>PIBIC LAB</span></div><div><b>Credenciais</b><span>não ficam nesta VM</span></div><div><b>Workspace</b><span>sem token global do cluster</span></div></div>`);
    }catch(e){main.innerHTML=page('Falha ao carregar',e.message||'Erro inesperado.','<div class="aws-v4-loading">Atualize a página e tente novamente.</div>')}
  }

  const apps={'pacotes-apk':'packages','terminal-web':'terminal','codigo':'code','docker-containers':'docker','servicos-openrc':'services','arquivos':'files','catalogo-aplicativos':'packages','logs-centralizados':'logs','configuracoes':'settings'};
  const infos=new Set(['sistema','processos','armazenamento','rede','usuarios','acesso-ssh','rede-privada','proxmox-cluster']);
  function route(e){const b=e.target.closest('[data-aws-path]');if(!b||!b.closest('#aws-shell'))return;const p=b.dataset.awsPath;if(p==='dashboard'){setTimeout(hydrate,120);return}if(apps[p]||infos.has(p)){e.preventDefault();e.stopImmediatePropagation();apps[p]?openApp(apps[p],p):info(p)}}

  function enhanceWindows(){
    $$('.app-window').forEach(w=>{if(w.dataset.awsV4)return;w.dataset.awsV4='1';const c=$('.window-content',w),t=$('.window-title',w)?.textContent||'Aplicativo';if(!c)return;const r=document.createElement('div');r.className='aws-v4-ribbon';r.innerHTML=`<b>${esc(t)}</b><span>VM local</span>`;c.prepend(r)});
  }

  function install(){
    document.documentElement.classList.add('aws-v4');document.addEventListener('click',route,true);
    const layer=$('#window-layer');if(layer)new MutationObserver(enhanceWindows).observe(layer,{childList:true,subtree:true});
    ensureSession().then(()=>{setTimeout(hydrate,100);setInterval(hydrate,5000)}).catch(()=>{});enhanceWindows();
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',install,{once:true}):install();
})();
