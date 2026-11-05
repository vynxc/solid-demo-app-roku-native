// Browser-shaped navigation/input services; all rendering stays in SceneGraph.
class Target {
  handlers=new Map<string,Set<any>>();
  addEventListener(n:string,fn:any){let s=this.handlers.get(n);if(!s)this.handlers.set(n,s=new Set());s.add(fn);}
  removeEventListener(n:string,fn:any){this.handlers.get(n)?.delete(fn);}
  dispatchEvent(e:any){e.target ||= this;for(const fn of this.handlers.get(e.type)||[])fn(e);return !e.defaultPrevented;}
}
export function installBrowserServices(){
 const g=globalThis as any; const events=new Target();
 class SearchParams {
   pairs:Array<[string,string]>=[];
   constructor(v:any=''){if(typeof v==='string'){for(const part of v.replace(/^\?/,'').split('&'))if(part){const i=part.indexOf('=');this.pairs.push([decodeURIComponent(i<0?part:part.slice(0,i)),decodeURIComponent((i<0?'':part.slice(i+1)).replace(/\+/g,' '))]);}}else if(v&&v[Symbol.iterator])this.pairs=Array.from(v);else for(const k in v)this.append(k,v[k]);}
   get(k:string){return this.pairs.find(p=>p[0]===k)?.[1]??null;}getAll(k:string){return this.pairs.filter(p=>p[0]===k).map(p=>p[1]);}has(k:string){return this.pairs.some(p=>p[0]===k);}append(k:string,v:any){this.pairs.push([k,String(v)]);}delete(k:string){this.pairs=this.pairs.filter(p=>p[0]!==k);}set(k:string,v:any){this.delete(k);this.append(k,v);}toString(){return this.pairs.map(p=>p.map(encodeURIComponent).join('=')).join('&');}entries(){return this.pairs[Symbol.iterator]();}keys(){return this.pairs.map(p=>p[0])[Symbol.iterator]();}forEach(fn:any){for(const [k,v] of this.pairs)fn(v,k,this);}[Symbol.iterator](){return this.entries();}
 }
 g.URLSearchParams ||= SearchParams;
 g.URL ||= class URL {
  href:string;origin:string;protocol:string;host:string;hostname:string;pathname:string;search:string;hash:string;searchParams:any;
  constructor(input:any,base='https://roku.local/'){let u=String(input);const b=String(base).match(/^(https?:)\/\/([^/]+)/);if(!/^https?:\/\//.test(u))u=(b?b[1]+'//'+b[2]:'https://roku.local')+(u.startsWith('/')?'':'/')+u;const m=u.match(/^(https?:)\/\/([^/]+)([^?#]*)(\?[^#]*)?(#.*)?$/);if(!m)throw Error('Unsupported URL '+u);this.href=u;this.protocol=m[1];this.host=this.hostname=m[2];this.origin=m[1]+'//'+m[2];this.pathname=m[3]||'/';this.search=m[4]||'';this.hash=m[5]||'';this.searchParams=new g.URLSearchParams(this.search);}
  toString(){return this.href;}
 };
 g.performance ||= {now:()=>Date.now()};g.performance.mark ||= ()=>{};g.performance.measure ||= ()=>{};
 g.window=g;g.self=g;g.innerWidth=1920;g.innerHeight=1080;g.devicePixelRatio=1;
 g.addEventListener=events.addEventListener.bind(events);g.removeEventListener=events.removeEventListener.bind(events);g.dispatchEvent=events.dispatchEvent.bind(events);
 class Event {type:string;defaultPrevented=false;constructor(type:string,opts:any={}){this.type=type;Object.assign(this,opts);}preventDefault(){this.defaultPrevented=true;}stopPropagation(){}stopImmediatePropagation(){}}
 g.Event=Event;g.CustomEvent=Event;g.KeyboardEvent=Event;
 let hash='#/browse/all';const location:any={protocol:'https:',origin:'https://roku.local',pathname:'/',search:'?animations=false&numImageWorkers=0',get hash(){return hash;},set hash(v){hash=v.startsWith('#')?v:'#'+v;events.dispatchEvent(new Event('hashchange'));},get href(){return this.origin+'/'+this.search+hash;}};
 location.assign=(s:string)=>{const i=s.indexOf('#');if(i>=0)location.hash=s.slice(i);};location.replace=location.assign;location.reload=()=>{};
 g.location=location;const stack:string[]=[hash];let position=0;
 const assign=(url:string)=>{const i=String(url).indexOf('#');if(i>=0)location.hash=String(url).slice(i);};
 g.history={state:null,pushState(state:any,_:any,url:string){this.state=state;assign(url);stack.splice(++position);stack.push(hash);},replaceState(state:any,_:any,url:string){this.state=state;assign(url);stack[position]=hash;},back(){if(position>0){hash=stack[--position];events.dispatchEvent(new Event('popstate'));events.dispatchEvent(new Event('hashchange'));}},go(n:number){if(n<0)this.back();}};
 const doc:any=new Target();doc.location=location;doc.defaultView=g;doc.documentElement={clientWidth:1920,clientHeight:1080};doc.body=doc;doc.head={appendChild(){}};doc.activeElement=null;doc.getElementById=()=>null;doc.querySelector=()=>null;doc.querySelectorAll=()=>[];doc.createElement=(tag:string)=>{if(tag==='style')return {textContent:'',style:{},remove(){}};throw Error('DOM element unavailable: '+tag);};doc.createEvent=()=>new Event('');g.document=doc;
 const store=new Map();g.localStorage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:any)=>store.set(k,String(v)),removeItem:(k:string)=>store.delete(k),clear:()=>store.clear()};g.sessionStorage=g.localStorage;
 g.navigator={userAgent:'Roku OS 16 / SolidTV SceneGraph',platform:'Roku',language:'en-US'};
 g.requestAnimationFrame=(fn:any)=>setTimeout(()=>fn(performance.now()),16);g.cancelAnimationFrame=clearTimeout;
 g.queueMicrotask ||= (fn:any)=>Promise.resolve().then(fn);g.scrollTo=()=>{};
}
export function sendKey(key:string,press:boolean){const g=globalThis as any;const map:any={left:['ArrowLeft',37],right:['ArrowRight',39],up:['ArrowUp',38],down:['ArrowDown',40],OK:['Enter',13],back:['Back',8],play:['PlayPause',10252]};const v=map[key];if(!v)return false;const e=new g.KeyboardEvent(press?'keydown':'keyup',{key:v[0],code:v[0],keyCode:v[1],which:v[1],repeat:false});g.document.dispatchEvent(e);g.dispatchEvent(e);return true;}
