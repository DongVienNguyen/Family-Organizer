/** @license SPDX-License-Identifier: Apache-2.0 */
export function detectedMediaType(bytes:Buffer):string|undefined {
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217)return 'image/jpeg';
 if(/^GIF8[79]a$/.test(bytes.subarray(0,6).toString('ascii')))return 'image/gif';
 if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'image/webp';
 if(/^%PDF-[12]\./.test(bytes.subarray(0,8).toString()))return 'application/pdf';
}
