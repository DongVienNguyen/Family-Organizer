import fs from 'node:fs';
import path from 'node:path';
import { pbkdf2Sync } from 'node:crypto';

/** Explicit test-owned legacy input; never imported by runtime or packaging. */
export function writeSyntheticInstallation(dataRoot:string){
  fs.mkdirSync(dataRoot,{recursive:true});
  const passwordHash=pbkdf2Sync('admin123','family_organizer_salt_2026',1000,64,'sha512').toString('hex');
  fs.writeFileSync(path.join(dataRoot,'db.json'),JSON.stringify({users:[{
    id:'user_admin',username:'admin',fullName:'Gia Trưởng (Admin)',role:'admin',avatarColor:'bg-red-500',passwordHash,createdAt:'2026-01-01T00:00:00.000Z',
  }]}));
}
