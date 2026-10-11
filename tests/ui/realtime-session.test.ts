import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {expect,it,vi} from 'vitest';
const app=fs.readFileSync(new URL('../../src/App.tsx',import.meta.url),'utf8');
const source=app.slice(app.indexOf('  // Listen to realtime server pushes'),app.indexOf('  // Auth helper triggers'));
it('the actual App starts authenticated realtime, dispatches invalidation and closes it on unmount',()=>{
  let cleanup!:()=>void;const close=vi.fn(),start=vi.fn((_options:any)=>({close,closed:Promise.resolve()})),request=vi.fn();
  const context:any={useEffect:(effect:()=>(()=>void))=>{cleanup=effect();},currentUser:{id:'A'},authToken:'synthetic-A',sseRef:{current:null},startAuthenticatedRealtime:start,invalidateManagedMedia:vi.fn(),fetch:request,browserSession:{capture:()=>()=>{},request},localStorage:{getItem:()=>null},weatherLocKey:()=> 'weather',DEFAULT_VN_LOCATION:{code:'synthetic'},setWeatherLoc:vi.fn(),setInterval:vi.fn(()=>1),clearInterval:vi.fn(),setIsOnline:vi.fn(),console:{log:vi.fn(),error:vi.fn()},EventSource:class{close=close}};
  for(const name of ['fetchAllData','fetchWidgets','fetchTasks','fetchRewards','fetchNotifications','fetchBackupsAndLogs','fetchPlans','fetchNotes','fetchTransactions','fetchFinancePlanning','fetchMedications','fetchMedicationLogs','fetchShopping','fetchDocuments','fetchChildHealth','fetchUsers','fetchAppVersion'])context[name]=vi.fn();
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  expect(start).toHaveBeenCalledOnce();expect(start.mock.calls[0][0]).toMatchObject({token:'synthetic-A',request});
  const options=(start.mock.calls[0] as any)[0];options.onMessage({type:'NOTES_UPDATE'});expect(context.fetchNotes).toHaveBeenCalledOnce();expect(context.invalidateManagedMedia).toHaveBeenCalledOnce();expect(context.invalidateManagedMedia.mock.invocationCallOrder[0]).toBeLessThan(context.fetchNotes.mock.invocationCallOrder[0]);expect(context.console.log).not.toHaveBeenCalled();cleanup();expect(close).toHaveBeenCalledOnce();expect(context.clearInterval).toHaveBeenCalledWith(1);
});

it.each(['admin','member','child','guest'])('the actual health screen receives authorized patient choices for %s',role=>{
  const tree=ts.createSourceFile('App.tsx',app,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let expression='';
  const visit=(node:ts.Node)=>{if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(tree)==='ChildHealth'){const attr=node.attributes.properties.find(prop=>ts.isJsxAttribute(prop)&&prop.name.getText(tree)==='users') as ts.JsxAttribute;expression=(attr.initializer as ts.JsxExpression).expression!.getText(tree);}ts.forEachChild(node,visit);};visit(tree);expect(expression).not.toBe('');
  const users=['admin','member','child','guest'].map(id=>({id,role:id})),context={users,currentUser:{id:role,role},canAccessFinance:(value:string)=>value==='admin'||value==='member'};
  const result=vm.runInNewContext(ts.transpileModule('('+expression+')',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  expect(result.map((user:any)=>user.id)).toEqual(role==='admin'||role==='member'?users.map(user=>user.id):[role]);
});
