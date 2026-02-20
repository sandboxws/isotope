## 1. Package Initialization

- [x] 1.1 Initialize `packages/cli/` with `package.json` (`@isotope/cli`), `tsconfig.json`, build tooling (tsup)
- [x] 1.2 Set up `bin` entry point for the `isotope` binary
- [x] 1.3 Add dependencies: commander, jiti, handlebars, @clack/prompts, picocolors, `@isotope/dsl` (workspace dependency)

## 2. CLI Entry Point (from FlinkReactor `src/cli/index.ts`)

- [x] 2.1 Port `createProgram()`: rename program `flink-reactor` → `isotope`, update description and version
- [x] 2.2 Register commands: `new`, `synth`, `dev`, `inspect`
- [x] 2.3 Write CLI entry test (--help output, --version)

## 3. Project Discovery (from FlinkReactor `src/cli/discovery.ts`)

- [x] 3.1 Port `discoverPipelines(projectDir, targetPipeline?)` — find `pipelines/*/index.tsx` entries, sorted by name
- [x] 3.2 Port `loadConfig(projectDir)` — load `isotope.config.ts` via jiti, change `jsxImportSource` from `'flink-reactor'` to `'@isotope/dsl'`
- [x] 3.3 Port `loadPipeline(entryPoint)` — dynamically import TSX via jiti with automatic JSX transform
- [x] 3.4 Port `loadEnvironment(projectDir, envName?)` — load `env/<name>.ts` via jiti
- [x] 3.5 Port `resolveProjectContext(projectDir, opts)` — combine pipelines, config, environment
- [x] 3.6 Write unit tests for discovery functions

## 4. `isotope new` Command (from FlinkReactor `src/cli/commands/new.ts`)

- [x] 4.1 Port scaffolding logic: directory creation, template rendering, package.json generation
- [x] 4.2 Create Isotope project templates:
  - `minimal`: GeneratorSource → ConsoleSink
  - `kafka`: KafkaSource → Filter → Map → KafkaSink
- [x] 4.3 Create template files: `isotope.config.ts`, `tsconfig.json`, `pipelines/main/index.tsx`
- [x] 4.4 Implement interactive project setup using @clack/prompts (project name, template selection)
- [x] 4.5 Write integration test: `isotope new test-project` creates expected file structure

## 5. `isotope synth` Command (from FlinkReactor `src/cli/commands/synth.ts`)

- [x] 5.1 Port command registration with options: `-p, --pipeline <name>`, `-o, --outdir <dir>`
- [x] 5.2 Port synthesis loop: discover pipelines → load each → synthesize → write output
- [x] 5.3 Adapt output: write serialized Protobuf `.pb` files instead of SQL+CRD (output to `dist/<pipeline-name>/plan.pb`)
  - Note: Currently writes JSON (`plan.json`) since plan-compiler is not yet implemented. Will switch to `.pb` when plan-compiler lands.
- [x] 5.4 Implement validation error reporting with source locations
- [x] 5.5 Write integration test: synth a sample pipeline, verify .pb file is produced

## 6. `isotope dev` Command (from FlinkReactor `src/cli/commands/dev.ts`)

- [x] 6.1 Implement Docker Compose generation: Kafka KRaft broker (no ZooKeeper) + Go runtime container
- [x] 6.2 Implement file watcher on `pipelines/` and `isotope.config.ts` — re-synth on change
- [x] 6.3 Implement Docker Compose lifecycle: start, stop, restart
- [x] 6.4 Implement log forwarding: stream Go runtime logs and Kafka logs to terminal
- [x] 6.5 Write integration test: verify Docker Compose file generation

## 7. `isotope inspect` Command (new, replaces FlinkReactor `graph`)

- [x] 7.1 Implement plan loading: read `.pb` file, deserialize Protobuf ExecutionPlan
  - Note: Currently reads JSON (`plan.json`). `.pb` support will be added when plan-compiler lands.
- [x] 7.2 Implement formatted output: operators table (id, type, parallelism, strategy), edges list, schemas
- [x] 7.3 Implement `--json` output: full plan as JSON
- [x] 7.4 Implement `--graph` output: DAG visualization in Mermaid format
- [x] 7.5 Write integration test: inspect a known .pb file, verify output

## 8. Final Integration

- [x] 8.1 Verify `isotope new → isotope synth → isotope inspect` workflow end-to-end
- [x] 8.2 Run full test suite and fix any failures
- [x] 8.3 Verify pnpm workspace scripts (`pnpm synth`, `pnpm dev`) work from root
