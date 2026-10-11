/** @license SPDX-License-Identifier: Apache-2.0 */
// Internal process capability, selected only by the local first-account entry.
// No environment override or HTTP route can request initialization.
let firstAccountOnly=false;
export function requestFirstAccountStorage():void { firstAccountOnly=true; }
export function isFirstAccountStorage():boolean { return firstAccountOnly; }
export class InstallationNotPristineError extends Error {
  constructor(){super('INSTALLATION_NOT_PRISTINE');}
}
