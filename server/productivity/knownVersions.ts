/** Gates accept only explicitly implemented versions. Checksums and exact SQL
 * shape are still required by storage/snapshot inspection; unknown future23 is
 * never treated as compatible merely because it exceeds a feature minimum. */
const known=Object.freeze([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22]);
const ranges=new Map(known.map(min=>[min,Object.freeze(known.filter(version=>version>=min))]));
export function productivityVersionsFrom(min:number):readonly number[]{const versions=ranges.get(min);if(!versions)throw Error('Unknown productivity feature minimum');return versions;}
