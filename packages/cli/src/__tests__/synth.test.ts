import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runSynth } from '../commands/synth.js';

// Use a fixture directory inside the monorepo so jiti can resolve @isotope/dsl
// from the workspace root's node_modules (pnpm hoists it).
const FIXTURES_ROOT = join(import.meta.dirname, '__fixtures__');

describe('isotope synth', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(FIXTURES_ROOT, `synth-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('reports no pipelines when directory is empty', async () => {
    const results = await runSynth({
      outdir: 'dist',
      projectDir: testDir,
    });
    expect(results).toEqual([]);
  });

  it('synthesizes a pipeline and produces plan.json', async () => {
    // Set up a minimal pipeline project
    const pipelineDir = join(testDir, 'pipelines', 'test-pipeline');
    mkdirSync(pipelineDir, { recursive: true });

    writeFileSync(
      join(pipelineDir, 'index.tsx'),
      `
import { Pipeline, GeneratorSource, ConsoleSink, Schema, Field } from '@isotope/dsl';

const TestSchema = Schema({
  fields: {
    id: Field.BIGINT(),
    value: Field.STRING(),
  },
});

export default (
  <Pipeline name="test-pipeline">
    <GeneratorSource schema={TestSchema} rowsPerSecond={1}>
      <ConsoleSink />
    </GeneratorSource>
  </Pipeline>
);
`,
    );

    const results = await runSynth({
      outdir: 'dist',
      projectDir: testDir,
    });

    expect(results.length).toBeGreaterThan(0);

    // Verify plan.json was written
    const planPath = join(testDir, 'dist', 'test-pipeline', 'plan.json');
    expect(existsSync(planPath)).toBe(true);

    const plan = JSON.parse(readFileSync(planPath, 'utf-8'));
    expect(plan.kind).toBe('Pipeline');
    expect(plan.props.name).toBe('test-pipeline');
  });
});
