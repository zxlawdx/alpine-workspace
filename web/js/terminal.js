import {wsUrl, qs} from './api.js';

const X = window.PIBICXterm;
if(!X) throw new Error('xterm.js local não carregou');

function fallbackCopy(text){
  // Primeiro fallback: usa o evento copy e clipboardData, como terminais web
  // tradicionais. execCommand aparece somente aqui para disparar o evento
  // legado quando a Clipboard API moderna foi bloqueada.
  let eventCopied=false;
  const onCopy=ev=>{
    if(ev.clipboardData){
      ev.clipboardData.setData('text/plain',text);
      ev.preventDefault();
      eventCopied=true;
    }
  };
  document.addEventListener('copy',onCopy,{capture:true,once:true});
  try{ document.execCommand('copy'); }catch(_){ }
  document.removeEventListener('copy',onCopy,true);
  if(eventCopied) return true;

  // Último recurso: seleção temporária em textarea para navegadores antigos.
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly','');
  ta.style.cssText='position:fixed;left:-9999px;top:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  let ok=false;
  try{ ok = document.execCommand('copy'); }catch(_){ ok=false; }
  ta.remove();
  return ok;
}

export class TerminalSession{
  constructor(host, options={}){
    this.host=host;
    this.options=options;
    this.id=options.id || crypto.randomUUID();
    this.notify=options.notify || (()=>{});
    this.term = new X.Terminal({
      cursorBlink:true,
      convertEol:false,
      fontFamily:getComputedStyle(document.documentElement).getPropertyValue('--mono').trim(),
      fontSize:Number(localStorage.getItem('pibic-terminal-font')||13),
      scrollback:Number(localStorage.getItem('pibic-terminal-scrollback')||3000),
      allowProposedApi:false,
      theme:{background:'#090d12',foreground:'#d7e1ea',cursor:'#8cc5ff',selectionBackground:'#35506c'},
    });
    this.fitAddon = new X.FitAddon.FitAddon();
    this.term.loadAddon(this.fitAddon);
    this.pane=document.createElement('div');
    this.pane.className='terminal-pane';
    this.pane.tabIndex=0;
    host.appendChild(this.pane);
    this.term.open(this.pane);
    this.socket=null;
    this.closed=false;
    this.resizeObserver=new ResizeObserver(()=>this.fit());
    this.resizeObserver.observe(this.pane);
    this._bindClipboard();
    this._connect();
    setTimeout(()=>{this.fit();this.term.focus();},30);
  }

  _connect(){
    const params={};
    if(this.options.cwd) params.cwd=this.options.cwd;
    if(this.options.mode) params.mode=this.options.mode;
    if(this.options.container) params.container=this.options.container;
    const query=qs(params);
    const url=wsUrl(`/ws/terminal/${encodeURIComponent(this.id)}${query?'?'+query:''}`);
    this.socket=new WebSocket(url);
    this.socket.addEventListener('open',()=>{
      this.fit();
      window.dispatchEvent(new CustomEvent('workspace-connection',{detail:{online:true}}));
    });
    this.socket.addEventListener('message',ev=>{
      try{
        const msg=JSON.parse(ev.data);
        if(msg.type==='output') this.term.write(msg.data);
        if(msg.type==='exit') this.term.write(`\r\n[processo encerrado: ${msg.code}]\r\n`);
      }catch(_){ this.term.write(String(ev.data)); }
    });
    this.socket.addEventListener('close',()=>{
      if(!this.closed) this.term.write('\r\n\x1b[33m[terminal desconectado]\x1b[0m\r\n');
    });
    this.socket.addEventListener('error',()=>window.dispatchEvent(new CustomEvent('workspace-connection',{detail:{online:false}})));
    this.term.onData(data=>this.sendInput(data));
  }

  sendInput(data){
    if(this.socket?.readyState===WebSocket.OPEN) this.socket.send(JSON.stringify({type:'input',data}));
  }

  fit(){
    if(this.closed || !this.pane.isConnected || this.pane.offsetParent===null) return;
    try{
      this.fitAddon.fit();
      if(this.socket?.readyState===WebSocket.OPEN){
        this.socket.send(JSON.stringify({type:'resize',cols:this.term.cols,rows:this.term.rows}));
      }
    }catch(_){ }
  }

  async copySelection(){
    const text=this.term.getSelection();
    if(!text) return false;
    try{
      await navigator.clipboard.writeText(text);
      this.notify('Texto copiado para o clipboard local.','success');
      return true;
    }catch(_){
      if(fallbackCopy(text)){
        this.notify('Texto copiado usando o modo de compatibilidade.','information');
        return true;
      }
      this.notify('O navegador bloqueou o clipboard. Use o menu de contexto ou a ação nativa de copiar.','warning');
      return false;
    }
  }

  async pasteClipboard(){
    try{
      const text=await navigator.clipboard.readText();
      if(text) this.sendInput(text);
      return true;
    }catch(_){
      this.notify('O navegador bloqueou a leitura programática do clipboard. Clique no terminal e use Colar do navegador/menu; eventos nativos de paste continuam aceitos.','warning');
      return false;
    }
  }

  _bindClipboard(){
    this.term.attachCustomKeyEventHandler(ev=>{
      if(ev.type!=='keydown') return true;
      const key=ev.key.toLowerCase();
      if(ev.ctrlKey && ev.shiftKey && key==='c'){
        if(this.term.hasSelection()) this.copySelection();
        return false;
      }
      if(ev.ctrlKey && ev.shiftKey && key==='v'){
        this.pasteClipboard();
        return false;
      }
      // Ctrl+C intentionally remains untouched so xterm sends \x03 to the PTY.
      return true;
    });
    this.pane.addEventListener('paste',ev=>{
      const text=ev.clipboardData?.getData('text/plain');
      if(text){ ev.preventDefault(); this.sendInput(text); }
    });
    this.pane.addEventListener('copy',ev=>{
      const text=this.term.getSelection();
      if(text && ev.clipboardData){
        ev.clipboardData.setData('text/plain',text);
        ev.preventDefault();
      }
    });
    this.pane.addEventListener('contextmenu',ev=>{
      ev.preventDefault();
      window.dispatchEvent(new CustomEvent('workspace-context-menu',{detail:{
        x:ev.clientX,y:ev.clientY,items:[
          {label:'Copiar',icon:'copy',action:()=>this.copySelection(),disabled:!this.term.hasSelection()},
          {label:'Colar',icon:'paste',action:()=>this.pasteClipboard()},
          {separator:true},
          {label:'Selecionar tudo',action:()=>this.term.selectAll()},
          {label:'Limpar terminal',action:()=>this.term.clear()},
        ]
      }}));
    });
  }

  focus(){this.term.focus();this.fit();}
  show(){this.pane.style.display='block';this.fit();}
  hide(){this.pane.style.display='none';}
  dispose(){
    this.closed=true;
    this.resizeObserver.disconnect();
    try{this.socket?.close();}catch(_){ }
    try{this.term.dispose();}catch(_){ }
    this.pane.remove();
  }
}
