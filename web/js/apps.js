import {api, qs, formatBytes, escapeHTML, icon} from './api.js';
import {TerminalSession} from './terminal.js';

export const APPS=[
  {id:'system',name:'Sistema',icon:'monitor',favorite:true},
  {id:'files',name:'Arquivos',icon:'folder',favorite:true},
  {id:'terminal',name:'Terminal',icon:'terminal',favorite:true,multi:true},
  {id:'code',name:'Código',icon:'code',favorite:true},
  {id:'packages',name:'Pacotes',icon:'package'},
  {id:'services',name:'Serviços',icon:'services'},
  {id:'docker',name:'Docker',icon:'docker'},
  {id:'logs',name:'Logs',icon:'logs'},
  {id:'settings',name:'Configurações',icon:'settings'},
];

const appById=id=>APPS.find(a=>a.id===id);
const joinPath=(a,b)=>a==='/'?`/${b}`:`${a.replace(/\/$/,'')}/${b}`;
const baseName=p=>p.replace(/\/$/,'').split('/').pop()||'/';
const parentPath=p=>{if(p==='/')return '/';const x=p.replace(/\/$/,'').split('/');x.pop();return x.join('/')||'/'};
const fmtDate=t=>new Date(Number(t)*1000).toLocaleString();

export function mountApp(id,win,ctx,options={}){
  switch(id){
    case 'system': return mountSystem(win,ctx);
    case 'files': return mountFiles(win,ctx,options);
    case 'terminal': return mountTerminal(win,ctx,options);
    case 'code': return mountCode(win,ctx,options);
    case 'packages': return mountPackages(win,ctx);
    case 'services': return mountServices(win,ctx);
    case 'docker': return mountDocker(win,ctx);
    case 'logs': return mountLogs(win,ctx);
    case 'settings': return mountSettings(win,ctx);
    default: win.content.innerHTML='<div class="system-app">Aplicativo desconhecido.</div>';
  }
}

function mountSystem(win,ctx){
  win.content.innerHTML='<div class="system-app"><h3 class="section-title">Sistema</h3><div id="sys-metrics" class="metric-grid"></div><h3 class="section-title" style="margin-top:18px">Detalhes</h3><table id="sys-details" class="kv-table"></table><h3 class="section-title" style="margin-top:18px">Processos com maior uso de memória</h3><div id="sys-processes"></div></div>';
  let stopped=false;
  const render=async()=>{
    try{
      const [{system:s},{processes:p}]=await Promise.all([api('/api/system'),api('/api/system/processes?limit=10')]);
      if(stopped)return;
      const up=Math.floor(s.uptime_seconds);const days=Math.floor(up/86400),hrs=Math.floor((up%86400)/3600),mins=Math.floor((up%3600)/60);
      win.content.querySelector('#sys-metrics').innerHTML=`
        <div class="metric-card"><div class="label">CPU</div><div class="value">${s.cpu_percent}%</div><div class="meter"><i style="width:${s.cpu_percent}%"></i></div></div>
        <div class="metric-card"><div class="label">Memória</div><div class="value">${s.memory.percent}%</div><div>${formatBytes(s.memory.used)} / ${formatBytes(s.memory.total)}</div><div class="meter"><i style="width:${s.memory.percent}%"></i></div></div>
        <div class="metric-card"><div class="label">Disco /</div><div class="value">${s.disk.percent}%</div><div>${formatBytes(s.disk.used)} / ${formatBytes(s.disk.total)}</div><div class="meter"><i style="width:${s.disk.percent}%"></i></div></div>
        <div class="metric-card"><div class="label">Load average</div><div class="value">${s.load_average.join(' · ')}</div><div>${s.vcpus} vCPU</div></div>`;
      const rows=[['Hostname',s.hostname],['Sistema operacional',s.os],['Versão',s.version||'—'],['Kernel',s.kernel],['Arquitetura',s.architecture],['Uptime',`${days}d ${hrs}h ${mins}m`],['Memória disponível',formatBytes(s.memory.available)],['Disco livre',formatBytes(s.disk.free)]];
      win.content.querySelector('#sys-details').innerHTML=rows.map(([a,b])=>`<tr><td>${escapeHTML(a)}</td><td>${escapeHTML(b)}</td></tr>`).join('');
      win.content.querySelector('#sys-processes').innerHTML=`<table class="file-table"><thead><tr><th>PID</th><th>Processo</th><th>RSS</th><th>Comando</th></tr></thead><tbody>${p.map(x=>`<tr><td>${x.pid}</td><td>${escapeHTML(x.name)}</td><td>${formatBytes(x.rss)}</td><td>${escapeHTML(x.command)}</td></tr>`).join('')}</tbody></table>`;
    }catch(e){ctx.notify(e.message,'error')}
  };
  render();const timer=setInterval(render,4000);win.onClose=()=>{stopped=true;clearInterval(timer);return true};
}

function mountTerminal(win,ctx,options){
  win.content.innerHTML='<div class="terminal-app"><div class="terminal-tabs"><button class="btn ghost" data-new-terminal aria-label="Novo terminal">'+icon('plus')+'</button></div><div class="terminal-host"></div></div>';
  const tabs=win.content.querySelector('.terminal-tabs');const host=win.content.querySelector('.terminal-host');
  const sessions=[];let active=null;let counter=0;
  const activate=s=>{sessions.forEach(x=>{x.button.classList.toggle('active',x===s);x.session[x===s?'show':'hide']()});active=s;s.session.focus()};
  const add=opts=>{
    counter++;const wrap=document.createElement('div');wrap.className='terminal-pane';wrap.style.height='100%';host.appendChild(wrap);
    const session=new TerminalSession(wrap,{...opts,notify:ctx.notify});
    const button=document.createElement('button');button.className='terminal-tab';button.innerHTML=`${icon('terminal')}<span>Terminal ${counter}</span><span class="terminal-tab-close" title="Fechar">${icon('close')}</span>`;
    tabs.appendChild(button);const row={session,button,wrap};sessions.push(row);
    button.addEventListener('click',e=>{if(e.target.closest('.terminal-tab-close')){close(row)}else activate(row)});
    activate(row);return row;
  };
  const close=row=>{if(sessions.length===1){row.session.dispose();row.button.remove();row.wrap.remove();sessions.splice(0,1);add(options);return}const idx=sessions.indexOf(row);row.session.dispose();row.button.remove();row.wrap.remove();sessions.splice(idx,1);if(active===row)activate(sessions[Math.max(0,idx-1)])};
  tabs.querySelector('[data-new-terminal]').addEventListener('click',()=>add({cwd:options.cwd}));
  add(options);
  win.el.addEventListener('window-resize',()=>active?.session.fit());win.el.addEventListener('window-focus',()=>active?.session.focus());
  win.onClose=()=>{sessions.forEach(s=>s.session.dispose());return true};
}

function mountFiles(win,ctx,options){
  win.content.innerHTML=`<div class="file-app">
    <div class="toolbar">
      <button data-f="back" title="Voltar">${icon('back')}</button><button data-f="forward" title="Avançar">${icon('forward')}</button><button data-f="up" title="Subir">${icon('up')}</button><button data-f="refresh" title="Atualizar">${icon('refresh')}</button>
      <input class="path-input" data-path aria-label="Caminho"><button data-f="go">Ir</button>
      <button data-f="new-file" title="Novo arquivo">${icon('file')}</button><button data-f="new-folder" title="Nova pasta">${icon('plus')}</button><button data-f="upload" title="Upload">${icon('upload')}</button><input type="file" data-upload-input hidden>
      <button data-f="toggle-hidden" title="Arquivos ocultos">.*</button><button data-f="view" title="Alternar visualização">${icon('list')}</button>
      <select data-sort title="Ordenar"><option value="name">Nome</option><option value="size">Tamanho</option><option value="modified">Data</option><option value="type">Tipo</option></select><button data-f="sort-dir" title="Inverter ordenação">A→Z</button>
      <input data-search placeholder="Pesquisar" style="width:140px"><button data-f="search">${icon('search')}</button>
    </div>
    <aside class="file-sidebar"></aside>
    <div class="file-main"><div class="breadcrumb"></div><div class="file-view grid"></div></div>
    <div class="statusbar"><span data-status></span><span data-selection></span></div>
  </div>`;
  const root=win.content.querySelector('.file-app'),view=root.querySelector('.file-view'),bread=root.querySelector('.breadcrumb'),pathInput=root.querySelector('[data-path]'),status=root.querySelector('[data-status]'),selectionLabel=root.querySelector('[data-selection]');
  const sidebar=root.querySelector('.file-sidebar');
  let path=options.path&&options.path.includes('.')?parentPath(options.path):(options.path||'~');let history=[];let hidx=-1;let items=[];let selected=new Set();let showHidden=false;let grid=true;let clip=null;let sortKey='name';let sortDir=1;
  const places=[['Home','~'],['Raiz','/'],['tmp','/tmp'],['var','/var'],['opt','/opt'],['etc','/etc']];
  sidebar.innerHTML=places.map(([n,p])=>`<button data-place="${escapeHTML(p)}">${icon('folder')}<span>${escapeHTML(n)}</span></button>`).join('');
  sidebar.addEventListener('click',e=>{const b=e.target.closest('[data-place]');if(b)load(b.dataset.place)});
  const setHistory=p=>{history=history.slice(0,hidx+1);history.push(p);hidx=history.length-1};
  const breadcrumbs=p=>{const parts=p==='/'?[]:p.split('/').filter(Boolean);let cur='';bread.innerHTML=`<button data-bread="/">/</button>${parts.map(seg=>{cur+='/'+seg;return `<span>›</span><button data-bread="${escapeHTML(cur)}">${escapeHTML(seg)}</button>`}).join('')}`};
  const render=()=>{
    const cmp=(a,b)=>{
      const av=sortKey==='name'?a.name.toLowerCase():sortKey==='type'?a.type.toLowerCase():Number(a[sortKey]||0);
      const bv=sortKey==='name'?b.name.toLowerCase():sortKey==='type'?b.type.toLowerCase():Number(b[sortKey]||0);
      if(av<bv)return -1*sortDir;if(av>bv)return 1*sortDir;return a.name.localeCompare(b.name)*sortDir;
    };
    items.sort((a,b)=>a.type==='directory'&&b.type!=='directory'?-1:a.type!=='directory'&&b.type==='directory'?1:cmp(a,b));
    view.classList.toggle('grid',grid);selected.clear();
    if(grid){
      view.innerHTML=items.map((x,i)=>`<div class="file-item grid-item" tabindex="0" data-i="${i}">${icon(x.type==='directory'?'folder':'file')}<span title="${escapeHTML(x.name)}">${escapeHTML(x.name)}</span></div>`).join('');
    }else{
      view.innerHTML=`<table class="file-table"><thead><tr><th>Nome</th><th>Tamanho</th><th>Tipo</th><th>Modificado</th><th>Permissões</th></tr></thead><tbody>${items.map((x,i)=>`<tr class="file-item" tabindex="0" data-i="${i}"><td><span class="file-name-cell">${icon(x.type==='directory'?'folder':'file')}${escapeHTML(x.name)}</span></td><td>${x.type==='directory'?'—':formatBytes(x.size)}</td><td>${escapeHTML(x.type)}</td><td>${escapeHTML(fmtDate(x.modified))}</td><td>${escapeHTML(x.permissions)}</td></tr>`).join('')}</tbody></table>`;
    }
    status.textContent=`${items.length} itens · ${path}`;selectionLabel.textContent='';
  };
  const load=async(p,record=true)=>{
    try{const d=await api('/api/files/list?'+qs({path:p,show_hidden:showHidden}));path=d.path;items=d.items;pathInput.value=path;breadcrumbs(path);if(record)setHistory(path);render()}catch(e){ctx.notify(e.message,'error')}
  };
  const openItem=x=>{if(x.type==='directory')load(x.path);else if(/\.(txt|py|js|mjs|html|css|json|ya?ml|md|sh|toml|conf|ini|sql|log)$/i.test(x.name))ctx.openApp('code',{path:x.path});else window.open('/api/files/download?'+qs({path:x.path}),'_blank')};
  const selectedPaths=()=>[...selected].map(i=>items[i]).filter(Boolean).map(x=>x.path);
  const updateSelection=()=>{view.querySelectorAll('[data-i]').forEach(el=>el.classList.toggle('selected',selected.has(Number(el.dataset.i))));selectionLabel.textContent=selected.size?`${selected.size} selecionado(s)`:''};
  view.addEventListener('click',e=>{const el=e.target.closest('[data-i]');if(!el)return;const i=Number(el.dataset.i);if(!e.ctrlKey&&!e.metaKey)selected.clear();selected.has(i)&& (e.ctrlKey||e.metaKey)?selected.delete(i):selected.add(i);updateSelection()});
  view.addEventListener('dblclick',e=>{const el=e.target.closest('[data-i]');if(el)openItem(items[Number(el.dataset.i)])});
  view.addEventListener('keydown',e=>{const el=e.target.closest('[data-i]');if(!el)return;if(e.key==='Enter'){e.preventDefault();openItem(items[Number(el.dataset.i)])}if(e.key==='Delete'){e.preventDefault();removeSelected()}});
  const newFile=async()=>{const n=await ctx.inputDialog('Novo arquivo','Nome do arquivo:','novo.txt');if(n){try{await api('/api/files/touch',{method:'POST',body:{path:joinPath(path,n)}});ctx.notify('Arquivo criado.','success');load(path,false)}catch(e){ctx.notify(e.message,'error')}}};
  const newFolder=async()=>{const n=await ctx.inputDialog('Nova pasta','Nome da pasta:','nova-pasta');if(n){try{await api('/api/files/mkdir',{method:'POST',body:{path:joinPath(path,n)}});ctx.notify('Pasta criada.','success');load(path,false)}catch(e){ctx.notify(e.message,'error')}}};
  const removeSelected=async()=>{const ps=selectedPaths();if(!ps.length)return;const ok=await ctx.confirmDialog('Excluir itens',`Excluir ${ps.length} item(ns)? Esta ação não pode ser desfeita.`,'Excluir',true);if(ok){try{await api('/api/files/delete',{method:'POST',body:{paths:ps}});ctx.notify('Itens excluídos.','success');load(path,false)}catch(e){ctx.notify(e.message,'error')}}};
  const paste=async()=>{if(!clip?.paths?.length)return;try{await api(`/api/files/${clip.cut?'move':'copy'}`,{method:'POST',body:{paths:clip.paths,destination:path}});ctx.notify(clip.cut?'Itens movidos.':'Itens copiados.','success');if(clip.cut)clip=null;load(path,false)}catch(e){ctx.notify(e.message,'error')}};
  const props=async()=>{const ps=selectedPaths();if(ps.length!==1)return;try{const {item}=await api('/api/files/properties?'+qs({path:ps[0]}));ctx.messageDialog('Propriedades',`Caminho: ${item.path}\nTamanho: ${formatBytes(item.size)}\nUsuário: ${item.owner} (${item.uid})\nGrupo: ${item.group} (${item.gid})\nPermissões: ${item.permissions}\nModificado: ${fmtDate(item.modified)}${item.symlink_target?`\nLink → ${item.symlink_target}`:''}`)}catch(e){ctx.notify(e.message,'error')}};
  const rename=async()=>{const ps=selectedPaths();if(ps.length!==1)return;const current=baseName(ps[0]);const n=await ctx.inputDialog('Renomear','Novo nome:',current);if(n&&n!==current){try{await api('/api/files/rename',{method:'POST',body:{path:ps[0],new_name:n}});load(path,false)}catch(e){ctx.notify(e.message,'error')}}};
  view.addEventListener('contextmenu',e=>{e.preventDefault();const el=e.target.closest('[data-i]');if(el){const i=Number(el.dataset.i);if(!selected.has(i)){selected.clear();selected.add(i);updateSelection()}}ctx.contextMenu(e.clientX,e.clientY,[
    {label:'Abrir',action:()=>{const i=[...selected][0];if(i!==undefined)openItem(items[i])},disabled:selected.size!==1},
    {label:'Abrir no Código',icon:'code',action:()=>{const i=[...selected][0];if(i!==undefined)ctx.openApp('code',{path:items[i].path})},disabled:selected.size!==1||items[[...selected][0]]?.type==='directory'},
    {separator:true},{label:'Renomear',action:rename,disabled:selected.size!==1},{label:'Copiar',icon:'copy',action:()=>clip={paths:selectedPaths(),cut:false},disabled:!selected.size},{label:'Recortar',action:()=>clip={paths:selectedPaths(),cut:true},disabled:!selected.size},{label:'Colar',icon:'paste',action:paste,disabled:!clip},{label:'Download',icon:'download',action:()=>{const p=selectedPaths()[0];if(p)window.open('/api/files/download?'+qs({path:p}),'_blank')},disabled:selected.size!==1||items[[...selected][0]]?.type==='directory'},{label:'Propriedades',action:props,disabled:selected.size!==1},{separator:true},{label:'Excluir',icon:'trash',danger:true,action:removeSelected,disabled:!selected.size}
  ])});
  root.querySelector('.toolbar').addEventListener('click',async e=>{const b=e.target.closest('[data-f]');if(!b)return;const a=b.dataset.f;
    if(a==='back'&&hidx>0){hidx--;load(history[hidx],false)}else if(a==='forward'&&hidx<history.length-1){hidx++;load(history[hidx],false)}else if(a==='up')load(parentPath(path));else if(a==='refresh')load(path,false);else if(a==='go')load(pathInput.value);else if(a==='new-file')newFile();else if(a==='new-folder')newFolder();else if(a==='upload')root.querySelector('[data-upload-input]').click();else if(a==='toggle-hidden'){showHidden=!showHidden;b.classList.toggle('active',showHidden);load(path,false)}else if(a==='view'){grid=!grid;b.innerHTML=icon(grid?'list':'grid');render()}else if(a==='sort-dir'){sortDir*=-1;b.textContent=sortDir===1?'A→Z':'Z→A';render()}else if(a==='search'){const q=root.querySelector('[data-search]').value.trim();if(!q)return;try{const d=await api('/api/files/search?'+qs({path,q,show_hidden:showHidden}));items=d.items;render();status.textContent=`${items.length} resultado(s) em ${path}`;}catch(err){ctx.notify(err.message,'error')}}
  });
  root.querySelector('[data-sort]').addEventListener('change',e=>{sortKey=e.target.value;render()});
  pathInput.addEventListener('keydown',e=>{if(e.key==='Enter')load(pathInput.value)});bread.addEventListener('click',e=>{const b=e.target.closest('[data-bread]');if(b)load(b.dataset.bread)});
  root.querySelector('[data-upload-input]').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>8*1024*1024){ctx.notify('Upload limitado a 8 MiB nesta versão.','warning');return}const buf=await f.arrayBuffer();let bin='';new Uint8Array(buf).forEach(v=>bin+=String.fromCharCode(v));try{await api('/api/files/upload',{method:'POST',body:{directory:path,name:f.name,content_b64:btoa(bin)}});ctx.notify('Upload concluído.','success');load(path,false)}catch(err){ctx.notify(err.message,'error')}e.target.value=''});
  window.addEventListener('workspace-open-file',()=>{});
  load(path).then(()=>{if(options.path&&options.path.includes('.') ){const i=items.findIndex(x=>x.path===options.path);if(i>=0){selected.add(i);updateSelection()}}});
}

function mountCode(win,ctx,options){
  const CM=window.PIBICCodeMirror;if(!CM){win.content.innerHTML='<div class="system-app">CodeMirror local não carregou.</div>';return}
  win.content.innerHTML=`<div class="code-app">
    <div class="toolbar code-toolbar"><button data-c="save" title="Salvar">${icon('save')}</button><button data-c="run" title="Executar">${icon('play')}</button><button data-c="stop" title="Parar">${icon('stop')}</button><button data-c="quick" title="Quick Open">${icon('search')}</button><button data-c="terminal" title="Terminal integrado">${icon('terminal')}</button><span class="spacer"></span><span data-code-path style="color:var(--muted);font-size:11px"></span></div>
    <aside class="code-explorer"><div class="explorer-title">EXPLORER</div><div data-tree></div></aside>
    <div class="code-tabs"></div><div class="editor-host"><div class="editor-empty">Abra um arquivo pelo Explorer ou Ctrl+P.</div></div>
    <div class="code-terminal"></div><div class="statusbar code-statusbar"><span data-code-status>Pronto</span><span>Ctrl+S salvar · Ctrl+P abrir · Esc, Tab sai do editor</span></div>
    <pre class="run-output hidden"></pre>
  </div>`;
  const root=win.content.querySelector('.code-app'),tree=root.querySelector('[data-tree]'),tabs=root.querySelector('.code-tabs'),host=root.querySelector('.editor-host'),pathLabel=root.querySelector('[data-code-path]'),status=root.querySelector('[data-code-status]'),runOutput=root.querySelector('.run-output');
  let files=[];let active=null;let editor=null;let terminal=null;let runJob=null;let rootPath=options.root||'~';
  const languageFor=p=>{const ext=(p.split('.').pop()||'').toLowerCase();return ({py:'python',js:'javascript',mjs:'javascript',html:'html',htm:'html',css:'css',json:'json',md:'markdown',yaml:'yaml',yml:'yaml',sh:'shell'})[ext]||'text'};
  const renderTabs=()=>{tabs.innerHTML=files.map((f,i)=>`<div class="code-tab ${f===active?'active':''}" data-tab="${i}"><span class="dirty">${f.dirty?'●':''}</span><span>${escapeHTML(baseName(f.path))}</span><span data-close-tab>${icon('close')}</span></div>`).join('');pathLabel.textContent=active?.path||''};
  const activate=f=>{active=f;renderTabs();if(editor){editor.destroy();editor=null}host.innerHTML='';if(!f){host.innerHTML='<div class="editor-empty">Abra um arquivo pelo Explorer ou Ctrl+P.</div>';return}editor=CM.createEditor(host,{doc:f.content,language:languageFor(f.path),tabSize:Number(localStorage.getItem('pibic-editor-tab')||4),wordWrap:localStorage.getItem('pibic-editor-wrap')==='1',onChange:value=>{f.current=value;f.dirty=value!==f.content;renderTabs()},onSave:()=>saveActive(),onSaveAs:()=>saveAs(),onQuickOpen:()=>quickOpen(),onClose:()=>closeTab(f)});editor.focus()};
  const openFile=async p=>{let existing=files.find(f=>f.path===p);if(existing){activate(existing);return}try{const d=await api('/api/files/read?'+qs({path:p}));const x=d.file;const f={path:x.path,content:x.content,current:x.content,mtime:x.mtime_ns,hash:x.hash,dirty:false};files.push(f);activate(f)}catch(e){ctx.notify(e.message,'error')}};
  const saveActive=async(force=false)=>{if(!active)return false;if(!active.dirty)return true;try{const d=await api('/api/files/write',{method:'POST',body:{path:active.path,content:active.current,expected_mtime_ns:active.mtime,force}});active.content=active.current;active.mtime=d.mtime_ns;active.hash=d.hash;active.dirty=false;status.textContent='Salvo';renderTabs();ctx.notify('Arquivo salvo.','success');return true}catch(e){if(e.status===409&&e.payload?.error?.code==='FILE_CHANGED'){const choice=await ctx.choiceDialog('Arquivo modificado','O arquivo foi modificado fora do editor.',[{id:'reload',label:'Recarregar'},{id:'overwrite',label:'Sobrescrever',danger:true},{id:'cancel',label:'Cancelar'}]);if(choice==='reload'){const d=await api('/api/files/read?'+qs({path:active.path}));Object.assign(active,{content:d.file.content,current:d.file.content,mtime:d.file.mtime_ns,hash:d.file.hash,dirty:false});activate(active);return false}else if(choice==='overwrite')return await saveActive(true)}else ctx.notify(e.message,'error');return false}};
  const saveAs=async()=>{if(!active)return false;const target=await ctx.inputDialog('Salvar como','Novo caminho completo:',active.path);if(!target||target===active.path)return false;let overwrite=false;while(true){try{const d=await api('/api/files/write',{method:'POST',body:{path:target,content:active.current,force:overwrite,create_only:!overwrite}});const nf={path:d.path,content:active.current,current:active.current,mtime:d.mtime_ns,hash:d.hash,dirty:false};files.push(nf);activate(nf);ctx.notify('Arquivo salvo como novo arquivo.','success');return true}catch(e){if(!overwrite&&e.status===409&&e.payload?.error?.code==='ALREADY_EXISTS'){const ok=await ctx.confirmDialog('Sobrescrever arquivo',`${target} já existe. Deseja sobrescrever?`,'Sobrescrever',true);if(ok){overwrite=true;continue}}else ctx.notify(e.message,'error');return false}}};
  const closeTab=async f=>{if(f.dirty){const ok=await ctx.confirmDialog('Fechar arquivo',`${baseName(f.path)} possui alterações não salvas. Fechar mesmo assim?`,'Fechar',true);if(!ok)return}const i=files.indexOf(f);files.splice(i,1);if(active===f)activate(files[Math.max(0,i-1)]||null);else renderTabs()};
  tabs.addEventListener('click',e=>{const t=e.target.closest('[data-tab]');if(!t)return;const f=files[Number(t.dataset.tab)];if(e.target.closest('[data-close-tab]'))closeTab(f);else activate(f)});
  const renderTreeNode=(item,depth=0)=>`<div class="tree-node" data-path="${escapeHTML(item.path)}" data-type="${item.type}" style="padding-left:${8+depth*12}px">${item.type==='directory'?icon('chevron'):''}${icon(item.type==='directory'?'folder':'file')}<span>${escapeHTML(item.name)}</span></div><div class="tree-children" data-children="${escapeHTML(item.path)}"></div>`;
  const loadTree=async(p,container,depth=0)=>{try{const d=await api('/api/files/list?'+qs({path:p,show_hidden:false}));if(p===rootPath||rootPath==='~')rootPath=d.path;container.innerHTML=d.items.map(x=>renderTreeNode(x,depth)).join('')}catch(e){container.innerHTML=`<div style="padding:8px;color:var(--danger)">${escapeHTML(e.message)}</div>`}};
  tree.addEventListener('click',async e=>{const n=e.target.closest('.tree-node');if(!n)return;if(n.dataset.type==='directory'){const c=n.nextElementSibling;if(c.dataset.loaded==='1'){c.classList.toggle('hidden');return}c.dataset.loaded='1';await loadTree(n.dataset.path,c,0)}else openFile(n.dataset.path)});
  loadTree(rootPath,tree);
  const quickOpen=async()=>{const query=await ctx.inputDialog('Quick Open','Digite parte do nome do arquivo:','');if(!query)return;try{const d=await api('/api/files/search?'+qs({path:rootPath,q:query,show_hidden:false}));const filesOnly=d.items.filter(x=>x.type==='file').slice(0,20);if(!filesOnly.length){ctx.notify('Nenhum arquivo encontrado.','information');return}const choice=await ctx.choiceDialog('Quick Open','Escolha um arquivo:',filesOnly.map(x=>({id:x.path,label:x.path})));if(choice)openFile(choice)}catch(e){ctx.notify(e.message,'error')}};
  const execute=async()=>{if(!active)return;if(active.dirty&&!(await saveActive()))return;try{const d=await api('/api/code/run',{method:'POST',body:{path:active.path}});runJob=d.job;runOutput.classList.remove('hidden');runOutput.textContent=`$ ${runJob.command_display}\n`;pollRun()}catch(e){ctx.notify(e.message,'error')}};
  const pollRun=async()=>{if(!runJob)return;try{const d=await api(`/api/jobs/${runJob.id}`);runJob=d.job;runOutput.textContent=`$ ${runJob.command_display}\n${runJob.output}`;runOutput.scrollTop=runOutput.scrollHeight;if(['queued','running'].includes(runJob.status))setTimeout(pollRun,600);else ctx.notify(runJob.status==='success'?'Execução concluída.':'Execução falhou.',runJob.status==='success'?'success':'error')}catch(e){ctx.notify(e.message,'error')}};
  const toggleTerminal=()=>{root.classList.toggle('terminal-open');if(root.classList.contains('terminal-open')){if(!terminal){terminal=new TerminalSession(root.querySelector('.code-terminal'),{cwd:rootPath,notify:ctx.notify})}setTimeout(()=>terminal.fit(),80)}};
  root.querySelector('.code-toolbar').addEventListener('click',e=>{const b=e.target.closest('[data-c]');if(!b)return;const a=b.dataset.c;if(a==='save')saveActive();else if(a==='run')execute();else if(a==='stop'&&runJob)api(`/api/jobs/${runJob.id}/stop`,{method:'POST'});else if(a==='quick')quickOpen();else if(a==='terminal')toggleTerminal()});
  root.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='p'){e.preventDefault();quickOpen()}});
  win.content.addEventListener('code-open-file',e=>{if(e.detail?.path)openFile(e.detail.path)});
  win.el.addEventListener('window-resize',()=>terminal?.fit());
  win.onClose=()=>{if(files.some(f=>f.dirty)){ctx.notify('Feche ou salve os arquivos modificados antes de fechar o editor.','warning');return false}terminal?.dispose();editor?.destroy();return true};
  if(options.path)openFile(options.path);
}

function mountPackages(win,ctx){
  win.content.innerHTML=`<div class="app-shell"><div class="toolbar"><button data-p-refresh>${icon('refresh')}</button><span>Catálogo APK</span><span class="spacer"></span><span style="color:var(--muted);font-size:11px">Ações privilegiadas passam por allowlist</span></div><div class="app-body catalog"></div><div class="statusbar"><span>Alpine Package Keeper</span><span></span></div></div>`;
  const list=win.content.querySelector('.catalog');let pollers=[];
  const load=async()=>{try{const d=await api('/api/packages');list.innerHTML=d.packages.map(p=>`<article class="catalog-item" data-pkg="${p.id}"><div><h4>${escapeHTML(p.name)} ${p.installed?'<span class="badge success">instalado</span>':'<span class="badge">não instalado</span>'}</h4><p>${escapeHTML(p.description)}</p><p>${p.installed_version?`Versão: ${escapeHTML(p.installed_version)}`:''}</p></div><div class="item-actions"><button class="btn" data-act="install" ${p.installed?'disabled':''}>Instalar</button><button class="btn" data-act="update" ${!p.installed?'disabled':''}>Atualizar</button><button class="btn" data-act="remove" ${!p.installed||p.protected?'disabled':''}>Remover</button></div></article>`).join('')}catch(e){ctx.notify(e.message,'error')}};
  const action=async(id,act,article)=>{if(act==='remove'){const ok=await ctx.confirmDialog('Remover pacote',`Remover ${id} e os pacotes associados do catálogo?`,'Remover',true);if(!ok)return}try{const d=await api('/api/packages/action',{method:'POST',body:{package_id:id,action:act}});const out=document.createElement('pre');out.className='job-output';article.appendChild(out);watchJob(d.job.id,out,ctx,()=>load())}catch(e){ctx.notify(e.message,'error')}};
  list.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const a=e.target.closest('[data-pkg]');action(a.dataset.pkg,b.dataset.act,a)});win.content.querySelector('[data-p-refresh]').addEventListener('click',load);load();
}

function watchJob(id,output,ctx,done){
  let stopped=false;
  const tick=async()=>{if(stopped)return;try{const d=await api(`/api/jobs/${id}`);const j=d.job;output.textContent=`Comando executado:\n${j.command_display}\n\n${j.output||j.status}`;output.scrollTop=output.scrollHeight;if(['queued','running'].includes(j.status))setTimeout(tick,700);else{ctx.notify(j.status==='success'?`${j.title} concluído.`:`${j.title} falhou.`,j.status==='success'?'success':'error');done?.(j)}}catch(e){ctx.notify(e.message,'error')}};tick();return()=>{stopped=true};
}

function mountServices(win,ctx){
  win.content.innerHTML=`<div class="app-shell"><div class="toolbar"><button data-s-refresh>${icon('refresh')}</button><span>OpenRC</span><span class="spacer"></span><span class="badge protected">SSH · rede · firewall · ZeroTier protegidos</span></div><div class="app-body service-list"></div><div class="statusbar"><span>Serviços da VM</span><span></span></div></div>`;
  const list=win.content.querySelector('.service-list');
  const load=async()=>{try{const d=await api('/api/services');list.innerHTML=d.services.map(s=>`<article class="service-item" data-service="${escapeHTML(s.name)}"><div><h4>${escapeHTML(s.name)} <span class="badge ${s.status}">${s.status}</span> ${s.protected?'<span class="badge protected">protegido</span>':''}</h4><p>Runlevels: ${escapeHTML(s.runlevels.join(', ')||'—')}</p></div><div class="item-actions">${s.protected?'<button class="btn" disabled>Somente leitura</button>':`<button class="btn" data-act="start">Start</button><button class="btn" data-act="stop">Stop</button><button class="btn" data-act="restart">Restart</button><button class="btn" data-act="enable">Enable</button><button class="btn" data-act="disable">Disable</button>`}</div></article>`).join('')}catch(e){ctx.notify(e.message,'error')}};
  list.addEventListener('click',async e=>{const b=e.target.closest('[data-act]');if(!b)return;const a=e.target.closest('[data-service]');const name=a.dataset.service,act=b.dataset.act;if(['stop','restart','disable'].includes(act)){const ok=await ctx.confirmDialog('Confirmar ação',`${act} em ${name}?`,'Continuar',act!=='restart');if(!ok)return}try{const d=await api('/api/services/action',{method:'POST',body:{name,action:act}});const out=document.createElement('pre');out.className='job-output';a.appendChild(out);watchJob(d.job.id,out,ctx,()=>load())}catch(err){ctx.notify(err.message,'error')}});win.content.querySelector('[data-s-refresh]').addEventListener('click',load);load();
}

function mountDocker(win,ctx){
  win.content.innerHTML=`<div class="app-shell"><div class="toolbar"><button data-d-refresh>${icon('refresh')}</button><button class="btn ghost" data-d-tab="containers">Containers</button><button class="btn ghost" data-d-tab="images">Images</button><button class="btn ghost" data-d-tab="volumes">Volumes</button><button class="btn ghost" data-d-tab="networks">Networks</button><span class="spacer"></span><span data-d-status></span></div><div class="app-body docker-list"></div><div class="statusbar"><span>Docker</span><span></span></div></div>`;
  const list=win.content.querySelector('.docker-list'),status=win.content.querySelector('[data-d-status]');let tab='containers';
  const load=async()=>{try{const d=await api('/api/docker');const info=d.docker;if(!info.installed){status.innerHTML='<span class="badge">não instalado</span>';list.innerHTML=`<article class="docker-item"><div><h4>Docker não instalado</h4><p>Instale pelo aplicativo Pacotes.</p></div><div class="item-actions"><button class="btn primary" data-open-packages>Abrir Pacotes</button></div></article>`;return}status.innerHTML=`<span class="badge ${info.daemon?'running':'stopped'}">${info.daemon?'daemon online':'daemon indisponível'}</span>`;if(!info.daemon){list.innerHTML=`<article class="docker-item"><div><h4>Docker instalado, mas indisponível</h4><p>${escapeHTML(info.error||'Inicie o serviço docker no aplicativo Serviços.')}</p></div></article>`;return}if(tab==='containers'){const c=(await api('/api/docker/containers')).containers;list.innerHTML=c.length?c.map(x=>`<article class="docker-item" data-container="${escapeHTML(x.id)}"><div><h4>${escapeHTML(x.name||x.id.slice(0,12))} <span class="badge ${x.state==='running'?'running':'stopped'}">${escapeHTML(x.state)}</span></h4><p>${escapeHTML(x.image)} · ${escapeHTML(x.status)} · ${escapeHTML(x.ports||'sem portas publicadas')}</p></div><div class="item-actions"><button class="btn" data-da="start">Start</button><button class="btn" data-da="stop">Stop</button><button class="btn" data-da="restart">Restart</button><button class="btn" data-da="logs">Logs</button><button class="btn" data-da="terminal">Terminal</button></div></article>`).join(''):'<div>Nenhum container.</div>'}else{const r=(await api(`/api/docker/resources/${tab}`)).items;list.innerHTML=r.map((x,i)=>`<article class="docker-item"><div><h4>${escapeHTML(x.Repository||x.Name||x.ID||x.Driver||`${tab} ${i+1}`)}</h4><p>${escapeHTML(JSON.stringify(x))}</p></div></article>`).join('')||'<div>Nenhum item.</div>'}}catch(e){ctx.notify(e.message,'error')}};
  win.content.addEventListener('click',async e=>{if(e.target.closest('[data-open-packages]'))ctx.openApp('packages');const tb=e.target.closest('[data-d-tab]');if(tb){tab=tb.dataset.dTab;load();return}const b=e.target.closest('[data-da]');if(!b)return;const a=e.target.closest('[data-container]'),container=a.dataset.container,act=b.dataset.da;if(act==='terminal'){ctx.openApp('terminal',{mode:'docker',container});return}if(act==='logs'){try{const d=await api('/api/docker/logs?'+qs({container,tail:400}));ctx.messageDialog('Container logs',d.content||'(sem logs)',true)}catch(err){ctx.notify(err.message,'error')}return}if(['stop','restart'].includes(act)){const ok=await ctx.confirmDialog('Docker',`${act} container ${container.slice(0,12)}?`,'Continuar',act==='stop');if(!ok)return}try{const d=await api('/api/docker/action',{method:'POST',body:{container,action:act}});const out=document.createElement('pre');out.className='job-output';a.appendChild(out);watchJob(d.job.id,out,ctx,()=>load())}catch(err){ctx.notify(err.message,'error')}});win.content.querySelector('[data-d-refresh]').addEventListener('click',load);load();
}

function mountLogs(win,ctx){
  win.content.innerHTML=`<div class="app-shell"><div class="toolbar"><select data-log-source><option value="workspace">Workspace</option><option value="system">Sistema</option></select><button data-l-refresh>${icon('refresh')}</button><label class="switch"><input type="checkbox" data-auto> Auto</label><input data-filter placeholder="Filtrar"><button data-download-log>${icon('download')}</button></div><pre class="app-body log-view"></pre><div class="statusbar"><span data-log-path></span><span data-log-state></span></div></div>`;
  const view=win.content.querySelector('.log-view'),src=win.content.querySelector('[data-log-source]'),filter=win.content.querySelector('[data-filter]'),pathEl=win.content.querySelector('[data-log-path]');let raw='',timer=null;
  const render=()=>{const q=filter.value.toLowerCase();view.textContent=q?raw.split('\n').filter(x=>x.toLowerCase().includes(q)).join('\n'):raw;view.scrollTop=view.scrollHeight};
  const load=async()=>{try{const d=await api('/api/logs?'+qs({source:src.value,lines:500}));raw=d.log.content||'';pathEl.textContent=d.log.path;render()}catch(e){ctx.notify(e.message,'error')}};
  src.addEventListener('change',load);filter.addEventListener('input',render);win.content.querySelector('[data-l-refresh]').addEventListener('click',load);win.content.querySelector('[data-auto]').addEventListener('change',e=>{clearInterval(timer);timer=e.target.checked?setInterval(load,3000):null});win.content.querySelector('[data-download-log]').addEventListener('click',()=>{const blob=new Blob([raw],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${src.value}.log`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});load();win.onClose=()=>{clearInterval(timer);return true};
}

function mountSettings(win,ctx){
  const theme=localStorage.getItem('pibic-theme')||'dark',termFont=localStorage.getItem('pibic-terminal-font')||13,scroll=localStorage.getItem('pibic-terminal-scrollback')||3000,editorFont=localStorage.getItem('pibic-editor-font')||13,tab=localStorage.getItem('pibic-editor-tab')||4,wrap=localStorage.getItem('pibic-editor-wrap')==='1';
  win.content.innerHTML=`<div class="settings-app"><section class="settings-section"><h3>Aparência</h3><div class="settings-row"><div>Tema<small>Preferência guardada no navegador.</small></div><select data-set="theme"><option value="dark">Escuro</option><option value="light">Claro</option><option value="system">Sistema</option></select></div><div class="settings-row"><div>Animações reduzidas</div><label class="switch"><input type="checkbox" data-set="reduced"> reduzir</label></div></section><section class="settings-section"><h3>Terminal</h3><div class="settings-row"><div>Tamanho da fonte</div><input type="number" min="10" max="24" data-set="term-font" value="${termFont}"></div><div class="settings-row"><div>Scrollback</div><input type="number" min="500" max="20000" data-set="scroll" value="${scroll}"></div></section><section class="settings-section"><h3>Editor</h3><div class="settings-row"><div>Tamanho da fonte</div><input type="number" min="10" max="24" data-set="editor-font" value="${editorFont}"></div><div class="settings-row"><div>Tab size</div><input type="number" min="2" max="8" data-set="tab" value="${tab}"></div><div class="settings-row"><div>Word wrap</div><label class="switch"><input type="checkbox" data-set="wrap" ${wrap?'checked':''}> ativado</label></div></section><section class="settings-section"><h3>Workspace</h3><p>Serviço local: <code>127.0.0.1:8765</code></p><p>O Workspace não altera SSH, porta 22, DNS, hostname, interfaces ou ZeroTier.</p></section><section class="settings-section"><h3>Sobre</h3><p>PIBIC Workspace v0.1 · Web Desktop Environment para VMs Alpine Linux.</p></section></div>`;
  const themeSel=win.content.querySelector('[data-set="theme"]');themeSel.value=theme;themeSel.addEventListener('change',()=>{localStorage.setItem('pibic-theme',themeSel.value);ctx.applyTheme()});
  win.content.querySelector('[data-set="reduced"]').addEventListener('change',e=>{document.documentElement.dataset.reduced=e.target.checked?'1':'0';localStorage.setItem('pibic-reduced',e.target.checked?'1':'0')});
  win.content.querySelector('[data-set="term-font"]').addEventListener('change',e=>localStorage.setItem('pibic-terminal-font',String(Math.max(10,Math.min(24,Number(e.target.value)||13)))));
  win.content.querySelector('[data-set="scroll"]').addEventListener('change',e=>localStorage.setItem('pibic-terminal-scrollback',String(Math.max(500,Math.min(20000,Number(e.target.value)||3000)))));
  win.content.querySelector('[data-set="editor-font"]').addEventListener('change',e=>{localStorage.setItem('pibic-editor-font',e.target.value);document.documentElement.style.setProperty('--editor-font',`${e.target.value}px`)});
  win.content.querySelector('[data-set="tab"]').addEventListener('change',e=>localStorage.setItem('pibic-editor-tab',String(Math.max(2,Math.min(8,Number(e.target.value)||4)))));
  win.content.querySelector('[data-set="wrap"]').addEventListener('change',e=>localStorage.setItem('pibic-editor-wrap',e.target.checked?'1':'0'));
}
