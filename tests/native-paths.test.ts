import { describe, expect, it } from 'vitest';

describe('fully qualified storage paths', () => {
  it('rejects Windows drive-relative and root-relative paths on every host', async () => {
    const { isFullyQualifiedPath } = await import('../scripts/lib/native-paths.mjs');
    for (const value of ['data', 'C:relative', '/data', '\\data', '', '//server']) expect(isFullyQualifiedPath(value, 'win32'), value).toBe(false);
  });
  it('accepts fully qualified drive/UNC paths and absolute POSIX paths', async () => {
    const { isFullyQualifiedPath } = await import('../scripts/lib/native-paths.mjs');
    for (const value of ['C:/dữ liệu gia đình', 'D:\\data', '\\\\server\\share\\data']) expect(isFullyQualifiedPath(value, 'win32'), value).toBe(true);
    expect(isFullyQualifiedPath('/tmp/data', 'linux')).toBe(true);
    expect(isFullyQualifiedPath('tmp/data', 'linux')).toBe(false);
  });
});
