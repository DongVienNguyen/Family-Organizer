import {TaskStatus,TaskPriority,type Task} from '../../src/types.js';
export function legacyTask(id:string,patch:Partial<Task>={}):Task {
 return {id,title:'Synthetic task '+id,description:'Synthetic body',status:TaskStatus.TODO,priority:TaskPriority.MEDIUM,dueDate:'2026-10-11 09:30',creatorId:'adult',assigneeId:'child',isShared:true,tags:['home'],rewardPoints:7,comments:[{id:'comment-'+id,userId:'adult',username:'synthetic',content:'Keep comment',createdAt:'2026-10-10T00:00:00Z'}],history:[],createdAt:'2026-10-10T00:00:00Z',updatedAt:'2026-10-10T00:00:00Z',proofImage:'/media/synthetic.jpg',proofNote:'Synthetic proof',sourceRecurringTaskId:'series-parent',rotationMemberIds:['child','adult'],...patch};
}
