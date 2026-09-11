(() => {
  'use strict';
  if (window.__ALPINE_WS_V4__) return;
  window.__ALPINE_WS_V4__ = true;

  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const bytes=n=>{n=Number(n||0);const u=['B','KiB','MiB','GiB','TiB'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return `${n.toFixed(i?1:0)} ${u[i]}`};
  const uptime=s=>{s=Number(s||0);const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);return d?`${d}d ${h}h ${m}m`:h?`${h}h ${m}m`:`${m}m`};
  let csrf='', session=null, reloadTried=false;

  const WALLPAPER_DB='alpine-workspace-ui';
  const WALLPAPER_STORE='preferences';
  const WALLPAPER_KEY='wallpaper';
  const MAX_WALLPAPER_BYTES=20*1024*1024;

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

  function identity(){
    const username=String(session?.username||'usuário');
    const roleLabel=String(session?.role_label||(Number(session?.uid)===0?'root':'usuário SSH'));
    return {username,roleLabel};
  }
  function setText(el,value){if(el&&el.textContent!==value)el.textContent=value}
  function greeting(){const h=new Date().getHours();return h<12?'Bom dia':h<18?'Boa tarde':'Boa noite'}
  function applyIdentity(hostname=''){
    const {username,roleLabel}=identity();
    const host=hostname||$('#aws-header-host')?.textContent||'alpine';
    setText($('#aws-cli-user'),`${username}@${host}:~$`);
    setText($('.aws-user-copy strong'),username);
    setText($('.aws-user-copy span'),roleLabel);
    setText($('.aws-title'),`${greeting()}, ${username}`);
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
      applyIdentity(s.hostname||'alpine');
      $('#aws-head-cpu')&&($('#aws-head-cpu').textContent=`${cpu.toFixed(0)}%`);$('#aws-head-ram')&&($('#aws-head-ram').textContent=`${ram.toFixed(0)}%`);
      $('#aws-head-cpu-bar')&&($('#aws-head-cpu-bar').style.width=`${Math.max(2,cpu)}%`);$('#aws-head-ram-bar')&&($('#aws-head-ram-bar').style.width=`${Math.max(2,ram)}%`);
      const meta=$$('.aws-host-meta .aws-meta strong');if(meta[0])meta[0].textContent=s.hostname||'—';if(meta[2])meta[2].textContent=uptime(s.uptime_seconds);if(meta[3])meta[3].textContent=s.kernel||'—';
      const cards=$$('.aws-metric-card');
      const set=(c,val,sub,p,detail)=>{if(!c)return;$('.aws-metric-value strong',c).textContent=val;$('.aws-metric-value span',c).textContent=sub;$('.aws-progress>span',c).style.width=`${Math.max(0,Math.min(100,p))}%`;$('.aws-metric-detail',c).innerHTML=detail};
      set(cards[0],`${cpu.toFixed(0)}%`,`${cores} vCPU`,cpu,`<span>Arquitetura: <b>${esc(s.architecture||'—')}</b></span><span>Load: <b>${esc(load.join(' · ')||'—')}</b></span>`);
      set(cards[1],`${ram.toFixed(0)}%`,`${bytes(m.used)} / ${bytes(m.total)}`,ram,`<span>Disponível</span><span>${bytes(m.available)}</span>`);
      set(cards[2],`${disk.toFixed(0)}%`,`${bytes(d.used)} / ${bytes(d.total)}`,disk,`<span>/</span><span>${bytes(d.free)} livres</span>`);
      set(cards[3],uptime(s.uptime_seconds),'uptime',Math.min(100,(Number(load[0]||0)/cores)*100),`<span>Load</span><span>${esc(load.join(' · ')||'—')}</span>`);
    }catch(_){ }
  }

  async function info(path){
    active(path);const main=$('#aws-main');main.innerHTML=page('Carregando','Consultando a VM em tempo real.','<div class="aws-v4-loading">Carregando…</div>');
    try{
      await ensureSession();
      const username=identity().username;
      const s=await system(),net=s.network||{},ssh=s.ssh||{},users=s.users||[],mounts=s.mounts||[],disk=s.disk||{};
      if(path==='sistema')main.innerHTML=page('Sistema & Risco','Estado real do Alpine e proteções do acesso remoto.',`<div class="aws-v4-grid">${card('Sistema',s.os||'Alpine',s.version)}${card('Kernel',s.kernel,s.architecture)}${card('vCPU',s.vcpus,`load ${(s.load_average||[]).join(' · ')}`)}${card('Uptime',uptime(s.uptime_seconds),s.hostname)}</div><section class="aws-v4-panel"><div class="aws-v4-risk"><div><b>Workspace</b><span>loopback via túnel SSH</span></div><div><b>SSH</b><span>porta 22 preservada</span></div><div><b>Rede</b><span>somente leitura nesta tela</span></div><div><b>Privilégios</b><span>ações administrativas por allowlist</span></div></div></section>`);
      else if(path==='processos'){const p=(await api('/api/system/processes?limit=80')).processes||[];main.innerHTML=page('Processos (htop)','Processos reais de /proc, ordenados por memória.',`<section class="aws-v4-panel">${table(['PID','Processo','UID','RSS','Comando'],p.map(x=>`<tr><td>${x.pid}</td><td><b>${esc(x.name)}</b></td><td>${x.uid??'—'}</td><td>${bytes(x.rss)}</td><td><code>${esc(x.command)}</code></td></tr>`))}</section>`)}
      else if(path==='armazenamento')main.innerHTML=page('Armazenamento & Disco','Partições e montagens reais da VM.',`<div class="aws-v4-grid">${card('Root',`${Number(disk.percent||0).toFixed(0)}%`,`${bytes(disk.used)} / ${bytes(disk.total)}`)}${card('Livre',bytes(disk.free),'/')}${card('Montagens',mounts.length,'detectadas')}</div><section class="aws-v4-panel">${table(['Ponto','Dispositivo','FS','Uso','Livre'],mounts.map(x=>`<tr><td><b>${esc(x.mountpoint)}</b></td><td>${esc(x.device)}</td><td>${esc(x.filesystem||'—')}</td><td>${Number(x.percent||0).toFixed(1)}%</td><td>${bytes(x.free)}</td></tr>`))}</section>`);
      else if(path==='rede'){const ifs=net.interfaces||[],routes=net.routes||[],ports=net.listening||[];main.innerHTML=page('Rede (Interfaces & Portas)','Diagnóstico somente leitura.',`<div class="aws-v4-grid">${ifs.map(i=>card(i.name,(i.addresses||[]).map(a=>a.address).join(' · ')||'sem IP',`${i.state} · MTU ${i.mtu??'—'}`)).join('')}</div><section class="aws-v4-panel">${table(['Destino','Gateway','Interface','Origem'],routes.map(r=>`<tr><td>${esc(r.dst||'default')}</td><td>${esc(r.gateway||'—')}</td><td>${esc(r.dev||'—')}</td><td>${esc(r.prefsrc||'—')}</td></tr>`))}</section><section class="aws-v4-panel">${table(['Proto','Estado','Local'],ports.map(p=>`<tr><td>${esc(p.protocol)}</td><td>${esc(p.state)}</td><td><code>${esc(p.local||p.raw)}</code></td></tr>`))}</section>`)}
      else if(path==='usuarios')main.innerHTML=page('Usuários','Contas locais; nenhum hash de senha é exposto.',`<section class="aws-v4-panel">${table(['Usuário','UID','Grupo','Home','Shell'],users.map(u=>`<tr><td><b>${esc(u.name)}</b></td><td>${u.uid}</td><td>${esc(u.group)}</td><td><code>${esc(u.home)}</code></td><td><code>${esc(u.shell)}</code></td></tr>`))}</section>`);
      else if(path==='acesso-ssh')main.innerHTML=page('Acesso SSH','Acesso remoto protegido e somente leitura.',`<div class="aws-v4-grid">${card('Usuário atual',username,session?.role_label||'usuário SSH')}${card('sshd',ssh.running?'Ativo':'Não detectado',ssh.openrc_service?'OpenRC presente':'sem script OpenRC')}${card('Porta','22','preservada')}${card('Workspace','loopback local','via SSH Local Forward')}</div><section class="aws-v4-panel"><code>ssh ${esc(username)}@HOST</code></section>`);
      else if(path==='rede-privada'){const z=net.zerotier||{};main.innerHTML=page('Rede Privada (VPN)','ZeroTier em modo diagnóstico; nenhuma rota é alterada.',`<div class="aws-v4-grid">${card('Daemon',z.running?'Executando':'Não detectado',z.daemon||'zerotier-one')}${card('CLI',z.cli?'Disponível':'Ausente',z.cli||'—')}${card('OpenRC',z.openrc_service?'Configurado':'Não detectado','daemon pode estar ativo sem script')}</div>${(z.interfaces||[]).map(i=>`<section class="aws-v4-panel"><b>${esc(i.name)}</b> ${state(String(i.state).toLowerCase()==='up')}<div>${(i.addresses||[]).map(a=>`<code>${esc(a.address)}</code>`).join(' ')}</div></section>`).join('')}`)}
      else if(path==='proxmox-cluster')main.innerHTML=page('Proxmox (Cluster)','O cluster continua separado e é aberto com segurança pelo PIBIC LAB.',`<div class="aws-v4-risk"><div><b>Destino interno</b><span>10.99.0.59:8006</span></div><div><b>Forward</b><span>PIBIC LAB</span></div><div><b>Credenciais</b><span>não ficam nesta VM</span></div><div><b>Workspace</b><span>sem token global do cluster</span></div></div>`);
    }catch(e){main.innerHTML=page('Falha ao carregar',e.message||'Erro inesperado.','<div class="aws-v4-loading">Atualize a página e tente novamente.</div>')}
  }

  const infos=new Set(['sistema','processos','armazenamento','rede','usuarios','acesso-ssh','rede-privada','proxmox-cluster']);
  function route(e){
    const b=e.target.closest?.('[data-aws-path]');
    if(!b||!b.closest('#aws-shell'))return;
    const p=b.dataset.awsPath;
    if(p==='dashboard'){setTimeout(hydrate,120);return}
    if(!infos.has(p))return;
    e.preventDefault();
    e.stopImmediatePropagation();
    info(p);
  }

  function dbOpen(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)){reject(new Error('IndexedDB não está disponível neste navegador.'));return}
      const request=indexedDB.open(WALLPAPER_DB,1);
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(WALLPAPER_STORE))db.createObjectStore(WALLPAPER_STORE)};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('Não foi possível abrir o armazenamento local.'));
    });
  }
  async function dbGet(key){
    const db=await dbOpen();
    try{return await new Promise((resolve,reject)=>{const tx=db.transaction(WALLPAPER_STORE,'readonly');const req=tx.objectStore(WALLPAPER_STORE).get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)})}finally{db.close()}
  }
  async function dbSet(key,value){
    const db=await dbOpen();
    try{await new Promise((resolve,reject)=>{const tx=db.transaction(WALLPAPER_STORE,'readwrite');tx.objectStore(WALLPAPER_STORE).put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}
  }
  async function dbDelete(key){
    const db=await dbOpen();
    try{await new Promise((resolve,reject)=>{const tx=db.transaction(WALLPAPER_STORE,'readwrite');tx.objectStore(WALLPAPER_STORE).delete(key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}
  }
  function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('Falha ao ler a imagem.'));r.readAsDataURL(blob)})}
  function validateImageBlob(blob){
    if(!blob||!String(blob.type||'').startsWith('image/'))throw new Error('O arquivo informado não é uma imagem válida.');
    if(blob.size>MAX_WALLPAPER_BYTES)throw new Error('O wallpaper deve ter no máximo 20 MiB.');
  }
  async function wallpaperFromUrl(raw){
    let url;
    try{url=new URL(String(raw||'').trim())}catch(_){throw new Error('Informe uma URL válida de imagem.')}
    if(!['http:','https:'].includes(url.protocol))throw new Error('Use uma URL http:// ou https://.');
    let response;
    try{response=await fetch(url.href,{mode:'cors',cache:'no-store',credentials:'omit'})}catch(_){throw new Error('Não foi possível baixar essa imagem. O servidor da URL precisa permitir acesso CORS.')}
    if(!response.ok)throw new Error(`A imagem respondeu HTTP ${response.status}.`);
    const blob=await response.blob();validateImageBlob(blob);
    const dataUrl=await blobToDataUrl(blob);
    return {source:'url',url:url.href,name:url.pathname.split('/').pop()||'wallpaper',dataUrl,updatedAt:Date.now()};
  }
  async function wallpaperFromFile(file){
    validateImageBlob(file);
    const dataUrl=await blobToDataUrl(file);
    return {source:'upload',url:'',name:file.name||'wallpaper',dataUrl,updatedAt:Date.now()};
  }
  function ensureWallpaperStyles(){
    if($('#aws-wallpaper-style'))return;
    const style=document.createElement('style');style.id='aws-wallpaper-style';style.textContent=`
      .aws-main.aws-wallpaper-active{background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important;background-attachment:fixed!important}
      .aws-main.aws-wallpaper-active .aws-section,.aws-main.aws-wallpaper-active .aws-metric-card,.aws-main.aws-wallpaper-active .aws-v4-panel{background:rgba(18,23,31,.84)!important;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
      .aws-wallpaper-controls{display:grid;gap:10px;margin-top:10px}
      .aws-wallpaper-url-row{display:flex;gap:8px;align-items:center}.aws-wallpaper-url-row input{min-width:0;flex:1}
      .aws-wallpaper-actions{display:flex;gap:8px;flex-wrap:wrap}.aws-wallpaper-actions button{min-height:34px}
      .aws-wallpaper-preview{height:150px;border-radius:8px;border:1px solid var(--aws-outline-variant);background:var(--aws-surface-container-lowest);background-size:cover;background-position:center;display:grid;place-items:center;color:var(--aws-outline);overflow:hidden}
      .aws-wallpaper-status{font-size:12px;color:var(--aws-on-surface-variant);min-height:18px}.aws-wallpaper-status.error{color:var(--aws-error)}.aws-wallpaper-status.ok{color:var(--aws-tertiary)}
    `;document.head.appendChild(style);
  }
  function applyWallpaper(record){
    ensureWallpaperStyles();
    const main=$('#aws-main');if(!main)return;
    if(!record?.dataUrl){main.classList.remove('aws-wallpaper-active');main.style.backgroundImage='';return}
    main.classList.add('aws-wallpaper-active');
    main.style.backgroundImage=`linear-gradient(rgba(15,19,28,.48),rgba(15,19,28,.66)),url(${JSON.stringify(record.dataUrl)})`;
  }
  async function restoreWallpaper(){try{applyWallpaper(await dbGet(WALLPAPER_KEY))}catch(_){}}
  function updateWallpaperPanel(section,record){
    const preview=$('[data-wallpaper-preview]',section),status=$('[data-wallpaper-status]',section),url=$('[data-wallpaper-url]',section);
    if(url&&record?.source==='url')url.value=record.url||'';
    if(preview){preview.style.backgroundImage=record?.dataUrl?`url(${JSON.stringify(record.dataUrl)})`:'';preview.textContent=record?.dataUrl?'': 'Nenhum wallpaper configurado';}
    if(status&&record?.dataUrl){status.className='aws-wallpaper-status ok';status.textContent=`Ativo: ${record.name||'wallpaper'} · salvo somente neste navegador.`}
  }
  function enhanceWallpaperSettings(win){
    if(win.dataset.awsWallpaper==='1')return;
    const settings=$('.settings-app',win);if(!settings)return;
    win.dataset.awsWallpaper='1';ensureWallpaperStyles();
    const section=document.createElement('section');section.className='settings-section';section.dataset.wallpaperSection='1';section.innerHTML=`
      <h3>Wallpaper</h3>
      <p>Personalize o fundo do Workspace. A imagem fica armazenada somente neste navegador.</p>
      <div class="aws-wallpaper-controls">
        <div class="aws-wallpaper-url-row"><input type="url" data-wallpaper-url placeholder="https://exemplo.com/wallpaper.jpg"><button class="btn" type="button" data-wallpaper-apply-url>Usar URL</button></div>
        <div class="aws-wallpaper-actions"><button class="btn" type="button" data-wallpaper-upload>Enviar imagem</button><input type="file" accept="image/*" data-wallpaper-file hidden><button class="btn ghost" type="button" data-wallpaper-remove>Remover wallpaper</button></div>
        <div class="aws-wallpaper-preview" data-wallpaper-preview>Nenhum wallpaper configurado</div>
        <div class="aws-wallpaper-status" data-wallpaper-status>URL externa precisa permitir CORS. Limite do upload: 20 MiB.</div>
      </div>`;
    const appearance=$('.settings-section',settings);if(appearance?.nextSibling)settings.insertBefore(section,appearance.nextSibling);else settings.prepend(section);
    const status=$('[data-wallpaper-status]',section),urlInput=$('[data-wallpaper-url]',section),fileInput=$('[data-wallpaper-file]',section);
    const show=(message,kind='')=>{status.className=`aws-wallpaper-status ${kind}`.trim();status.textContent=message};
    $('[data-wallpaper-apply-url]',section).addEventListener('click',async()=>{
      const url=urlInput.value.trim();if(!url){show('Cole uma URL de imagem primeiro.','error');return}
      try{show('Baixando e preparando o wallpaper...');const record=await wallpaperFromUrl(url);await dbSet(WALLPAPER_KEY,record);applyWallpaper(record);updateWallpaperPanel(section,record);show('Wallpaper aplicado e salvo neste navegador.','ok')}catch(e){show(e.message||'Falha ao aplicar wallpaper.','error')}
    });
    $('[data-wallpaper-upload]',section).addEventListener('click',()=>fileInput.click());
    fileInput.addEventListener('change',async()=>{
      const file=fileInput.files?.[0];if(!file)return;
      try{show('Processando imagem...');const record=await wallpaperFromFile(file);await dbSet(WALLPAPER_KEY,record);applyWallpaper(record);updateWallpaperPanel(section,record);show('Wallpaper enviado e aplicado.','ok')}catch(e){show(e.message||'Falha ao aplicar wallpaper.','error')}finally{fileInput.value=''}
    });
    $('[data-wallpaper-remove]',section).addEventListener('click',async()=>{
      try{await dbDelete(WALLPAPER_KEY)}catch(_){}
      applyWallpaper(null);urlInput.value='';updateWallpaperPanel(section,null);show('Wallpaper removido.','ok');
    });
    dbGet(WALLPAPER_KEY).then(record=>updateWallpaperPanel(section,record)).catch(()=>{});
  }

  function enhanceWindows(){
    $$('.app-window').forEach(w=>{
      if(!w.dataset.awsV4){w.dataset.awsV4='1';const c=$('.window-content',w),t=$('.window-title',w)?.textContent||'Aplicativo';if(c){const r=document.createElement('div');r.className='aws-v4-ribbon';r.innerHTML=`<b>${esc(t)}</b><span>VM local</span>`;c.prepend(r)}}
      if(w.dataset.app==='settings')enhanceWallpaperSettings(w);
    });
  }

  function install(){
    document.documentElement.classList.add('aws-v4');document.addEventListener('click',route,true);
    const layer=$('#window-layer');if(layer)new MutationObserver(enhanceWindows).observe(layer,{childList:true,subtree:true});
    const shell=$('#aws-shell');if(shell)new MutationObserver(()=>applyIdentity()).observe(shell,{childList:true,subtree:true,characterData:true});
    ensureSession().then(()=>{applyIdentity();setTimeout(hydrate,100);setInterval(hydrate,5000)}).catch(()=>{});
    restoreWallpaper();enhanceWindows();
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',install,{once:true}):install();
})();
