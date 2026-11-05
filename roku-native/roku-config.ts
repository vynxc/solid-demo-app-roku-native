import { getBuildType, type RokuConfig } from '@roku-sdk/rsg-ts/roku-config';
import { readFile } from 'node:fs/promises';
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';

// Roku's JS engine does not give each `for (const key of ...)` iteration its
// own binding. The framework generates every property descriptor in such a
// loop, so all of them captured the final key (`wordWrap`) and every
// width/height/x/y write landed in lng.wordWrap, collapsing layout. Rewrite
// the two descriptor loops to forEach, which restores one binding per key.
// Done at build time on the installed framework copy so the next build from a
// clean node_modules gets the same fix.
function patchSolidElementNode() {
  try {
    const dir = realpathSync(path.join(process.cwd(), 'node_modules/@solidtv/solid'));
    const file = path.join(dir, 'dist/src/core/elementNode.js');
    const source = readFileSync(file, 'utf8');
    const patched = source.replace(
      /for \(const key of (LightningRendererNumberProps|LightningRendererNonAnimatingProps)\) \{([\s\S]*?)\n\}/g,
      (_m, list, body) => `${list}.forEach((key) => {${body}\n});`,
    );
    if (patched !== source) {
      writeFileSync(file, patched);
      console.log('Patched @solidtv/solid property descriptor loops for Roku');
    } else if (source.includes('for (const key of LightningRendererNumberProps)')) {
      throw new Error('Could not patch @solidtv/solid descriptor loops; layout would collapse');
    }
  } catch (error) {
    console.warn('Could not patch @solidtv/solid: ' + String((error as any)?.message || error));
  }
}
patchSolidElementNode();
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { transformAsync } from '@babel/core';
import solidPreset from 'babel-preset-solid';
import typescriptPreset from '@babel/preset-typescript';
const require=createRequire(import.meta.url);
const root=process.cwd();
const shared=path.resolve(root,'../src');
// Public clones have no credential. Build against the deterministic fixture
// API in that case; adding the gitignored src/api/key.ts switches to live TMDB.
const hasLiveApiKey=existsSync(path.join(shared,'api/key.ts'));
const plugin={name:'solidtv-scenegraph-host',setup(build:any){
 build.initialOptions.conditions=['browser'];
 build.initialOptions.define={...build.initialOptions.define,'import.meta.env.DEV':'false','import.meta.env.PROD':'true','import.meta.env.BASE_URL':'"pkg:/"','import.meta.env.LEGACY':'false','import.meta.env.VITE_USE_NEW_FLEX':'true',SOLIDTV_DOM_RENDERING:'false',SOLIDTV_DISABLE_SHADERS:'false',SOLIDTV_SHARED_ENTRY:'"../../../src/index"'};
 build.onResolve({filter:/^theme$/},()=>({path:path.join(shared,'theme.ts')}));
 build.onResolve({filter:/^(@solidtv\/|@solidjs\/|@solid-primitives\/|solid-js)/},(args:any)=>{
  if(args.path==='solid-js')return {path:path.join(root,'node_modules/solid-js/dist/solid.js')};
  if(['solid-js/store','solid-js/web','solid-js/universal'].includes(args.path)){const part=args.path.split('/')[1];return {path:path.join(root,'node_modules/solid-js',part,'dist',part+'.js')};}
  const parts=args.path.split('/');const name=args.path.startsWith('@')?parts.slice(0,2).join('/'):parts[0];const sub=parts.slice(name.startsWith('@')?2:1).join('/');let dir=path.join(root,'node_modules',name);if(!existsSync(path.join(dir,'package.json'))){let scan=path.dirname(realpathSync(args.importer));while(scan!=='/'){const candidate=path.join(scan,'node_modules',name);if(existsSync(path.join(candidate,'package.json'))){dir=candidate;break;}scan=path.dirname(scan);}}const pkg=JSON.parse(readFileSync(path.join(dir,'package.json'),'utf8'));
  let entry=pkg.exports?.[sub?'./'+sub:'.'] || (!sub?pkg.exports:null) || pkg.module || pkg.main;
  while(entry&&typeof entry==='object')entry=entry.browser||entry.import||entry.default||entry.solid;
  if(typeof entry!=='string')throw Error('Cannot resolve '+args.path);
  return {path:path.resolve(dir,entry)};
 });
 build.onResolve({filter:/pages\/(Firebolt|RendererVersions)$/},()=>({path:path.join(root,'src/capability.ts')}));
 // The shared player imports `../video` (browser/Shaka). Route that import to
 // the native SceneGraph Video adapter, keeping the shared Player UI.
 build.onResolve({filter:/^\.\.\/video$/},(args:any)=>({path:path.join(root,'src/roku/video.ts')}));
 build.onLoad({filter:/[\/]core[\/]lightningInit\.js$/},async(args:any)=>{const s=await readFile(args.path,'utf8');const anchor='new lng.RendererMain(settings, rootId)';if(!s.includes(anchor))throw Error('SolidTV boundary changed');return {contents:s.replace(anchor,'new globalThis.__SolidTVRokuRenderer(settings, rootId)'),loader:'js'};});
 build.onLoad({filter:/\.[jt]sx?$/},async(args:any)=>{
  if(!hasLiveApiKey&&args.path===path.join(shared,'api/index.ts'))return {contents:await readFile(path.join(root,'src/offline-api.ts'),'utf8'),loader:'ts',resolveDir:path.join(root,'src')};
  if(args.path===path.join(shared,'fonts.ts'))return {contents:'export default [];',loader:'js'};
  if(!args.path.startsWith(shared+'/')&&!args.path.includes('/@solidtv/solid/'))return;
  let source=await readFile(args.path,'utf8');
  if(args.path.endsWith('/primitives/FPSCounter.tsx')||args.path.endsWith('/primitives/FPSCounter.jsx')){
   // The shared panel was written for WebGL, where idle still draws. The
   // native renderer is dirty-driven, so allow 0 and show the real produced
   // update rate instead of retaining the last non-zero value. The published
   // package resolves to FPSCounter.jsx; the source checkout uses .tsx.
   source=source.replace(/if \(fps > 5\) \{/,'if (fps >= 0) {').replace(/if \(!fps\)\s*return;?/,'if (typeof fps !== "number") return;');
   if(!source.includes('if (fps >= 0) {')||!source.includes('typeof fps !== "number"'))throw Error('Could not patch FPSCounter for native idle 0');
  }
  if(args.path===path.join(shared,'pages/Player.tsx')){
   const from='https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8';
   const to='https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
   if(!source.includes(from))throw Error('Player stream URL changed');
   source=source.split(from).join(to);
  }
  const result=await transformAsync(source,{filename:args.path,babelrc:false,configFile:false,presets:[[solidPreset,{generate:'universal',moduleName:'@solidtv/solid'}],[typescriptPreset,{allExtensions:true,isTSX:/[jt]sx$/.test(args.path),allowDeclareFields:true}]],assumptions:{noClassCalls:true},plugins:[require.resolve('@babel/plugin-transform-class-properties'),require.resolve('@babel/plugin-transform-classes'),()=>({visitor:{StringLiteral(p:any){const v=p.node.value;if(/^#[a-fA-F0-9]{6}([a-fA-F0-9]{2})?$/.test(v))p.replaceWith({type:'NumericLiteral',value:parseInt(v.slice(1).padEnd(8,'f'),16)});}}})]});
  return {contents:result?.code||source,loader:'js',resolveDir:path.dirname(args.path)};
 });
}};
export default {app:{entryPoint:'src/index.ts',staticAssetsDir:'./pkg',manifestEntries:{title:'SolidTV Demo — Roku prototype',major_version:1,minor_version:0,build_version:1,ui_resolutions:'fhd',rsg_version:'2.0',splash_color:'0x101826FF'}},pipeline:{startDev:{plugins:[{position:{before:'solid'},plugin}]},build:{plugins:[{position:{before:'solid'},plugin}]}}} satisfies RokuConfig;
