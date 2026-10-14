import {validateBrowserReports,browserProjects} from './browser-contract.mjs';
export const productivityBrowserCases=[
 'P04 C01 shared drawer keeps no-date/none and dirty draft across close and view changes',
 'P04 C02 drawer keyboard popup Escape preserves dialog and phone layout has no overflow',
 'P04 C03 actual checklist/subtask/personal pin preserve root identity and no reward side effect',
 'P04 C04 child has no private member rows and logout clears the shared draft',
];
export function validateProductivityBrowserReports(input){
 const errors=validateBrowserReports(input,{projects:browserProjects,cases:productivityBrowserCases});
 if(input.manifest?.synthetic!==true||input.manifest?.productivityVersion!==4||input.manifest?.nativeHandlesClosed!==true||input.manifest?.networkAttempts?.length!==0)errors.push('missing current synthetic productivity fixture/closed/offline evidence');return errors;
}
