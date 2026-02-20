## ADDED Requirements

### Requirement: Filter operator
The Filter operator SHALL evaluate a SQL condition expression against each RecordBatch and emit only rows where the condition evaluates to true. It SHALL use Arrow compute boolean masking (not row iteration).

#### Scenario: Filter with simple condition
- **WHEN** a RecordBatch of 1000 rows is processed with condition `"country = 'US'"`
- **THEN** the output RecordBatch SHALL contain only rows where `country` equals `'US'`, preserving all columns

#### Scenario: Filter with no matching rows
- **WHEN** no rows match the filter condition
- **THEN** the operator SHALL emit an empty RecordBatch (zero rows, same schema) or no batch at all

### Requirement: Map operator
The Map operator SHALL evaluate a set of column mappings (`output_name` → `expression_sql`) against each RecordBatch, producing a new RecordBatch with the mapped columns. Columns not in the mapping SHALL be dropped.

#### Scenario: Map with column projection and expression
- **WHEN** a Map with columns `{user_id: "user_id", full_name: "CONCAT(first_name, ' ', last_name)"}` is applied
- **THEN** the output RecordBatch SHALL have exactly two columns: `user_id` (pass-through) and `full_name` (computed)

### Requirement: FlatMap operator
The FlatMap operator SHALL unnest an array/list column, producing one output row per element in the array for each input row. Non-array columns are repeated.

#### Scenario: Unnest array column
- **WHEN** a row has `tags: ["a", "b", "c"]` and non-array column `id: 1`
- **THEN** FlatMap SHALL produce 3 rows: `{id:1, tags:"a"}, {id:1, tags:"b"}, {id:1, tags:"c"}`

### Requirement: Rename operator
The Rename operator SHALL change column names without modifying data. It SHALL accept a mapping of `old_name → new_name`.

#### Scenario: Rename columns
- **WHEN** a RecordBatch with columns `[user_id, user_name]` is processed with mapping `{user_name: "name"}`
- **THEN** the output schema SHALL have columns `[user_id, name]` with identical data

### Requirement: Drop operator
The Drop operator SHALL remove specified columns from the RecordBatch, preserving all other columns.

#### Scenario: Drop columns
- **WHEN** a RecordBatch with columns `[id, name, email, password_hash]` is processed with `drop: ["password_hash"]`
- **THEN** the output SHALL have columns `[id, name, email]`

### Requirement: Cast operator
The Cast operator SHALL convert column types (e.g., Int32→Int64, String→Int64). It SHALL use Arrow's built-in cast functions.

#### Scenario: Cast string to integer
- **WHEN** a column `age: Utf8 ["25", "30"]` is cast to Int64
- **THEN** the output column SHALL be `age: Int64 [25, 30]`

### Requirement: Union operator
The Union operator SHALL merge RecordBatches from multiple upstream inputs into a single output stream. All inputs MUST have compatible schemas.

#### Scenario: Union two streams
- **WHEN** two upstream operators produce RecordBatches with identical schemas
- **THEN** the Union operator SHALL emit all batches from both inputs in arrival order

### Requirement: Route operator
The Route operator SHALL evaluate condition expressions for each branch and split the RecordBatch accordingly. Each row goes to the first matching branch, or the default branch if no condition matches.

#### Scenario: Route to multiple branches
- **WHEN** a RecordBatch has rows with `event_type` values `["purchase", "error", "view"]` and branches for `"purchase"` and `"error"`
- **THEN** purchase rows SHALL go to branch 1, error rows to branch 2, and view rows to the default branch

#### Scenario: Route with no default
- **WHEN** a Route has no default branch and a row matches no condition
- **THEN** the row SHALL be silently dropped
