let csrfToken = '';

export async function initSession(){
  const r = await fetch('/api/session', {credentials:'same-origin'});
  const data = await r.json();
  if(!r.ok || !data.ok) throw new Error(data?.error?.message || 'Falha ao iniciar sessão');
  csrfToken = data.csrf;
  return data;
}

export async function api(path, options={}){
  const opts = {...options, credentials:'same-origin'};
  opts.headers = {'Accept':'application/json', ...(options.headers||{})};
  if(opts.body && !(opts.body instanceof FormData) && typeof opts.body !== 'string'){
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const method = (opts.method || 'GET').toUpperCase();
  if(['POST','PUT','PATCH','DELETE'].includes(method)) opts.headers['X-CSRF-Token'] = csrfToken;
  let r;
  try{
    r = await fetch(path, opts);
  }catch(err){
    window.dispatchEvent(new CustomEvent('workspace-connection', {detail:{online:false}}));
    throw err;
  }
  window.dispatchEvent(new CustomEvent('workspace-connection', {detail:{online:true}}));
  let data;
  const ctype = r.headers.get('content-type') || '';
  if(ctype.includes('application/json')) data = await r.json();
  else data = await r.text();
  if(!r.ok){
    const message = data?.error?.message || data?.detail?.message || data?.detail || `HTTP ${r.status}`;
    const error = new Error(typeof message === 'string' ? message : JSON.stringify(message));
    error.status = r.status;
    error.payload = data;
    throw error;
  }
  return data;
}

export function qs(params){
  const s = new URLSearchParams();
  for(const [k,v] of Object.entries(params||{})) if(v !== undefined && v !== null) s.set(k, String(v));
  return s.toString();
}

export function wsUrl(path){
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${path}`;
}

export function formatBytes(n){
  n = Number(n||0);
  if(n < 1024) return `${n} B`;
  const units=['KiB','MiB','GiB','TiB']; let i=-1;
  do{n/=1024;i++;}while(n>=1024 && i<units.length-1);
  return `${n.toFixed(n>=10?1:2)} ${units[i]}`;
}

export function escapeHTML(value=''){
  return String(value).replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

export function icon(name, cls=''){
  return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}
