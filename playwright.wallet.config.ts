import base from './playwright.config.js';
import { defineConfig } from '@playwright/test';
const project = process.env.FO_WALLET_PROJECT;
if (project && !['chromium', 'firefox', 'webkit'].includes(project))
    throw Error('Unknown Wallet browser project');
const reports = 'reports/wallet' + (project ? '/' + project : '');
export default defineConfig({ ...base, testMatch: 'wallet.spec.ts', outputDir: reports + '/results', reporter: [['list'], ['json', { outputFile: reports + '/browser.json' }], ['junit', { outputFile: reports + '/browser.junit.xml' }], ['html', { outputFolder: reports + '/html', open: 'never' }]] });
