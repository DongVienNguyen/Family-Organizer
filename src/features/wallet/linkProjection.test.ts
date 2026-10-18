import {it,expect} from 'vitest';
import {projectLinkedGoals} from './linkProjection.js';
const actor={userId:'synthetic-owner',role:'member' as const},goal:any={id:'goal',name:'Synthetic shared goal',targetAmount:1000000,isShared:true,creatorId:actor.userId,createdAt:'2026-10-18T00:00:00.000Z',updatedAt:'2026-10-18T00:00:00.000Z',contributions:[{id:'old',amount:100,date:'2026-10-18',byId:actor.userId,createdAt:'2026-10-18T00:00:00.000Z'},{id:'new',amount:{minor:'9007199254740993',currency:'VND'},walletLinkId:'private-link',note:'SYNTHETIC_PRIVATE_GOAL_CASH',date:'2026-10-18',byId:'other',createdAt:'2026-10-18T00:00:00.000Z'}]};
it('defaults to hiding every Wallet-linked contribution without a current source policy, preserving legacy history',()=>{expect(projectLinkedGoals(actor,[goal])[0].contributions.map(v=>v.id)).toEqual(['old']);expect(JSON.stringify(projectLinkedGoals(actor,[goal]))).not.toContain('SYNTHETIC_PRIVATE_GOAL_CASH');expect(goal.contributions).toHaveLength(2);});
it('uses exact current source binding and fails closed when a source resolver throws',()=>{expect(projectLinkedGoals(actor,[goal],(id,parent,entry)=>id==='private-link'&&parent==='goal'&&entry==='new')[0].contributions).toHaveLength(2);expect(projectLinkedGoals(actor,[goal],()=>{throw Error('synthetic retired source');})[0].contributions).toHaveLength(1);});
it('never exposes private goal headers to another Admin or financial content to a child/guest',()=>{expect(projectLinkedGoals({userId:'other',role:'admin'},[{...goal,isShared:false}],()=>true)).toEqual([]);for(const role of ['child','guest'] as const)expect(projectLinkedGoals({...actor,role},[goal],()=>true)).toEqual([]);});
it('preserves a sparse original legacy goal without contribution history while retaining its private owner boundary',()=>{
 const sparse={id:'synthetic-sparse',name:'Synthetic original private goal',targetAmount:17,isShared:false,creatorId:'member'} as any;
 expect(projectLinkedGoals({userId:'member',role:'member'},[sparse])).toMatchObject([{id:sparse.id,contributions:[]}]);
 expect(projectLinkedGoals({userId:'other',role:'admin'},[sparse])).toEqual([]);
});
