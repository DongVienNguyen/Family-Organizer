import base from './playwright.config.js';
import{productivityBrowserWorkers}from'./scripts/ci/productivity-browser-contract.mjs';
import {defineConfig} from '@playwright/test';
import {productivityReportLayout} from './scripts/ci/productivity-report-layout.mjs';
import path from 'node:path';
const project=process.env.FO_PRODUCTIVITY_PROJECT||undefined,{reports}=productivityReportLayout(project);
const file=(name:string)=>path.join(reports,name);
export default defineConfig({...base,...(project?{projects:base.projects.filter(p=>p.name===project)}:{}),workers:productivityBrowserWorkers,testMatch:['productivity.spec.ts','productivity-advanced.spec.ts'],outputDir:file('productivity-browser-results'),reporter:[...(project?[['blob',{outputDir:file('blob')}]]as any:[]),['list'],['json',{outputFile:file('productivity-browser.json')}],['junit',{outputFile:file('productivity-browser.junit.xml')}],['html',{outputFolder:file('productivity-browser-html'),open:'never'}]]});
