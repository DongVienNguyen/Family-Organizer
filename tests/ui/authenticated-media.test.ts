import fs from 'node:fs';
import ts from 'typescript';
import {it,expect} from 'vitest';
for(const name of ['Avatar','Assets','Finance','Documents','DebtTracker','Notes','Tasks','Markdown'])it(`actual ${name} image paths use authenticated media ownership`,()=>{
 const source=fs.readFileSync(new URL('../../src/components/'+name+'.tsx',import.meta.url),'utf8');const tree=ts.createSourceFile(name+'.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let images=0,owned=0;
 const visit=(node:ts.Node)=>{if(ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node)){if(node.tagName.getText(tree)==='img')images++;if(node.tagName.getText(tree)==='AuthenticatedImage')owned++;}ts.forEachChild(node,visit);};visit(tree);if(name==='Notes'){expect(source).not.toContain('<img');return;}expect(images).toBe(0);expect(owned).toBeGreaterThan(0);
});
it('actual document PDF and original links use authenticated media ownership',()=>{
 const source=fs.readFileSync(new URL('../../src/components/Documents.tsx',import.meta.url),'utf8');const tree=ts.createSourceFile('Documents.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const links:string[]=[];
 const visit=(node:ts.Node)=>{if(ts.isJsxOpeningElement(node)){const href=node.attributes.properties.find(p=>ts.isJsxAttribute(p)&&p.name.getText(tree)==='href') as ts.JsxAttribute|undefined;if(href&&/\.url/.test(href.getText(tree)))links.push(node.tagName.getText(tree));}ts.forEachChild(node,visit);};visit(tree);expect(links).toHaveLength(3);expect(links.every(tag=>tag==='AuthenticatedMediaLink')).toBe(true);
});
it('actual document viewer drops stale attachment context when authoritative documents disappear',()=>{
 const source=fs.readFileSync(new URL('../../src/components/Documents.tsx',import.meta.url),'utf8');const tree=ts.createSourceFile('Documents.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const effects:string[]=[];
 const visit=(node:ts.Node)=>{if(ts.isCallExpression(node)&&node.expression.getText(tree)==='useEffect'&&node.arguments[1]?.getText(tree).includes('documents'))effects.push(node.arguments[0].getText(tree));ts.forEachChild(node,visit);};visit(tree);
 let viewer:any={files:[{url:'/uploads/documents/synthetic.pdf'}],index:0,title:'Synthetic private'};
 for(const expression of effects){const evaluate=new Function('viewer','documents','setViewer','('+expression+')()');evaluate(viewer,[],(value:any)=>{viewer=value;});}
 expect(viewer).toBeNull();
});

// Execute the actual hook/component source with explicit synthetic window and
// hook scheduling; real browser behavior remains the F05 acceptance gate.
import vm from 'node:vm';
import {vi,afterEach} from 'vitest';
const linkDisposals:(()=>void)[]=[];afterEach(()=>{for(const dispose of linkDisposals.splice(0))dispose();});
import {createSessionBoundary} from '../../src/utils/sessionBoundary.js';
import {createMediaResource,subscribeMediaInvalidation} from '../../src/utils/mediaResource.js';
async function linkFixture(request:typeof fetch=vi.fn(async()=>new Response('synthetic',{headers:{'Content-Type':'application/pdf'}}))){
 let token:string|null=null;const session=createSessionBoundary({origin:'http://synthetic',request,readToken:()=>token,writeToken:t=>{token=t;},purge:async()=>{}});await session.change('synthetic-a');
 const popup={closed:false,opener:{},location:{replace:vi.fn()},close:vi.fn(function(this:any){this.closed=true;})};
 const window={open:vi.fn(()=>({...popup,location:{replace:vi.fn()},close:vi.fn(function(this:any){this.closed=true;})}))};
 const urls={createObjectURL:vi.fn(()=> 'blob:synthetic-'+Math.random()),revokeObjectURL:vi.fn()};
 const slots:any[]=[],effects:{index:number;effect:()=>any;deps:any[]}[]=[];let cursor=0,rendered:any,scheduled=false,alive=true;
 const schedule=()=>{if(!scheduled&&alive){scheduled=true;queueMicrotask(()=>{scheduled=false;if(alive)render();});}};
 const context:any={browserSession:session,createMediaResource,subscribeMediaInvalidation,window,URL:urls,React:{createElement:(tag:any,props:any,...children:any[])=>({tag,props,children})},
 useState:(initial:any)=>{const index=cursor++;if(!slots[index])slots[index]={value:initial};return [slots[index].value,(next:any)=>{slots[index].value=typeof next==='function'?next(slots[index].value):next;schedule();}];},
 useRef:(initial:any)=>{const index=cursor++;if(!slots[index])slots[index]={current:initial};return slots[index];},
 useEffect:(effect:()=>any,deps:any[])=>{const index=cursor++;const previous=slots[index];if(!previous||deps.some((d,i)=>d!==previous.deps[i]))effects.push({index,effect,deps});},};
 const source=fs.readFileSync(new URL('../../src/components/AuthenticatedMedia.tsx',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,context);
 function render(){cursor=0;rendered=context.AuthenticatedMediaLink({href:'/uploads/documents/synthetic.pdf',children:'Synthetic PDF'});for(const item of effects.splice(0)){slots[item.index]?.cleanup?.();slots[item.index]={deps:item.deps,cleanup:item.effect()};}}
 const dispose=()=>{if(!alive)return;alive=false;for(const slot of slots)slot?.cleanup?.();};linkDisposals.push(dispose);
 render();return {session,request,window,urls,click:()=>{const event:any={defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};rendered.props.onClick(event);},view:()=>rendered,dispose};
}
it('actual PDF click opens its owned viewer synchronously and navigates only to authenticated blob bytes',async()=>{const f=await linkFixture();expect(f.request).not.toHaveBeenCalled();expect(f.view().props.href).toBeUndefined();f.click();expect(f.window.open).toHaveBeenCalledOnce();const viewer=f.window.open.mock.results[0].value;expect(viewer.opener).toBeNull();await vi.waitFor(()=>expect(viewer.location.replace).toHaveBeenCalledWith(expect.stringMatching(/^blob:synthetic-/)));expect(new Headers((f.request as any).mock.calls[0][1].headers).get('Authorization')).toBe('Bearer synthetic-a');f.dispose();expect(viewer.close).toHaveBeenCalled();expect(f.urls.revokeObjectURL).toHaveBeenCalled();});
it('actual PDF denial closes the empty viewer and exposes a retry message',async()=>{const f=await linkFixture(vi.fn(async()=>new Response('synthetic denied',{status:404})));f.click();const viewer=f.window.open.mock.results[0].value;await vi.waitFor(()=>expect(viewer.close).toHaveBeenCalled());expect(viewer.location.replace).not.toHaveBeenCalled();expect(JSON.stringify(f.view().children)).toContain('Vui lòng thử lại');f.dispose();});
it('actual repeated PDF click fetches current authorization again',async()=>{const f=await linkFixture();f.click();await vi.waitFor(()=>expect(f.urls.createObjectURL).toHaveBeenCalledOnce());f.click();await vi.waitFor(()=>expect(f.request).toHaveBeenCalledTimes(2));f.dispose();});
it('actual session switching closes a pending PDF viewer without navigating to late bytes',async()=>{let finish!:(response:Response)=>void;const f=await linkFixture(vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve;})));f.click();await vi.waitFor(()=>expect(f.request).toHaveBeenCalledOnce());const viewer=f.window.open.mock.results[0].value;await f.session.change('synthetic-b');expect(viewer.close).toHaveBeenCalled();finish(new Response('synthetic private'));await new Promise(resolve=>setTimeout(resolve,10));expect(viewer.location.replace).not.toHaveBeenCalled();expect(f.urls.createObjectURL).not.toHaveBeenCalled();f.dispose();});
it('actual managed PDF action remains keyboard accessible before its bytes are loaded',async()=>{const f=await linkFixture();expect(f.view().props.role).toBe('button');expect(f.view().props.tabIndex).toBe(0);const event:any={key:'Enter',defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},currentTarget:{click:f.click}};f.view().props.onKeyDown(event);expect(f.window.open).toHaveBeenCalledOnce();await vi.waitFor(()=>expect(f.request).toHaveBeenCalledOnce());f.dispose();});

it('actual Markdown attachment anchors delegate to authenticated click ownership while preserving external props',()=>{
 const source=fs.readFileSync(new URL('../../src/components/Markdown.tsx',import.meta.url),'utf8');const tree=ts.createSourceFile('Markdown.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let anchor:string|undefined;
 const visit=(node:ts.Node)=>{if(ts.isPropertyAssignment(node)&&node.name.getText(tree)==='a')anchor=node.initializer.getText(tree);ts.forEachChild(node,visit);};visit(tree);expect(anchor).toBeDefined();
 const AuthenticatedMediaLink=()=>null;const context={AuthenticatedMediaLink,React:{createElement:(tag:any,props:any)=>({tag,props})}};const render=vm.runInNewContext(ts.transpileModule('const render='+anchor+';render;', {compilerOptions:{jsx:ts.JsxEmit.React}}).outputText,context);
 for(const href of ['/uploads/documents/synthetic.pdf','https://synthetic.invalid/example.pdf']){const rendered=render({href,children:'Synthetic PDF'});expect(rendered.tag).toBe(AuthenticatedMediaLink);expect(rendered.props.href).toBe(href);expect(rendered.props.target).toBe('_blank');expect(rendered.props.rel).toBe('noreferrer noopener');}
});
