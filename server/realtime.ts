import type {Response} from 'express';
import type {AuthUser} from './auth.js';
export interface RealtimeEvent {type:string;data:Record<string,unknown>;previous?:Set<string>}
interface Client {token:string;userId:string;response:Response;close:()=>void}
export function createRealtimeHub(deps:{verify:(token:string)=>AuthUser|null;allow:(user:AuthUser,event:RealtimeEvent)=>boolean;maxClients?:number;maxPerUser?:number}){
  const clients=new Set<Client>();let heartbeat:ReturnType<typeof setInterval>|undefined;
  const detach=(client:Client)=>{clients.delete(client);client.response.off('close',client.close);if(!clients.size&&heartbeat){clearInterval(heartbeat);heartbeat=undefined;}};
  const close=(client:Client)=>{detach(client);client.response.end();};
  const verify=(client:Client)=>{
    try{const user=deps.verify(client.token);if(user&&!client.response.destroyed&&!client.response.writableEnded)return user;}catch{/* Fail closed without logging credentials. */}
    close(client);return null;
  };
  return {
    get size(){return clients.size;},
    open(token:string,response:Response){
      let user:AuthUser|null;try{user=deps.verify(token);}catch{return false;}if(!user)return false;
      if(clients.size>=(deps.maxClients??128)||[...clients].filter(client=>client.userId===user.id).length>=(deps.maxPerUser??4)){
        response.writeHead(429,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify({error:'Quá nhiều kết nối đồng bộ. Hãy đóng bớt tab.'}));return false;
      }
      const client:Client={token,userId:user.id,response,close:()=>detach(client)};
      clients.add(client);response.on('close',client.close);
      response.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive'});
      if(!response.write('data: '+JSON.stringify({type:'init',message:'Đã thiết lập kết nối thời gian thực'})+'\n\n'))close(client);
      if(clients.size&&!heartbeat){heartbeat=setInterval(()=>{for(const client of clients){if(!verify(client))continue;try{if(client.response.writableLength>65536||!client.response.write(': heartbeat\n\n'))close(client);}catch{close(client);}}},15000);heartbeat.unref?.();}
      return true;
    },
    emit(event:RealtimeEvent){
      for(const client of clients){const user=verify(client);if(!user)continue;
        try{if(client.response.writableLength>65536){close(client);continue;}if(deps.allow(user,event)&&!client.response.write('data: '+JSON.stringify({type:event.type,timestamp:new Date().toISOString()})+'\n\n'))close(client);}catch{close(client);}
      }
    },
    recheck(){for(const client of clients)verify(client);},
    end(){for(const client of clients)close(client);},
  };
}
