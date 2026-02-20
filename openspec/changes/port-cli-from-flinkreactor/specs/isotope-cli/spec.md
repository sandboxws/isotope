## ADDED Requirements

### Requirement: CLI entry point and command structure
The CLI SHALL be implemented in `packages/cli/` using Commander.js, providing the `isotope` binary with commands: `new`, `synth`, `dev`, `inspect`. The CLI SHALL use picocolors for styled terminal output.

#### Scenario: CLI help output
- **WHEN** `isotope --help` is run
- **THEN** it SHALL display available commands with descriptions

### Requirement: Project discovery ported from FlinkReactor
The CLI SHALL provide project discovery in `packages/cli/src/discovery.ts`:
- `discoverPipelines(projectDir, targetPipeline?)` — find `pipelines/*/index.tsx` entries
- `loadConfig(projectDir)` — load `isotope.config.ts` via jiti with `jsxImportSource: '@isotope/dsl'`
- `loadPipeline(entryPoint)` — dynamically import TSX via jiti
- `resolveProjectContext(projectDir, opts)` — combine pipelines, config, and environment

#### Scenario: Pipeline discovery
- **WHEN** a project has `pipelines/my-pipeline/index.tsx`
- **THEN** discoverPipelines() SHALL return it with name 'my-pipeline' and the correct entry point path

#### Scenario: Config loading via jiti
- **WHEN** an `isotope.config.ts` exists in the project root
- **THEN** loadConfig() SHALL import it using jiti with automatic JSX transformation sourced from `@isotope/dsl`

### Requirement: isotope new command
The `isotope new <name>` command SHALL scaffold a new Isotope project with:
- `package.json` with `@isotope/dsl` dependency
- `tsconfig.json` with JSX configuration
- `isotope.config.ts` with sensible defaults
- `pipelines/main/index.tsx` with a sample pipeline (GeneratorSource → ConsoleSink)

Templates SHALL use Handlebars for variable substitution (projectName, etc.).

#### Scenario: Scaffold minimal project
- **WHEN** `isotope new my-app` is run
- **THEN** it SHALL create a `my-app/` directory with all required files and a working sample pipeline

### Requirement: isotope synth command
The `isotope synth` command SHALL:
1. Discover pipelines via `discoverPipelines()`
2. Load each pipeline via jiti
3. Run synthesis (tree building + validation via the DSL)
4. Invoke the plan-compiler to produce Protobuf ExecutionPlan
5. Write serialized `.pb` files to the output directory (default: `dist/`)

Options: `-p, --pipeline <name>` (specific pipeline), `-o, --outdir <dir>` (output directory)

#### Scenario: Synth produces .pb file
- **WHEN** `isotope synth` is run in a project with one pipeline
- **THEN** it SHALL produce `dist/<pipeline-name>/plan.pb` containing the serialized ExecutionPlan

#### Scenario: Synth reports validation errors
- **WHEN** a pipeline has validation errors (orphan source, cycle)
- **THEN** `isotope synth` SHALL report the errors and exit with non-zero code

### Requirement: isotope dev command
The `isotope dev` command SHALL:
1. Run `isotope synth` to compile pipelines
2. Generate a Docker Compose configuration with Kafka KRaft and the Go runtime
3. Start the Docker Compose environment
4. Watch for TSX file changes and re-synth on change
5. Forward runtime logs to the terminal

#### Scenario: Dev starts environment
- **WHEN** `isotope dev` is run in a valid project
- **THEN** it SHALL start Kafka and the Go runtime, streaming logs to stdout

### Requirement: isotope inspect command
The `isotope inspect` command SHALL load a `.pb` file and display:
- Pipeline name and mode
- Operator list with types, parallelism, and execution strategy
- Edge list with shuffle strategies
- Schema definitions per operator
- Optional DAG visualization (Mermaid or ASCII)

Options: `--json` (machine-readable output), `--graph` (DAG visualization)

#### Scenario: Inspect shows operators
- **WHEN** `isotope inspect dist/my-pipeline/plan.pb` is run
- **THEN** it SHALL display a formatted list of operators with their types and connections

#### Scenario: Inspect JSON output
- **WHEN** `isotope inspect --json dist/my-pipeline/plan.pb` is run
- **THEN** it SHALL output a JSON object with operators, edges, and schemas
