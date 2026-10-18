import base from './playwright.config.js';
import {defineConfig} from '@playwright/test';
const project=process.env.FO_CALENDAR_PROJECT;
if(project&&!['chromium','firefox','webkit'].includes(project))throw Error('Unknown calendar browser project');
const reports='reports/calendar/'+(project??'all');
export default defineConfig({...base,testMatch:'calendar.spec.ts',outputDir:reports+'/results',reporter:[['list'],['json',{outputFile:reports+'/browser.json'}],['junit',{outputFile:reports+'/browser.junit.xml'}],['html',{outputFolder:reports+'/html',open:'never'}]]});
