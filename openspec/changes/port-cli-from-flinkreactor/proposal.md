## Why

Isotope's CLI (`isotope new`, `isotope synth`, `isotope dev`, `isotope inspect`) follows the same developer workflow pattern as FlinkReactor's CLI (`flink-reactor new`, `flink-reactor synth`, `flink-reactor dev`). The project discovery system (finding pipelines in `pipelines/*/index.tsx`, loading config via jiti, resolving project context) is directly reusable. Porting the CLI structure avoids re-inventing the command parsing, discovery, and scaffolding infrastructure.

The key adaptation: FlinkReactor's synth command outputs Flink SQL files + Kubernetes CRD YAML. Isotope's synth command outputs serialized Protobuf `.pb` files. The dev command switches from managing a Flink cluster to managing Docker Compose with Kafka KRaft + Go runtime. A new `inspect` command replaces the `graph` command with plan introspection.

## What Changes

- Initialize `packages/cli/` as a pnpm workspace package with Commander.js
- Port CLI entry point and command registration — rename from `flink-reactor` to `isotope`
- Port project discovery: `discoverPipelines()`, `loadConfig()`, `loadPipeline()`, `resolveProjectContext()` — change jiti importSource to `@isotope/dsl`
- Port and adapt `isotope new`: scaffold project with Isotope templates (Generator→Console, Kafka→Filter→Kafka)
- Port and adapt `isotope synth`: compile TSX pipelines → Protobuf `.pb` files instead of SQL+CRD
- Port and adapt `isotope dev`: Docker Compose (Kafka KRaft + Go runtime) instead of Flink cluster
- Implement new `isotope inspect`: load `.pb` file, dump operators/edges/schemas, DAG visualization, `--json` output
- Write integration tests for each command

## Capabilities

### New Capabilities
- `isotope-cli`: CLI binary with `new`, `synth`, `dev`, `inspect` commands, ported from FlinkReactor with Isotope-specific compilation targets

### Modified Capabilities
_None — this is the initial CLI implementation._

## Impact

- **New directories**: `packages/cli/`, `packages/cli/src/commands/`, `packages/cli/src/templates/`
- **Dependencies**: commander, jiti, handlebars, @clack/prompts, picocolors
- **Source project**: `/Users/ahmed/Development/opensource/flink-reactor/src/cli/`
- **Upstream**: Depends on `packages/dsl/` (imports DSL for pipeline loading and synthesis)
- **Downstream**: User-facing CLI binary, `pnpm synth` / `pnpm dev` root scripts
