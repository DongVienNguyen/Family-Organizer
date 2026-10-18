import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { providerEnvKeys } from './recoveryEnv.js';
import { isFullyQualifiedPath } from '../scripts/lib/native-paths.mjs';

export interface AppConfig {
  codeRoot: string;
  dataRoot: string;
  configRoot: string;
  logRoot: string;
  production: boolean;
}

function absolute(value: string | undefined, fallback: string, name: string): string {
  if (value === undefined) return fallback;
  if (!isFullyQualifiedPath(value)) throw new Error(`${name} must be a fully qualified absolute path`);
  return path.resolve(value);
}

function within(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** Pure root selection. Never infer a database or dotenv file from process.cwd(). */
export function resolveConfig(env: NodeJS.ProcessEnv, defaultCodeRoot: string): AppConfig {
  const codeRoot = absolute(env.APP_CODE_ROOT, path.resolve(defaultCodeRoot), 'APP_CODE_ROOT');
  const production = env.NODE_ENV === 'production';
  if (production && !env.DATA_DIR) throw new Error('DATA_DIR is required as an absolute path in production');
  const dataRoot = absolute(env.DATA_DIR, path.join(codeRoot, 'data'), 'DATA_DIR');
  const configRoot = absolute(env.CONFIG_DIR, dataRoot, 'CONFIG_DIR');
  const logRoot = absolute(env.LOG_DIR, path.join(dataRoot, 'logs'), 'LOG_DIR');
  if (production && [dataRoot, configRoot, logRoot].some(root => within(codeRoot, root))) {
    throw new Error('Production storage must be outside codeRoot');
  }
  return Object.freeze({ codeRoot, dataRoot, configRoot, logRoot, production });
}

/** Verify actual writes before opening SQLite or generating installation secrets. */
export function prepareStorage(config: AppConfig): void {
  for (const directory of new Set([config.dataRoot, config.configRoot, config.logRoot])) {
    const probe = path.join(directory, `.write-probe-${crypto.randomUUID()}`);
    try {
      fs.mkdirSync(directory, { recursive: true });
      if (config.production && within(fs.realpathSync(config.codeRoot), fs.realpathSync(directory))) {
        throw new Error('Resolved production storage must be outside codeRoot');
      }
      const fd = fs.openSync(probe, 'wx', 0o600);
      fs.closeSync(fd);
      fs.unlinkSync(probe);
    } catch (cause) {
      throw new Error(`Storage directory is not writable: ${directory}`, { cause });
    }
  }
}

// In source ESM this is server/; the CJS bundle defines import.meta.dirname as
// __dirname (dist/). Both resolve the installation root without consulting cwd.
export const appConfig = resolveConfig(process.env, path.resolve(import.meta.dirname, '..'));
// Roots/NODE_ENV are launch-time environment settings. Optional provider values
// come from this explicit installation config location; cwd/.env is never read.
const environmentName=(name:string)=>process.platform==='win32'?name.toUpperCase():name;
const launchEnvironmentNames=new Set(Object.keys(process.env).map(environmentName));
const fileEnv = loadEnv({ path: path.join(appConfig.configRoot, '.env'), processEnv: {}, quiet: true }).parsed || {};
const launchKeys = new Set(['NODE_ENV', 'APP_CODE_ROOT', 'DATA_DIR', 'CONFIG_DIR', 'LOG_DIR']);
for (const [name, value] of Object.entries(fileEnv)) {
  if (!launchKeys.has(environmentName(name)) && process.env[name] === undefined) process.env[name] = value;
}

/** Reconcile file-derived provider values after restore recovery; host overrides win. */
export function reloadProviderEnvironment():void {
 const current=loadEnv({path:path.join(appConfig.configRoot,'.env'),processEnv:{},quiet:true}).parsed||{};
 const names=new Map<string,string>();for(const name of Object.keys(current))if(!names.has(environmentName(name)))names.set(environmentName(name),name);
 for(const key of new Set([...Object.keys(fileEnv).map(environmentName),...names.keys(),...providerEnvKeys.map(environmentName)])){if(launchKeys.has(key)||launchEnvironmentNames.has(key))continue;const name=names.get(key);if(name!==undefined)process.env[name]=current[name];else delete process.env[key];}
}
