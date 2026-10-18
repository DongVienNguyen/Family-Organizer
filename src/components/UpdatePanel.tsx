/** @license SPDX-License-Identifier: Apache-2.0 */
import React, { useEffect, useState } from 'react';
import { Tag, ExternalLink } from 'lucide-react';
import { type AppVersionInfo, fetchAppVersion } from '../utils/appVersion.js';

export function UpdatePanel({ isAdmin }: { isAdmin: boolean }) {
  const [version, setVersion] = useState<AppVersionInfo | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void fetchAppVersion().then(value => { if (active) { setVersion(value); setFailed(!value); } });
    return () => { active = false; };
  }, []);
  return <div className="bg-slate-950 neu-pressed-sm rounded-2xl p-4.5 space-y-4">
    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2"><Tag className="w-4 h-4 text-sky-400" /> Phiên bản hiện tại</h3>
    {version ? <div className="space-y-1 text-xs text-slate-400">
      <p className="font-mono text-slate-100">v{version.version}{version.shortCommit ? ` · ${version.shortCommit}` : ''}</p>
      {version.buildTime && <p>Build: {version.buildTime}</p>}
    </div> : <p className={`text-[11px] ${failed ? 'text-rose-400' : 'text-slate-500'}`}>{failed ? 'Không tải được phiên bản. Vui lòng mở lại trang sau.' : 'Đang tải thông tin phiên bản…'}</p>}
    {isAdmin && <div className="space-y-2 text-[11px] text-slate-400">
      <p>Cập nhật do quản trị viên máy chủ thực hiện qua gói phát hành đã kiểm thử.</p>
      <a href="https://github.com/DongVienNguyen/Family-Organizer/releases" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40 rounded-lg"><ExternalLink className="w-3.5 h-3.5" /> Các bản phát hành</a>
    </div>}
  </div>;
}
