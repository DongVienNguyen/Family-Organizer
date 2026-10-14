export interface TagLabel {id:string;name:string}
export function tagLabel(id:string,tags:readonly TagLabel[]):string {return tags.find(tag=>tag.id===id)?.name??id;}
export function tagInput(ids:readonly string[],tags:readonly TagLabel[]):string {return ids.map(id=>tagLabel(id,tags)).join(', ');}
/** Preserve unchanged draft IDs even when names change while the editor is open. */
export function resolveTagInput(value:string,tags:readonly TagLabel[],originalIds:readonly string[],originalText:string):string[] {
 if(value.trim()===originalText.trim())return [...originalIds];
 const values=value.split(',').map(label=>label.trim()).filter(Boolean),ids:string[]=[];
 for(const label of values){
  const matches=tags.filter(tag=>tag.name===label||tag.id===label),previous=matches.filter(tag=>originalIds.includes(tag.id));
  if(previous.length===1)ids.push(previous[0].id);
  else if(matches.length===1)ids.push(matches[0].id);
  else if(matches.length>1)throw new Error('task-tag-ambiguous');
  else ids.push(label); // Existing Adult free-form input; server owns role enforcement.
 }
 return [...new Set(ids)];
}
