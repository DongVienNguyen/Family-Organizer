import base from './playwright.config.js';
import {defineConfig} from '@playwright/test';
const project=process.env.FO_COLLABORATION_PROJECT;
if(project&&!['chromium','firefox','webkit'].includes(project))throw Error('Unknown collaboration browser project');
const reports='reports/collaboration/'+(project??'all');
export default defineConfig({...base,testMatch:'collaboration.spec.ts',outputDir:reports+'/results',reporter:[['list'],['json',{outputFile:reports+'/browser.json'}],['junit',{outputFile:reports+'/browser.junit.xml'}],['html',{outputFolder:reports+'/html',open:'never'}]]});
