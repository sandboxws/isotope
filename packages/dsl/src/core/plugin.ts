import type { ConstructNode, NodeKind } from './types.js';
import type { ValidationDiagnostic } from './synth-context.js';

// ── Synthesis hook context ──────────────────────────────────────────

export interface SynthHookContext {
  readonly appName: string;
  readonly pipelines: readonly ConstructNode[];
}

export interface AfterSynthHookContext extends SynthHookContext {
  readonly results: readonly { readonly name: string; readonly tree: ConstructNode }[];
}

// ── Plugin plan transformer signature ────────────────────────────────

export type PluginPlanTransformer = (
  node: ConstructNode,
  nodeIndex: ReadonlyMap<string, ConstructNode>,
) => Record<string, unknown>;

// ── Plugin validator signature ──────────────────────────────────────

export type PluginValidator = (
  tree: ConstructNode,
  existingDiagnostics: readonly ValidationDiagnostic[],
) => ValidationDiagnostic[];

// ── IsotopePlugin interface ─────────────────────────────────────────

export interface IsotopePlugin {
  readonly name: string;
  readonly version?: string;
  readonly ordering?: {
    readonly before?: readonly string[];
    readonly after?: readonly string[];
  };

  // Layer 1: Component Registration
  readonly components?: ReadonlyMap<string, NodeKind>;

  // Layer 2: Tree Transformers
  readonly transformTree?: (tree: ConstructNode) => ConstructNode;

  // Layer 3: Plan Extensions
  readonly planTransformers?: ReadonlyMap<string, PluginPlanTransformer>;

  // Layer 4: Validation
  readonly validate?: PluginValidator;

  // Layer 5: Lifecycle Hooks
  readonly beforeSynth?: (context: SynthHookContext) => void;
  readonly afterSynth?: (context: AfterSynthHookContext) => void;
}
