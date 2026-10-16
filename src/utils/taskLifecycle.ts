import {TaskStatus,type Task} from '../types.js';
/** Stopped work remains history, and is never active/overdue/completed credit. */
export function isActiveLegacyTask(task:Pick<Task,'status'>):boolean {return task.status!==TaskStatus.COMPLETED&&task.status!==TaskStatus.WONT_DO;}
