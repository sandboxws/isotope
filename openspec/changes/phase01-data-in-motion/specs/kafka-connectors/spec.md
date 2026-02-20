## ADDED Requirements

### Requirement: Kafka source connector via franz-go
The Kafka source SHALL consume records from a Kafka topic using `twmb/franz-go`, deserialize them according to the configured format (JSON, Avro, Protobuf), and produce Arrow RecordBatches. It SHALL support consumer groups, partition assignment, and configurable startup mode (earliest, latest, timestamp).

#### Scenario: Consume from Kafka topic
- **WHEN** a KafkaSource is configured with `topic: "events"`, `bootstrap_servers: "localhost:9092"`, `format: "json"`
- **THEN** it SHALL consume records from the topic, deserialize JSON payloads, and emit Arrow RecordBatches matching the configured schema

#### Scenario: Consumer group offset management
- **WHEN** a KafkaSource is configured with `consumer_group: "isotope-pipeline-1"`
- **THEN** it SHALL commit offsets to Kafka, and on restart, resume from the last committed offset

#### Scenario: Startup mode from earliest
- **WHEN** `startup_mode: "earliest"` is configured and no committed offset exists
- **THEN** the source SHALL start consuming from the earliest available offset

### Requirement: Kafka sink connector via franz-go
The Kafka sink SHALL serialize Arrow RecordBatches to the configured format and produce records to a Kafka topic. It SHALL support key-based partitioning via `key_by` column.

#### Scenario: Produce to Kafka topic
- **WHEN** an Arrow RecordBatch is sent to a KafkaSink with `topic: "output"`, `format: "json"`
- **THEN** each row SHALL be serialized as a JSON record and produced to the topic

#### Scenario: Key-based partitioning
- **WHEN** `key_by: "user_id"` is configured
- **THEN** records with the same `user_id` value SHALL be produced to the same Kafka partition

### Requirement: Generator source
The Generator source SHALL produce synthetic Arrow RecordBatches at a configurable rate (`rows_per_second`) with auto-incrementing fields and timestamps. It SHALL support an optional `max_rows` limit.

#### Scenario: Generate at configured rate
- **WHEN** a GeneratorSource is configured with `rows_per_second: 10000`
- **THEN** it SHALL produce approximately 10,000 rows per second, batched into RecordBatches

#### Scenario: Stop at max rows
- **WHEN** `max_rows: 100000` is configured
- **THEN** the source SHALL stop producing after 100,000 total rows

### Requirement: Console sink
The Console sink SHALL print Arrow RecordBatches to stdout in a human-readable table format, limited to `max_rows` per batch for readability.

#### Scenario: Print to console
- **WHEN** a RecordBatch with 100 rows is sent to a ConsoleSink with `max_rows: 10`
- **THEN** the first 10 rows SHALL be printed as a formatted table with column headers
