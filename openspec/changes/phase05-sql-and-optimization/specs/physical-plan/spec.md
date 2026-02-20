## ADDED Requirements

### Requirement: Logical to physical plan translation
The physical planner SHALL translate a logical plan into a physical plan with: parallelism per operator, shuffle strategy per edge (HASH for keyed ops, FORWARD for chains, BROADCAST for small sides), and execution strategy (ARROW_NATIVE or DUCKDB_MICRO_BATCH).

#### Scenario: Physical plan with shuffle insertion
- **WHEN** a logical plan has Scan → Filter → Aggregate(GROUP BY user_id)
- **THEN** the physical plan SHALL insert a HASH shuffle on `user_id` before the Aggregate

### Requirement: Plan fragment generation
For multi-node execution, the physical plan SHALL be split into fragments — one per Task Manager — connected by Flight shuffle edges.

#### Scenario: Plan fragments across 3 nodes
- **WHEN** a pipeline has parallelism 12 across 3 Task Managers
- **THEN** each TM SHALL receive a plan fragment with 4 operator instances and the necessary remote shuffle connections

### Requirement: Physical plan to ExecutionPlan Protobuf
The physical plan SHALL be serializable to the existing Protobuf `ExecutionPlan` format, so the Go runtime receives the same plan structure regardless of whether it was compiled from TSX or SQL.

#### Scenario: SQL-compiled plan identical format
- **WHEN** a SQL query is compiled to a physical plan
- **THEN** the resulting ExecutionPlan Protobuf SHALL be loadable by the same Go runtime plan loader used for TSX-compiled plans
