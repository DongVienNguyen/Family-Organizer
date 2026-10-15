import base from './playwright.config.js';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:'matrix-touch.spec.ts',projects:[{name:'chromium',use:{browserName:'chromium',hasTouch:true,isMobile:true,viewport:{width:390,height:844},reducedMotion:'reduce'}}],outputDir:'reports/productivity-browser-touch-results',reporter:[['list'],['json',{outputFile:'reports/productivity-browser-touch.json'}],['junit',{outputFile:'reports/productivity-browser-touch.junit.xml'}],['html',{outputFolder:'reports/productivity-browser-touch-html',open:'never'}]]});
