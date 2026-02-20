## ADDED Requirements

### Requirement: RawSQL TSX component via SQL layer
The `<RawSQL>` component SHALL accept a SQL string and compile it through the SQL layer (parse → logical plan → physical plan → Protobuf). The SQL SHALL be validated against input schemas at synth time.

#### Scenario: RawSQL compilation
- **WHEN** `<RawSQL>{`SELECT sensor_id, AVG(temp) FROM input GROUP BY sensor_id`}</RawSQL>` is used within a window
- **THEN** the plan-compiler SHALL parse the SQL, build a logical plan, and compile it to operator nodes in the Protobuf plan

### Requirement: Query TSX component for standalone SQL pipelines
The `<Query>` component SHALL accept a complete SQL query (with FROM clauses referencing registered sources) and compile the entire pipeline from SQL.

#### Scenario: SQL-driven pipeline
- **WHEN** `<Query sql="SELECT user_id, COUNT(*) FROM events GROUP BY user_id, TUMBLE(ts, INTERVAL '5' MINUTE)" />` is used
- **THEN** the compiler SHALL generate the complete pipeline: KafkaSource → Filter → Aggregate → output, from the SQL definition
