import type { IsotopePlugin } from './plugin.js';

// ── IsotopeConfig ───────────────────────────────────────────────────

export interface IsotopeConfig {
  readonly kafka?: {
    readonly bootstrapServers?: string;
  };
  readonly runtime?: {
    readonly batchSize?: number;
    readonly duckdb?: boolean;
  };
  readonly kubernetes?: {
    readonly namespace?: string;
    readonly image?: string;
  };
  readonly plugins?: readonly IsotopePlugin[];
}

// ── defineConfig ─────────────────────────────────────────────────────

export function defineConfig(config: IsotopeConfig): IsotopeConfig {
  if (config.plugins && config.plugins.length > 0) {
    const seen = new Set<string>();
    for (const plugin of config.plugins) {
      if (seen.has(plugin.name)) {
        throw new Error(`Duplicate plugin name '${plugin.name}' in config.plugins`);
      }
      seen.add(plugin.name);
    }
  }

  if (config.runtime?.batchSize !== undefined && config.runtime.batchSize <= 0) {
    throw new Error('runtime.batchSize must be a positive number');
  }

  return Object.freeze(config);
}
