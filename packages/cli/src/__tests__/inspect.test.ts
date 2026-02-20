import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInspect } from '../commands/inspect.js';
import type { ConstructNode } from '@isotope/dsl';

describe('isotope inspect', () => {
  let testDir: string;
  let planPath: string;

  const samplePlan: ConstructNode = {
    id: 'pipeline-1',
    kind: 'Pipeline',
    component: 'Pipeline',
    props: { name: 'test-pipeline', mode: 'streaming' },
    children: [
      {
        id: 'source-1',
        kind: 'Source',
        component: 'GeneratorSource',
        props: { rowsPerSecond: 1 },
        children: [
          {
            id: 'sink-1',
            kind: 'Sink',
            component: 'ConsoleSink',
            props: {},
            children: [],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    testDir = join(tmpdir(), `isotope-inspect-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    planPath = join(testDir, 'plan.json');
    writeFileSync(planPath, JSON.stringify(samplePlan, null, 2));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('displays formatted table output', async () => {
    const output = await runInspect(planPath, {});
    expect(output).toContain('test-pipeline');
    expect(output).toContain('GeneratorSource');
    expect(output).toContain('ConsoleSink');
  });

  it('displays JSON output with --json', async () => {
    const output = await runInspect(planPath, { json: true });
    const parsed = JSON.parse(output);
    expect(parsed.pipeline.name).toBe('test-pipeline');
    expect(parsed.operators).toHaveLength(3);
    expect(parsed.edges).toHaveLength(2);
  });

  it('displays Mermaid DAG with --graph', async () => {
    const output = await runInspect(planPath, { graph: true });
    expect(output).toContain('graph TD');
    expect(output).toContain('Pipeline');
    expect(output).toContain('GeneratorSource');
    expect(output).toContain('-->');
  });

  it('reports error for missing file', async () => {
    const output = await runInspect('/nonexistent/plan.json', {});
    expect(output).toBe('');
  });
});
