import { describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';

describe('build script', () => {
  it('builds the CLI bundle successfully when setup imports Node builtin subpaths', () => {
    const result = spawnSync(process.execPath, ['scripts/build.js'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);
  });
});
