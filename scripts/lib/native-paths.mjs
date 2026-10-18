import fs from 'node:fs';
import path from 'node:path';

/** Windows rooted paths are absolute but can still inherit the current drive. */
export function isFullyQualifiedPath(value, platform = process.platform) {
  if (typeof value !== 'string' || !value) return false;
  if (platform !== 'win32') return path.posix.isAbsolute(value);
  if (/^[\\/]{2}[?.][\\/]/.test(value)) return false; // device namespaces are not installation roots
  return /^[A-Za-z]:[\\/]/.test(value) || /^[\\/]{2}[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(value);
}

/** Walk existing ancestors too: lstat on only the leaf misses parent junctions. */
export function assertNoLinkedAncestors(value) {
  for (let current = path.resolve(value); ; current = path.dirname(current)) {
    if (fs.lstatSync(current, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('Linked/reparse path ancestor is forbidden');
    if (path.dirname(current) === current) return;
  }
}
