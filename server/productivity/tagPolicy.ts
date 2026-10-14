import type {TaskReader} from './access.js';
import {taskScope} from './access.js';
import type {AppActor} from '../../src/features/productivity/contracts.js';
import {UserRole} from '../../src/types.js';
import {strings} from '../../src/features/productivity/validation.js';
import {AppStoreError} from '../appErrors.js';
export function hasTagOwnership(reader:TaskReader):boolean{return !!reader.get("SELECT name FROM sqlite_master WHERE type='table' AND name='productivity_tag_owners'");}
/** Metadata-only authorization; labels are read only after this predicate passes. */
export function canSelectTag(reader:TaskReader,actor:AppActor,id:string):boolean {
 if(actor.role===UserRole.ADMIN)return !!reader.get('SELECT id FROM productivity_tags WHERE id=?',id);
 const filter=taskScope(actor),owned=hasTagOwnership(reader)&&actor.role===UserRole.MEMBER;
 return !!reader.get("SELECT tag.id FROM productivity_tags tag WHERE tag.id=? AND ("+(owned?"EXISTS(SELECT 1 FROM productivity_tag_owners o WHERE o.tag_id=tag.id AND o.user_id=?) OR ":'')+"EXISTS(SELECT 1 FROM productivity_task_tags tt JOIN productivity_tasks t ON t.id=tt.task_id WHERE tt.tag_id=tag.id AND ("+filter.sql+')))',id,...(owned?[actor.userId]:[]),...filter.args);
}
export function assertTagSelection(reader:TaskReader,actor:AppActor,input:unknown):void {
 if(!hasTagOwnership(reader))return;try{strings(input);}catch{throw new AppStoreError('Nhãn công việc không hợp lệ.',400,'task-tags');}
 for(const id of input as string[]){const exists=reader.get('SELECT id FROM productivity_tags WHERE id=?',id);if(!exists){if(actor.role!==UserRole.ADMIN&&actor.role!==UserRole.MEMBER)throw new AppStoreError('Bạn không có quyền tạo nhãn.',403,'tag-create');}else if(!canSelectTag(reader,actor,id))throw new AppStoreError('Không tìm thấy nhãn.',404,'tag-not-found');}
}

/** Only current visible IDs can yield labels; stored relationships stay as IDs. */
export function visibleTagLabels(reader:TaskReader,actor:AppActor,ids:readonly string[]):string[]{return ids.map(id=>canSelectTag(reader,actor,id)?reader.get('SELECT name FROM productivity_tags WHERE id=?',id)?.name??id:id);}
