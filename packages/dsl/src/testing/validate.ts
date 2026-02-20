import type { ConstructNode } from '../core/types.js';
import type { IsotopePlugin } from '../core/plugin.js';
import { SynthContext, type ValidationDiagnostic } from '../core/synth-context.js';
import { resolvePlugins, EMPTY_PLUGIN_CHAIN } from '../core/plugin-registry.js';

export type { ValidationDiagnostic as Diagnostic } from '../core/synth-context.js';

// ── validate() test helper ───────────────────────────────────────────

export interface ValidateResult {
  readonly errors: readonly ValidationDiagnostic[];
  readonly warnings: readonly ValidationDiagnostic[];
}

export interface ValidateOptions {
  readonly plugins?: readonly IsotopePlugin[];
}

export function validate(
  pipeline: ConstructNode,
  options?: ValidateOptions,
): ValidateResult {
  const ctx = new SynthContext();
  ctx.buildFromTree(pipeline);

  const chain = options?.plugins && options.plugins.length > 0
    ? resolvePlugins(options.plugins)
    : EMPTY_PLUGIN_CHAIN;

  const diagnostics = ctx.validate(
    chain.validators.length > 0 ? pipeline : undefined,
    chain.validators.length > 0 ? chain.validators : undefined,
  );

  return {
    errors: diagnostics.filter((d) => d.severity === 'error'),
    warnings: diagnostics.filter((d) => d.severity === 'warning'),
  };
}
