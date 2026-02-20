import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverPipelines } from '../discovery.js';

describe('discoverPipelines', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `isotope-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns empty array when pipelines/ does not exist', () => {
    const result = discoverPipelines(testDir);
    expect(result).toEqual([]);
  });

  it('discovers pipelines with index.tsx', () => {
    const pipelinesDir = join(testDir, 'pipelines');
    mkdirSync(join(pipelinesDir, 'alpha'), { recursive: true });
    mkdirSync(join(pipelinesDir, 'beta'), { recursive: true });

    writeFileSync(join(pipelinesDir, 'alpha', 'index.tsx'), 'export default {};');
    writeFileSync(join(pipelinesDir, 'beta', 'index.tsx'), 'export default {};');

    const result = discoverPipelines(testDir);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('alpha');
    expect(result[1].name).toBe('beta');
    expect(result[0].entryPoint).toBe(join(pipelinesDir, 'alpha', 'index.tsx'));
  });

  it('ignores directories without index.tsx', () => {
    const pipelinesDir = join(testDir, 'pipelines');
    mkdirSync(join(pipelinesDir, 'has-it'), { recursive: true });
    mkdirSync(join(pipelinesDir, 'no-tsx'), { recursive: true });

    writeFileSync(join(pipelinesDir, 'has-it', 'index.tsx'), 'export default {};');
    writeFileSync(join(pipelinesDir, 'no-tsx', 'readme.md'), '# hello');

    const result = discoverPipelines(testDir);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('has-it');
  });

  it('filters by target pipeline', () => {
    const pipelinesDir = join(testDir, 'pipelines');
    mkdirSync(join(pipelinesDir, 'alpha'), { recursive: true });
    mkdirSync(join(pipelinesDir, 'beta'), { recursive: true });

    writeFileSync(join(pipelinesDir, 'alpha', 'index.tsx'), 'export default {};');
    writeFileSync(join(pipelinesDir, 'beta', 'index.tsx'), 'export default {};');

    const result = discoverPipelines(testDir, 'beta');

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('beta');
  });

  it('returns pipelines sorted by name', () => {
    const pipelinesDir = join(testDir, 'pipelines');
    mkdirSync(join(pipelinesDir, 'zebra'), { recursive: true });
    mkdirSync(join(pipelinesDir, 'alpha'), { recursive: true });
    mkdirSync(join(pipelinesDir, 'middle'), { recursive: true });

    writeFileSync(join(pipelinesDir, 'zebra', 'index.tsx'), '');
    writeFileSync(join(pipelinesDir, 'alpha', 'index.tsx'), '');
    writeFileSync(join(pipelinesDir, 'middle', 'index.tsx'), '');

    const result = discoverPipelines(testDir);
    const names = result.map((p) => p.name);

    expect(names).toEqual(['alpha', 'middle', 'zebra']);
  });
});
