## ADDED Requirements

### Requirement: Windowed aggregate via DuckDB
When an Aggregate operator is inside a window, it SHALL execute via DuckDB micro-batch: accumulate all window records as Arrow RecordBatches, on window fire register them as a DuckDB view "input", execute `SELECT ... GROUP BY ...`, and emit the result as Arrow.

#### Scenario: Tumble window aggregate
- **WHEN** a TumbleWindow(5 min) with Aggregate(groupBy=["product_id"], select={total: "SUM(amount)"}) fires
- **THEN** DuckDB SHALL execute `SELECT product_id, SUM(amount) AS total FROM input GROUP BY product_id` on the window's accumulated records

### Requirement: TopN via DuckDB
When a TopN operator is inside a window, it SHALL execute via DuckDB: `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...) QUALIFY rn <= N`.

#### Scenario: TopN within tumble window
- **WHEN** a TumbleWindow(1 hour) with TopN(n=5, partitionBy=["category"], orderBy="revenue DESC") fires
- **THEN** DuckDB SHALL execute the ROW_NUMBER + QUALIFY query and return the top 5 per category

### Requirement: Windowed HashJoin via DuckDB
When a HashJoin operator has both inputs bounded by the same window, it SHALL execute via DuckDB: load both sides as views, run `SELECT ... FROM left JOIN right ON ...`.

#### Scenario: Hash join within window
- **WHEN** a TumbleWindow contains a HashJoin of stream A and stream B on `a.id = b.id`
- **THEN** DuckDB SHALL register both sides as views and execute the JOIN SQL

### Requirement: Non-windowed aggregate with configurable interval
For global aggregations without explicit windows, the DuckDB micro-batch trigger SHALL fire on a configurable time interval (default: 1 second). Each micro-batch computes partial aggregates in DuckDB, which are merged with running state in Pebble.

#### Scenario: Running aggregate with 1-second micro-batch
- **WHEN** a non-windowed Aggregate runs with 1-second micro-batch interval
- **THEN** every second, accumulated records SHALL be flushed to DuckDB, partial aggregates computed, and merged with Pebble state
