import {EventEmitter} from 'node:events';
import {afterEach,expect,it,vi} from 'vitest';
import {createRealtimeHub} from './realtime.js';
const actor={id:'synthetic-user',role:'member'} as any;
function sink(){const response=Object.assign(new EventEmitter(),{destroyed:false,writableEnded:false,writableLength:0,writeHead:vi.fn(),write:vi.fn(()=>true),end:vi.fn()});return response as any;}
afterEach(()=>vi.useRealTimers());
it('constructs without verifying sessions or starting timers and preserves generic authenticated emission',()=>{
  const verify=vi.fn(()=>actor),timer=vi.spyOn(globalThis,'setInterval'),allow=vi.fn(()=>true);const hub=createRealtimeHub({verify,allow});
  try{expect(verify).not.toHaveBeenCalled();expect(timer).not.toHaveBeenCalled();const response=sink();expect(hub.open('synthetic',response)).toBe(true);hub.emit({type:'NOTES_UPDATE',data:{noteId:'private-id',title:'private-title'}});expect(response.write.mock.calls.at(-1)[0]).not.toContain('private-');expect(allow).toHaveBeenCalledOnce();hub.end();expect(response.listenerCount('close')).toBe(0);expect(hub.size).toBe(0);}
  finally{timer.mockRestore();hub.end();}
});
it('rechecks otherwise idle sessions on a bounded heartbeat and stops its last timer',()=>{
  vi.useFakeTimers();let user:any=actor;const hub=createRealtimeHub({verify:()=>user,allow:()=>true}),response=sink();hub.open('synthetic',response);user=null;
  vi.advanceTimersByTime(15000);expect(response.end).toHaveBeenCalledOnce();expect(hub.size).toBe(0);expect(vi.getTimerCount()).toBe(0);hub.end();
});
it('sends heartbeat comments for valid sessions and leaves no timers after disconnect',()=>{
  vi.useFakeTimers();const hub=createRealtimeHub({verify:()=>actor,allow:()=>true}),response=sink();hub.open('synthetic',response);vi.advanceTimersByTime(15000);
  expect(response.write.mock.calls.at(-1)[0]).toMatch(/^:/);response.emit('close');expect(hub.size).toBe(0);expect(vi.getTimerCount()).toBe(0);hub.end();
});
it('closes a slow consumer before additional payload grows its response buffer',()=>{
  const hub=createRealtimeHub({verify:()=>actor,allow:()=>true}),response=sink();hub.open('synthetic',response);response.writableLength=70000;const writes=response.write.mock.calls.length;
  hub.emit({type:'NOTES_UPDATE',data:{}});expect(response.end).toHaveBeenCalledOnce();expect(response.write).toHaveBeenCalledTimes(writes);expect(hub.size).toBe(0);hub.end();
});
it('closes a response whose transport refuses an event write',()=>{
  const hub=createRealtimeHub({verify:()=>actor,allow:()=>true}),response=sink();hub.open('synthetic',response);response.write.mockReturnValue(false);hub.emit({type:'NOTES_UPDATE',data:{}});expect(response.end).toHaveBeenCalledOnce();expect(hub.size).toBe(0);hub.end();
});
it('bounds per-user and total connections without treating capacity as logout',()=>{
  let id='one';const hub=createRealtimeHub({verify:()=>({...actor,id}),allow:()=>true,maxClients:3,maxPerUser:2} as any),responses=Array.from({length:5},sink);
  try{expect(hub.open('one',responses[0])).toBe(true);expect(hub.open('one',responses[1])).toBe(true);expect(hub.open('one',responses[2])).toBe(false);expect(responses[2].writeHead).toHaveBeenCalledWith(429,expect.anything());id='two';expect(hub.open('two',responses[3])).toBe(true);id='three';expect(hub.open('three',responses[4])).toBe(false);expect(responses[4].writeHead).toHaveBeenCalledWith(429,expect.anything());expect(hub.size).toBe(3);}finally{hub.end();}
});
it('fails closed when live session verification throws and disposes the response listener',()=>{
  const verify=vi.fn(()=>actor),hub=createRealtimeHub({verify,allow:()=>true}),response=sink();hub.open('synthetic',response);verify.mockImplementation(()=>{throw new Error('Synthetic auth failure');});hub.emit({type:'NOTES_UPDATE',data:{}});expect(hub.size).toBe(0);expect(response.end).toHaveBeenCalledOnce();expect(response.listenerCount('close')).toBe(0);hub.end();
});
