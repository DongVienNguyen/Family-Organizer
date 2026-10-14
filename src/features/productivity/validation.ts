export function object(value:unknown):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Expected object');
 return value as Record<string,unknown>;
}
export function keys(value:Record<string,unknown>,allowed:string[]):void {
 if(Object.keys(value).some(key=>!allowed.includes(key)))throw new Error('Unexpected contract field');
}
export function text(value:unknown,max:number,nonempty=true):asserts value is string {
 if(typeof value!=='string'||value.length>max||(nonempty&&!value.trim()))throw new Error('Invalid text');
}
export function choice<T extends string>(value:unknown,allowed:readonly T[]):asserts value is T {
 if(!allowed.includes(value as T))throw new Error('Invalid contract choice');
}
export function boolean(value:unknown):asserts value is boolean {if(typeof value!=='boolean')throw new Error('Expected boolean');}
export function integer(value:unknown,min=0,max=Number.MAX_SAFE_INTEGER):asserts value is number {
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)throw new Error('Invalid integer');
}
export function strings(value:unknown):asserts value is string[] {
 if(!Array.isArray(value)||value.length>1000)throw new Error('Invalid string list');
 for(const item of value)text(item,256);
}
