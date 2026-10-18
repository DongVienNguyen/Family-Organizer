import type {registerDomainMigration} from '../appMigrations.js';
import type {registerSnapshotTable} from '../appSnapshot.js';
import {boardTables,prepareBoardSchema,productivityBoardCandidateChecksum} from './boardSchema.js';
export const productivityBoardChecksum=productivityBoardCandidateChecksum;
/** Explicit pilot registration. Existing installations never migrate on startup.
 * Bootstrap registers this only when a validated v7 image already exists. */
export function registerBoardMigration(ports:{registerMigration:typeof registerDomainMigration;registerSnapshot:typeof registerSnapshotTable}):void {
 for(const [name,columns]of Object.entries(boardTables))ports.registerSnapshot('productivity',name,columns);
 ports.registerMigration('productivity',7,prepareBoardSchema,productivityBoardChecksum);
}
