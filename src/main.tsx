import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserSessionRoot} from './components/BrowserSessionRoot.js';
import {browserSession} from './utils/browserSession.js';
import './index.css';
import './i18n/index.ts'; // khởi tạo đa ngôn ngữ trước khi render App

void browserSession.change(localStorage.getItem('family_token'),false).catch(()=>{});
window.addEventListener('storage',event=>{
  if(event.storageArea===localStorage && event.key==='family_token')void browserSession.change(event.newValue,false).catch(()=>{});
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserSessionRoot />
  </StrictMode>,
);
