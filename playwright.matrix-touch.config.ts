import base from './playwright.config.js';
import {defineConfig} from '@playwright/test';
import {productivityReportLayout} from './scripts/ci/productivity-report-layout.mjs';
import path from 'node:path';
const {reports}=productivityReportLayout(process.env.FO_PRODUCTIVITY_PROJECT||undefined),file=(name:string)=>path.join(reports,name);
export default defineConfig({...base,testMatch:'matrix-touch.spec.ts',projects:[{name:'chromium',use:{...base.projects.find(project=>project.name==='chromium')!.use,browserName:'chromium',hasTouch:true,isMobile:true,viewport:{width:390,height:844},reducedMotion:'reduce'}}],outputDir:file('productivity-browser-touch-results'),reporter:[['list'],['json',{outputFile:file('productivity-browser-touch.json')}],['junit',{outputFile:file('productivity-browser-touch.junit.xml')}],['html',{outputFolder:file('productivity-browser-touch-html'),open:'never'}]]});
