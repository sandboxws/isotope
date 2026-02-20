import type { ConstructNode, NodeKind } from './types.js';
import type {
  IsotopePlugin,
  PluginPlanTransformer,
  PluginValidator,
} from './plugin.js';

// ── Resolved plugin chain ───────────────────────────────────────────

export interface ResolvedPluginChain {
  readonly order: readonly string[];
  readonly components: ReadonlyMap<string, NodeKind>;
  readonly transformTree: (tree: ConstructNode) => ConstructNode;
  readonly planTransformers: ReadonlyMap<string, PluginPlanTransformer>;
  readonly validators: readonly PluginValidator[];
  readonly beforeSynth: readonly IsotopePlugin['beforeSynth'][];
  readonly afterSynth: readonly IsotopePlugin['afterSynth'][];
}

// ── Empty chain constant ────────────────────────────────────────────

const IDENTITY_TREE = (tree: ConstructNode): ConstructNode => tree;

export const EMPTY_PLUGIN_CHAIN: ResolvedPluginChain = {
  order: [],
  components: new Map(),
  transformTree: IDENTITY_TREE,
  planTransformers: new Map(),
  validators: [],
  beforeSynth: [],
  afterSynth: [],
};

// ── resolvePlugins ──────────────────────────────────────────────────

export function resolvePlugins(
  plugins: readonly IsotopePlugin[],
): ResolvedPluginChain {
  if (plugins.length === 0) return EMPTY_PLUGIN_CHAIN;

  validateUniqueNames(plugins);
  const ordered = topologicalSortPlugins(plugins);

  const components = mergeComponents(ordered);
  const planTransformers = mergePlanTransformers(ordered);
  const transformTree = composeTreeTransformers(ordered);

  const validators = ordered
    .filter((p) => p.validate != null)
    .map((p) => p.validate!);

  const beforeSynth = ordered
    .filter((p) => p.beforeSynth != null)
    .map((p) => p.beforeSynth!);

  const afterSynth = ordered
    .filter((p) => p.afterSynth != null)
    .map((p) => p.afterSynth!);

  return {
    order: ordered.map((p) => p.name),
    components,
    transformTree,
    planTransformers,
    validators,
    beforeSynth,
    afterSynth,
  };
}

// ── Validation ──────────────────────────────────────────────────────

function validateUniqueNames(plugins: readonly IsotopePlugin[]): void {
  const seen = new Set<string>();
  for (const plugin of plugins) {
    if (seen.has(plugin.name)) {
      throw new Error(`Duplicate plugin name '${plugin.name}'`);
    }
    seen.add(plugin.name);
  }
}

// ── Topological sort ────────────────────────────────────────────────

function topologicalSortPlugins(
  plugins: readonly IsotopePlugin[],
): IsotopePlugin[] {
  const byName = new Map<string, IsotopePlugin>();
  for (const p of plugins) {
    byName.set(p.name, p);
  }

  const edges = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();

  for (const p of plugins) {
    edges.set(p.name, new Set());
    inDegree.set(p.name, 0);
  }

  for (const p of plugins) {
    if (p.ordering?.before) {
      for (const target of p.ordering.before) {
        if (byName.has(target)) {
          edges.get(p.name)!.add(target);
          inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
        }
      }
    }
    if (p.ordering?.after) {
      for (const dep of p.ordering.after) {
        if (byName.has(dep)) {
          edges.get(dep)!.add(p.name);
          inDegree.set(p.name, (inDegree.get(p.name) ?? 0) + 1);
        }
      }
    }
  }

  const queue: string[] = [];
  for (const [name, deg] of inDegree) {
    if (deg === 0) queue.push(name);
  }
  queue.sort();

  const result: IsotopePlugin[] = [];
  while (queue.length > 0) {
    const name = queue.shift()!;
    result.push(byName.get(name)!);

    for (const neighbor of edges.get(name) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) {
        const insertIdx = queue.findIndex((q) => q > neighbor);
        if (insertIdx === -1) {
          queue.push(neighbor);
        } else {
          queue.splice(insertIdx, 0, neighbor);
        }
      }
    }
  }

  if (result.length !== plugins.length) {
    const missing = plugins
      .filter((p) => !result.some((r) => r.name === p.name))
      .map((p) => p.name);
    throw new Error(
      `Circular ordering constraint among plugins: ${missing.join(', ')}`,
    );
  }

  return result;
}

// ── Map merging with conflict detection ─────────────────────────────

function mergeComponents(
  plugins: readonly IsotopePlugin[],
): ReadonlyMap<string, NodeKind> {
  const merged = new Map<string, NodeKind>();
  const owners = new Map<string, string>();

  for (const plugin of plugins) {
    if (!plugin.components) continue;
    for (const [name, kind] of plugin.components) {
      if (merged.has(name)) {
        throw new Error(
          `Component '${name}' registered by both '${owners.get(name)}' and '${plugin.name}'`,
        );
      }
      merged.set(name, kind);
      owners.set(name, plugin.name);
    }
  }

  return merged;
}

function mergePlanTransformers(
  plugins: readonly IsotopePlugin[],
): ReadonlyMap<string, PluginPlanTransformer> {
  const merged = new Map<string, PluginPlanTransformer>();
  const owners = new Map<string, string>();

  for (const plugin of plugins) {
    if (!plugin.planTransformers) continue;
    for (const [name, transformer] of plugin.planTransformers) {
      if (merged.has(name)) {
        throw new Error(
          `Plan transformer for '${name}' registered by both '${owners.get(name)}' and '${plugin.name}'`,
        );
      }
      merged.set(name, transformer);
      owners.set(name, plugin.name);
    }
  }

  return merged;
}

// ── Transformer composition ─────────────────────────────────────────

function composeTreeTransformers(
  plugins: readonly IsotopePlugin[],
): (tree: ConstructNode) => ConstructNode {
  const transformers = plugins
    .filter((p) => p.transformTree != null)
    .map((p) => p.transformTree!);

  if (transformers.length === 0) return IDENTITY_TREE;
  if (transformers.length === 1) return transformers[0];

  return (tree: ConstructNode) =>
    transformers.reduce((t, fn) => fn(t), tree);
}
