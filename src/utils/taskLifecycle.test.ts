import {expect,it} from 'vitest';import {TaskStatus} from '../types.js';import {isActiveLegacyTask} from './taskLifecycle.js';
it.each([TaskStatus.TODO,TaskStatus.IN_PROGRESS,TaskStatus.OVERDUE])('keeps existing actionable status%s active',status=>{expect(isActiveLegacyTask({status})).toBe(true);});
it.each([TaskStatus.COMPLETED,TaskStatus.WONT_DO])('terminal status%s contributes no active work overdue or reminder count',status=>{expect(isActiveLegacyTask({status})).toBe(false);});
