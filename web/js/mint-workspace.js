(() => {
  'use strict';
  if (window.__ALPINE_WS_MINT_REFRESH__) return;
  window.__ALPINE_WS_MINT_REFRESH__ = true;

  const STORAGE = {
    preset: 'pibic-wallpaper',
    custom: 'pibic-wallpaper-custom',
    dim: 'pibic-wallpaper-dim',
    fit: 'pibic-wallpaper-fit',
  };

  const PRESETS = {
    'mint-night': 'radial-gradient(circle at 24% 25%,rgba(134,190,67,.20),transparent 31%), radial-gradient(circle at 78% 32%,rgba(85,139,47,.17),transparent 27%), linear-gradient(135deg,#202622 0%,#151918 45%,#0d1110 100%)',
    graphite: 'radial-gradient(circle at 72% 18%,rgba(255,255,255,.08),transparent 24%), linear-gradient(135deg,#34373b 0%,#1b1d20 48%,#0d0f11 100%)',
    forest: 'radial-gradient(circle at 76% 22%,rgba(134,190,67,.18),transparent 26%), linear-gradient(135deg,#31533c 0%,#19291f 52%,#0d120f 100%)',
    blue: 'radial-gradient(circle at 20% 24%,rgba(86,168,220,.20),transparent 28%), linear-gradient(135deg,#24455b 0%,#142731 50%,#0a1116 100%)',
  };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  const folderIcon = (system=false) => `<svg class="mint-place-icon${system?' system':''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5h6.5l2 2H21v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;
  const driveIcon = () => `<svg class="mint-place-icon system" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h.01M11 15h6"/></svg>`;
  const homeIcon = () => `<svg class="mint-place-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></svg>`;

  function cssUrl(value){
    const clean=String(value||'').trim().replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/[\r\n]/g,'');
    return `url("${clean}")`;
  }

  function currentWallpaper(){
    const preset=localStorage.getItem(STORAGE.preset)||'mint-night';
    const custom=localStorage.getItem(STORAGE.custom)||'';
    const dim=Math.max(0,Math.min(60,Number(localStorage.getItem(STORAGE.dim) ?? 20)));
    const fit=localStorage.getItem(STORAGE.fit)||'cover';
    return {preset,custom,dim,fit};
  }

  function applyWallpaper(){
    const {preset,custom,dim,fit}=currentWallpaper();
    const image=preset==='custom' && custom ? cssUrl(custom) : (PRESETS[preset]||PRESETS['mint-night']);
    const root=document.documentElement;
    root.style.setProperty('--mint-wallpaper-image',image);
    root.style.setProperty('--mint-wallpaper-overlay',`rgba(0,0,0,${(dim/100).toFixed(2)})`);
    root.style.setProperty('--mint-wallpaper-size',fit);
    root.style.setProperty('--mint-wallpaper-position','center');
  }

  async function fileToWallpaper(file){
    if(!file?.type?.startsWith('image/')) throw new Error('Selecione um arquivo de imagem.');
    if(file.size>18*1024*1024) throw new Error('A imagem é muito grande. Use um arquivo de até 18 MB.');
    const url=URL.createObjectURL(file);
    try{
      const img=new Image();
      img.decoding='async';
      img.src=url;
      await img.decode();
      const maxW=1920,maxH=1080;
      const scale=Math.min(1,maxW/img.naturalWidth,maxH/img.naturalHeight);
      const w=Math.max(1,Math.round(img.naturalWidth*scale));
      const h=Math.max(1,Math.round(img.naturalHeight*scale));
      const canvas=document.createElement('canvas');
      canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d',{alpha:false});
      ctx.fillStyle='#111';
      ctx.fillRect(0,0,w,h);
      ctx.drawImage(img,0,0,w,h);
      let data=canvas.toDataURL('image/jpeg',.82);
      if(data.length>3900000){
        const scale2=Math.min(1,1440/w,810/h);
        if(scale2<1){
          const c2=document.createElement('canvas');
          c2.width=Math.max(1,Math.round(w*scale2));
          c2.height=Math.max(1,Math.round(h*scale2));
          const x2=c2.getContext('2d',{alpha:false});
          x2.fillStyle='#111';x2.fillRect(0,0,c2.width,c2.height);
          x2.drawImage(canvas,0,0,c2.width,c2.height);
          data=c2.toDataURL('image/jpeg',.74);
        }
      }
      if(data.length>4400000) throw new Error('A imagem ainda ficou grande demais para ser salva no navegador.');
      return data;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function setWallpaper(preset,custom=''){
    try{
      localStorage.setItem(STORAGE.preset,preset);
      if(custom) localStorage.setItem(STORAGE.custom,custom);
      applyWallpaper();
      return true;
    }catch(_){
      return false;
    }
  }

  function wallpaperSection(settings){
    if(settings.querySelector('[data-mint-wallpaper]')) return;
    const appearance=settings.querySelector('.settings-section');
    const section=document.createElement('section');
    section.className='settings-section';
    section.dataset.mintWallpaper='1';
    const state=currentWallpaper();
    section.innerHTML=`
      <h3>Área de trabalho</h3>
      <div>
        <strong style="font-size:12px">Papel de parede</strong>
        <small style="display:block;margin-top:3px;color:var(--mint-muted)">Escolha um tema, use uma URL ou carregue uma imagem do seu computador. A preferência fica somente neste navegador.</small>
      </div>
      <div class="mint-wallpaper-grid">
        <button class="mint-wallpaper-option" type="button" data-wallpaper="mint-night" data-label="Mint Night" aria-label="Mint Night"></button>
        <button class="mint-wallpaper-option" type="button" data-wallpaper="graphite" data-label="Grafite" aria-label="Grafite"></button>
        <button class="mint-wallpaper-option" type="button" data-wallpaper="forest" data-label="Floresta" aria-label="Floresta"></button>
        <button class="mint-wallpaper-option" type="button" data-wallpaper="blue" data-label="Azul" aria-label="Azul"></button>
        <button class="mint-wallpaper-option" type="button" data-wallpaper="custom" data-label="Personalizado" aria-label="Papel de parede personalizado"></button>
      </div>
      <div class="mint-wallpaper-actions">
        <input type="url" data-wallpaper-url placeholder="https://.../imagem.jpg" aria-label="URL do papel de parede">
        <button class="btn" type="button" data-wallpaper-url-apply>Aplicar URL</button>
        <button class="btn" type="button" data-wallpaper-upload>Escolher imagem…</button>
        <input type="file" accept="image/*" data-wallpaper-file hidden>
        <button class="btn" type="button" data-wallpaper-reset>Restaurar</button>
      </div>
      <div class="settings-row">
        <div>Preenchimento<small>Como a imagem ocupa a área de trabalho.</small></div>
        <select data-wallpaper-fit>
          <option value="cover">Preencher</option>
          <option value="contain">Ajustar inteira</option>
          <option value="auto">Tamanho original</option>
        </select>
      </div>
      <div class="settings-row">
        <div>Escurecer fundo<small>Melhora a leitura dos cartões e janelas.</small></div>
        <input type="range" min="0" max="60" step="1" data-wallpaper-dim value="${state.dim}" aria-label="Escurecer papel de parede">
      </div>
      <div class="mint-wallpaper-status" data-wallpaper-status></div>`;

    if(appearance?.nextSibling) settings.insertBefore(section,appearance.nextSibling);
    else settings.prepend(section);

    const status=section.querySelector('[data-wallpaper-status]');
    const fit=section.querySelector('[data-wallpaper-fit]');
    fit.value=state.fit;
    const markActive=()=>{
      const s=currentWallpaper();
      section.querySelectorAll('[data-wallpaper]').forEach((b)=>b.classList.toggle('active',b.dataset.wallpaper===s.preset));
      const custom=s.custom;
      if(custom && !custom.startsWith('data:')) section.querySelector('[data-wallpaper-url]').value=custom;
    };
    const say=(message,error=false)=>{
      status.textContent=message;
      status.style.color=error?'#ffb4ab':'var(--mint-muted)';
    };

    section.querySelector('.mint-wallpaper-grid').addEventListener('click',(e)=>{
      const button=e.target.closest('[data-wallpaper]');
      if(!button) return;
      const preset=button.dataset.wallpaper;
      if(preset==='custom' && !localStorage.getItem(STORAGE.custom)){
        say('Carregue uma imagem ou informe uma URL para usar o modo personalizado.',true);
        return;
      }
      setWallpaper(preset);
      markActive();
      say('Papel de parede aplicado.');
    });

    section.querySelector('[data-wallpaper-url-apply]').addEventListener('click',()=>{
      const input=section.querySelector('[data-wallpaper-url]');
      const value=input.value.trim();
      if(!value){say('Informe uma URL de imagem.',true);return}
      if(!/^https?:\/\//i.test(value) && !value.startsWith('data:image/')){
        say('Use uma URL http(s) válida.',true);return;
      }
      if(!setWallpaper('custom',value)){say('Não foi possível salvar essa preferência.',true);return}
      markActive();say('Imagem por URL aplicada.');
    });

    const fileInput=section.querySelector('[data-wallpaper-file]');
    section.querySelector('[data-wallpaper-upload]').addEventListener('click',()=>fileInput.click());
    fileInput.addEventListener('change',async()=>{
      const file=fileInput.files?.[0];
      if(!file)return;
      say('Preparando imagem…');
      try{
        const data=await fileToWallpaper(file);
        if(!setWallpaper('custom',data)) throw new Error('O navegador não conseguiu salvar a imagem.');
        markActive();say(`Imagem "${file.name}" aplicada.`);
      }catch(err){
        say(err.message||'Falha ao aplicar a imagem.',true);
      }finally{
        fileInput.value='';
      }
    });

    section.querySelector('[data-wallpaper-reset]').addEventListener('click',()=>{
      try{
        localStorage.removeItem(STORAGE.custom);
        localStorage.setItem(STORAGE.preset,'mint-night');
        localStorage.setItem(STORAGE.dim,'20');
        localStorage.setItem(STORAGE.fit,'cover');
      }catch(_){}
      section.querySelector('[data-wallpaper-dim]').value='20';
      fit.value='cover';
      section.querySelector('[data-wallpaper-url]').value='';
      applyWallpaper();markActive();say('Configuração padrão restaurada.');
    });

    fit.addEventListener('change',()=>{
      localStorage.setItem(STORAGE.fit,fit.value);
      applyWallpaper();
    });
    section.querySelector('[data-wallpaper-dim]').addEventListener('input',(e)=>{
      localStorage.setItem(STORAGE.dim,e.target.value);
      applyWallpaper();
    });
    markActive();
  }

  function sectionMarkup(label,items,kind='folder'){
    if(!items.length) return '';
    return `<div class="file-sidebar-section"><span class="file-sidebar-label">${esc(label)}</span>${items.map((item)=>{
      const icon=item.icon==='home'?homeIcon():item.icon==='drive'?driveIcon():folderIcon(kind==='system');
      return `<button type="button" data-place="${esc(item.path)}" title="${esc(item.path)}">${icon}<span>${esc(item.label)}</span></button>`;
    }).join('')}</div>`;
  }

  function enhanceFileManager(root){
    if(!root || root.dataset.mintEnhanced==='1') return;
    root.dataset.mintEnhanced='1';
    const sidebar=root.querySelector('.file-sidebar');
    const view=root.querySelector('.file-view');
    const pathInput=root.querySelector('[data-path]');
    if(!sidebar || !view || !pathInput) return;

    let homePath='';
    let personal=[];

    const buildSidebar=()=>{
      const locals=[
        {label:'Pasta pessoal',path:'~',icon:'home'},
        ...personal
      ];
      const system=[
        {label:'Sistema de arquivos',path:'/',icon:'drive'},
        {label:'Usuários',path:'/home'},
        {label:'Configurações',path:'/etc'},
        {label:'Dados variáveis',path:'/var'},
        {label:'Temporários',path:'/tmp'},
        {label:'Aplicações',path:'/opt'},
        {label:'Programas do sistema',path:'/usr'},
      ];
      sidebar.innerHTML=sectionMarkup('Locais',locals)+sectionMarkup('Sistema',system,'system');
      updateActive();
    };

    const updateActive=()=>{
      const current=pathInput.value||'';
      sidebar.querySelectorAll('[data-place]').forEach((button)=>{
        const p=button.dataset.place;
        const active=(p==='~' && homePath && current===homePath) || current===p;
        button.classList.toggle('active',!!active);
      });
    };

    const detectHomeFolders=()=>{
      const current=pathInput.value||'';
      if(!homePath && current && current!=='/' && /^\/home\/[^/]+\/?$/.test(current)) homePath=current.replace(/\/$/,'');
      if(!homePath || current.replace(/\/$/,'')!==homePath) return;
      const names=new Set([...view.querySelectorAll('[data-i]')].map((el)=>{
        const named=el.querySelector('[title]')?.getAttribute('title') || el.querySelector('.file-name-cell')?.textContent || el.textContent;
        return String(named||'').trim();
      }));
      const candidates=[
        ['Área de Trabalho',['Área de Trabalho','Desktop']],
        ['Documentos',['Documentos','Documents']],
        ['Downloads',['Downloads']],
        ['Imagens',['Imagens','Pictures']],
        ['Músicas',['Músicas','Music']],
        ['Vídeos',['Vídeos','Videos']],
        ['Público',['Público','Public']],
      ];
      const found=[];
      for(const [label,alts] of candidates){
        const actual=alts.find((name)=>names.has(name));
        if(actual) found.push({label,path:`${homePath}/${actual}`,icon:'folder'});
      }
      const signature=found.map(x=>x.path).join('|');
      const currentSignature=personal.map(x=>x.path).join('|');
      if(signature!==currentSignature){personal=found;buildSidebar()}
    };

    sidebar.addEventListener('click',(e)=>{
      const button=e.target.closest('[data-place]');
      if(!button)return;
      setTimeout(updateActive,80);
      setTimeout(updateActive,350);
    });

    const viewObserver=new MutationObserver(()=>{
      detectHomeFolders();
      updateActive();
    });
    viewObserver.observe(view,{childList:true,subtree:true});

    buildSidebar();
    setTimeout(()=>{detectHomeFolders();updateActive()},450);
  }

  function slimLegacyDesktop(){
    const area=document.querySelector('#desktop-area');
    if(!area || area.dataset.mintSlim==='1') return;
    area.dataset.mintSlim='1';
    const keep=new Set(['files','terminal','code','settings']);
    [...area.querySelectorAll('[data-app]')].forEach((button)=>{
      if(!keep.has(button.dataset.app)) button.remove();
    });
  }

  function enhanceNode(root=document){
    if(root.nodeType!==1 && root!==document) return;
    const scope=root===document?document:root;
    if(scope.matches?.('.settings-app')) wallpaperSection(scope);
    scope.querySelectorAll?.('.settings-app').forEach(wallpaperSection);
    if(scope.matches?.('.file-app')) enhanceFileManager(scope);
    scope.querySelectorAll?.('.file-app').forEach(enhanceFileManager);
    slimLegacyDesktop();
  }

  function install(){
    applyWallpaper();
    document.documentElement.classList.add('mint-refresh');
    enhanceNode(document);
    const observer=new MutationObserver((mutations)=>{
      for(const mutation of mutations){
        for(const node of mutation.addedNodes){
          if(node.nodeType===1) enhanceNode(node);
        }
      }
    });
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('storage',(e)=>{
      if(Object.values(STORAGE).includes(e.key)) applyWallpaper();
    });
  }

  document.readyState==='loading'
    ? document.addEventListener('DOMContentLoaded',install,{once:true})
    : install();
})();