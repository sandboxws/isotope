## ADDED Requirements

### Requirement: isotope new command
The `isotope new <project-name>` CLI command SHALL scaffold a new Isotope project with the standard directory structure: `src/` for pipeline TSX files, `package.json` with `@isotope/dsl` dependency, `tsconfig.json` with JSX configuration, and a sample pipeline file.

#### Scenario: Scaffold new project
- **WHEN** `isotope new my-pipeline` is run
- **THEN** a directory `my-pipeline/` SHALL be created with `src/pipeline.tsx` (sample), `package.json`, `tsconfig.json`, and a `.gitignore`

### Requirement: isotope synth command
The `isotope synth` CLI command SHALL compile all TSX pipeline files in the project to Protobuf `ExecutionPlan` binary files. It SHALL run the JSX runtime, build the ConstructNode tree, invoke the plan-compiler, and write serialized `.pb` files to a `build/` directory.

#### Scenario: Compile a single pipeline
- **WHEN** `isotope synth` is run in a project with `src/pipeline.tsx`
- **THEN** a file `build/pipeline.pb` SHALL be created containing the serialized ExecutionPlan

#### Scenario: Compilation error reporting
- **WHEN** a pipeline has a schema mismatch (e.g., Filter references non-existent column)
- **THEN** the CLI SHALL print an error with the TSX file, line number, and a description of the mismatch

### Requirement: isotope dev command
The `isotope dev` CLI command SHALL start a local development environment using Docker Compose: Kafka (KRaft mode, no ZooKeeper), the Go runtime with the compiled plan, and optionally Prometheus + Grafana for metrics.

#### Scenario: Start dev environment
- **WHEN** `isotope dev` is run after `isotope synth`
- **THEN** Docker Compose SHALL start Kafka and the Go runtime, and the pipeline SHALL begin processing data

#### Scenario: Hot reload on source change
- **WHEN** a TSX pipeline file is modified while `isotope dev` is running
- **THEN** the CLI SHALL re-run `synth`, restart the runtime container with the new plan, and log the reload

### Requirement: isotope inspect command
The `isotope inspect` CLI command SHALL dump information about a compiled plan: operator list with types and parallelism, edge list with shuffle strategies, schema per operator, execution strategy per operator, and an ASCII DAG visualization.

#### Scenario: Inspect compiled plan
- **WHEN** `isotope inspect build/pipeline.pb` is run
- **THEN** the CLI SHALL print the operator list, edges, schemas, and a DAG visualization to stdout

#### Scenario: Inspect with JSON output
- **WHEN** `isotope inspect --json build/pipeline.pb` is run
- **THEN** the CLI SHALL output a JSON representation of the execution plan
