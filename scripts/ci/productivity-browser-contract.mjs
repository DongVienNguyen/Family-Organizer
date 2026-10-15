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
];
export function validateProductivityBrowserReports(input){
 const errors=validateBrowserReports(input,{projects:browserProjects,cases:productivityBrowserCases});
 if(input.manifest?.synthetic!==true||input.manifest?.productivityVersion!==5||input.manifest?.nativeHandlesClosed!==true||input.manifest?.networkAttempts?.length!==0)errors.push('missing current synthetic productivity fixture/closed/offline evidence');return errors;
}
