import React,{useEffect,useRef,useState} from 'react';
import {browserSession} from '../utils/browserSession.js';
import {createMediaResource,subscribeMediaInvalidation} from '../utils/mediaResource.js';
function useMediaUrl(source:string|undefined,active=true,onUnavailable?:()=>void,requestRevision=0):string|undefined {
 const unavailable=useRef(onUnavailable);unavailable.current=onUnavailable;
 const [result,setResult]=useState<{source:string|undefined;url:string|undefined;revision:number}>({source:undefined,url:undefined,revision:-1});
 useEffect(()=>{
  let live=true;const resource=createMediaResource({session:browserSession,request:browserSession.request,publish:url=>{if(live)setResult({source,url,revision:requestRevision});},createUrl:blob=>URL.createObjectURL(blob),revokeUrl:url=>URL.revokeObjectURL(url),onUnavailable:()=>unavailable.current?.(),subscribeInvalidations:subscribeMediaInvalidation});
  if(active)void resource.load(source);
  return()=>{live=false;resource.dispose();};
 },[source,active,requestRevision]);
 return active&&result.source===source&&result.revision===requestRevision?result.url:undefined;
}
export function AuthenticatedImage({src,...props}:React.ImgHTMLAttributes<HTMLImageElement>){
 const source=typeof src==='string'?src:undefined;const url=useMediaUrl(source);
 return <img {...props} src={url}/>;
}
export function AuthenticatedMediaLink({href,onClick,children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>){
 const managed=typeof href==='string'&&href.startsWith('/uploads/');const [active,setActive]=useState(false),[failed,setFailed]=useState(false);
 const [requestRevision,setRequestRevision]=useState(0);
 const viewer=useRef<Window|null>(null),checkSession=useRef<(()=>void)|undefined>(undefined);const url=useMediaUrl(href,managed?active:true,()=>{viewer.current?.close();viewer.current=null;setActive(false);setFailed(true);},requestRevision);
 useEffect(()=>{
  const close=()=>{viewer.current?.close();viewer.current=null;setActive(false);};
  const unwatch=subscribeMediaInvalidation(close),unsubscribe=browserSession.subscribe(close);
  return()=>{unwatch();unsubscribe();viewer.current?.close();viewer.current=null;};
 },[href]);
 useEffect(()=>{
  if(!url||!managed||!viewer.current||viewer.current.closed)return;
  try{checkSession.current?.();viewer.current.location.replace(url);}catch{viewer.current.close();viewer.current=null;setFailed(true);}
 },[url,managed]);
 return <a {...props} role={managed?'button':props.role} tabIndex={managed?0:props.tabIndex} onKeyDown={event=>{props.onKeyDown?.(event);if(managed&&!event.defaultPrevented&&(event.key==='Enter'||event.key===' ')){event.preventDefault();event.currentTarget.click();}}} href={managed?undefined:url} onClick={event=>{
  onClick?.(event);if(event.defaultPrevented||!managed)return;event.preventDefault();
  try{checkSession.current=browserSession.capture();checkSession.current();viewer.current?.close();viewer.current=window.open('about:blank','_blank');
   if(!viewer.current){setFailed(true);return;}viewer.current.opener=null;setFailed(false);
   setActive(true);setRequestRevision(value=>value+1);
  }catch{viewer.current?.close();viewer.current=null;setFailed(true);}
 }} aria-disabled={managed&&!browserSession.snapshot().token}>
  {failed?'Không mở được tệp. Vui lòng thử lại.':children}
 </a>;
}
