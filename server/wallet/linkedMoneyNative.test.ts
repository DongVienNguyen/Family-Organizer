import {it,expect,vi} from 'vitest';
import {FamilyDB} from '../db.js';
import {sqliteLoad,sqliteSave} from '../sqlite.js';
import {UserRole} from '../../src/types.js';
const push=vi.hoisted(()=>({isPushConfigured:vi.fn(()=>false),sendQueuedNotification:vi.fn(async()=> 'ok')}));
vi.mock('../push.js',()=>push);
it('the existing debt reminder reads exact linked principal instead of emitting NaN or the full original debt',()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-18T10:00:00.000Z'));
 try{const db=sqliteLoad();db.users=[{id:'synthetic-linked-debt-owner',username:'synthetic',fullName:'Synthetic owner',role:UserRole.MEMBER,passwordHash:'synthetic',avatarColor:'blue',createdAt:'2026-10-18T00:00:00.000Z'}];db.tasks=[];db.medications=[];db.vaccinations=[];db.recurringBills=[];db.documents=[];db.notifications=[];db.pushSubscriptions=[];db.debts=[{id:'synthetic-linked-debt',direction:'borrowed',counterparty:'Synthetic lender',amount:1000000,isSettled:false,creatorId:'synthetic-linked-debt-owner',dueDate:'2026-10-18',createdAt:'2026-10-18T00:00:00.000Z',updatedAt:'2026-10-18T00:00:00.000Z',payments:[{id:'synthetic-linked-principal',amount:{minor:'999999',currency:'VND'},walletLinkId:'synthetic-link',date:'2026-10-18',byId:'synthetic-linked-debt-owner',createdAt:'2026-10-18T00:00:00.000Z'}]}];sqliteSave(db);
 FamilyDB.generateReminders();const notices=FamilyDB.getNotificationsForActor('synthetic-linked-debt-owner');expect(notices).toHaveLength(1);expect(notices[0].content).toContain('trả 1đ');expect(notices[0].content).not.toContain('NaN');expect(notices[0].content).not.toContain('1,000,000');FamilyDB.generateReminders();expect(FamilyDB.getNotificationsForActor('synthetic-linked-debt-owner')).toHaveLength(1);expect(push.sendQueuedNotification).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
});
