import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scaffoldProject } from '../commands/new.js';

describe('isotope new', () => {
  const testDir = join(tmpdir(), `isotope-new-test-${Date.now()}`);

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('scaffolds a minimal project with expected files', () => {
    scaffoldProject(testDir, {
      projectName: 'test-project',
      template: 'minimal',
      pm: 'pnpm',
      gitInit: false,
      installDeps: false,
    });

    // Check expected files exist
    expect(existsSync(join(testDir, 'package.json'))).toBe(true);
    expect(existsSync(join(testDir, 'tsconfig.json'))).toBe(true);
    expect(existsSync(join(testDir, 'isotope.config.ts'))).toBe(true);
    expect(existsSync(join(testDir, '.gitignore'))).toBe(true);
    expect(existsSync(join(testDir, 'env', 'dev.ts'))).toBe(true);
    expect(existsSync(join(testDir, 'pipelines', 'main', 'index.tsx'))).toBe(true);
  });

  it('generates valid package.json with correct name', () => {
    scaffoldProject(testDir, {
      projectName: 'my-app',
      template: 'minimal',
      pm: 'pnpm',
      gitInit: false,
      installDeps: false,
    });

    const pkg = JSON.parse(readFileSync(join(testDir, 'package.json'), 'utf-8'));

    expect(pkg.name).toBe('my-app');
    expect(pkg.type).toBe('module');
    expect(pkg.dependencies['@isotope/dsl']).toBeDefined();
  });

  it('generates tsconfig with @isotope/dsl as jsxImportSource', () => {
    scaffoldProject(testDir, {
      projectName: 'test-project',
      template: 'minimal',
      pm: 'pnpm',
      gitInit: false,
      installDeps: false,
    });

    const tsconfig = JSON.parse(readFileSync(join(testDir, 'tsconfig.json'), 'utf-8'));

    expect(tsconfig.compilerOptions.jsx).toBe('react-jsx');
    expect(tsconfig.compilerOptions.jsxImportSource).toBe('@isotope/dsl');
  });

  it('scaffolds a kafka project with pipeline', () => {
    scaffoldProject(testDir, {
      projectName: 'kafka-project',
      template: 'kafka',
      pm: 'pnpm',
      gitInit: false,
      installDeps: false,
    });

    expect(existsSync(join(testDir, 'pipelines', 'main', 'index.tsx'))).toBe(true);

    const pipeline = readFileSync(join(testDir, 'pipelines', 'main', 'index.tsx'), 'utf-8');
    expect(pipeline).toContain('KafkaSource');
    expect(pipeline).toContain('KafkaSink');
    expect(pipeline).toContain('Filter');
  });
});
