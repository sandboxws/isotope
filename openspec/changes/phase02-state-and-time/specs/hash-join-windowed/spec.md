## ADDED Requirements

### Requirement: Hash join within window via DuckDB
When a HashJoin operator has both inputs bounded by the same window, the join SHALL execute via DuckDB micro-batch: both sides' window buffers are registered as DuckDB views, and a SQL JOIN is executed.

#### Scenario: Windowed hash join execution
- **WHEN** a TumbleWindow(5 min) fires with 10K records on left and 5K on right
- **THEN** DuckDB SHALL execute `SELECT ... FROM left_input JOIN right_input ON condition` and emit the result as Arrow RecordBatches

### Requirement: Join type support
The DuckDB hash join SHALL support INNER, LEFT, RIGHT, FULL, ANTI, and SEMI join types.

#### Scenario: Left join with nulls
- **WHEN** a LEFT join is executed and some left records have no match on the right
- **THEN** the result SHALL include those left records with NULL values for right-side columns

### Requirement: Broadcast hint optimization
When a `BroadcastHint` is set (BROADCAST_LEFT or BROADCAST_RIGHT), the smaller side SHALL be broadcast to all parallel instances of the other side, avoiding shuffle overhead.

#### Scenario: Broadcast small table
- **WHEN** BroadcastHint=BROADCAST_RIGHT and the right side has 100 records
- **THEN** the right side SHALL be broadcast to all parallel instances rather than hash-partitioned
