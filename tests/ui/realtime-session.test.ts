import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {expect,it,vi} from 'vitest';
const app=fs.readFileSync(new URL('../../src/App.tsx',import.meta.url),'utf8');
const source=app.slice(app.indexOf('  // Listen to realtime server pushes'),app.indexOf('  // Auth helper triggers'));
it('the actual App starts authenticated realtime, dispatches invalidation and closes it on unmount',()=>{
  let cleanup!:()=>void;const close=vi.fn(),start=vi.fn((_options:any)=>({close,closed:Promise.resolve()})),request=vi.fn();
  const context:any={useEffect:(effect:()=>(()=>void))=>{cleanup=effect();},currentUser:{id:'A'},authToken:'synthetic-A',sseRef:{current:null},startAuthenticatedRealtime:start,fetch:request,browserSession:{capture:()=>()=>{},request},localStorage:{getItem:()=>null},weatherLocKey:()=> 'weather',DEFAULT_VN_LOCATION:{code:'synthetic'},setWeatherLoc:vi.fn(),setInterval:vi.fn(()=>1),clearInterval:vi.fn(),setIsOnline:vi.fn(),console:{log:vi.fn(),error:vi.fn()},EventSource:class{close=close}};
  for(const name of ['fetchAllData','fetchWidgets','fetchTasks','fetchRewards','fetchNotifications','fetchBackupsAndLogs','fetchPlans','fetchNotes','fetchTransactions','fetchFinancePlanning','fetchMedications','fetchMedicationLogs','fetchShopping','fetchDocuments','fetchChildHealth','fetchUsers','fetchAppVersion'])context[name]=vi.fn();
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  expect(start).toHaveBeenCalledOnce();expect(start.mock.calls[0][0]).toMatchObject({token:'synthetic-A',request});
  const options=(start.mock.calls[0] as any)[0];options.onMessage({type:'NOTES_UPDATE'});expect(context.fetchNotes).toHaveBeenCalledOnce();expect(context.console.log).not.toHaveBeenCalled();cleanup();expect(close).toHaveBeenCalledOnce();expect(context.clearInterval).toHaveBeenCalledWith(1);
});
