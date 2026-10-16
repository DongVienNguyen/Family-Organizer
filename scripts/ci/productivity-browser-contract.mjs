import {isDeepStrictEqual} from 'node:util';
export const productivityFixtureVersion=9;
import {validateMatrixTouchReports} from './matrix-touch-contract.mjs';
import {validateBrowserReports,browserProjects} from './browser-contract.mjs';
export const productivityBrowserCases=[
 'P04 C01 shared drawer keeps no-date/none and dirty draft across close and view changes',
 'P04 C02 drawer keyboard popup Escape preserves dialog and phone layout has no overflow',
 'P04 C03 actual checklist/subtask/personal pin preserve root identity and no reward side effect',
 'P04 C04 child has no private member rows and logout clears the shared draft',
 'P04 C05 delayed checklist read cannot delete existing items',
 'P04 C06 conflict reload reads the current authorized server revision',
 'P04 C07 retained board refuses opening while authorization refresh is pending',
 'P04 C08 unsent comment checklist and subtask text survive unrelated SSE refresh',
 'P04 C09 inactive bootstrap keeps legacy workspace without canonical requests',
 'P04 C10 active workspace survives reload and clears drafts across actor switches',
 "P05 C11 smart views retain the shared task identity and unsaved drawer draft",
 "P05 C12 Vietnamese tag any-all saved filters survive reload with the same task IDs",
 "P05 C13 Trash detail is readonly with Escape focus and no private child hits",
 "P05 C14 GlobalSearch opens the same canonical task with normalized Vietnamese text",
 "P05 C15 completed windows7-30-90-all use real canonical rows on phone and dark theme",
 'P07 C16 keyboard preview cancel apply and private pin reset retain one canonical task and deadline',
 'P07 C17 custom rule preview overlap unmatched saved config conflict and preset changes never edit tasks',
 'P07 C18 pointer deadline preview stale SSE and shared drawer draft survive phone dark reduced motion',
 'P07 C19 custom choices require a fresh preview and Escape restores the keyboard trigger',
 'P09 C20 canonical and multi-tag Kanban share drawer drafts across saved boards',
 'P09 C21 actor switch clears private Kanban rows and keeps workflow read-only',
 'P09 C22 keyboard section preview cancel apply preserves canonical draft lifecycle deadline and rewards',
 'P09 C23 authorization refresh discards a held section preview without any late apply',
];
export function validateProductivityBrowserReports(input){
 const errors=[...validateBrowserReports(input,{projects:browserProjects,cases:productivityBrowserCases}),...validateMatrixTouchReports(input)];
 if(!isDeepStrictEqual(input.manifest?.kanbanFixture,{taskRowsPreserved:true,boards:2,views:9}))errors.push('missing explicit synthetic9 Kanban fixture preservation');
 if(input.manifest?.synthetic!==true||input.manifest?.productivityVersion!==productivityFixtureVersion||input.manifest?.nativeHandlesClosed!==true||input.manifest?.networkAttempts?.length!==0)errors.push('missing current synthetic productivity fixture/closed/offline evidence');return errors;
}
