import {structureRouter} from './productivity/structureRouter.js';
import {taskRouter,type ProductivityPorts} from './productivity/router.js';
import {telegramSettingsPatch} from './telegramSettings.js';
import {validateTaskComment} from './taskPolicy.js';
import {validateContentHeader} from './contentInput.js';
import { backupOccurrence, digestOccurrence } from './providerOccurrences.js';
import {createRealtimeHub} from './realtime.js';
import {isAdult,canViewLegacyTask,canonicalLegacyTagNames,canViewLegacyPlan,canViewLegacyNote,canViewLegacyDocument,canViewLegacyPatient,canViewLegacyNotification,canEditLegacyTask,canEditLegacyNote} from './legacyVisibility.js';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from "express";
import path from "path";
import os from "os";
import fsp from "fs/promises";
import crypto from "crypto";
import { UserRole, isLimitedViewer, DishSlot, MealIngredient, DOCUMENT_TYPE_LABELS } from "../src/types.js";
import { buildPlanFromLibrary, dedupeAndAnnotateGroceries } from "../src/utils/mealPlan.js";
import { normalizeSearchText, matchesQuery, excerptAround } from "../src/utils/searchText.js";

import type { AppConfig } from "./config.js";
import type { AppJobs } from "./appJobs.js";
import type { createSystemMetrics } from "./systemMetrics.js";
import { httpErrorStatus, httpErrorBody } from "./appErrors.js";
import { registerPushDelivery } from './registerOutbox.js';
import { withAppCommandContext } from "./commandContext.js";
import { isReady, type RuntimeState } from "./runtimeState.js";
import type { AuthService } from './auth.js';
import { isActiveAuthUser } from './auth.js';

export interface AppDependencies {
  db: typeof import('./db.js'); sqlite: typeof import('./sqlite.js');
  media: typeof import('./media.js'); fullBackup: typeof import('./fullBackup.js');
  telegram: typeof import('./telegramBackup.js'); digest: typeof import('./weeklyDigest.js');
  ics: typeof import('./icsFeed.js'); push: typeof import('./push.js');
  build: { version: string; commit: string; buildTime: string };
  state: RuntimeState; jobs: AppJobs; metrics: ReturnType<typeof createSystemMetrics>;
  backupHealth?:()=>import('./recoverySchedule.js').BackupHealth;
  checkStorage?: () => void;
  auth:AuthService;
  productivity?:ProductivityPorts;
}

/** Route construction does not open storage, bind HTTP or start scheduled jobs. */
export async function createApp(appConfig: AppConfig, dependencies: AppDependencies) {
  const { FamilyDB, verifyPassword, getAppSettings, setAppSetting } = dependencies.db;
  const { sqliteAppendServerMetric, sqliteGetServerMetrics } = dependencies.sqlite;
  const { UPLOADS_DIR } = dependencies.media;
  const { streamFullBackup, fullBackupFilename, importFullBackup } = dependencies.fullBackup;
  const { telegramBackupStatus, sendBackupToTelegram, runTelegramBackupTick } = dependencies.telegram;
  const { sendWeeklyDigest, runWeeklyDigestTick } = dependencies.digest;
  const { icsFeedToken, isValidIcsToken, buildIcsFeed } = dependencies.ics;
  const { getVapidPublicKey, isPushConfigured, sendTestPush } = dependencies.push;
  const BUILD = dependencies.build;
  const { jobs, state, metrics } = dependencies;
  registerPushDelivery(jobs, FamilyDB, dependencies.push);
  let disposeAssets = async () => {};
// Accepted permission roles for write validation
const VALID_ROLES = new Set<string>([UserRole.ADMIN, UserRole.MEMBER, UserRole.CHILD, UserRole.GUEST]);
const MAX_AVATAR_IMAGE_CHARS = 2_500_000;

// Images are stored either as "/uploads/..." file references (new) or, for older
// records, inline base64 "data:image/..." URLs. Both are accepted on write.
function isStoredImageRef(value: string): boolean {
  return value.startsWith("/uploads/") || value.startsWith("data:image/");
}

function validateAvatarImagePayload(avatarImage: unknown) {
  if (avatarImage === undefined || avatarImage === "") return;
  if (typeof avatarImage !== "string" || !isStoredImageRef(avatarImage)) {
    throw new Error("Ảnh đại diện không hợp lệ.");
  }
  // Length cap only matters for inline base64; file refs are short.
  if (avatarImage.startsWith("data:image/") && avatarImage.length > MAX_AVATAR_IMAGE_CHARS) {
    throw new Error("Ảnh đại diện sau khi tối ưu vẫn quá lớn. Vui lòng chọn ảnh khác.");
  }
}

const MAX_ASSET_PHOTOS = 8;
const MAX_ASSET_PHOTO_CHARS = 2_500_000;

function validateImageRef(value: unknown, label: string, maxChars: number) {
  if (typeof value !== "string" || !isStoredImageRef(value)) {
    throw new Error(`${label} không hợp lệ.`);
  }
  if (value.startsWith("data:image/") && value.length > maxChars) {
    throw new Error(`${label} quá lớn. Vui lòng để app tối ưu ảnh trước khi lưu.`);
  }
}

function validateAssetPhotosPayload(photos: unknown) {
  if (photos === undefined) return;
  if (!Array.isArray(photos)) throw new Error("Danh sách ảnh tài sản không hợp lệ.");
  if (photos.length > MAX_ASSET_PHOTOS) {
    throw new Error(`Mỗi tài sản chỉ nên lưu tối đa ${MAX_ASSET_PHOTOS} ảnh.`);
  }

  photos.forEach((photo, idx) => {
    if (!photo || typeof photo !== "object") throw new Error(`Ảnh tài sản #${idx + 1} không hợp lệ.`);
    const item = photo as any;
    validateImageRef(item.thumbnailDataUrl, `Ảnh thu nhỏ #${idx + 1}`, 500_000);
    validateImageRef(item.fullDataUrl, `Ảnh xem lớn #${idx + 1}`, MAX_ASSET_PHOTO_CHARS);
  });
}

const app = express();
app.use(['/api','/uploads'],(_req,res,next)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');res.vary('Authorization');next();
});
const handlers = new Map<Promise<unknown>,object>();
const responses = new Map<Promise<void>,object>();
const requestOwners = new WeakMap<Request,object>();
let maintenancePort: (<T>(work: () => Promise<T>, owner?: object) => Promise<T>) | undefined;
function maintenanceFor<T>(req: Request, work: () => Promise<T>): Promise<T> {
  const owner=requestOwners.get(req);
  if (!maintenancePort || !owner) return Promise.reject(new Error('Restore requires a managed runtime request owner'));
  return maintenancePort(work,owner);
}
for (const method of ['get', 'post', 'put', 'delete', 'patch'] as const) {
  const original = app[method].bind(app) as (...args: any[]) => any;
  (app as any)[method] = (...args: any[]) => original(...args.map((arg, index) => {
    if (index === 0 || typeof arg !== 'function') return arg;
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = arg(req, res, next);
        if (result && typeof result.then === 'function') {
          const pending = Promise.resolve(result).catch(next).finally(() => { handlers.delete(pending); });
          handlers.set(pending,requestOwners.get(req)!);
        }
      } catch (error) { next(error); }
    };
  }));
}
app.get('/api/health', (_req, res) => res.json({ ok: !['failed','stopped'].includes(state.phase), version: BUILD.version }));
app.get('/api/ready', (_req, res) => {
  if (state.phase === 'ready' && !state.migrating && dependencies.checkStorage) {
    try { dependencies.checkStorage(); state.storageWritable = true; }
    catch { state.storageWritable = false; }
  }
  res.status(isReady(state) ? 200 : 503).json({ ready: isReady(state), phase: state.phase });
});
app.use((req, res, next) => {
  if (!isReady(state)) { res.status(503).json({ error: 'Ứng dụng đang bảo trì hoặc dừng. Vui lòng thử lại sau.' }); return; }
  const owner={}; requestOwners.set(req,owner);
  const completed = new Promise<void>(resolve => {
    const done = () => { res.off('finish', done); res.off('close', done); responses.delete(completed); resolve(); };
    res.once('finish', done); res.once('close', done);
  });
  responses.set(completed,owner);
  next();
});


// --- GEMINI API KEY ---
// Admin can set a key from the UI (stored in app_settings.json); falls back to env.
function getGeminiKey(): string {
  const fromDb = (getAppSettings().geminiApiKey || "").trim();
  return fromDb || (process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim();
}
function geminiKeySource(): "app" | "env" | "none" {
  if ((getAppSettings().geminiApiKey || "").trim()) return "app";
  if ((process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim()) return "env";
  return "none";
}
function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}
function aiStatus() {
  const key = getGeminiKey();
  return { configured: Boolean(key), source: geminiKeySource(), masked: maskKey(key) };
}
// Lightweight validation: make a tiny call so a bad key fails fast at save time.
async function testGeminiKey(key: string): Promise<void> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: key });
  await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: "ping",
    config: { responseMimeType: "text/plain" }
  } as any);
}

// Gemini thường trả 503 "model overloaded" / 429 khi quá tải — lỗi tạm thời.
function isGeminiOverloaded(err: any): boolean {
  const msg = String(err?.message || err || "");
  return /\b(503|429)\b|overloaded|unavailable|rate.?limit|quota|try again/i.test(msg);
}
function geminiErrorMessage(err: any): string {
  if (isGeminiOverloaded(err)) {
    return "Gemini đang quá tải (503). Đã thử lại nhưng chưa được — bạn chờ một lát rồi bấm lại nhé.";
  }
  return err?.message || "AI đang gặp lỗi, vui lòng thử lại.";
}
// Gọi Gemini có tự thử lại khi bị quá tải (503/429) với backoff nhẹ.
async function geminiGenerate(ai: any, params: any, retries = 2, beforeAttempt?: () => void): Promise<any> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    beforeAttempt?.();
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      lastErr = err;
      if (!isGeminiOverloaded(err) || attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // 1s, 2s
    }
  }
  throw lastErr;
}

// Body parser - supports rich receipt images in finances
app.use('/api/auth',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
app.use(express.json({ limit: "15mb" }));
// A request accepted before maintenance may still be parsing its body.
app.use((_req, res, next) => {
  if (!isReady(state)) { res.status(503).json({ error: 'Ứng dụng đang bảo trì hoặc dừng.' }); return; }
  next();
});

// Internal opaque Bearer sessions are owned by the injected revocation service.

// --- SIMPLE LOGIN RATE LIMITING (in-memory, per IP) ---
const loginAttempts = new Map<string, { count: number; first: number }>();
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 8;

function isRateLimited(ip: string): boolean {
  const rec = loginAttempts.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.first > RATE_WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return rec.count >= RATE_MAX;
}

function recordLoginFailure(ip: string): void {
  const rec = loginAttempts.get(ip);
  if (!rec || Date.now() - rec.first > RATE_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, first: Date.now() });
  } else {
    rec.count += 1;
  }
}

function canReceiveRealtime(user:{id:string;role:UserRole},event:{type:string;data:Record<string,unknown>}){
  const actor={userId:user.id,role:user.role},data=event.data;
  if(!VALID_ROLES.has(actor.role))return false;
  const target=(getter:()=>{id:string}[],id:unknown,allow:(row:any,recipient:{userId:string;role:UserRole})=>boolean)=>typeof id==='string'&&getter().some(row=>row.id===id&&allow(row,actor));
  switch(event.type){
    case 'TASKS_UPDATE':return (Array.isArray(data.taskIds)?data.taskIds:[data.taskId??data.deletedId]).some(id=>target(()=>FamilyDB.getTasks(),id,canViewLegacyTask));
    case 'PLANS_UPDATE':return target(()=>FamilyDB.getPlans(),data.planId??data.deletedId,canViewLegacyPlan);
    case 'NOTES_UPDATE':return target(()=>FamilyDB.getNotes(),data.noteId??data.deletedId,canViewLegacyNote);
    case 'DOCUMENTS_UPDATE':return target(()=>FamilyDB.getDocuments(),data.documentId??data.deletedId,canViewLegacyDocument);
    case 'FINANCE_UPDATE':return isAdult(actor)&&(!('savingsGoalId' in data||'deletedGoalId' in data)||target(()=>FamilyDB.getSavingsGoals(),data.savingsGoalId??data.deletedGoalId,canViewSavingsGoal));
    case 'BACKUPS_UPDATE':return actor.role===UserRole.ADMIN;
    case 'MEDICATIONS_UPDATE':return isAdult(actor)||target(()=>FamilyDB.getMedications(),data.medicationId??data.deletedId,row=>canViewLegacyPatient(row.patientId,actor));
    case 'CHILD_HEALTH_UPDATE':return isAdult(actor)||target(()=>FamilyDB.getHealthProfiles(),data.healthProfileId,row=>canViewLegacyPatient(row.userId,actor))||target(()=>FamilyDB.getVaccinations(),data.vaccinationId??data.deletedVaccinationId,row=>canViewLegacyPatient(row.childId,actor))||target(()=>FamilyDB.getGrowthRecords(),data.growthId??data.deletedGrowthId,row=>canViewLegacyPatient(row.childId,actor));
    case 'REWARDS_UPDATE':return typeof data.taskId==='string'?target(()=>FamilyDB.getTasks(),data.taskId,canViewLegacyTask):true;
    case 'SHOPPING_UPDATE':case 'USERS_UPDATE':case 'NOTIFICATIONS_UPDATE':case 'SETTINGS_UPDATE':case 'RESTORE_COMPLETED':return true;
    default:return false;
  }
}
const realtime=createRealtimeHub({verify:token=>dependencies.auth.verify(token),allow:(user,event)=>canReceiveRealtime(user,event)||!!event.previous?.has(user.id)});
const realtimeAudience=(type:string,data:Record<string,unknown>)=>new Set(FamilyDB.getUsers().filter(user=>!user.isDeleted&&canReceiveRealtime(user,{type,data})).map(user=>user.id));

// Realtime sync broadcast helper
function broadcastSyncEvent(eventType: string, extraData: any = {},previous?:Set<string>,invalidateCatalog=true) {
  realtime.emit({type:eventType,data:extraData,previous});
  // Canonical and retained task writers can change tag membership/visibility.
  // Use both current and prior task readers so revoked readers purge labels.
  if(eventType==='TASKS_UPDATE'&&invalidateCatalog){const audience=realtimeAudience(eventType,extraData);for(const userId of previous??[])audience.add(userId);realtime.emit({type:'PRODUCTIVITY_CATALOG_UPDATE',data:{},previous:audience});}
}

// Authentication middleware to extract current user session
interface AuthRequest extends Request {
  userSession?: {
    userId: string;
    username: string;
    fullName: string;
    role: UserRole;
  };
}

const validateContentRequest=(req:Request,res:Response,next:NextFunction)=>{
  try {validateContentHeader(req.body);next();}
  catch(error){res.status(httpErrorStatus(error)).json(httpErrorBody(error));}
};

const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = authHeader.slice(7);
  const matchedUser=dependencies.auth.verify(token);
  if (!matchedUser) {
    next();
    return;
  }

  if (matchedUser && !matchedUser.isDeleted) {
    req.userSession = {
      userId: matchedUser.id,
      username: matchedUser.username,
      fullName: matchedUser.fullName,
      role: matchedUser.role
    };
  }
  if (req.userSession) {
    const supplied = req.get('x-request-id');
    const requestId = supplied && /^[A-Za-z0-9_-]{1,128}$/.test(supplied) ? supplied : crypto.randomUUID();
    withAppCommandContext({ actorId: req.userSession.userId, requestId }, next);
  } else next();
};

app.use(authMiddleware as any);

// --- OPTIMISTIC LOCKING (chống 2 người cùng sửa một bản ghi đè nhau) ---
// Optimistic edit checks run inside the write gateway, after retry lookup.

// Enforce authentication on APIs
const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.userSession) {
    res.status(401).json({ error: "Vui lòng đăng nhập để thực hiện tác vụ này!" });
    return;
  }
  next();
};

// Bearer-authenticated immutable files; current domain ACL precedes any bytes.
app.use('/uploads',requireAuth,(req:AuthRequest,res:Response)=>{
  const missing=()=>res.status(404).json({error:'Không tìm thấy tệp.'});
  if(req.method!=='GET'&&req.method!=='HEAD'){missing();return;}
  const url=req.originalUrl.split('?')[0];
  if(!dependencies.media.authorizeMedia?.(url,req.userSession!)){missing();return;}
  try{const {bytes,mime}=dependencies.media.readManagedMedia(url);
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"sandbox; default-src 'none'");
    res.type(mime).send(bytes);
  }catch{missing();}
});

// Enforce specific role level
const requireRole = (roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userSession) {
      res.status(401).json({ error: "Bạn chưa đăng nhập!" });
      return;
    }
    if (!roles.includes(req.userSession.role)) {
      res.status(403).json({ error: `Tài khoản của bạn (${req.userSession.role}) không được phép thực hiện thao tác này!` });
      return;
    }
    next();
  };
};

const canViewSavingsGoal = (goal: { isShared: boolean; creatorId: string }, session: AuthRequest["userSession"]) => {
  if (!session) return false;
  return goal.isShared===true || goal.creatorId === session.userId;
};

const canManageSavingsGoal = (goal: { isShared: boolean; creatorId: string }, session: AuthRequest["userSession"]) => {
  if (!session) return false;
  return goal.creatorId === session.userId || (goal.isShared && session.role === UserRole.ADMIN);
};

const canViewDocument = (
  doc: { isShared: boolean; creatorId: string; ownerId?: string },
  session: AuthRequest["userSession"]
) => {
  if (!session) return false;
  return canViewLegacyDocument(doc,session);
};

const canManageDocument = (
  doc: { isShared: boolean; creatorId: string; ownerId?: string },
  session: AuthRequest["userSession"]
) => {
  if (!session) return false;
  return doc.creatorId === session.userId ||
    doc.ownerId === session.userId ||
    (doc.isShared && session.role === UserRole.ADMIN);
};

// --- MEDIA UPLOAD ---
// Accepts an optimized base64 data URL, writes it to disk under the given
// category folder, and returns the "/uploads/..." URL to store in the DB.
const UPLOAD_CATEGORIES = new Set(["avatars", "assets", "receipts", "documents", "debts", "notes"]);

app.post("/api/uploads", requireAuth, (req: AuthRequest, res: Response) => {
  const { dataUrl, category, subfolder } = req.body || {};
  if (!UPLOAD_CATEGORIES.has(category)) {
    res.status(400).json({ error: "Loại ảnh tải lên không hợp lệ." });
    return;
  }
  try {
    if(!Object.values(UserRole).includes(req.userSession!.role)||["assets","receipts","documents","debts"].includes(category)&&!isAdult(req.userSession!)){res.status(403).json({error:"Không được tải tệp này."});return;}
    const saved = dependencies.media.uploadMedia(dataUrl, category, subfolder,req.userSession!.userId);
    res.json(saved);
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Tải ảnh lên thất bại." });
  }
});

// --- FEATURE FLAGS (family-level) ---
// Điểm thưởng cho trẻ: mặc định BẬT nếu gia đình có tài khoản Trẻ (Con); admin
// bật/tắt thủ công trong Thiết lập sẽ ghi đè mặc định (lưu trong app_settings).
function rewardsFeatureEnabled(): boolean {
  const v = getAppSettings().rewardsEnabled;
  if (v === "1") return true;
  if (v === "0") return false;
  return FamilyDB.getUsers().some(u => u.role === UserRole.CHILD);
}

// --- CURRENT BUILD (operator-managed Windows releases) ---
app.get("/api/version", requireAuth, (_req: AuthRequest, res: Response) => {
  res.json({
    version: BUILD.version,
    commit: BUILD.commit,
    shortCommit: BUILD.commit ? BUILD.commit.slice(0, 7) : "",
    buildTime: BUILD.buildTime,
    aiEnabled: Boolean(getGeminiKey()),
    productivityActive: dependencies.productivity?.active()===true,
    rewardsEnabled: rewardsFeatureEnabled(),
    rewardApprovalThreshold: Math.max(0, Number(getAppSettings().rewardApprovalThreshold || 0))
  });
});

// Windows-native telemetry; no /proc, /sys or shell execution.
async function recordServerMetric() {
  const value = await metrics.sample();
  sqliteAppendServerMetric({ t: Date.now(), cpu: value.cpu.percent,
    ram: value.memory.totalBytes ? value.memory.usedBytes / value.memory.totalBytes * 100 : null,
    temp: null, ssd: null, disk: value.disk ? value.disk.usedBytes / value.disk.totalBytes * 100 : null });
}
jobs.registerAppJob('legacy', 'metrics', recordServerMetric, { everyMs: 60 * 1000, initialMs: 10 * 1000 });

// Danh sách shortcut dịch vụ homelab (Immich, Portainer…) lưu trong app_settings.
// Admin quản lý (GET xem, PUT ghi toàn bộ mảng).
interface HomelabLink { id: string; emoji: string; name: string; url: string; desc?: string }
const parseHomelabLinks = (): HomelabLink[] => {
  try { return JSON.parse(getAppSettings().homelabLinks || "[]"); } catch { return []; }
};
app.get("/api/server/homelab-links", requireAuth, requireRole([UserRole.ADMIN]), (_req: AuthRequest, res: Response) => {
  res.json({ links: parseHomelabLinks() });
});
app.put("/api/server/homelab-links", requireAuth, requireRole([UserRole.ADMIN]), (req: AuthRequest, res: Response) => {
  const links = req.body?.links;
  if (!Array.isArray(links)) { res.status(400).json({ error: "links phải là mảng" }); return; }
  const clean: HomelabLink[] = links.map((l: any) => ({
    id: String(l.id || `hl_${Date.now()}_${Math.random().toString(36).slice(2,6)}`),
    emoji: String(l.emoji || "🔗").trim().slice(0, 8),
    name: String(l.name || "").trim().slice(0, 60),
    url: String(l.url || "").trim().slice(0, 500),
    desc: l.desc ? String(l.desc).trim().slice(0, 120) : undefined
  })).filter(l => l.name && l.url);
  setAppSetting("homelabLinks", JSON.stringify(clean));
  res.json({ links: clean });
});

// Lịch sử telemetry cho biểu đồ: 24h (mặc định) hoặc 7 ngày, downsample ≤320 điểm.
app.get("/api/server/history", requireAuth, requireRole([UserRole.ADMIN]), (req: AuthRequest, res: Response) => {
  const range = req.query.range === "7d" ? "7d" : "24h";
  const sinceMs = Date.now() - (range === "7d" ? 7 * 24 : 24) * 3600 * 1000;
  const all = sqliteGetServerMetrics(sinceMs);
  const MAX_POINTS = 320;
  const step = Math.ceil(all.length / MAX_POINTS);
  const points = step > 1 ? all.filter((_, i) => i % step === 0 || i === all.length - 1) : all;
  res.json({ range, points });
});

// Các địa chỉ IPv4 của máy (không tính loopback). Gắn nhãn Tailscale theo dải
// CGNAT 100.64.0.0/10 hoặc tên card "tailscale*"; dải 172.16–31 trong container
// được hiển thị như mạng LAN; không suy đoán Docker theo dải IP.
const listNetworkAddrs = () => {
  const out: { name: string; address: string; kind: "tailscale" | "lan" }[] = [];
  const isTailscaleIp = (ip: string) => {
    const m = ip.match(/^100\.(\d+)\./);
    return !!m && Number(m[1]) >= 64 && Number(m[1]) <= 127;
  };
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.internal || a.family !== "IPv4") continue;
      const kind = (isTailscaleIp(a.address) || name.startsWith("tailscale")) ? "tailscale"
        : "lan";
      out.push({ name, address: a.address, kind });
    }
  }
  return out;
};

// IP của client đang gọi (qua reverse proxy thì lấy hop đầu của x-forwarded-for).
const readClientIp = (req: Request): string => {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const raw = fwd || req.socket.remoteAddress || "";
  return raw.replace(/^::ffff:/, "");
};

// Dung lượng dữ liệu app: file SQLite (+wal/shm) đọc mỗi lần, thư mục uploads
// walk đệ quy nhưng cache 5 phút (có thể nhiều file media).
let uploadsSizeCache: { at: number; bytes: number } | null = null;
async function readDataSizes(): Promise<{ dbBytes: number; uploadsBytes: number }> {
  let dbBytes = 0;
  for (const f of ["family.db", "family.db-wal", "family.db-shm"]) {
    try { dbBytes += (await fsp.stat(path.join(appConfig.dataRoot, f))).size; } catch { /* file chưa tồn tại */ }
  }
  if (!uploadsSizeCache || Date.now() - uploadsSizeCache.at > 5 * 60 * 1000) {
    let bytes = 0;
    const walk = async (dir: string) => {
      let entries;
      try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else { try { bytes += (await fsp.stat(p)).size; } catch { /* file vừa bị xóa */ } }
      }
    };
    await walk(UPLOADS_DIR);
    uploadsSizeCache = { at: Date.now(), bytes };
  }
  return { dbBytes, uploadsBytes: uploadsSizeCache.bytes };
}

app.get("/api/server/stats", requireAuth, requireRole([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const [sample, dataSizes] = await Promise.all([metrics.sample(), readDataSizes()]);
    const { cpu, tempC, ssdTempC, memory, disk, loadAvg, capabilities } = sample;
    res.json({
      at: new Date().toISOString(),
      hostname: os.hostname(),
      platform: `${os.type()} ${os.arch()}`,
      uptimeSec: Math.round(os.uptime()),
      loadAvg, capabilities,
      cpu,
      tempC,
      ssdTempC,
      memory,
      disk,
      // Mạng & truy cập
      network: { interfaces: listNetworkAddrs(), clientIp: readClientIp(req) },
      // Ứng dụng & dữ liệu
      app: {
        version: BUILD.version,
        commit: BUILD.commit ? BUILD.commit.slice(0, 7) : "",
        nodeVersion: process.version,
        processUptimeSec: Math.round(process.uptime()),
        rssBytes: process.memoryUsage.rss()
      },
      data: {
        backup: dependencies.backupHealth?.(),
        ...dataSizes,
        pushDevices: FamilyDB.getPushSubscriptions().length,
        sseClients: realtime.size,
        users: FamilyDB.getUsers().length
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Không đọc được thông số máy chủ." });
  }
});

// --- AI SETTINGS (Gemini API key, admin only) ---

app.get("/api/settings/ai", requireAuth, requireRole([UserRole.ADMIN]), (_req: AuthRequest, res: Response) => {
  res.json(aiStatus());
});

// Save (and validate) a Gemini key, or clear it by sending an empty value.
app.post("/api/settings/ai", requireAuth, requireRole([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
  const apiKey = String(req.body?.apiKey ?? "").trim();

  if (!apiKey) {
    setAppSetting("geminiApiKey", null);
    res.json({ ...aiStatus(), message: "Đã xóa key trong app. Sẽ dùng key từ biến môi trường (nếu có)." });
    return;
  }

  try {
    await testGeminiKey(apiKey);
  } catch (err: any) {
    res.status(400).json({ error: "Key không dùng được (gọi thử Gemini thất bại): " + (err?.message || "lỗi không rõ") });
    return;
  }

  setAppSetting("geminiApiKey", apiKey);
  res.json({ ...aiStatus(), message: "Đã lưu Gemini API key. Tính năng AI đã sẵn sàng." });
});

// --- FEATURE TOGGLES (admin only) ---
// Bật/tắt tính năng "Điểm thưởng cho trẻ" cho cả nhà. Gửi { rewards: boolean }.
app.post("/api/settings/features", requireAuth, requireRole([UserRole.ADMIN]), (req: AuthRequest, res: Response) => {
  const { rewards, rewardApprovalThreshold } = req.body || {};
  if (rewards !== undefined) setAppSetting("rewardsEnabled", rewards ? "1" : "0");
  // Ngưỡng tự duyệt: task của trẻ có điểm ≤ ngưỡng thì bấm xong tự cộng luôn;
  // lớn hơn thì phải chờ ba mẹ duyệt. 0 = mọi task có điểm đều cần duyệt.
  if (rewardApprovalThreshold !== undefined) {
    const n = Math.max(0, Math.floor(Number(rewardApprovalThreshold) || 0));
    setAppSetting("rewardApprovalThreshold", n > 0 ? String(n) : null);
  }
  broadcastSyncEvent("SETTINGS_UPDATE");
  res.json({
    rewardsEnabled: rewardsFeatureEnabled(),
    rewardApprovalThreshold: Math.max(0, Number(getAppSettings().rewardApprovalThreshold || 0))
  });
});

// --- TELEGRAM BACKUP SETTINGS (admin only) ---
// Backup toàn phần tự gửi qua bot Telegram hằng đêm (2h–4h sáng) — bản sao offsite.

app.get("/api/settings/telegram-backup", requireAuth, requireRole([UserRole.ADMIN]), (_req: AuthRequest, res: Response) => {
  res.json(telegramBackupStatus());
});

app.post("/api/settings/telegram-backup", requireAuth, requireRole([UserRole.ADMIN]), (req: AuthRequest, res: Response) => {
  try {
    const patch=telegramSettingsPatch(req.body,req.userSession!.userId,getAppSettings());
    dependencies.db.patchAppSettings(patch);
    res.json(telegramBackupStatus());
  } catch(error) {
    const status=(error as {status?:number})?.status;
    res.status(status===400?400:503).json({error:status===400?'Cấu hình Telegram không hợp lệ.':'Không lưu được cấu hình Telegram. Hãy thử lại.'});
  }
});

// Gửi thử ngay 1 bản backup (kiểm tra token/chat id đúng chưa).
app.post("/api/settings/telegram-backup/test", requireAuth, requireRole([UserRole.ADMIN]), async (_req: AuthRequest, res: Response) => {
  try {
    const result = await sendBackupToTelegram();
    res.json({ success: true, message: `Đã gửi backup ${result.sizeMb}MB qua Telegram — kiểm tra chat của bạn nhé.`, ...telegramBackupStatus() });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Gửi backup qua Telegram thất bại." });
  }
});

// Gửi thử bản tin tuần ngay (không chờ thứ Hai).
app.post("/api/settings/telegram-digest/test", requireAuth, requireRole([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
  try {
    const actorId=req.userSession!.userId,token=(req.get("authorization")||"").slice(7);
    const { aiUsed } = await sendWeeklyDigest(new Date(),{userId:actorId,isCurrent:()=>dependencies.auth.verify(token)?.id===actorId});
    res.json({ success: true, message: `Đã gửi bản tin tuần${aiUsed ? " (AI)" : ""} — kiểm tra chat Telegram nhé.` });
  } catch (err: any) {
    res.status(400).json({ error: "Gửi bản tin tuần thất bại. Kiểm tra cấu hình và quyền nhận tin." });
  }
});

// Vòng kiểm tra gửi backup + bản tin tuần (mỗi 30 phút, module tự lo dedupe + khung giờ).
jobs.registerAppJob('legacy', 'telegram-backup', () => runTelegramBackupTick(), { everyMs: 30 * 60 * 1000, kind: 'effect', occurrenceKey: backupOccurrence });
jobs.registerAppJob('legacy', 'weekly-digest', () => runWeeklyDigestTick(), { everyMs: 30 * 60 * 1000, kind: 'effect', occurrenceKey: digestOccurrence });

// --- AUTH API ENDPOINTS ---

app.post("/api/auth/login", (req: Request, res: Response) => {
  const ip = req.ip || "unknown";

  if (isRateLimited(ip)) {
    res.status(429).json({ error: "Bạn đã thử đăng nhập sai quá nhiều lần. Vui lòng đợi vài phút rồi thử lại!" });
    return;
  }

  const {username,password}=req.body&&typeof req.body==='object'&&!Array.isArray(req.body)?req.body:{};
  if (typeof username!=='string'||!username.trim()||username.length>512||typeof password!=='string'||!password||password.length>4096||Buffer.byteLength(password,'utf8')>4096) {
    res.status(400).json({ error: "Vui lòng nhập đầy đủ tài khoản và mật khẩu!" });
    return;
  }

  const users = FamilyDB.getUsers();
  const user = users.find(u => u.username === username.toLowerCase().trim());

  if (!isActiveAuthUser(user) || !verifyPassword(password, user.passwordHash)) {
    recordLoginFailure(ip);
    res.status(401).json({ error: "Tài khoản hoặc mật khẩu không chính xác!" });
    return;
  }

  // Successful login clears the failure counter
  loginAttempts.delete(ip);

  // Record login activity
  FamilyDB.logActivity(user.id, user.username, "Đăng nhập", `Đã đăng nhập thành công vào hệ thống.`);

  // Refresh birthday reminders on each login so they stay current
  try {
    FamilyDB.generateBirthdayNotifications();
  } catch (e) {
    console.error("Lỗi tạo nhắc sinh nhật:", e);
  }

  const { passwordHash, ...safeUser } = user;
  res.json({ user: safeUser, token: dependencies.auth.issue(user) });
});

app.post('/api/auth/logout',requireAuth,(req:AuthRequest,res:Response)=>{
  dependencies.auth.logout(req.headers.authorization!.slice(7));realtime.recheck();res.json({success:true});
});

app.get("/api/auth/me", (req: AuthRequest, res: Response) => {
  if (!req.userSession) {
    res.status(401).json({ error: "Không tìm thấy phiên làm việc!" });
    return;
  }
  const users = FamilyDB.getUsers();
  const user = users.find(u => u.id === req.userSession?.userId);
  if (!user) {
    res.status(404).json({ error: "Không tìm thấy người dùng!" });
    return;
  }
  const { passwordHash, ...safeUser } = user;
  res.json({ user: safeUser });
});

app.post("/api/auth/change-password", requireAuth, (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Vui lòng nhập mật khẩu hiện tại và mật khẩu mới!" });
    return;
  }

  try {
    FamilyDB.changePassword(session.userId, currentPassword, newPassword);
    realtime.recheck();
    res.json({ success: true });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// --- REALTIME SSE CONNECTION FOR REPLICATION ---

app.get("/api/realtime", requireAuth, (req: Request, res: Response) => {
  if(!realtime.open(req.headers.authorization!.slice(7),res)&&!res.headersSent)res.status(401).json({error:'Phiên đăng nhập đã kết thúc.'});
});

// --- TASK API ENDPOINTS ---
if(dependencies.productivity)app.use('/api/productivity/tasks',taskRouter(dependencies.productivity,requireAuth as any,{previous:id=>realtimeAudience('TASKS_UPDATE',{taskId:id}),emit:(id,previous)=>broadcastSyncEvent('TASKS_UPDATE',{taskId:id},previous)}));
if(dependencies.productivity)app.use('/api/productivity',structureRouter(dependencies.productivity,requireAuth as any,{previous:id=>realtimeAudience('TASKS_UPDATE',{taskId:id}),emit:(id,previous)=>broadcastSyncEvent('TASKS_UPDATE',{taskId:id},previous,false),catalog:audience=>broadcastSyncEvent('PRODUCTIVITY_CATALOG_UPDATE',{},audience),pin:actorId=>broadcastSyncEvent('PRODUCTIVITY_PIN_UPDATE',{},new Set([actorId]))}));

app.get('/api/tasks/:id',requireAuth,(req:AuthRequest,res:Response)=>{
 try{const task=FamilyDB.getTasks().find(row=>row.id===req.params.id&&canViewLegacyTask(row,req.userSession!));if(!task){res.status(404).json({error:'Không tìm thấy công việc.'});return;}res.json({task});}
 catch(error){res.status(httpErrorStatus(error)).json(httpErrorBody(error));}
});

app.get("/api/tasks", requireAuth, (req: AuthRequest, res: Response) => {
  const tasks = FamilyDB.getTasks().filter(task=>canViewLegacyTask(task,req.userSession!));
  res.json({ tasks });
});

app.post("/api/tasks", requireAuth, requireRole([UserRole.ADMIN,UserRole.MEMBER,UserRole.CHILD]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  
  if(req.body?.id){
    const existing=FamilyDB.getTasks().find(task=>task.id===req.body.id);
    if(!existing||!canViewLegacyTask(existing,session)){res.status(404).json({error:'Không tìm thấy công việc'});return;}
    if(!canEditLegacyTask(existing,session)){res.status(403).json({error:'Bạn không có quyền sửa công việc này.'});return;}
  }

  try {
    const previous=realtimeAudience('TASKS_UPDATE',{taskId:req.body.id});
    const beforeIds=new Set(FamilyDB.getTasks().map(task=>task.id));
    const savedTask = FamilyDB.saveTask(req.body, session.userId, session.username);
    broadcastSyncEvent("TASKS_UPDATE", { taskIds: [savedTask.id,...FamilyDB.getTasks().filter(task=>!beforeIds.has(task.id)).map(task=>task.id)] },previous);
    res.json({ task: savedTask });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.post("/api/tasks/:id/comments", requireAuth, (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const { id } = req.params;
  const { content } = req.body;
  const existing=FamilyDB.getTasks().find(task=>task.id===id);
  if(!existing||!canViewLegacyTask(existing,session)){res.status(404).json({error:'Không tìm thấy công việc'});return;}

  try { validateTaskComment(content); } catch(error) { res.status(400).json(httpErrorBody(error)); return; }

  try {
    const updatedTask = FamilyDB.addCommentToTask(id, content, session.userId, session.username);
    broadcastSyncEvent("TASKS_UPDATE", { taskId: id });
    res.json({ task: updatedTask });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// Người lớn DUYỆT việc trẻ đã báo hoàn thành (chờ duyệt) → cộng điểm cho trẻ.
app.post("/api/tasks/:id/approve", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const beforeIds=new Set(FamilyDB.getTasks().map(task=>task.id));
    const previous=realtimeAudience('TASKS_UPDATE',{taskId:req.params.id});
    const task = FamilyDB.approveTaskCompletion(req.params.id, session.userId, session.username);
    broadcastSyncEvent("TASKS_UPDATE", { taskIds: [task.id,...FamilyDB.getTasks().filter(task=>!beforeIds.has(task.id)).map(task=>task.id)] },previous);
    broadcastSyncEvent("REWARDS_UPDATE", { taskId: task.id });
    res.json({ task });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// Người lớn TRẢ LẠI việc trẻ báo xong (kèm lý do) → trẻ làm lại, không cộng điểm.
app.post("/api/tasks/:id/reject", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const task = FamilyDB.rejectTaskCompletion(req.params.id, session.userId, session.username, req.body?.reason);
    broadcastSyncEvent("TASKS_UPDATE", { taskId: task.id });
    res.json({ task });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.delete("/api/tasks/:id", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const { id } = req.params;

  try {
    const previous=realtimeAudience('TASKS_UPDATE',{taskId:id});
    FamilyDB.deleteTask(id, session.userId, session.username);
    broadcastSyncEvent("TASKS_UPDATE", { deletedId: id },previous);
    res.json({ success: true });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// --- PLANS / SCHEDULE API ENDPOINTS ---

app.get("/api/plans", requireAuth, (req: AuthRequest, res: Response) => {
  const plans = FamilyDB.getPlans().filter(plan=>canViewLegacyPlan(plan,req.userSession!));
  res.json({ plans });
});

app.post("/api/plans", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER, UserRole.CHILD]), validateContentRequest, (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const planData = req.body;

  if (planData.id) {
    const existing = FamilyDB.getPlans().find(p => p.id === planData.id);
    if(!existing||!canViewLegacyPlan(existing,session)){res.status(404).json({error:'Không tìm thấy sự kiện'});return;}
    if (existing && existing.creatorId !== session.userId && session.role !== UserRole.ADMIN) {
      res.status(403).json({ error: "Bạn chỉ có thể chỉnh sửa sự kiện do mình tạo. Admin có toàn quyền chỉnh sửa lịch." });
      return;
    }
  }

  try {
    const previous=realtimeAudience('PLANS_UPDATE',{planId:planData.id});
    const savedPlan = FamilyDB.savePlan(planData, session.userId, session.username);
    broadcastSyncEvent("PLANS_UPDATE", { planId: savedPlan.id },previous);
    res.json({ plan: savedPlan });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.delete("/api/plans/:id", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER, UserRole.CHILD]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const { id } = req.params;
  const existing = FamilyDB.getPlans().find(p => p.id === id);
  if(!existing||!canViewLegacyPlan(existing,session)){res.status(404).json({error:'Không tìm thấy sự kiện'});return;}

  if (existing && existing.creatorId !== session.userId && session.role !== UserRole.ADMIN) {
    res.status(403).json({ error: "Bạn chỉ có thể xóa sự kiện do mình tạo. Admin có toàn quyền quản lý lịch." });
    return;
  }

  try {
    const previous=realtimeAudience('PLANS_UPDATE',{planId:id});
    FamilyDB.deletePlan(id, session.userId, session.username);
    broadcastSyncEvent("PLANS_UPDATE", { deletedId: id },previous);
    res.json({ success: true });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// --- ICS SUBSCRIBE FEED (Apple/Google Calendar tự đồng bộ lịch gia đình) ---

// Cho thành viên lấy URL đăng ký (kèm token) để dán vào app lịch.
app.get("/api/calendar/feed-info", requireAuth, (_req: AuthRequest, res: Response) => {
  res.json({ path: "/api/calendar.ics", token: icsFeedToken() });
});

// Feed công khai qua token (calendar app không gửi được header Authorization).
app.get("/api/calendar.ics", (req: Request, res: Response) => {
  if (!isValidIcsToken(req.query.token)) {
    res.status(401).send("Invalid token");
    return;
  }
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="family-calendar.ics"');
  res.setHeader("Cache-Control", "no-store");
  res.send(buildIcsFeed());
});

// --- NOTES API ENDPOINTS ---

app.get("/api/notes", requireAuth, (req: AuthRequest, res: Response) => {
  const notes = FamilyDB.getNotes().filter(note=>canViewLegacyNote(note,req.userSession!));
  res.json({ notes });
});

app.post("/api/notes", requireAuth, validateContentRequest, (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const noteData = req.body;

  if(noteData.id){
    const existing=FamilyDB.getNotes().find(note=>note.id===noteData.id);
    if(!existing||!canViewLegacyNote(existing,session)){res.status(404).json({error:'Không tìm thấy ghi chú'});return;}
    if(!canEditLegacyNote(existing,session)){res.status(403).json({error:'Bạn không có quyền sửa ghi chú này.'});return;}
  }

  try {
    const previous=realtimeAudience('NOTES_UPDATE',{noteId:noteData.id});
    const savedNote = FamilyDB.saveNote(noteData, session.userId, session.username);
    broadcastSyncEvent("NOTES_UPDATE", { noteId: savedNote.id },previous);
    res.json({ note: savedNote });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.delete("/api/notes/:id", requireAuth, (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const { id } = req.params;

  const existing = FamilyDB.getNotes().find(n => n.id === id);
  if (!existing||!canViewLegacyNote(existing,session)) {
    res.status(404).json({ error: "Không tìm thấy ghi chú" });
    return;
  }

  if (existing.creatorId !== session.userId && session.role !== UserRole.ADMIN) {
    res.status(403).json({ error: "Chỉ người tạo hoặc Admin mới được xóa ghi chú này!" });
    return;
  }

  try {
    const previous=realtimeAudience('NOTES_UPDATE',{noteId:id});
    FamilyDB.deleteNote(id, session.userId, session.username);
    broadcastSyncEvent("NOTES_UPDATE", { deletedId: id },previous);
    res.json({ success: true });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// --- TÌM KIẾM TOÀN CỤC ---
// Gộp kết quả từ tasks + lịch + ghi chú + thu chi + giấy tờ trong MỘT request.
// So khớp không phân biệt hoa/thường & bỏ dấu tiếng Việt ("giay to" khớp "Giấy tờ").
// Quyền xem soi đúng theo từng route GET gốc: thu chi + giấy tờ chỉ Admin/Member,
// All domain visibility filters run before matching and result limits.

interface SearchResultItem {
  kind: "task" | "plan" | "note" | "transaction" | "document";
  id: string;
  title: string;
  snippet: string;
  date: string; // ngày hiển thị (YYYY-MM-DD...) — để client format
  tab: string;  // tab đích khi bấm vào kết quả
}

const SEARCH_LIMIT_PER_KIND = 6;

app.get("/api/search", requireAuth, (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const q = normalizeSearchText(String(req.query.q || ""));
  if (q.length < 2) {
    res.json({ results: [], query: q });
    return;
  }

  const results: SearchResultItem[] = [];
  const take = <T,>(list: T[], map: (x: T) => SearchResultItem) =>
    list.slice(0, SEARCH_LIMIT_PER_KIND).forEach(x => results.push(map(x)));

  // Tasks — same authoritative visibility as the list route.
  take(
    FamilyDB.getTasks().filter(t => canViewLegacyTask(t,session)&&matchesQuery(q, t.title, t.description, canonicalLegacyTagNames(t.tags,session))),
    t => ({
      kind: "task", id: t.id, title: t.title,
      snippet: excerptAround(t.description, q) || "Công việc",
      date: t.dueDate || t.createdAt, tab: "tasks"
    })
  );

  // Lịch / sự kiện — title/description
  take(
    FamilyDB.getPlans().filter(p => canViewLegacyPlan(p,session)&&matchesQuery(q, p.title, p.description)),
    p => ({
      kind: "plan", id: p.id, title: p.title,
      snippet: excerptAround(p.description, q) || "Sự kiện",
      date: p.startDate, tab: "plans"
    })
  );

  // Ghi chú — title/content/tags
  take(
    FamilyDB.getNotes().filter(n => canViewLegacyNote(n,session)&&matchesQuery(q, n.title, n.content, n.tags)),
    n => ({
      kind: "note", id: n.id, title: n.title,
      snippet: excerptAround(n.content, q) || "Ghi chú",
      date: n.updatedAt || n.createdAt, tab: "notes"
    })
  );

  // Thu chi + Giấy tờ: chỉ Admin/Member (khớp quyền các route gốc)
  if (session.role === UserRole.ADMIN || session.role === UserRole.MEMBER) {
    take(
      FamilyDB.getTransactions().filter(tx =>
        matchesQuery(q, tx.description, tx.category, String(tx.amount))
      ),
      tx => ({
        kind: "transaction", id: tx.id,
        title: tx.description || "(không có mô tả)",
        snippet: `${tx.type === "income" ? "Thu" : "Chi"} ${Number(tx.amount).toLocaleString("vi-VN")} đ`,
        date: tx.date, tab: "finance"
      })
    );

    take(
      FamilyDB.getDocuments()
        .filter(doc => canViewDocument(doc, session))
        .filter(doc => matchesQuery(q, doc.title, doc.documentNumber, doc.issuer, doc.notes)),
      doc => ({
        kind: "document", id: doc.id, title: doc.title,
        snippet: [DOCUMENT_TYPE_LABELS[doc.type] || "Giấy tờ", doc.documentNumber].filter(Boolean).join(" • "),
        date: doc.expiryDate || doc.updatedAt || doc.createdAt, tab: "documents"
      })
    );
  }

  res.json({ results, query: q });
});

// --- FINANCIAL API ENDPOINTS ---

app.get("/api/finance", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const transactions = FamilyDB.getTransactions();
  res.json({ transactions });
});

app.post("/api/finance", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const savedTx = FamilyDB.saveTransaction(req.body, session.userId, session.username);
    broadcastSyncEvent("FINANCE_UPDATE", { txId: savedTx.id });
    res.json({ transaction: savedTx });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.delete("/api/finance/:id", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const { id } = req.params;

  try {
    FamilyDB.deleteTransaction(id, session.userId, session.username);
    broadcastSyncEvent("FINANCE_UPDATE", { deletedId: id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// --- REWARDS API ENDPOINTS ---

app.get("/api/rewards", requireAuth, (req: AuthRequest, res: Response) => {
  const entries = FamilyDB.getRewardLedgerForActor(req.userSession!.userId);
  const totals: Record<string, number> = {};
  entries.forEach(entry => {
    totals[entry.userId] = (totals[entry.userId] || 0) + entry.points;
  });
  res.json({ entries, totals, items: FamilyDB.getRewardItems() });
});

app.post("/api/rewards", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const entry = FamilyDB.addRewardEntry(req.body, session.userId, session.username);
    broadcastSyncEvent("REWARDS_UPDATE", { rewardId: entry.id });
    res.json({ entry });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// Cửa hàng đổi thưởng: người lớn quản lý danh sách quà
app.post("/api/rewards/items", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const item = FamilyDB.saveRewardItem(req.body, session.userId, session.username);
    broadcastSyncEvent("REWARDS_UPDATE", { itemId: item.id });
    res.json({ item });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.delete("/api/rewards/items/:id", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    FamilyDB.deleteRewardItem(req.params.id, session.userId, session.username);
    broadcastSyncEvent("REWARDS_UPDATE", { deletedItemId: req.params.id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// Đổi quà: trẻ tự đổi cho mình; người lớn có thể đổi hộ (gửi childId)
app.post("/api/rewards/items/:id/redeem", requireAuth, (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const isAdult = session.role === UserRole.ADMIN || session.role === UserRole.MEMBER;
  const childId = isAdult && req.body?.childId ? String(req.body.childId) : session.userId;
  try {
    const entry = FamilyDB.redeemRewardItem(req.params.id, childId, session.userId, session.username);
    broadcastSyncEvent("REWARDS_UPDATE", { rewardId: entry.id });
    res.json({ entry });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// Thêm mẫu quà mặc định nếu cửa hàng đang trống (idempotent).
app.post("/api/rewards/items/seed-defaults", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const items = FamilyDB.seedDefaultRewardItems(session.userId, session.username);
    broadcastSyncEvent("REWARDS_UPDATE", { seeded: true });
    res.json({ items });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// Đổi quà bất ngờ: server chọn ngẫu nhiên + tính giá mystery (giảm ~30%).
app.post("/api/rewards/items/mystery", requireAuth, (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const isAdult = session.role === UserRole.ADMIN || session.role === UserRole.MEMBER;
  const childId = isAdult && req.body?.childId ? String(req.body.childId) : session.userId;
  try {
    const result = FamilyDB.redeemMysteryItem(childId, session.userId, session.username);
    broadcastSyncEvent("REWARDS_UPDATE", { rewardId: result.entry.id });
    res.json(result);
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// --- BUDGET + RECURRING BILL API ENDPOINTS ---

app.get("/api/finance/budgets", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  res.json({ budgets: FamilyDB.getBudgets() });
});

app.post("/api/finance/budgets", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const budget = FamilyDB.saveBudget(req.body, session.userId, session.username);
    broadcastSyncEvent("FINANCE_UPDATE", { budgetId: budget.id });
    res.json({ budget });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.post("/api/finance/budgets/carry-forward", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const copied = FamilyDB.carryForwardBudgets(req.body.month, session.userId, session.username);
    if (copied.length > 0) broadcastSyncEvent("FINANCE_UPDATE", { carriedForward: copied.length });
    res.json({ budgets: FamilyDB.getBudgets(), copied: copied.length });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.delete("/api/finance/budgets/:id", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  FamilyDB.deleteBudget(req.params.id);
  broadcastSyncEvent("FINANCE_UPDATE", { deletedBudgetId: req.params.id });
  res.json({ success: true });
});

// Hạng mục CHI: đọc cho mọi người dùng tài chính (để render/chọn); chỉnh sửa chỉ Admin.
app.get("/api/finance/categories", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (_req: AuthRequest, res: Response) => {
  res.json(FamilyDB.getCategoryConfig());
});

app.post("/api/finance/categories", requireAuth, requireRole([UserRole.ADMIN]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const category = FamilyDB.saveCustomCategory(req.body, session.userId, session.username);
    broadcastSyncEvent("FINANCE_UPDATE", { categoryId: category.id });
    res.json({ category, ...FamilyDB.getCategoryConfig() });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.delete("/api/finance/categories/:id", requireAuth, requireRole([UserRole.ADMIN]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  FamilyDB.deleteCustomCategory(req.params.id, session.userId, session.username);
  broadcastSyncEvent("FINANCE_UPDATE", { deletedCategoryId: req.params.id });
  res.json({ success: true, ...FamilyDB.getCategoryConfig() });
});

app.put("/api/finance/categories/hidden", requireAuth, requireRole([UserRole.ADMIN]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const hiddenBuiltinCategories = FamilyDB.setHiddenBuiltinCategories(req.body?.hidden, session.userId, session.username);
    broadcastSyncEvent("FINANCE_UPDATE", { hiddenCategories: hiddenBuiltinCategories.length });
    res.json({ hiddenBuiltinCategories });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.get("/api/finance/recurring-bills", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  res.json({ recurringBills: FamilyDB.getRecurringBills() });
});

app.post("/api/finance/recurring-bills", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const bill = FamilyDB.saveRecurringBill(req.body, session.userId, session.username);
    broadcastSyncEvent("FINANCE_UPDATE", { billId: bill.id });
    res.json({ bill });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.post("/api/finance/recurring-bills/:id/pay", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const result = FamilyDB.payRecurringBill(req.params.id, session.userId, session.username);
    broadcastSyncEvent("FINANCE_UPDATE", { billId: result.bill.id, txId: result.transaction.id });
    res.json(result);
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.delete("/api/finance/recurring-bills/:id", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  FamilyDB.deleteRecurringBill(req.params.id);
  broadcastSyncEvent("FINANCE_UPDATE", { deletedBillId: req.params.id });
  res.json({ success: true });
});

// --- MỤC TIÊU TIẾT KIỆM ---
app.get("/api/finance/savings-goals", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const savingsGoals = FamilyDB.getSavingsGoals().filter(goal => canViewSavingsGoal(goal, session));
  res.json({ savingsGoals });
});

app.post("/api/finance/savings-goals", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  if (req.body?.id) {
    const existing = FamilyDB.getSavingsGoals().find(g => g.id === req.body.id);
    if (!existing) {
      res.status(404).json({ error: "Không tìm thấy mục tiêu tiết kiệm" });
      return;
    }
    if (!canManageSavingsGoal(existing, session)) {
      res.status(403).json({ error: "Bạn không có quyền sửa mục tiêu tiết kiệm này." });
      return;
    }
  }
  try {
    const previous=realtimeAudience('FINANCE_UPDATE',{savingsGoalId:req.body?.id});
    const goal = FamilyDB.saveSavingsGoal(req.body, session.userId, session.username);
    broadcastSyncEvent("FINANCE_UPDATE", { savingsGoalId: goal.id },previous);
    res.json({ goal });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.delete("/api/finance/savings-goals/:id", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const existing = FamilyDB.getSavingsGoals().find(g => g.id === req.params.id);
  if (existing && !canManageSavingsGoal(existing, session)) {
    res.status(403).json({ error: "Bạn không có quyền xóa mục tiêu tiết kiệm này." });
    return;
  }
  try {
    const previous=realtimeAudience('FINANCE_UPDATE',{savingsGoalId:req.params.id});
    FamilyDB.deleteSavingsGoal(req.params.id, session.userId, session.username);
    broadcastSyncEvent("FINANCE_UPDATE", { deletedGoalId: req.params.id },previous);
    res.json({ success: true });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.post("/api/finance/savings-goals/:id/contributions", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const existing = FamilyDB.getSavingsGoals().find(g => g.id === req.params.id);
  if (existing && !canViewSavingsGoal(existing, session)) {
    res.status(403).json({ error: "Bạn không có quyền ghi nhận mục tiêu tiết kiệm này." });
    return;
  }
  try {
    const goal = FamilyDB.addSavingsContribution(req.params.id, req.body, session.userId);
    broadcastSyncEvent("FINANCE_UPDATE", { savingsGoalId: goal.id });
    res.json({ goal });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.delete("/api/finance/savings-goals/:id/contributions/:cid", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const existing = FamilyDB.getSavingsGoals().find(g => g.id === req.params.id);
  const contribution = existing?.contributions.find(c => c.id === req.params.cid);
  if (existing && (!canViewSavingsGoal(existing, session) || (!canManageSavingsGoal(existing, session) && contribution?.byId !== session.userId))) {
    res.status(403).json({ error: "Bạn không có quyền xóa lần ghi nhận này." });
    return;
  }
  try {
    const goal = FamilyDB.removeSavingsContribution(req.params.id, req.params.cid);
    broadcastSyncEvent("FINANCE_UPDATE", { savingsGoalId: goal.id });
    res.json({ goal });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// --- VAY / CHO MƯỢN (NỢ) ---
app.get("/api/finance/debts", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (_req: AuthRequest, res: Response) => {
  res.json({ debts: FamilyDB.getDebts() });
});

app.post("/api/finance/debts", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const debt = FamilyDB.saveDebt(req.body, session.userId, session.username);
    broadcastSyncEvent("FINANCE_UPDATE", { debtId: debt.id });
    res.json({ debt });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.delete("/api/finance/debts/:id", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  FamilyDB.deleteDebt(req.params.id, session.userId, session.username);
  broadcastSyncEvent("FINANCE_UPDATE", { deletedDebtId: req.params.id });
  res.json({ success: true });
});

app.post("/api/finance/debts/:id/payments", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const debt = FamilyDB.addDebtPayment(req.params.id, req.body, session.userId);
    broadcastSyncEvent("FINANCE_UPDATE", { debtId: debt.id });
    res.json({ debt });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.delete("/api/finance/debts/:id/payments/:pid", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  try {
    const debt = FamilyDB.removeDebtPayment(req.params.id, req.params.pid);
    broadcastSyncEvent("FINANCE_UPDATE", { debtId: debt.id });
    res.json({ debt });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.get("/api/finance/assets", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  res.json({ assets: FamilyDB.getAssets() });
});

app.post("/api/finance/assets", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const assetData = req.body;

  try {
    validateAssetPhotosPayload(assetData.photos);
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
    return;
  }

  if (assetData.id) {
    const existing = FamilyDB.getAssets().find(a => a.id === assetData.id);
    if (existing && existing.createdById !== session.userId && session.role !== UserRole.ADMIN) {
      res.status(403).json({ error: "Bạn chỉ có thể chỉnh sửa tài sản do mình tạo. Admin có toàn quyền quản lý tài sản." });
      return;
    }
  }

  try {
    const asset = FamilyDB.saveAsset(assetData, session.userId, session.username);
    broadcastSyncEvent("FINANCE_UPDATE", { assetId: asset.id });
    res.json({ asset });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.delete("/api/finance/assets/:id", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const existing = FamilyDB.getAssets().find(a => a.id === req.params.id);

  if (existing && existing.createdById !== session.userId && session.role !== UserRole.ADMIN) {
    res.status(403).json({ error: "Bạn chỉ có thể xóa tài sản do mình tạo. Admin có toàn quyền quản lý tài sản." });
    return;
  }

  try {
    FamilyDB.deleteAsset(req.params.id, session.userId, session.username);
    broadcastSyncEvent("FINANCE_UPDATE", { deletedAssetId: req.params.id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// --- MARKET PRICES API ---

interface MarketPriceCacheData {
  gold: { pricePerGramUsd: number; pricePerGramVnd: number; source: string } | null;
  crypto: Record<string, { usd: number; vnd: number }>;
  usdVndRate: number;
  lastUpdated: string;
  cacheUntil: number;
}

// CoinGecko ID map for common crypto symbols
const CRYPTO_ID_MAP: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", USDT: "tether", USDC: "usd-coin",
  BNB: "binancecoin", SOL: "solana", XRP: "ripple", ADA: "cardano",
  DOGE: "dogecoin", TON: "the-open-network", TRX: "tron", LINK: "chainlink",
  MATIC: "matic-network", DOT: "polkadot", AVAX: "avalanche-2", LTC: "litecoin",
  SHIB: "shiba-inu", UNI: "uniswap", ATOM: "cosmos", NEAR: "near",
  OP: "optimism", ARB: "arbitrum", SUI: "sui", PEPE: "pepe",
  FIL: "filecoin", APT: "aptos", INJ: "injective-protocol", SEI: "sei-network",
  STX: "blockstack", RENDER: "render-token", WIF: "dogwifcoin"
};

// Cache for extended crypto list (30+ coins). Gold + FX are reused from the
// dashboard's cachedFetch("gold") / cachedFetch("fx") — same vang.today source.
let _cryptoCache: { data: Record<string, { usd: number; vnd: number }>; until: number } = {
  data: {}, until: 0
};

async function fetchExtendedCrypto(): Promise<Record<string, { usd: number; vnd: number }>> {
  const now = Date.now();
  if (now < _cryptoCache.until) return _cryptoCache.data;

  try {
    const ids = Object.values(CRYPTO_ID_MAP).join(",");
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,vnd`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (res.ok) {
      const raw = await res.json() as any;
      const result: Record<string, { usd: number; vnd: number }> = {};
      for (const [symbol, id] of Object.entries(CRYPTO_ID_MAP)) {
        if (raw[id]) {
          const usdPrice = raw[id].usd ?? 0;
          result[symbol] = { usd: usdPrice, vnd: raw[id].vnd ?? usdPrice * 25000 };
        }
      }
      _cryptoCache = { data: result, until: now + 5 * 60 * 1000 };
      return result;
    }
  } catch (err) {
    console.warn("[market-prices] crypto fetch failed:", (err as Error).message);
  }
  // On error keep stale data, retry in 1 min
  _cryptoCache.until = now + 60 * 1000;
  return _cryptoCache.data;
}

app.get("/api/market-prices", requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    // Reuse the same cached data as the dashboard (vang.today for SJC gold, open.er-api for FX).
    // cachedFetch / fetchGold / fetchFx are async function declarations — hoisted, safe to call here.
    const [fx, goldRaw, cryptoData] = await Promise.all([
      cachedFetch("fx", 30 * 60 * 1000, fetchFx),
      cachedFetch("gold", 30 * 60 * 1000, () => fetchGold(null)),
      fetchExtendedCrypto()
    ]);

    const usdVndRate: number = fx?.usdVnd ?? 25000;

    // Convert SJC/vang.today gold result into per-unit prices the Assets module needs.
    // goldRaw.sell   = SJC VND/lượng (primary path)
    // goldRaw.vndPerTael = estimated VND/lượng from world price (fallback path)
    // goldRaw.usdPerOz   = world price in USD/troy oz (fallback path, no VND available)
    let gold: { pricePerGramUsd: number; pricePerGramVnd: number; source: string } | null = null;
    if (goldRaw) {
      const pricePerLuongVnd: number | null =
        goldRaw.sell ?? goldRaw.vndPerTael ??
        (goldRaw.usdPerOz ? Math.round((goldRaw.usdPerOz / 31.1035) * 37.5 * usdVndRate) : null);
      if (pricePerLuongVnd && pricePerLuongVnd > 0) {
        const pricePerLuongUsd = pricePerLuongVnd / usdVndRate;
        gold = {
          pricePerGramVnd: pricePerLuongVnd / 37.5,
          pricePerGramUsd: pricePerLuongUsd / 37.5,
          source: goldRaw.source ?? "vang.today"
        };
      }
    }

    res.json({
      gold: gold ? {
        pricePerGramUsd: gold.pricePerGramUsd,
        pricePerGramVnd: gold.pricePerGramVnd,
        pricePerChiUsd: gold.pricePerGramUsd * 3.75,
        pricePerChiVnd: gold.pricePerGramVnd * 3.75,
        pricePerLuongUsd: gold.pricePerGramUsd * 37.5,
        pricePerLuongVnd: gold.pricePerGramVnd * 37.5,
        source: gold.source
      } : null,
      crypto: cryptoData,
      usdVndRate,
      lastUpdated: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: "Không thể lấy giá thị trường." });
  }
});

// --- MEDICATION API ENDPOINTS ---

app.get("/api/medications", requireAuth, (req: AuthRequest, res: Response) => {
  res.json({ medications: FamilyDB.getMedications().filter(row=>canViewLegacyPatient(row.patientId,req.userSession!)) });
});

app.post("/api/medications", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const previous=realtimeAudience('MEDICATIONS_UPDATE',{medicationId:req.body?.id});
    const medication = FamilyDB.saveMedication(req.body, session.userId, session.username);
    broadcastSyncEvent("MEDICATIONS_UPDATE", { medicationId: medication.id },previous);
    res.json({ medication });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.delete("/api/medications/:id", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const previous=realtimeAudience('MEDICATIONS_UPDATE',{deletedId:req.params.id});
  FamilyDB.deleteMedication(req.params.id);
  broadcastSyncEvent("MEDICATIONS_UPDATE", { deletedId: req.params.id },previous);
  res.json({ success: true });
});

// Nhật ký uống thuốc — danh sách log gần đây (mặc định 30 ngày, hoặc ?since=YYYY-MM-DD)
app.get("/api/medications/logs", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const since = typeof req.query.since === "string" ? req.query.since : undefined;
  res.json({ logs: FamilyDB.getMedicationLogs(since) });
});

// Ghi nhận một liều (taken/skipped) hoặc bỏ đánh dấu (none)
app.post("/api/medications/logs", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const result = FamilyDB.logMedicationDose(req.body, session.userId);
    broadcastSyncEvent("MEDICATIONS_UPDATE", { medicationId: req.body?.medicationId });
    res.json(result);
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// --- KHO GIẤY TỜ API (chỉ Admin/Member) ---

app.get("/api/documents", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const documents = FamilyDB.getDocuments().filter(doc => canViewDocument(doc, session));
  res.json({ documents });
});

app.post("/api/documents", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), validateContentRequest, (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  if (req.body?.id) {
    const existing = FamilyDB.getDocuments().find(d => d.id === req.body.id);
    if (!existing||!canViewDocument(existing,session)) {
      res.status(404).json({ error: "Không tìm thấy giấy tờ" });
      return;
    }
    if (!canManageDocument(existing, session)) {
      res.status(403).json({ error: "Bạn không có quyền sửa giấy tờ này." });
      return;
    }
  }
  try {
    const previous=realtimeAudience('DOCUMENTS_UPDATE',{documentId:req.body?.id});
    const document = FamilyDB.saveDocument(req.body, session.userId, session.username);
    broadcastSyncEvent("DOCUMENTS_UPDATE", { documentId: document.id },previous);
    res.json({ document });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.delete("/api/documents/:id", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const existing = FamilyDB.getDocuments().find(d => d.id === req.params.id);
  if(!existing||!canViewDocument(existing,session)){res.status(404).json({error:'Không tìm thấy giấy tờ'});return;}
  if (existing && !canManageDocument(existing, session)) {
    res.status(403).json({ error: "Bạn không có quyền xóa giấy tờ này." });
    return;
  }
  try {
    const previous=realtimeAudience('DOCUMENTS_UPDATE',{documentId:req.params.id});
    FamilyDB.deleteDocument(req.params.id, session.userId, session.username);
    broadcastSyncEvent("DOCUMENTS_UPDATE", { deletedId: req.params.id },previous);
    res.json({ success: true });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// --- SỨC KHỎE TRẺ: TIÊM CHỦNG & TĂNG TRƯỞNG (chỉ Admin/Member) ---
// Adults manage family care; limited viewers receive only their own patient records.
app.get("/api/child-health", requireAuth, (req: AuthRequest, res: Response) => {
  res.json({
    vaccinations: FamilyDB.getVaccinations().filter(row=>canViewLegacyPatient(row.childId,req.userSession!)),
    growthRecords: FamilyDB.getGrowthRecords().filter(row=>canViewLegacyPatient(row.childId,req.userSession!)),
    healthProfiles: FamilyDB.getHealthProfiles().filter(row=>canViewLegacyPatient(row.userId,req.userSession!))
  });
});

// Emergency profile: patient or adult read; adults update.
app.post("/api/child-health/emergency", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const previous=realtimeAudience('CHILD_HEALTH_UPDATE',{healthProfileId:req.body?.id});
    const profile = FamilyDB.saveHealthProfile(req.body, session.userId, session.username);
    broadcastSyncEvent("CHILD_HEALTH_UPDATE", { healthProfileId: profile.id },previous);
    res.json({ profile });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.post("/api/child-health/vaccinations", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const previous=realtimeAudience('CHILD_HEALTH_UPDATE',{vaccinationId:req.body?.id});
    const vaccination = FamilyDB.saveVaccination(req.body, session.userId, session.username);
    broadcastSyncEvent("CHILD_HEALTH_UPDATE", { vaccinationId: vaccination.id },previous);
    res.json({ vaccination });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.delete("/api/child-health/vaccinations/:id", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const previous=realtimeAudience('CHILD_HEALTH_UPDATE',{deletedVaccinationId:req.params.id});
  FamilyDB.deleteVaccination(req.params.id);
  broadcastSyncEvent("CHILD_HEALTH_UPDATE", { deletedVaccinationId: req.params.id },previous);
  res.json({ success: true });
});

app.post("/api/child-health/growth", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const previous=realtimeAudience('CHILD_HEALTH_UPDATE',{growthId:req.body?.id});
    const record = FamilyDB.saveGrowthRecord(req.body, session.userId, session.username);
    broadcastSyncEvent("CHILD_HEALTH_UPDATE", { growthId: record.id },previous);
    res.json({ record });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.delete("/api/child-health/growth/:id", requireAuth, requireRole([UserRole.ADMIN, UserRole.MEMBER]), (req: AuthRequest, res: Response) => {
  const previous=realtimeAudience('CHILD_HEALTH_UPDATE',{deletedGrowthId:req.params.id});
  FamilyDB.deleteGrowthRecord(req.params.id);
  broadcastSyncEvent("CHILD_HEALTH_UPDATE", { deletedGrowthId: req.params.id },previous);
  res.json({ success: true });
});

// --- AI ASSISTANT API ---

function cleanAssistantText(value: any, maxLength: number): string {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function parseAssistantJson(rawText: string): any | null {
  const text = rawText.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (!candidate) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function normalizeAssistantActions(actions: any[]): any[] {
  if (!Array.isArray(actions)) return [];

  return actions
    .map((action, actionIndex) => {
      if (!action || action.type !== "create_shopping_items") return null;
      const rawItems = Array.isArray(action.items) ? action.items : [];
      const seen = new Set<string>();
      const items = rawItems
        .map((item: any) => {
          const name = cleanAssistantText(typeof item === "string" ? item : item?.name, 80);
          if (!name) return null;
          const key = name.toLowerCase();
          if (seen.has(key)) return null;
          seen.add(key);
          return {
            name,
            quantity: cleanAssistantText(item?.quantity, 40),
            note: cleanAssistantText(item?.note, 120)
          };
        })
        .filter(Boolean)
        .slice(0, 20);

      if (items.length === 0) return null;
      return {
        id: `assistant_action_${Date.now()}_${actionIndex}_${Math.random().toString(36).slice(2, 6)}`,
        type: "create_shopping_items",
        title: cleanAssistantText(action.title, 100) || "Thêm nguyên liệu vào danh sách đi chợ",
        items
      };
    })
    .filter(Boolean);
}

app.post("/api/assistant/chat", requireAuth, async (req: AuthRequest, res: Response) => {
  const apiKey = getGeminiKey();
  const message = String(req.body?.message || "").trim();
  if (!message) {
    res.status(400).json({ error: "Vui lòng nhập câu hỏi cho trợ lý" });
    return;
  }
  if (!apiKey) {
    res.status(400).json({ error: "Chưa cấu hình Gemini API key. Vào Thiết lập để nhập key." });
    return;
  }

  try {
    const [{ GoogleGenAI }] = await Promise.all([import("@google/genai")]);
    const user=dependencies.auth.verify(req.headers.authorization!.slice(7));
    if(!user){res.status(401).json({error:'Phiên đăng nhập đã kết thúc.'});return;}
    const actor={userId:user.id,role:user.role};
    const ai = new GoogleGenAI({ apiKey });
    const tasks = FamilyDB.getTasks().filter(task=>canViewLegacyTask(task,actor)).slice(-30).map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      assigneeId: t.assigneeId,
      rewardPoints: t.rewardPoints
    }));
    const plans = FamilyDB.getPlans().filter(plan=>canViewLegacyPlan(plan,actor)).slice(-30).map(p => ({
      id: p.id,
      title: p.title,
      startDate: p.startDate,
      endDate: p.endDate,
      isShared: p.isShared
    }));
    const transactions = (isAdult(actor)?FamilyDB.getTransactions():[]).slice(-30).map(({ receiptImage, ...tx }) => tx);
    const medications = FamilyDB.getMedications().filter(row=>canViewLegacyPatient(row.patientId,actor)).map(m => ({
      id: m.id,
      name: m.name,
      dosage: m.dosage,
      patientId: m.patientId,
      times: m.times,
      isActive: m.isActive
    }));
    // Captured prompts remain usable only while every included object is visible.
    // Check immediately before every dispatch and again after the provider await.
    const assertContextAuthorized = () => {
      const current=dependencies.auth.verify(req.headers.authorization!.slice(7));
      if(!current) throw Object.assign(new Error('Phiên đăng nhập đã kết thúc.'),{assistantStatus:401});
      const currentActor={userId:current.id,role:current.role};
      const visible=(captured:any[],rows:any[],allow:(row:any,actor:any)=>boolean)=>captured.every(item=>{
        const row=rows.find(candidate=>candidate.id===item.id);
        return row!==undefined&&allow(row,currentActor);
      });
      if(!visible(tasks,FamilyDB.getTasks(),canViewLegacyTask)||
        !visible(plans,FamilyDB.getPlans(),canViewLegacyPlan)||
        !visible(medications,FamilyDB.getMedications(),(row,actor)=>canViewLegacyPatient(row.patientId,actor))||
        (transactions.length>0&&!isAdult(currentActor))) {
        throw Object.assign(new Error('Quyền xem dữ liệu đã thay đổi. Vui lòng gửi lại câu hỏi.'),{assistantStatus:409});
      }
    };
    const shoppingItems = FamilyDB.getShoppingItems()
      .filter(item => !item.isPurchased)
      .slice(0, 80)
      .map(item => ({ name: item.name, quantity: item.quantity, note: item.note }));
    const prompt = [
      "Bạn là trợ lý gia đình trong app Family Organizer. Trả lời ngắn gọn bằng tiếng Việt, ưu tiên việc có thể làm ngay.",
      "Bạn PHẢI trả về duy nhất một JSON object hợp lệ, không bọc markdown, không thêm chữ ngoài JSON.",
      "Schema: {\"reply\":\"câu trả lời cho người dùng\",\"actions\":[{\"type\":\"create_shopping_items\",\"title\":\"tiêu đề hành động\",\"items\":[{\"name\":\"tên món cần mua\",\"quantity\":\"số lượng nếu biết\",\"note\":\"ghi chú nếu cần\"}]}]}",
      "Chỉ tạo action create_shopping_items khi người dùng yêu cầu thêm/tạo/lập danh sách đi chợ, mua sắm, hoặc hỏi menu và nhờ thêm nguyên liệu vào danh sách đi chợ. Nếu chỉ hỏi gợi ý hoặc hỏi thông tin, actions phải là [].",
      "Không tạo quá 20 món. Gộp món trùng nhau. Không tự ý tạo task, giao dịch, thuốc hoặc lịch vì app hiện chỉ cho phép action đi chợ.",
      `Nguoi hoi: ${user.fullName}`,
      `Tasks gan day: ${JSON.stringify(tasks)}`,
      `Lich gan day: ${JSON.stringify(plans)}`,
      `Giao dich gan day: ${JSON.stringify(transactions)}`,
      `Lich thuoc: ${JSON.stringify(medications)}`,
      `Danh sach di cho hien tai: ${JSON.stringify(shoppingItems)}`,
      `Cau hoi: ${message}`
    ].join("\n\n");
    const response = await geminiGenerate(ai, {
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    } as any, 2, assertContextAuthorized);
    assertContextAuthorized();
    const rawText = response.text || "";
    const parsed = parseAssistantJson(rawText);
    if (!parsed) {
      res.json({ answer: rawText || "Mình chưa có câu trả lời phù hợp.", actions: [] });
      return;
    }
    res.json({
      answer: cleanAssistantText(parsed.reply, 4000) || "Mình đã chuẩn bị gợi ý cho bạn.",
      actions: normalizeAssistantActions(parsed.actions)
    });
  } catch (err: any) {
    if(err.assistantStatus===401||err.assistantStatus===409){res.status(err.assistantStatus).json({error:err.message});return;}
    console.error("Assistant error:", err);
    res.status(500).json({ error: err.message || "Trợ lý AI đang gặp lỗi" });
  }
});

// AI meal planner → balanced multi-day menu + consolidated grocery list.
// The current shared weekly menu (persisted, synced across the family).
app.get("/api/shopping/meal-plan/current", requireAuth, (_req: AuthRequest, res: Response) => {
  res.json({ mealPlan: FamilyDB.getMealPlan() });
});

// Random balanced plan drawn from the (growing) dish library in the DB. No AI key needed.
// With save:true it becomes the shared weekly menu shown on the shopping view.
app.post("/api/shopping/meal-plan/random", requireAuth, (req: AuthRequest, res: Response) => {
  const adults = Math.min(10, Math.max(0, Math.floor(Number(req.body?.adults) || 0)));
  const children = Math.min(10, Math.max(0, Math.floor(Number(req.body?.children) || 0)));
  const days = Math.min(7, Math.max(1, Math.floor(Number(req.body?.days) || 7)));
  const save = req.body?.save === true;
  if (adults + children <= 0) {
    res.status(400).json({ error: "Cần ít nhất 1 người để lập thực đơn." });
    return;
  }
  try {
    const library = FamilyDB.getDishLibrary();
    const plan = buildPlanFromLibrary(library, { adults, children, days });
    if (save) {
      const stored = {
        days: plan.days,
        groceries: plan.groceries,
        source: plan.source,
        adults,
        children,
        updatedAt: new Date().toISOString(),
        updatedById: req.userSession?.userId || ""
      };
      FamilyDB.setMealPlan(stored);
      broadcastSyncEvent("SHOPPING_UPDATE");
    }
    res.json({ ...plan, dishCount: library.length });
  } catch (err: any) {
    console.error("Random meal-plan error:", err);
    res.status(500).json({ error: err.message || "Không tạo được thực đơn." });
  }
});

app.post("/api/shopping/meal-plan", requireAuth, async (req: AuthRequest, res: Response) => {
  const apiKey = getGeminiKey();
  if (!apiKey) {
    res.status(400).json({ error: "Chưa cấu hình Gemini API key. Vào Thiết lập để nhập key." });
    return;
  }
  const adults = Math.min(10, Math.max(0, Math.floor(Number(req.body?.adults) || 0)));
  const children = Math.min(10, Math.max(0, Math.floor(Number(req.body?.children) || 0)));
  const days = Math.min(7, Math.max(1, Math.floor(Number(req.body?.days) || 3)));
  const notes = String(req.body?.notes || "").slice(0, 500);
  if (adults + children <= 0) {
    res.status(400).json({ error: "Cần ít nhất 1 người để lập thực đơn." });
    return;
  }

  try {
    const [{ GoogleGenAI }] = await Promise.all([import("@google/genai")]);
    const ai = new GoogleGenAI({ apiKey });
    const prompt = [
      "Bạn là chuyên gia dinh dưỡng kiêm đầu bếp gia đình Việt Nam.",
      `Lập thực đơn cân bằng dinh dưỡng cho gia đình ${adults} người lớn và ${children} trẻ em, trong ${days} ngày, mỗi ngày 3 bữa (Sáng/Trưa/Tối).`,
      "Món Việt quen thuộc, đa dạng giữa các ngày, đủ nhóm chất (đạm, rau củ, tinh bột, trái cây); khẩu phần trẻ em ít hơn người lớn.",
      notes ? `Lưu ý của gia đình (dị ứng/kiêng/ngân sách/sở thích): ${notes}` : "Không có lưu ý đặc biệt.",
      "Sau đó GỘP toàn bộ nguyên liệu của cả thực đơn thành một danh sách đi chợ, cộng dồn số lượng theo số người, ghi số lượng ước tính dễ mua (vd '1.2 kg', '6 quả', 'vừa đủ').",
      "Đồng thời liệt kê các MÓN đã dùng kèm nguyên liệu chính (để lưu vào thư viện món xoay vòng sau này): mỗi món có slot là breakfast (món sáng), main (món mặn chính), side (rau/canh) hoặc fruit (trái cây).",
      "Bạn PHẢI trả về DUY NHẤT một JSON hợp lệ, không bọc markdown, không thêm chữ ngoài JSON.",
      'Schema: {"days":[{"day":1,"meals":[{"meal":"Sáng","dishes":["..."]},{"meal":"Trưa","dishes":["..."]},{"meal":"Tối","dishes":["..."]}]}],"groceries":[{"name":"tên nguyên liệu","cat":"Đạm|Rau củ|Tinh bột|Trái cây|Gia vị","quantity":"số lượng"}],"dishes":[{"name":"tên món","slot":"breakfast|main|side|fruit","ingredients":[{"name":"nguyên liệu","cat":"Đạm|Rau củ|Tinh bột|Trái cây|Gia vị"}]}]}',
      "Trường cat bắt buộc thuộc: Đạm, Rau củ, Tinh bột, Trái cây, Gia vị. Không quá 40 nguyên liệu và 30 món."
    ].join("\n\n");

    // Tắt "thinking" + cấp nhiều output token: thực đơn JSON khá lớn, nếu để
    // gemini-2.5-flash suy nghĩ sẽ ngốn hết token và treo/không ra JSON.
    const response = await geminiGenerate(ai, {
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 }
      }
    } as any);

    const parsed = parseAssistantJson(response.text || "");
    if (!parsed || !Array.isArray(parsed.days) || !Array.isArray(parsed.groceries)) {
      console.error("Meal-plan AI parse fail. finishReason:", (response as any)?.candidates?.[0]?.finishReason, "len:", (response.text || "").length);
      res.status(502).json({ error: "AI trả về dữ liệu không hợp lệ (có thể do quá dài). Hãy giảm số ngày rồi thử lại." });
      return;
    }

    const CATS = ["Đạm", "Rau củ", "Tinh bột", "Trái cây", "Gia vị"];
    const cleanDays = parsed.days.slice(0, 14).map((d: any, i: number) => ({
      day: Number(d?.day) || i + 1,
      meals: Array.isArray(d?.meals)
        ? d.meals.slice(0, 3).map((m: any) => ({
            meal: ["Sáng", "Trưa", "Tối"].includes(String(m?.meal)) ? String(m.meal) : "Bữa",
            dishes: Array.isArray(m?.dishes)
              ? m.dishes.slice(0, 6).map((x: any) => String(x).slice(0, 80)).filter(Boolean)
              : []
          }))
        : []
    }));
    const cleanGroceries = parsed.groceries
      .slice(0, 60)
      .map((g: any) => ({
        name: String(g?.name || "").slice(0, 100),
        cat: CATS.includes(String(g?.cat)) ? String(g.cat) : "Gia vị",
        quantity: String(g?.quantity || "").slice(0, 40)
      }))
      .filter((g: any) => g.name);

    // Chuẩn hoá danh sách MÓN (dùng cho cả học món mới lẫn chú thích buổi/món).
    const SLOTS = ["breakfast", "main", "side", "fruit"];
    const cleanDishes = Array.isArray(parsed.dishes)
      ? parsed.dishes
          .slice(0, 40)
          .map((d: any) => ({
            name: String(d?.name || "").slice(0, 80),
            slot: (SLOTS.includes(String(d?.slot)) ? String(d.slot) : "main") as DishSlot,
            ingredients: Array.isArray(d?.ingredients)
              ? d.ingredients.slice(0, 12).map((ing: any): MealIngredient => ({
                  name: String(ing?.name || "").slice(0, 60),
                  cat: CATS.includes(String(ing?.cat)) ? (String(ing.cat) as MealIngredient["cat"]) : "Gia vị"
                })).filter((ing: MealIngredient) => ing.name)
              : []
          }))
          .filter((d: any) => d.name)
      : [];

    // GỘP nguyên liệu trùng (AI hay lặp) + gắn chú thích "dùng ở buổi/món nào".
    const annotatedGroceries = dedupeAndAnnotateGroceries(cleanGroceries, cleanDays, cleanDishes);

    // Learn new dishes into the library so future random plans get more variety.
    let learned = 0;
    if (cleanDishes.length) {
      try { learned = FamilyDB.addDishesFromAI(cleanDishes); } catch (e) { console.error("Lưu món AI lỗi:", e); }
    }

    // Save as the shared weekly menu shown on the shopping view + sync the family.
    FamilyDB.setMealPlan({
      days: cleanDays,
      groceries: annotatedGroceries as any,
      source: "ai",
      adults,
      children,
      updatedAt: new Date().toISOString(),
      updatedById: req.userSession?.userId || ""
    });
    broadcastSyncEvent("SHOPPING_UPDATE");

    res.json({ days: cleanDays, groceries: annotatedGroceries, source: "ai", learned });
  } catch (err: any) {
    console.error("Meal-plan error:", err);
    res.status(isGeminiOverloaded(err) ? 503 : 500).json({ error: geminiErrorMessage(err) });
  }
});

// AI viết nháp ghi chú (Markdown) từ mô tả ngắn của người dùng.
app.post("/api/notes/ai-draft", requireAuth, async (req: AuthRequest, res: Response) => {
  if (req.userSession?.role === UserRole.GUEST) {
    res.status(403).json({ error: "Tài khoản khách không thể tạo ghi chú." });
    return;
  }
  const apiKey = getGeminiKey();
  if (!apiKey) {
    res.status(400).json({ error: "Chưa cấu hình Gemini API key. Vào Thiết lập để nhập key." });
    return;
  }
  const promptText = String(req.body?.prompt || "").trim().slice(0, 2000);
  const existingTitle = String(req.body?.title || "").trim().slice(0, 200);
  if (!promptText) {
    res.status(400).json({ error: "Hãy mô tả nội dung ghi chú bạn muốn AI viết." });
    return;
  }

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const prompt = [
      "Bạn là trợ lý viết ghi chú cho một app gia đình. Viết bằng tiếng Việt, rõ ràng, hữu ích, đúng trọng tâm.",
      "Trả về DUY NHẤT một JSON hợp lệ, không bọc markdown, không thêm chữ ngoài JSON.",
      'Schema: {"title":"tiêu đề ngắn gọn","content":"nội dung ở định dạng Markdown (GFM): dùng tiêu đề ##, danh sách, checkbox - [ ], in đậm, bảng khi hợp lý"}',
      existingTitle ? `Tiêu đề gợi ý sẵn: ${existingTitle}` : "Tự đặt tiêu đề phù hợp.",
      `Yêu cầu của người dùng: ${promptText}`
    ].join("\n\n");

    const response = await geminiGenerate(ai, {
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    } as any);

    const parsed = parseAssistantJson(response.text || "");
    const title = cleanAssistantText(parsed?.title, 200) || existingTitle || "Ghi chú mới";
    // Keep newlines/markdown intact — do NOT run through cleanAssistantText (it collapses whitespace).
    const content = String(parsed?.content || "").trim().slice(0, 20000) || (response.text || "").trim();
    if (!content) {
      res.status(502).json({ error: "AI chưa tạo được nội dung. Hãy thử mô tả chi tiết hơn." });
      return;
    }
    res.json({ title, content });
  } catch (err: any) {
    console.error("Notes AI draft error:", err);
    res.status(isGeminiOverloaded(err) ? 503 : 500).json({ error: geminiErrorMessage(err) });
  }
});

// --- SHOPPING LIST ENDPOINTS ---

app.get("/api/shopping", requireAuth, (req: AuthRequest, res: Response) => {
  res.json({ shoppingItems: FamilyDB.getShoppingItems() });
});

app.post("/api/shopping", requireAuth, (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  if (!req.body.id && (typeof req.body.name !== "string" || !req.body.name.trim())) {
    res.status(400).json({ error: "Vui lòng nhập tên món đồ cần mua!" });
    return;
  }
  try {
    const item = FamilyDB.saveShoppingItem(req.body, session.userId, session.username);
    broadcastSyncEvent("SHOPPING_UPDATE", { itemId: item.id });
    res.json({ item });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.post("/api/shopping/:id/toggle", requireAuth, (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const item = FamilyDB.toggleShoppingItem(req.params.id, session.userId);
    broadcastSyncEvent("SHOPPING_UPDATE", { itemId: item.id });
    res.json({ item });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// Note: this must be declared before the "/:id" route so "purchased" isn't treated as an id.
app.delete("/api/shopping/purchased", requireAuth, (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const removed = FamilyDB.clearPurchasedShopping(session.userId, session.username);
  broadcastSyncEvent("SHOPPING_UPDATE");
  res.json({ removed });
});

app.delete("/api/shopping/all", requireAuth, (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const removed = FamilyDB.clearAllShopping(session.userId, session.username);
  broadcastSyncEvent("SHOPPING_UPDATE");
  res.json({ removed });
});

app.delete("/api/shopping/:id", requireAuth, (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    FamilyDB.deleteShoppingItem(req.params.id, session.userId, session.username);
    broadcastSyncEvent("SHOPPING_UPDATE", { deletedId: req.params.id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// --- USER MANAGEMENT ENDPOINTS ---

app.get("/api/users", requireAuth, (req: AuthRequest, res: Response) => {
  const users = FamilyDB.getUsers().map(u => {
    const { passwordHash, ...safe } = u;
    return safe;
  });
  res.json({ users });
});

app.post("/api/users", requireAuth, requireRole([UserRole.ADMIN]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const { username, fullName, role, passwordPlain, avatarColor, dateOfBirth, gender, phone, familyRelation } = req.body;

  if (!username || !fullName || !role || !passwordPlain) {
    res.status(400).json({ error: "Vui lòng nhập đầy đủ chi tiết thành viên mới!" });
    return;
  }
  if (!VALID_ROLES.has(role)) {
    res.status(400).json({ error: "Vai trò (phân quyền) không hợp lệ!" });
    return;
  }

  try {
    const newUser = FamilyDB.createUser({
      username,
      fullName,
      role,
      passwordPlain,
      avatarColor,
      dateOfBirth,
      gender,
      phone,
      familyRelation
    }, session.userId, session.username);

    broadcastSyncEvent("USERS_UPDATE");
    res.json({ user: newUser });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// Self-service profile update: a user can edit their OWN personal info only.
app.post("/api/profile", requireAuth, (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const { fullName, dateOfBirth, gender, phone, avatarImage, avatarColor } = req.body;

  try {
    validateAvatarImagePayload(avatarImage);
    const updated = FamilyDB.updateProfile(session.userId, {
      fullName,
      dateOfBirth,
      gender,
      phone,
      avatarImage,
      avatarColor
    });
    broadcastSyncEvent("USERS_UPDATE", { updatedId: session.userId });
    res.json({ user: updated });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.delete("/api/users/:id", requireAuth, requireRole([UserRole.ADMIN]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const { id } = req.params;

  try {
    FamilyDB.deleteUser(id, session.userId, session.username);
    broadcastSyncEvent("USERS_UPDATE", { deletedId: id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.post("/api/users/:id", requireAuth, requireRole([UserRole.ADMIN]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const { id } = req.params;
  const { fullName, role, dateOfBirth, gender, phone, avatarColor, familyRelation } = req.body;

  if (role !== undefined && !VALID_ROLES.has(role)) {
    res.status(400).json({ error: "Vai trò (phân quyền) không hợp lệ!" });
    return;
  }

  try {
    const updated = FamilyDB.adminUpdateUser(id, { fullName, role, dateOfBirth, gender, phone, avatarColor, familyRelation }, session.userId, session.username);
    broadcastSyncEvent("USERS_UPDATE", { updatedId: id });
    res.json({ user: updated });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

app.post("/api/users/:id/reset-password", requireAuth, requireRole([UserRole.ADMIN]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword) {
    res.status(400).json({ error: "Vui lòng nhập mật khẩu mới!" });
    return;
  }

  try {
    FamilyDB.adminResetPassword(id, newPassword, session.userId, session.username);
    res.json({ success: true });
  } catch (err: any) {
    res.status(httpErrorStatus(err)).json(httpErrorBody(err));
  }
});

// --- NOTIFICATIONS ENDPOINTS ---

app.get("/api/notifications", requireAuth, (req: AuthRequest, res: Response) => {
  const userId = req.userSession!.userId;
  const list = FamilyDB.getNotificationsForActor(userId);
  res.json({ notifications: list });
});

app.post("/api/notifications/:id/read", requireAuth, (req: AuthRequest, res: Response) => {
  const userId = req.userSession!.userId;
  const { id } = req.params;
  const notification=FamilyDB.getNotificationsForActor(userId).find(row=>row.id===id);
  if(!notification||!canViewLegacyNotification(notification,req.userSession!)){res.status(404).json({error:'Không tìm thấy thông báo'});return;}
  FamilyDB.markNotificationRead(id, userId);
  res.json({ success: true });
});

app.post("/api/notifications/read-all", requireAuth, (req: AuthRequest, res: Response) => {
  const userId = req.userSession!.userId;
  FamilyDB.markAllNotificationsRead(userId);
  res.json({ success: true });
});

// Manual nudge: a member sends a notification (+ push) to one person or "all".
// Gentle anti-spam: at most 1 send per 3s per sender.
const NUDGE_COOLDOWN_MS = 3000;
const lastNudgeAt = new Map<string, number>();

app.post("/api/notifications/send", requireAuth, (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  if (session.role === UserRole.GUEST) {
    res.status(403).json({ error: "Tài khoản Khách không gửi được lời nhắc." });
    return;
  }
  const { toUserId, message } = req.body || {};
  const msg = typeof message === "string" ? message.trim() : "";
  if (!toUserId || typeof toUserId !== "string") {
    res.status(400).json({ error: "Vui lòng chọn người nhận." });
    return;
  }
  if (!msg) {
    res.status(400).json({ error: "Nội dung lời nhắc không được để trống." });
    return;
  }
  if (msg.length > 300) {
    res.status(400).json({ error: "Nội dung quá dài (tối đa 300 ký tự)." });
    return;
  }
  if (toUserId !== "all" && !FamilyDB.getUsers().some(u => u.id === toUserId)) {
    res.status(400).json({ error: "Không tìm thấy người nhận." });
    return;
  }
  const now = Date.now();
  if (now - (lastNudgeAt.get(session.userId) || 0) < NUDGE_COOLDOWN_MS) {
    res.status(429).json({ error: "Bạn gửi hơi nhanh, chờ vài giây rồi thử lại nhé." });
    return;
  }
  lastNudgeAt.set(session.userId, now);
  try {
    FamilyDB.sendManualNotification(session.fullName, session.userId, toUserId, msg);
    broadcastSyncEvent("NOTIFICATIONS_UPDATE");
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gửi lời nhắc thất bại." });
  }
});

// --- WEB PUSH (system notifications + app-icon badge) ---

// Public: the client needs the VAPID public key to create a push subscription.
app.get("/api/push/vapid-public-key", (_req: Request, res: Response) => {
  res.json({ publicKey: getVapidPublicKey(), enabled: isPushConfigured() });
});

// Save (upsert) this device's push subscription for the logged-in user.
app.post("/api/push/subscribe", requireAuth, (req: AuthRequest, res: Response) => {
  const userId = req.userSession!.userId;
  const { subscription } = req.body || {};
  if (!subscription || typeof subscription.endpoint !== "string" || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    res.status(400).json({ error: "Dữ liệu đăng ký thông báo không hợp lệ." });
    return;
  }
  try {
    FamilyDB.addPushSubscription(userId, subscription, req.headers["user-agent"]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Lưu đăng ký thất bại." });
  }
});

// Forget this device's subscription (called when the user turns notifications off).
app.post("/api/push/unsubscribe", requireAuth, (req: AuthRequest, res: Response) => {
  const { endpoint } = req.body || {};
  if (typeof endpoint === "string" && endpoint) {
    FamilyDB.removePushSubscriptionByEndpoint(endpoint);
  }
  res.json({ success: true });
});

// Send a one-off test notification to the current user's devices.
app.post("/api/push/test", requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.userSession!.userId;
  if (!isPushConfigured()) {
    res.status(503).json({ error: "Máy chủ chưa cấu hình thông báo đẩy (VAPID)." });
    return;
  }
  try {
    const sent = await sendTestPush(
      FamilyDB.getPushSubscriptions(),
      userId,
      (dead) => FamilyDB.removePushSubscriptionsByEndpoints(dead)
    );
    res.json({ sent });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gửi thông báo thử thất bại." });
  }
});

// --- LOGS & BACKUPS (ADMIN ONLY) ---

app.get("/api/admin/logs", requireAuth, requireRole([UserRole.ADMIN]), (req: AuthRequest, res: Response) => {
  const logs = FamilyDB.getActivityLogsForActor(req.userSession!.userId);
  res.json({ logs });
});

app.get("/api/admin/backups", requireAuth, requireRole([UserRole.ADMIN]), (req: AuthRequest, res: Response) => {
  const backups = FamilyDB.getBackups();
  res.json({ backups });
});

app.post("/api/admin/backups", requireAuth, requireRole([UserRole.ADMIN]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const info = FamilyDB.createBackup("manual", session.userId, session.username);
    broadcastSyncEvent("BACKUPS_UPDATE");
    res.json({ success: true, ...info });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/backups/:id", requireAuth, requireRole([UserRole.ADMIN]), (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const { id } = req.params;
  try {
    FamilyDB.deleteBackup(id, session.userId, session.username);
    broadcastSyncEvent("BACKUPS_UPDATE");
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/backups/:id/restore", requireAuth, requireRole([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  const { id } = req.params;
  try {
    await FamilyDB.restoreBackup(id, session.userId, session.username, { maintenance: work => maintenanceFor(req,work) });
    broadcastSyncEvent("RESTORE_COMPLETED");
    res.json({ success: true });
  } catch (err: any) {
    res.status(httpErrorStatus(err,500)).json(httpErrorBody(err));
  }
});

// Sao lưu TOÀN PHẦN: tải về 1 tệp .zip chứa 100% hệ thống (DB + uploads + cấu hình).
app.get("/api/admin/backups/full/export", requireAuth, requireRole([UserRole.ADMIN]), async (req: AuthRequest, res: Response) => {
  const session = req.userSession!;
  try {
    const filename = fullBackupFilename();
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await streamFullBackup(res);
    FamilyDB.logActivity(session.userId, session.username, "Backup toàn phần", `Đã xuất tệp sao lưu toàn phần ${filename} (DB + toàn bộ tệp media + cấu hình).`);
  } catch (err: any) {
    console.error("Lỗi xuất backup toàn phần:", err);
    // Nếu headers đã gửi (đang stream dở) thì chỉ còn cách cắt kết nối.
    if (res.headersSent) res.destroy();
    else res.status(500).json({ error: err.message || "Không xuất được backup toàn phần" });
  }
});

// Khôi phục TOÀN PHẦN từ tệp .zip tải lên — thay thế hoàn toàn dữ liệu hiện tại.
app.post(
  "/api/admin/backups/full/import",
  requireAuth,
  requireRole([UserRole.ADMIN]),
  express.raw({ type: () => true, limit: "256mb" }),
  async (req: AuthRequest, res: Response) => {
    const session = req.userSession!;
    // The injected runtime owns maintenance/drain and excludes only this request.
    try {
      const result = await importFullBackup(req.body as Buffer, session.userId, session.username, { maintenance: work => maintenanceFor(req,work) });
      broadcastSyncEvent("RESTORE_COMPLETED");
      res.json({ success: true, restoredFiles: result.restoredFiles });
    } catch (err: any) {
      console.error("Lỗi import backup toàn phần:", err);
      res.status(httpErrorStatus(err)).json(httpErrorBody(err));
    }
  }
);

// --- DASHBOARD WIDGETS (weather / crypto / gold / fx) ---
// Server-side proxy with caching: avoids CORS, respects rate limits, and keeps
// serving the last known value if an upstream call fails.

// Toạ độ mặc định (TP. Hồ Chí Minh) khi client không gửi kèm địa phương.
const WEATHER_LAT = 10.7769;
const WEATHER_LON = 106.7009;
const WEATHER_CITY = "TP. Hồ Chí Minh";

const widgetCache: Record<string, { data: any; ts: number }> = {};

async function cachedFetch(key: string, ttlMs: number, fetcher: () => Promise<any>): Promise<any> {
  const entry = widgetCache[key];
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
  try {
    const data = await fetcher();
    widgetCache[key] = { data, ts: Date.now() };
    return data;
  } catch (e) {
    console.error(`Widget '${key}' fetch lỗi:`, e);
    return entry ? entry.data : null; // serve stale data on error
  }
}

// Suy ra "nguy cơ giông bão" (ước lượng, KHÔNG phải đường đi bão chính thức) từ
// mã thời tiết dông + gió giật hiện tại/tối đa trong các ngày dự báo. Thang gió
// tham chiếu cấp bão VN: cấp 8 (bão) ≈ 62 km/h, cấp 10 ≈ 89 km/h.
// Chỉ trả về dữ liệu có cấu trúc (level/type + số), phần văn bản dịch qua i18n
// ở client (dashboard.weather.storm.*) để hỗ trợ đa ngôn ngữ.
function deriveStormRisk(current: any, daily: any): any {
  const codeNow = Number(current?.weather_code);
  const gustNow = Number(current?.wind_gusts_10m) || 0;
  const gustsMax: number[] = Array.isArray(daily?.wind_gusts_10m_max) ? daily.wind_gusts_10m_max.map(Number) : [];
  const rainProb: number[] = Array.isArray(daily?.precipitation_probability_max) ? daily.precipitation_probability_max.map(Number) : [];
  const peakGust = Math.max(gustNow, ...(gustsMax.length ? gustsMax : [0]));
  const peakRain = rainProb.length ? Math.max(...rainProb) : 0;
  const thunderNow = [95, 96, 99].includes(codeNow);
  const gust = Math.round(peakGust);
  const rain = Math.round(peakRain);

  if (peakGust >= 89) {
    return { level: "warning", type: "typhoon", gust, rain, thunderNow };
  }
  if (peakGust >= 62) {
    return { level: "watch", type: "wind", gust, rain, thunderNow };
  }
  if (thunderNow || (peakRain >= 80 && peakGust >= 45)) {
    return { level: "watch", type: "thunder", gust, rain, thunderNow };
  }
  return { level: "none", type: "none", gust, rain, thunderNow: false };
}

async function fetchWeather(lat: number, lon: number, city: string) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max,wind_gusts_10m_max&timezone=Asia%2FHo_Chi_Minh&forecast_days=3`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`weather HTTP ${r.status}`);
  const j: any = await r.json();
  return { city, current: j.current, daily: j.daily, stormRisk: deriveStormRisk(j.current, j.daily) };
}

// Khoảng cách Haversine (km) giữa hai toạ độ.
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Động đất gần đây trong bán kính quanh địa phương (USGS, miễn phí, không cần key).
async function fetchQuakes(lat: number, lon: number) {
  const RADIUS_KM = 500;
  const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${lat}&longitude=${lon}&maxradiuskm=${RADIUS_KM}&starttime=${start}&minmagnitude=2.5&orderby=time&limit=5`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`quakes HTTP ${r.status}`);
  const j: any = await r.json();
  const events = (j.features || []).map((f: any) => {
    const [qlon, qlat] = f.geometry?.coordinates || [];
    return {
      mag: f.properties?.mag ?? null,
      place: f.properties?.place ?? "",
      time: f.properties?.time ?? null,
      distanceKm: (typeof qlat === "number" && typeof qlon === "number") ? Math.round(haversineKm(lat, lon, qlat, qlon)) : null
    };
  });
  return { radiusKm: RADIUS_KM, events };
}

async function fetchCrypto() {
  const url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd,vnd&include_24hr_change=true";
  const r = await fetch(url);
  if (!r.ok) throw new Error(`crypto HTTP ${r.status}`);
  return await r.json();
}

async function fetchFx() {
  const r = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!r.ok) throw new Error(`fx HTTP ${r.status}`);
  const j: any = await r.json();
  return { usdVnd: j.rates?.VND ?? null, updated: j.time_last_update_utc ?? null };
}

const VANG_TODAY_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json, text/plain, */*"
};

function marketNumber(value: any): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickVangTodayQuote(payload: any, code: string): any | null {
  if (!payload || typeof payload !== "object") return null;

  if (payload.type === code || payload.type_code === code) return payload;

  if (payload.prices && typeof payload.prices === "object" && payload.prices[code]) {
    return { type: code, ...payload.prices[code] };
  }

  const list: any[] = Array.isArray(payload.data) ? payload.data : [];
  return list.find(it => it?.type === code || it?.type_code === code) ?? null;
}

async function fetchVangTodayQuote(code: string) {
  const r = await fetch(`https://www.vang.today/api/prices?type=${encodeURIComponent(code)}`, {
    headers: VANG_TODAY_HEADERS
  });
  if (!r.ok) throw new Error(`vang.today ${code} HTTP ${r.status}`);
  const payload: any = await r.json();
  return { payload, quote: pickVangTodayQuote(payload, code) };
}

async function fetchGold(usdVnd: number | null) {
  // Prefer Vietnam SJC price from vang.today (VND/tael, free, no key).
  try {
    const { payload, quote } = await fetchVangTodayQuote("SJL1L10");
    const sell = marketNumber(quote?.sell);
    if (sell && sell > 0) {
      const buy = marketNumber(quote?.buy);
      const changeSell = marketNumber(quote?.change_sell) ?? 0;
      const prevSell = sell - changeSell;
      const changePct = prevSell ? (changeSell / prevSell) * 100 : null;
      return {
        source: quote?.name ? `Vàng ${quote.name}` : "Vàng SJC",
        buy,
        sell,
        changePct,
        updated: quote?.update_time ?? payload.timestamp ?? payload.current_time ?? null
      };
    }
    throw new Error("vang.today SJL1L10 response missing sell price");
  } catch (e) {
    console.error("Gold vang.today SJC loi, dung XAUUSD:", e);
  }

  // Fallback to world gold from the same provider.
  const { payload, quote } = await fetchVangTodayQuote("XAUUSD");
  const usdPerOz = marketNumber(quote?.sell) || marketNumber(quote?.buy);
  if (!usdPerOz) throw new Error("vang.today XAUUSD response missing price");

  const change = marketNumber(quote?.change_sell) || marketNumber(quote?.change_buy) || 0;
  const prev = usdPerOz - change;
  const changePct = prev ? (change / prev) * 100 : null;
  let vndPerTael: number | null = null;
  if (usdVnd) {
    // Approximate VND per tael (1 tael = 37.5g, 1 troy oz = 31.1035g).
    vndPerTael = Math.round((usdPerOz / 31.1035) * 37.5 * usdVnd);
  }
  return {
    source: "Vàng thế giới (XAU, tham khảo)",
    usdPerOz,
    changePct,
    vndPerTael,
    updated: quote?.update_time ?? payload.timestamp ?? payload.current_time ?? null
  };
}

app.get("/api/widgets/overview", requireAuth, async (req: AuthRequest, res: Response) => {
  // Toạ độ do client gửi theo địa phương từng người; fallback về TP.HCM.
  const parseCoord = (v: any, min: number, max: number, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const lat = parseCoord(req.query.lat, 8, 24, WEATHER_LAT);   // giới hạn quanh VN
  const lon = parseCoord(req.query.lon, 102, 110, WEATHER_LON);
  const city = typeof req.query.city === "string" && req.query.city.trim() ? req.query.city.trim().slice(0, 60) : WEATHER_CITY;
  const geoKey = `${lat.toFixed(3)}_${lon.toFixed(3)}`;

  const weather = await cachedFetch(`weather_v2_${geoKey}`, 15 * 60 * 1000, () => fetchWeather(lat, lon, city));
  const quakes = await cachedFetch(`quakes_${geoKey}`, 30 * 60 * 1000, () => fetchQuakes(lat, lon));
  const cryptoPrices = await cachedFetch("crypto", 5 * 60 * 1000, fetchCrypto);
  const fx = await cachedFetch("fx", 30 * 60 * 1000, fetchFx);
  const gold = await cachedFetch("gold", 30 * 60 * 1000, () => fetchGold(fx?.usdVnd ?? null));
  res.json({ weather, quakes, crypto: cryptoPrices, fx, gold });
});

// --- LỊCH SỬ GIÁ THỊ TRƯỜNG (sparkline BTC/ETH/Vàng/USD ở Tổng quan) ---

// Chụp một điểm giá vào CSDL (dedupe/prune nằm trong FamilyDB.appendMarketHistory).
async function recordMarketSnapshot() {
  try {
    const fx = await cachedFetch("fx", 30 * 60 * 1000, fetchFx);
    const [cryptoPrices, gold] = await Promise.all([
      cachedFetch("crypto", 5 * 60 * 1000, fetchCrypto),
      cachedFetch("gold", 30 * 60 * 1000, () => fetchGold(fx?.usdVnd ?? null))
    ]);
    FamilyDB.appendMarketHistory({
      btcUsd: marketNumber(cryptoPrices?.bitcoin?.usd),
      ethUsd: marketNumber(cryptoPrices?.ethereum?.usd),
      goldSell: marketNumber(gold?.sell) ?? marketNumber(gold?.vndPerTael),
      usdVnd: marketNumber(fx?.usdVnd)
    });
  } catch (e) {
    console.error("Không ghi được lịch sử giá thị trường:", e);
  }
}

// Registered runtime job samples every ~10 minutes, independent of open clients.
jobs.registerAppJob('legacy', 'market-history', recordMarketSnapshot, { everyMs: 10 * 60 * 1000, initialMs: 20 * 1000 });

// Trả lịch sử trong N ngày (mặc định 7, tối đa 30), downsample còn ≤200 điểm.
app.get("/api/widgets/history", requireAuth, (req: AuthRequest, res: Response) => {
  const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
  const cutoff = Date.now() - days * 86400000;
  const all = FamilyDB.getMarketHistory().filter(p => new Date(p.at).getTime() >= cutoff);
  const MAX_POINTS = 200;
  const step = Math.ceil(all.length / MAX_POINTS);
  const points = step > 1 ? all.filter((_, i) => i % step === 0 || i === all.length - 1) : all;
  res.json({ days, points });
});

// --- VITE MIDDLEWARE SETUP & STATIC SERVING ---

async function setupAssets() {
  app.use("/api", (_req, res) => res.status(404).json({ error: "API endpoint not found" }));
  if (!appConfig.production) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      root: appConfig.codeRoot,
      server: {
        middlewareMode: true,
        watch: {
          ignored: ["**/data/**"]
        }
      },
      appType: "spa"
    });
    disposeAssets = () => vite.close();
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(appConfig.codeRoot, "dist");
    const pwaAssets: Record<string, { file: string; type: string; cacheControl: string }> = {
      "/manifest.webmanifest": {
        file: "manifest.webmanifest",
        type: "application/manifest+json",
        cacheControl: "no-cache"
      },
      "/sw.js": {
        file: "sw.js",
        type: "application/javascript; charset=utf-8",
        cacheControl: "no-cache, no-store, must-revalidate"
      },
      "/pwa-icon.svg": {
        file: "pwa-icon.svg",
        type: "image/svg+xml; charset=utf-8",
        cacheControl: "public, max-age=86400"
      }
    };

    Object.entries(pwaAssets).forEach(([route, asset]) => {
      app.get(route, (_req, res) => {
        res.setHeader("Content-Type", asset.type);
        res.setHeader("Cache-Control", asset.cacheControl);
        res.sendFile(path.join(distPath, asset.file), err => {
          if (err && !res.headersSent) {
            res.status(404).send(`${asset.file} not found. Rebuild the Windows package with the public/ directory included.`);
          }
        });
      });
    });

    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

}

jobs.registerAppJob('legacy', 'reminders', () => {
  FamilyDB.generateReminders();
  broadcastSyncEvent('NOTIFICATIONS_UPDATE');
}, { everyMs: 30 * 60 * 1000, initialMs: 0 });
jobs.registerAppJob('legacy', 'daily-backup-birthdays', () => {
  try {
    const lastAuto = FamilyDB.getBackups().find(b => b.type === 'auto');
    if (!lastAuto || Date.now() - new Date(lastAuto.createdAt).getTime() > 20 * 60 * 60 * 1000) {
      FamilyDB.createBackup('auto', 'system', 'Hệ thống');
    }
  } catch (error) { console.error('Automatic backup failed', error); }
  try { FamilyDB.generateBirthdayNotifications(); }
  catch (error) { console.error('Birthday notifications failed', error); }
}, { everyMs: 24 * 60 * 60 * 1000, initialMs: 0 });
await setupAssets();
app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  // Error objects (including body-parser errors) may carry private request bytes.
  console.error('Request failed', {status:httpErrorStatus(error,500)});
  if (res.headersSent) { next(error); return; }
  const status = (error as { status?: unknown })?.status;
  res.status(typeof status === 'number' && Number.isInteger(status) && status >= 400 && status < 500 ? status : 500)
    .json({ error: 'Không xử lý được yêu cầu.' });
});
return {
  app, jobs,
  endStreams() { realtime.end(); },
  setMaintenance(port: typeof maintenancePort) { maintenancePort=port; },
  async drainHandlers(exceptOwner?: object) {
    while (true) {
      const pending=[...handlers,...responses].filter(([,owner])=>!exceptOwner || owner!==exceptOwner).map(([promise])=>promise);
      if (!pending.length) return;
      await Promise.all(pending);
    }
  },
  async dispose() { realtime.end();await disposeAssets(); },
};
}
