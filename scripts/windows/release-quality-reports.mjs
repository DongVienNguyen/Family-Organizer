const steps=['install','native','lint','test','build','production','audit','coverage'];
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const positive=n=>integer(n)&&n>0;
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const sameMultiset=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
const sameSet=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&new Set(a).size===a.length&&a.every(x=>b.includes(x));
const validXmlCharacter=n=>n===9||n===10||n===13||(n>=32&&n<=0xd7ff)||(n>=0xe000&&n<=0xfffd)||(n>=0x10000&&n<=0x10ffff);
function validateXmlCharacters(text){for(const character of text)if(!validXmlCharacter(character.codePointAt(0)))throw Error('Invalid XML character');}
function xmlValue(text){
 validateXmlCharacters(text);
 if(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/.test(text)||text.includes('<'))throw Error('Invalid XML attribute');
 return text.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g,entity=>{
  const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};if(named[entity])return named[entity];
  const number=entity.startsWith('&#x')?parseInt(entity.slice(3,-1),16):Number(entity.slice(2,-1));
  if(!integer(number)||!validXmlCharacter(number))throw Error('Invalid XML character');
  return String.fromCodePoint(number);
 });
}
// A bounded parser for the JUnit vocabulary emitted by the pinned reporters.
// DTDs/entities, duplicate attributes, malformed nesting and extra roots fail.
function readXmlToken(text,start){
 let offset=start+1,closing=false;
 const letter=c=>typeof c==='string'&&c>='a'&&c<='z';
 const nameCharacter=c=>letter(c)||c==='-';
 const space=c=>c===' '||c==='\t'||c==='\r'||c==='\n';
 const whitespace=()=>{const before=offset;while(space(text[offset]))offset++;return offset-before;};
 const name=()=>{const before=offset;if(!letter(text[offset]))throw Error('Invalid XML name');offset++;while(nameCharacter(text[offset]))offset++;return text.slice(before,offset);};
 if(text[offset]==='/'){closing=true;offset++;}
 const tag=name(),attributes={};
 if(closing){whitespace();if(text[offset]!=='>')throw Error('Invalid XML close');return {tag,attributes,closing:true,selfClosing:false,end:offset+1};}
 for(;;){
  const separated=whitespace();
  if(text[offset]==='>')return {tag,attributes,closing:false,selfClosing:false,end:offset+1};
  if(text[offset]==='/'){if(text[offset+1]!=='>')throw Error('Invalid XML self-close');return {tag,attributes,closing:false,selfClosing:true,end:offset+2};}
  if(!separated)throw Error('Missing XML attribute separator');
  const key=name();if(Object.hasOwn(attributes,key))throw Error('Duplicate XML attribute');
  whitespace();if(text[offset]!=='=')throw Error('Missing XML attribute equals');offset++;whitespace();
  if(text[offset]!=='"')throw Error('Unsupported XML attribute quote');offset++;const before=offset;
  while(offset<text.length&&text[offset]!=='"'){if(text[offset]==='<')throw Error('Invalid XML attribute');offset++;}
  if(offset===text.length)throw Error('Incomplete XML attribute');attributes[key]=xmlValue(text.slice(before,offset));offset++;
 }
}
export function parseReleaseJUnit(text){
 if(typeof text!=='string'||text.length===0||Buffer.byteLength(text)>64*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('Invalid JUnit');
 validateXmlCharacters(text);
 const document={tag:'document',children:[]},stack=[document];let offset=0,nodes=0;
 while(offset<text.length){
  if(text.startsWith('<?',offset)){const end=text.indexOf('?>',offset);if(offset!==0||end<0||!/^<\?xml version="1\.0"(?: encoding="UTF-8")? ?\?>$/.test(text.slice(offset,end+2)))throw Error('Invalid XML declaration');offset=end+2;continue;}
  if(text.startsWith('<![CDATA[',offset)){const end=text.indexOf(']]>',offset);if(end<0||!['system-out','system-err'].includes(stack.at(-1).tag))throw Error('Invalid CDATA');offset=end+3;continue;}
  if(text[offset]!=='<'){const end=text.indexOf('<',offset),stop=end<0?text.length:end;const value=text.slice(offset,stop);if((/[^ \t\r\n]/.test(value)&&!['system-out','system-err'].includes(stack.at(-1).tag))||value.includes(']]>'))throw Error('Unexpected XML text');xmlValue(value);offset=stop;continue;}
  const token=readXmlToken(text,offset),name=token.tag,attributes=token.attributes;offset=token.end;
  if(token.closing){if(stack.length===1||stack.pop().tag!==name)throw Error('Invalid XML nesting');continue;}
  if(!['testsuites','testsuite','testcase','properties','property','system-out','system-err','failure','error','skipped'].includes(name)||++nodes>100000||stack.length>32)throw Error('Unsupported/excessive XML');
  const vocabulary={document:['testsuites'],testsuites:['testsuite'],testsuite:['testcase','properties','system-out','system-err'],testcase:['system-out','system-err','failure','error','skipped'],properties:['property'],'system-out':[],'system-err':[],property:[],failure:[],error:[],skipped:[]};
  if(!vocabulary[stack.at(-1).tag]?.includes(name))throw Error('Invalid JUnit element hierarchy');
  const node={tag:name,attributes,children:[]};stack.at(-1).children.push(node);if(!token.selfClosing)stack.push(node);
 }
 if(stack.length!==1||document.children.length!==1||document.children[0].tag!=='testsuites')throw Error('Incomplete JUnit');return document.children[0];
}
export function validateReleaseQualityReports(input){
 const errors=[],require=(ok,message)=>{if(!ok)errors.push(message);};
 try{
  const {expected:e,evidence:q,tests:v,junit,exits}=input??{};
  require(record(e)&&/^[a-f0-9]{40}$/.test(e?.commitSha??'')&&/^[a-f0-9]{64}$/.test(e?.lockSha256??'')&&positive(e?.runId)&&[22,24].includes(e?.major),'invalid expected quality identity');
  const node=e?.major===22?'v22.23.3':'v24.21.0',npm=e?.major===22?'10.9.9':'11.19.0';
  require(q?.commitSha===e?.commitSha&&q?.lockSha256===e?.lockSha256&&q?.workflowRunUrl===`https://github.com/DongVienNguyen/Family-Organizer/actions/runs/${e?.runId}`&&q?.runAttempt===1&&q?.runnerOS==='Windows_NT 10.0.20348'&&q?.nodeVersion===node&&q?.npmVersion===npm&&q?.server2019Acceptance==='not-run','foreign quality identity/runtime');
  require(Array.isArray(q?.errors)&&q.errors.length===0,'quality receipt contains errors');
  require(record(q?.checks)&&sameSet(Object.keys(q.checks),steps)&&steps.every(n=>q.checks[n]==='success'),'missing/skipped quality checks');
  for(const name of steps){require(exits?.[name]?.exitCode===0,`${name}: missing/nonzero exit`);if(name==='audit')require(exits?.[name]?.nativeAuditExitCode===0,'native audit failed');if(name==='coverage')require(exits?.[name]?.nativeCoverageExitCode===0,'native coverage failed');}
  require(v?.success===true&&positive(v?.numTotalTestSuites)&&v?.numPassedTestSuites===v?.numTotalTestSuites&&positive(v?.numTotalTests)&&v?.numPassedTests===v?.numTotalTests&&['numFailedTests','numPendingTests','numTodoTests','numFailedTestSuites','numPendingTestSuites'].every(k=>v?.[k]===0),'raw quality totals incomplete');
  const suites=Array.isArray(v?.testResults)?v.testResults:[],receipts=Array.isArray(q?.suites)?q.suites:[];
  require(suites.length>0&&sameSet(receipts.map(s=>s?.name),receipts.map(s=>s?.name)),'missing/duplicate receipt suites');
  require(Array.isArray(e?.requiredSuites)&&e.requiredSuites.length>0&&sameSet(e.requiredSuites,e.requiredSuites),'empty/duplicate required-suite policy');
  const observed=[];let total=0;
  for(const suite of suites){
   const normalized=typeof suite?.name==='string'?suite.name.replaceAll('\\','/'):'';
   const names=receipts.filter(r=>typeof r?.name==='string'&&(normalized===r.name||normalized.endsWith('/'+r.name)));
   require(names.length===1,'raw suite has no unique receipt identity');if(names.length!==1)continue;
   const receipt=names[0],assertions=Array.isArray(suite.assertionResults)?suite.assertionResults:[];
   require(suite.status==='passed'&&assertions.length>0&&assertions.every(a=>a?.status==='passed'&&typeof a?.fullName==='string'&&a.fullName.length>0&&Array.isArray(a.ancestorTitles)&&a.ancestorTitles.every(n=>typeof n==='string')&&typeof a.title==='string'&&a.title.length>0&&a.fullName===[...a.ancestorTitles,a.title].join(' ')&&Array.isArray(a.failureMessages)&&a.failureMessages.length===0),'raw assertion failed/empty');
   const identities=assertions.map(a=>[...(a.ancestorTitles??[]),a.title].join(' > '));
   require(receipt.passed===assertions.length&&receipt.failed===0&&receipt.skipped===0,'receipt contradicts raw assertions');
   total+=assertions.length;observed.push({name:receipt.name,assertions:identities});
  }
  require(total===v?.numTotalTests&&sameSet(observed.map(s=>s.name),receipts.map(s=>s.name)),'suite inventory contradicts totals');
  for(const name of e?.requiredSuites??[])require(observed.some(s=>s.name===name),'missing required suite: '+name);
  const tree=parseReleaseJUnit(junit),count=(a,k,n,optional=false)=>optional&&a[k]===undefined?true:/^\d+$/.test(a[k]??'')&&Number(a[k])===n;
  require(count(tree.attributes,'tests',total)&&count(tree.attributes,'failures',0)&&count(tree.attributes,'errors',0)&&count(tree.attributes,'skipped',0,true),'JUnit root totals mismatch');
  const xmlSuites=[];
  for(const suite of tree.children){
   require(suite.tag==='testsuite','unexpected JUnit root child');const raw=observed.find(s=>s.name===suite.attributes.name);if(!raw){errors.push('unknown JUnit suite');continue;}
   xmlSuites.push(suite.attributes.name);const cases=suite.children.filter(c=>c.tag==='testcase');
   require(suite.children.every(c=>['testcase','properties','system-out','system-err'].includes(c.tag)),'JUnit failure/unknown suite child');
   require(['tests','failures','errors','skipped'].every(k=>count(suite.attributes,k,k==='tests'?raw.assertions.length:0)),'JUnit suite totals mismatch');
   require(sameMultiset(cases.map(c=>c.attributes.name),raw.assertions)&&cases.every(c=>c.attributes.classname===raw.name&&c.children.every(n=>['system-out','system-err'].includes(n.tag))),'JUnit assertion identities/failures mismatch');
  }
  require(sameSet(xmlSuites,observed.map(s=>s.name)),'JUnit suite inventory mismatch');
  const walk=node=>{require(!['failure','error','skipped'].includes(node.tag),'JUnit contains failed/skipped case');for(const child of node.children)walk(child);};walk(tree);
 }catch{errors.push('malformed raw quality reports');}
 return errors;
}
