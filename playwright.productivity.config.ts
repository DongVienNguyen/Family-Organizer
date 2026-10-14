import base from './playwright.config.js';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:'productivity.spec.ts',outputDir:'reports/productivity-browser-results',reporter:[['list'],['json',{outputFile:'reports/productivity-browser.json'}],['junit',{outputFile:'reports/productivity-browser.junit.xml'}],['html',{outputFolder:'reports/productivity-browser-html',open:'never'}]]});
