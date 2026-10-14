export interface TagLabel {id:string;name:string}
export function tagLabel(id:string,tags:readonly TagLabel[]):string {return tags.find(tag=>tag.id===id)?.name??id;}
/** Quote accepted names that contain separators or escapes without changing their IDs. */
export function tagInput(ids:readonly string[],tags:readonly TagLabel[]):string {
 return ids.map(id=>{const label=tagLabel(id,tags);return /[,"\\\r\n]/.test(label)||label!==label.trim()?JSON.stringify(label):label;}).join(', ');
}
function parseTagInput(value:string):string[] {
 const labels:string[]=[];let position=0;
 while(position<value.length){
  while(position<value.length&&/\s/.test(value[position]))position++;
  if(value[position]==='"'){
   const start=position++;let escaped=false,closed=false;
   while(position<value.length){const char=value[position++];if(escaped){escaped=false;continue;}if(char==='\\'){escaped=true;continue;}if(char==='"'){closed=true;break;}}
   if(!closed)throw new Error('task-tag-ambiguous');
   const label:unknown=JSON.parse(value.slice(start,position));if(typeof label!=='string')throw new Error('task-tag-ambiguous');
   while(position<value.length&&/\s/.test(value[position]))position++;
   if(position<value.length&&value[position]!==',')throw new Error('task-tag-ambiguous');
   if(label)labels.push(label);
  }else{
   const start=position;while(position<value.length&&value[position]!==',')position++;
   const label=value.slice(start,position).trim();if(label)labels.push(label);
  }
  if(value[position]===',')position++;
 }
 return labels;
}
/** Captured draft labels retain their original identity independently of live catalog refreshes. */
export function resolveTagInput(value:string,tags:readonly TagLabel[],originalIds:readonly string[],originalText:string):string[] {
 if(value.trim()===originalText.trim())return [...originalIds];
 const originalLabels=parseTagInput(originalText),values=parseTagInput(value),ids:string[]=[];
 const originalGroups=new Map<string,string[]>();
 originalLabels.forEach((label,index)=>{const id=originalIds[index];if(id!==undefined)originalGroups.set(label,[...(originalGroups.get(label)??[]),id]);});
 const counts=new Map<string,number>();for(const label of values)counts.set(label,(counts.get(label)??0)+1);
 const offsets=new Map<string,number>();
 for(const label of values){
  const previous=originalGroups.get(label);
  if(previous){
   if(previous.length>1&&counts.get(label)!==previous.length)throw new Error('task-tag-ambiguous');
   const offset=offsets.get(label)??0;ids.push(previous[Math.min(offset,previous.length-1)]);offsets.set(label,offset+1);continue;
  }
  const matches=tags.filter(tag=>tag.name===label||tag.id===label);
  if(matches.length===1)ids.push(matches[0].id);
  else if(matches.length>1)throw new Error('task-tag-ambiguous');
  else ids.push(label); // Existing Adult free-form input; server owns role enforcement.
 }
 return [...new Set(ids)];
}
