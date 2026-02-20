import type { ConstructNode } from '../core/types.js';
import type { IsotopePlugin } from '../core/plugin.js';
import { SynthContext } from '../core/synth-context.js';
import { resolvePlugins, EMPTY_PLUGIN_CHAIN } from '../core/plugin-registry.js';
import { registerComponentKinds, resetComponentKinds } from '../core/jsx-runtime.js';
import { rekindTree } from '../core/tree-utils.js';

// ── synth() test helper ──────────────────────────────────────────────

export interface SynthResult {
  readonly tree: ConstructNode;
  readonly context: SynthContext;
}

export interface SynthOptions {
  readonly plugins?: readonly IsotopePlugin[];
}

export function synth(
  pipeline: ConstructNode,
  options?: SynthOptions,
): SynthResult {
  const chain = options?.plugins && options.plugins.length > 0
    ? resolvePlugins(options.plugins)
    : EMPTY_PLUGIN_CHAIN;

  if (chain.components.size > 0) {
    registerComponentKinds(chain.components);
  }

  try {
    let node = chain.components.size > 0 ? rekindTree(pipeline, chain.components) : pipeline;
    node = chain.transformTree(node);

    const context = new SynthContext();
    context.buildFromTree(node);

    return { tree: node, context };
  } finally {
    if (chain.components.size > 0) {
      resetComponentKinds();
    }
  }
}
