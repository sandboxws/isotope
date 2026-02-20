import { describe, it, expect } from 'vitest';
import { defineConfig } from '../../src/core/config.js';
import { defineEnvironment, resolveEnvironment, discoverEnvironments } from '../../src/core/environment.js';

describe('defineConfig', () => {
  it('creates a frozen config', () => {
    const config = defineConfig({
      kafka: { bootstrapServers: 'kafka:9092' },
      runtime: { batchSize: 1000 },
    });

    expect(config.kafka?.bootstrapServers).toBe('kafka:9092');
    expect(config.runtime?.batchSize).toBe(1000);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('throws on duplicate plugin names', () => {
    expect(() =>
      defineConfig({
        plugins: [
          { name: 'dup' },
          { name: 'dup' },
        ],
      }),
    ).toThrow("Duplicate plugin name 'dup'");
  });

  it('throws on invalid batchSize', () => {
    expect(() =>
      defineConfig({
        runtime: { batchSize: 0 },
      }),
    ).toThrow('runtime.batchSize must be a positive number');
  });

  it('accepts empty config', () => {
    const config = defineConfig({});
    expect(config).toBeDefined();
  });
});

describe('defineEnvironment', () => {
  it('creates a frozen environment config', () => {
    const env = defineEnvironment({
      name: 'staging',
      infra: { kafka: { bootstrapServers: 'kafka-staging:9092' } },
    });

    expect(env.name).toBe('staging');
    expect(Object.isFrozen(env)).toBe(true);
  });
});

describe('resolveEnvironment', () => {
  it('applies infra-level overrides', () => {
    const env = defineEnvironment({
      name: 'prod',
      infra: {
        kafka: { bootstrapServers: 'kafka-prod:9092' },
        kubernetes: { namespace: 'prod-ns' },
      },
    });

    const result = resolveEnvironment('my-pipeline', env);
    expect(result.bootstrapServers).toBe('kafka-prod:9092');
    expect(result.namespace).toBe('prod-ns');
  });

  it('merges wildcard and named overrides', () => {
    const env = defineEnvironment({
      name: 'staging',
      pipelineOverrides: {
        '*': { parallelism: 2 },
        'my-pipeline': { parallelism: 4 },
      },
    });

    const myResult = resolveEnvironment('my-pipeline', env);
    expect(myResult.parallelism).toBe(4); // named wins

    const otherResult = resolveEnvironment('other-pipeline', env);
    expect(otherResult.parallelism).toBe(2); // wildcard
  });
});

describe('discoverEnvironments', () => {
  it('discovers .ts files as environments', () => {
    const files = ['staging.ts', 'production.ts', 'types.d.ts', 'readme.md'];
    const result = discoverEnvironments('/env', files);

    expect(result).toEqual([
      { name: 'staging', path: '/env/staging.ts' },
      { name: 'production', path: '/env/production.ts' },
    ]);
  });
});
