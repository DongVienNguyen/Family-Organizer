import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
export const walletPdfLicense=Object.freeze({version:1,engine:'pdfmake@0.3.11',family:'Roboto',fontVersion:'3.014;2025',license:'OFL-1.1',notice:{path:'licenses/Roboto-OFL-1.1.txt',sha256:'061402327a96aadb0bfb694a960ed289ecd38d383e396243831ab81feb109c41'},fonts:[
 {name:'Roboto-Italic.ttf',size:162892,sha256:'b9e7d02d28dd215bd1dbb164d2d75bc1bbccf754a17390efc8678feb78017577'},
 {name:'Roboto-Medium.ttf',size:157392,sha256:'4cb9d8a346d7d9190ef145daad9a85d58e2592043b199cdb8ed52ff535c64047'},
 {name:'Roboto-MediumItalic.ttf',size:163192,sha256:'1b4daee5311f0bcd8e1b79d44d1d5ba675a72abb6624d2b0ed77fda1c65d77b1'},
 {name:'Roboto-Regular.ttf',size:157208,sha256:'ab9c18a75da1636435afd2398ffce325496644a8f258f918c92c4baf34a68625'},
]});
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function verifyBundledRoboto(text){
 for(const font of walletPdfLicense.fonts){const key=font.name.replaceAll('.','\\.'),match=text.match(new RegExp('["\\\']'+key+'["\\\']\\s*:\\s*["\\\']([A-Za-z0-9+/=]+)["\\\']'));assert.ok(match,'Missing embedded '+font.name);const bytes=Buffer.from(match[1],'base64');assert.equal(bytes.toString('base64'),match[1],'Noncanonical embedded font');assert.equal(bytes.length,font.size,'Embedded font size changed');assert.equal(hash(bytes),font.sha256,'Embedded font bytes changed');}
 return {fonts:walletPdfLicense.fonts.length};
}
/** Historical packages keep their original policy. Newly embedded server fonts
 * require the original OFL/copyright and the same pinned browser font bytes. */
export function verifyWalletPdfLicense(root,manifest){
 const server=path.join(root,'app/dist/server.cjs'),text=fs.existsSync(server)?fs.readFileSync(server,'utf8'):'';
 if(!manifest.licensePolicy?.walletPdf&&!/["']Roboto-Regular\.ttf["']\s*:\s*["'][A-Za-z0-9+/=]{1000}/.test(text))return {present:false};
 assert.deepEqual(manifest.licensePolicy?.walletPdf,walletPdfLicense,'Missing or changed Wallet PDF font policy');assert.equal(hash(fs.readFileSync(path.join(root,walletPdfLicense.notice.path))),walletPdfLicense.notice.sha256,'Original Roboto OFL/copyright changed');verifyBundledRoboto(text);
 const metadata=JSON.parse(fs.readFileSync(path.join(root,'licenses/build-inputs/pdfmake/package.json'),'utf8'));assert.equal(metadata.version,'0.3.11','PDF engine version changed');
 const assets=path.join(root,'app/dist/assets'),files=fs.readdirSync(assets).filter(name=>/^vfs_fonts-[\w-]+\.js$/.test(name));assert.equal(files.length,1,'Expected one browser font bundle');verifyBundledRoboto(fs.readFileSync(path.join(assets,files[0]),'utf8'));
 return {present:true,engine:walletPdfLicense.engine,fonts:4,originalNoticeVerified:true};
}
