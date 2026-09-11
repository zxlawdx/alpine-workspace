import {icon} from './api.js';

export class WindowManager{
  constructor(layer, runningApps){
    this.layer=layer;this.runningApps=runningApps;this.windows=[];this.z=200;this.active=null;
    window.addEventListener('keydown',e=>this._keys(e));
    window.addEventListener('resize',()=>this._keepVisible());
  }

  open(app,{title,iconName='monitor',width=820,height=600,multi=false,onClose=null}={}){
    if(!multi){
      const existing=this.windows.find(w=>w.app===app && !w.closed);
      if(existing){this.restore(existing);this.focus(existing);return existing;}
    }
    const id=crypto.randomUUID();
    const el=document.createElement('section');
    el.className='app-window'; el.dataset.windowId=id; el.dataset.app=app;
    const n=this.windows.length%8;
    el.style.left=`${38+n*24}px`;el.style.top=`${26+n*20}px`;
    el.style.width=`min(${width}px, calc(100% - 70px))`; el.style.height=`min(${height}px, calc(100% - 55px))`;
    el.innerHTML=`
      <div class="window-titlebar">
        <span class="app-icon">${icon(iconName)}</span><span class="window-title"></span>
        <div class="window-controls">
          <button class="window-control" data-wact="min" aria-label="Minimizar">${icon('minimize')}</button>
          <button class="window-control" data-wact="max" aria-label="Maximizar ou restaurar">${icon('maximize')}</button>
          <button class="window-control close" data-wact="close" aria-label="Fechar">${icon('close')}</button>
        </div>
      </div>
      <div class="window-content"></div>
      ${['n','e','s','w','ne','nw','se','sw'].map(x=>`<div class="resize-handle ${x}" data-resize="${x}"></div>`).join('')}`;
    el.querySelector('.window-title').textContent=title||app;
    this.layer.appendChild(el);
    const win={id,app,title:title||app,iconName,el,content:el.querySelector('.window-content'),minimized:false,maximized:false,closed:false,restoreRect:null,onClose,taskButton:null};
    this.windows.push(win);this._bind(win);this._task(win);this.focus(win);
    return win;
  }

  _bind(win){
    const bar=win.el.querySelector('.window-titlebar');
    bar.addEventListener('pointerdown',e=>{
      if(e.target.closest('button'))return;
      this.focus(win);
      if(win.maximized)return;
      e.preventDefault();
      const r=win.el.getBoundingClientRect(); const lr=this.layer.getBoundingClientRect();
      const sx=e.clientX,sy=e.clientY,left=r.left-lr.left,top=r.top-lr.top;
      bar.setPointerCapture(e.pointerId);
      const move=ev=>{
        const nx=Math.max(-r.width+80,Math.min(lr.width-80,left+ev.clientX-sx));
        const ny=Math.max(0,Math.min(lr.height-38,top+ev.clientY-sy));
        win.el.style.left=`${nx}px`;win.el.style.top=`${ny}px`;
      };
      const up=ev=>{
        bar.releasePointerCapture(ev.pointerId);bar.removeEventListener('pointermove',move);bar.removeEventListener('pointerup',up);
        const x=ev.clientX-lr.left;
        if(x<24)this.snap(win,'left');else if(x>lr.width-24)this.snap(win,'right');else if(ev.clientY-lr.top<12)this.maximize(win);
      };
      bar.addEventListener('pointermove',move);bar.addEventListener('pointerup',up);
    });
    win.el.addEventListener('pointerdown',()=>this.focus(win));
    win.el.addEventListener('click',e=>{
      const a=e.target.closest('[data-wact]');if(!a)return;
      const act=a.dataset.wact;
      if(act==='close')this.close(win);else if(act==='min')this.minimize(win);else if(act==='max'){win.maximized?this.restore(win):this.maximize(win)}
    });
    win.el.querySelectorAll('[data-resize]').forEach(handle=>handle.addEventListener('pointerdown',e=>this._resizeStart(e,win,handle.dataset.resize)));
  }

  _resizeStart(e,win,dir){
    if(win.maximized)return;e.preventDefault();this.focus(win);
    const r=win.el.getBoundingClientRect(),lr=this.layer.getBoundingClientRect();
    const start={x:e.clientX,y:e.clientY,left:r.left-lr.left,top:r.top-lr.top,width:r.width,height:r.height};
    e.currentTarget.setPointerCapture(e.pointerId);
    const move=ev=>{
      let {left,top,width,height}=start; const dx=ev.clientX-start.x,dy=ev.clientY-start.y;
      if(dir.includes('e'))width=Math.max(360,start.width+dx);
      if(dir.includes('s'))height=Math.max(240,start.height+dy);
      if(dir.includes('w')){width=Math.max(360,start.width-dx);left=start.left+(start.width-width)}
      if(dir.includes('n')){height=Math.max(240,start.height-dy);top=start.top+(start.height-height)}
      width=Math.min(width,lr.width-left);height=Math.min(height,lr.height-top);
      Object.assign(win.el.style,{left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px`});
      win.el.dispatchEvent(new CustomEvent('window-resize'));
    };
    const up=ev=>{e.currentTarget.releasePointerCapture(ev.pointerId);e.currentTarget.removeEventListener('pointermove',move);e.currentTarget.removeEventListener('pointerup',up)};
    e.currentTarget.addEventListener('pointermove',move);e.currentTarget.addEventListener('pointerup',up);
  }

  _task(win){
    const b=document.createElement('button');b.className='taskbar-button running';b.title=win.title;b.innerHTML=icon(win.iconName);b.dataset.windowId=win.id;
    b.addEventListener('click',()=>{if(win.minimized)this.restore(win);else if(this.active===win)this.minimize(win);else this.focus(win)});
    this.runningApps.appendChild(b);win.taskButton=b;
  }

  focus(win){
    if(!win||win.closed)return;if(win.minimized)this.restore(win);
    this.active=win;win.el.style.zIndex=String(++this.z);
    this.windows.forEach(w=>{w.el.classList.toggle('focused',w===win);w.taskButton?.classList.toggle('focused',w===win)});
    win.el.dispatchEvent(new CustomEvent('window-focus'));
  }

  minimize(win){win.minimized=true;win.el.classList.add('minimized');win.taskButton?.classList.remove('focused');if(this.active===win)this.active=null}
  restore(win){
    win.minimized=false;win.el.classList.remove('minimized');
    if(win.maximized&&win.restoreRect){
      win.maximized=false;win.el.classList.remove('maximized');Object.assign(win.el.style,win.restoreRect);win.restoreRect=null;
      const u=win.el.querySelector('[data-wact="max"] use');if(u)u.setAttribute('href','#i-maximize');
    }
    this.focus(win);win.el.dispatchEvent(new CustomEvent('window-resize'));
  }
  maximize(win){
    if(win.maximized)return;
    win.restoreRect={left:win.el.style.left,top:win.el.style.top,width:win.el.style.width,height:win.el.style.height};
    win.maximized=true;win.el.classList.add('maximized');const u=win.el.querySelector('[data-wact="max"] use');if(u)u.setAttribute('href','#i-restore');
    this.focus(win);win.el.dispatchEvent(new CustomEvent('window-resize'));
  }
  snap(win,side){
    if(win.maximized&&win.restoreRect){win.maximized=false;win.el.classList.remove('maximized');win.restoreRect=null}
    win.el.style.top='6px';win.el.style.height='calc(100% - 12px)';win.el.style.width='calc(50% - 9px)';win.el.style.left=side==='left'?'6px':'calc(50% + 3px)';this.focus(win);win.el.dispatchEvent(new CustomEvent('window-resize'));
  }
  close(win){
    if(win.closed)return;
    try{const allowed=win.onClose?.();if(allowed===false)return}catch(_){ }
    win.closed=true;win.el.remove();win.taskButton?.remove();this.windows=this.windows.filter(w=>w!==win);
    if(this.active===win)this.active=null;
    const next=[...this.windows].reverse().find(w=>!w.minimized);if(next)this.focus(next);
  }
  _keys(e){
    if(e.altKey&&e.key==='Tab'){
      e.preventDefault();const list=this.windows.filter(w=>!w.closed);if(!list.length)return;
      const i=Math.max(0,list.indexOf(this.active));const next=list[(i+1)%list.length];this.restore(next);this.focus(next);return;
    }
  }
  _keepVisible(){this.windows.forEach(w=>{if(!w.maximized){const lr=this.layer.getBoundingClientRect(),r=w.el.getBoundingClientRect();if(r.left>lr.right-80)w.el.style.left=`${Math.max(0,lr.width-80)}px`;if(r.top>lr.bottom-38)w.el.style.top=`${Math.max(0,lr.height-38)}px`}})}
}
