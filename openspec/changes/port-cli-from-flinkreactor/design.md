## Context

FlinkReactor has a mature CLI built with Commander.js that handles project discovery (finding pipelines in `pipelines/*/index.tsx`), configuration loading (via jiti for runtime .tsx evaluation), and synthesis (TSX → SQL + CRD). Isotope needs the same developer workflow but targeting different outputs (Protobuf instead of SQL, Docker Compose instead of Flink cluster).

The FlinkReactor CLI source is at `/Users/ahmed/Development/opensource/flink-reactor/src/cli/`. The Isotope target is `packages/cli/`.

## Goals / Non-Goals

**Goals:**
- Port the CLI entry point, command structure, and project discovery from FlinkReactor
- Adapt the `synth` command to output Protobuf `.pb` files
- Adapt the `dev` command to manage Docker Compose (Kafka KRaft + Go runtime)
- Implement `inspect` command (new) for plan introspection
- Port `new` command with Isotope-specific project templates
- All commands have integration tests

**Non-Goals:**
- Porting `deploy` command — Kubernetes deployment is Phase 6
- Porting `doctor` command — simpler diagnostics for now
- Porting `cluster` command — replaced by Docker Compose in `dev`
- Porting `schema` command — replaced by `inspect`
- Implementing the plan-compiler itself — that's a separate change

## Decisions

### Decision 1: Keep Commander.js for CLI framework

**Choice:** Use Commander.js, same as FlinkReactor.

**Rationale:** Commander.js is battle-tested, lightweight, and the FlinkReactor code already structures commands around it. Switching to another framework (yargs, oclif, citty) adds unnecessary work.

### Decision 2: Keep jiti for TSX runtime loading

**Choice:** Use jiti to dynamically import `.tsx` pipeline files at synth time.

**Rationale:** jiti handles JSX transformation, TypeScript compilation, and ESM/CJS interop at runtime. It's what makes `isotope synth` work without a separate build step. The change: `jsxImportSource` switches from `'flink-reactor'` to `'@isotope/dsl'`.

### Decision 3: Docker Compose for dev environment

**Choice:** `isotope dev` generates and manages a Docker Compose configuration with Kafka KRaft (no ZooKeeper) and the Go runtime binary.

**Rationale:** FlinkReactor's `dev` command manages a Flink cluster (SQL Gateway, TaskManager, JobManager). Isotope's runtime is a single Go binary — Docker Compose is sufficient. Kafka KRaft mode eliminates ZooKeeper complexity.

### Decision 4: Inspect replaces graph + adds plan introspection

**Choice:** A single `isotope inspect` command that combines DAG visualization (from FlinkReactor's `graph`) with Protobuf plan introspection.

**Rationale:** After `isotope synth` produces `.pb` files, developers need to inspect what was compiled. `inspect` loads the binary plan, dumps operators/edges/schemas, and optionally renders the DAG. `--json` provides machine-readable output.

## Risks / Trade-offs

- **jiti version compatibility** — jiti's JSX handling may change between versions. Pin the version.
- **Docker Compose dependency** — Requires Docker installed. Provide clear error messages if Docker is missing.
- **Template maintenance** — Isotope templates diverge from FlinkReactor templates over time. Keep templates simple.

## Open Questions

- Should `isotope dev` also run `isotope synth` in watch mode, or should they be separate processes?
- Should `isotope inspect` work on both `.pb` files and live pipelines (via the running runtime)?
