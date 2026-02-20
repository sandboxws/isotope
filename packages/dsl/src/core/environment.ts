// ── Environment configuration ────────────────────────────────────────

export interface PipelineOverrides {
  readonly parallelism?: number;
  readonly [key: string]: unknown;
}

export interface EnvironmentConfig {
  readonly name: string;
  readonly infra?: {
    readonly kafka?: {
      readonly bootstrapServers?: string;
    };
    readonly kubernetes?: {
      readonly namespace?: string;
      readonly image?: string;
    };
  };
  readonly pipelineOverrides?: Record<string, PipelineOverrides>;
}

// ── Resolution ───────────────────────────────────────────────────────

export function resolveEnvironment(
  pipelineName: string,
  env: EnvironmentConfig,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (env.infra?.kafka?.bootstrapServers) {
    result.bootstrapServers = env.infra.kafka.bootstrapServers;
  }
  if (env.infra?.kubernetes?.namespace) {
    result.namespace = env.infra.kubernetes.namespace;
  }

  const overrides = env.pipelineOverrides;
  if (!overrides) return result;

  const wildcard = overrides['*'];
  if (wildcard) {
    for (const [key, value] of Object.entries(wildcard)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
  }

  const named = overrides[pipelineName];
  if (named) {
    for (const [key, value] of Object.entries(named)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
  }

  return result;
}

// ── Auto-discovery ───────────────────────────────────────────────────

export function discoverEnvironments(
  envDir: string,
  files: readonly string[],
): Array<{ name: string; path: string }> {
  return files
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .map((f) => ({
      name: f.replace(/\.ts$/, ''),
      path: `${envDir}/${f}`,
    }));
}

// ── defineEnvironment ───────────────────────────────────────────────

export function defineEnvironment(config: EnvironmentConfig): EnvironmentConfig {
  return Object.freeze(config);
}
