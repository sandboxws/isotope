## ADDED Requirements

### Requirement: Plugin architecture ported from FlinkReactor
The DSL SHALL provide a plugin system in `packages/dsl/src/core/plugin.ts` with the FlinkReactor plugin interface adapted for Isotope:

**Layer 1: Component Registration** — `components: ReadonlyMap<string, NodeKind>` for adding custom component kinds
**Layer 2: Tree Transformers** — `transformTree(tree) → ConstructNode` for modifying the tree before synthesis
**Layer 3: Plan Extensions** — `planTransformers: Map<componentName, PluginPlanTransformer>` replacing FlinkReactor's `sqlGenerators`/`ddlGenerators`
**Layer 4: Validation** — `validate(tree, diagnostics) → ValidationDiagnostic[]` for custom validation rules
**Layer 5: Lifecycle Hooks** — `beforeSynth(context)` and `afterSynth(context)` hooks

#### Scenario: Plugin registers custom component
- **WHEN** a plugin provides a components map with `{ MyCustomOp: 'Transform' }`
- **THEN** the JSX runtime SHALL recognize `<MyCustomOp>` as a valid component with kind 'Transform'

#### Scenario: Plugin validation runs
- **WHEN** validate() is called with plugin validators registered
- **THEN** plugin validators SHALL run after built-in validation and their diagnostics SHALL be merged

### Requirement: Plugin registry with dependency ordering
The DSL SHALL provide `resolvePlugins(plugins)` that topologically orders plugins by their `ordering.before`/`ordering.after` dependencies, validates uniqueness, and produces a `ResolvedPluginChain`.

#### Scenario: Plugin ordering
- **WHEN** plugin A declares `ordering: { before: ['B'] }` and plugin B exists
- **THEN** resolvePlugins SHALL order A before B

### Requirement: Determinism contract
All plugin transformers and generators SHALL be pure functions (deterministic, no side effects). The DSL SHALL document this requirement but not enforce it at runtime.
