import {optimizeImageFile} from '../../utils/image.js';
function readDataUrl(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(Error('Invalid receipt file'));reader.onerror=()=>reject(Error('Cannot read receipt file'));reader.readAsDataURL(blob);});}
/** Reuse the existing HEIC conversion. Never sends a legacy public upload. */
export async function prepareWalletReceipt(file:File,ports={optimize:optimizeImageFile,read:readDataUrl}):Promise<{fileName:string;dataUrl:string}>{
 if(!file.size)throw Error('Empty receipt file');
 if(file.type==='application/pdf'||!file.type&&/\.pdf$/i.test(file.name)){
  if(file.size>10*1024*1024)throw Error('PDF exceeds 10 MiB');
  return {fileName:file.name.normalize('NFC'),dataUrl:await ports.read(new Blob([file],{type:'application/pdf'}))};
 }
 if(!['image/png','image/jpeg','image/webp','image/gif','image/heic','image/heif'].includes(file.type)&&!/\.(heic|heif)$/i.test(file.name))throw Error('Unsupported receipt file');
 const result=await ports.optimize(file),mime=/^data:(image\/(?:png|jpeg|webp|gif));base64,/.exec(result.dataUrl)?.[1],extensions:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'};
 if(!mime)throw Error('Unsupported converted receipt');
 return {fileName:file.name.normalize('NFC').replace(/\.[^.]*$/,'')+'.'+extensions[mime],dataUrl:result.dataUrl};
}
