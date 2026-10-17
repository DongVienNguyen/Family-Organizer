/** Ordered roster draft; moving never writes a Task or a series. */
export function moveRotationMember(ids:readonly string[],id:string,direction:-1|1):string[]{
 const next=[...ids],index=next.indexOf(id),target=index+direction;
 if(index>=0&&target>=0&&target<next.length)[next[index],next[target]]=[next[target],next[index]];
 return next;
}
