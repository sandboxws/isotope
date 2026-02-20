## 1. Package Initialization

- [ ] 1.1 Initialize `packages/cli/` with `package.json` (`@isotope/cli`), `tsconfig.json`, build tooling (tsup)
- [ ] 1.2 Set up `bin` entry point for the `isotope` binary
- [ ] 1.3 Add dependencies: commander, jiti, handlebars, @clack/prompts, picocolors, `@isotope/dsl` (workspace dependency)

## 2. CLI Entry Point (from FlinkReactor `src/cli/index.ts`)

- [ ] 2.1 Port `createProgram()`: rename program `flink-reactor` → `isotope`, update description and version
- [ ] 2.2 Register commands: `new`, `synth`, `dev`, `inspect`
- [ ] 2.3 Write CLI entry test (--help output, --version)

## 3. Project Discovery (from FlinkReactor `src/cli/discovery.ts`)

- [ ] 3.1 Port `discoverPipelines(projectDir, targetPipeline?)` — find `pipelines/*/index.tsx` entries, sorted by name
- [ ] 3.2 Port `loadConfig(projectDir)` — load `isotope.config.ts` via jiti, change `jsxImportSource` from `'flink-reactor'` to `'@isotope/dsl'`
- [ ] 3.3 Port `loadPipeline(entryPoint)` — dynamically import TSX via jiti with automatic JSX transform
- [ ] 3.4 Port `loadEnvironment(projectDir, envName?)` — load `env/<name>.ts` via jiti
- [ ] 3.5 Port `resolveProjectContext(projectDir, opts)` — combine pipelines, config, environment
- [ ] 3.6 Write unit tests for discovery functions

## 4. `isotope new` Command (from FlinkReactor `src/cli/commands/new.ts`)

- [ ] 4.1 Port scaffolding logic: directory creation, template rendering, package.json generation
- [ ] 4.2 Create Isotope project templates:
  - `minimal`: GeneratorSource → ConsoleSink
  - `kafka`: KafkaSource → Filter → Map → KafkaSink
- [ ] 4.3 Create template files: `isotope.config.ts`, `tsconfig.json`, `pipelines/main/index.tsx`
- [ ] 4.4 Implement interactive project setup using @clack/prompts (project name, template selection)
- [ ] 4.5 Write integration test: `isotope new test-project` creates expected file structure

## 5. `isotope synth` Command (from FlinkReactor `src/cli/commands/synth.ts`)

- [ ] 5.1 Port command registration with options: `-p, --pipeline <name>`, `-o, --outdir <dir>`
- [ ] 5.2 Port synthesis loop: discover pipelines → load each → synthesize → write output
- [ ] 5.3 Adapt output: write serialized Protobuf `.pb` files instead of SQL+CRD (output to `dist/<pipeline-name>/plan.pb`)
- [ ] 5.4 Implement validation error reporting with source locations
- [ ] 5.5 Write integration test: synth a sample pipeline, verify .pb file is produced

## 6. `isotope dev` Command (from FlinkReactor `src/cli/commands/dev.ts`)

- [ ] 6.1 Implement Docker Compose generation: Kafka KRaft broker (no ZooKeeper) + Go runtime container
- [ ] 6.2 Implement file watcher on `pipelines/` and `isotope.config.ts` — re-synth on change
- [ ] 6.3 Implement Docker Compose lifecycle: start, stop, restart
- [ ] 6.4 Implement log forwarding: stream Go runtime logs and Kafka logs to terminal
- [ ] 6.5 Write integration test: verify Docker Compose file generation

## 7. `isotope inspect` Command (new, replaces FlinkReactor `graph`)

- [ ] 7.1 Implement plan loading: read `.pb` file, deserialize Protobuf ExecutionPlan
- [ ] 7.2 Implement formatted output: operators table (id, type, parallelism, strategy), edges list, schemas
- [ ] 7.3 Implement `--json` output: full plan as JSON
- [ ] 7.4 Implement `--graph` output: DAG visualization in Mermaid format
- [ ] 7.5 Write integration test: inspect a known .pb file, verify output

## 8. Final Integration

- [ ] 8.1 Verify `isotope new → isotope synth → isotope inspect` workflow end-to-end
- [ ] 8.2 Run full test suite and fix any failures
- [ ] 8.3 Verify pnpm workspace scripts (`pnpm synth`, `pnpm dev`) work from root
