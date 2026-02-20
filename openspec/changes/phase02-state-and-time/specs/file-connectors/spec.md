## ADDED Requirements

### Requirement: Parquet file source
The file source SHALL read Parquet files via Arrow Go's Parquet module, producing Arrow RecordBatches. It SHALL support predicate pushdown to Parquet row group statistics.

#### Scenario: Read Parquet file
- **WHEN** a FileSource is configured with `path: "/data/events.parquet"`, `format: "parquet"`
- **THEN** it SHALL read the file and emit Arrow RecordBatches matching the file's schema

### Requirement: Parquet file sink with partitioning
The file sink SHALL write Arrow RecordBatches as Parquet files. It SHALL support partitioned writes (Hive-style: `column=value/` directories).

#### Scenario: Partitioned Parquet write
- **WHEN** a FileSink is configured with `format: "parquet"`, `partition_by: ["date"]`
- **THEN** output SHALL be written to directories like `date=2024-01-15/part-0001.parquet`

#### Scenario: Single file Parquet write
- **WHEN** a FileSink is configured without partitioning
- **THEN** all records SHALL be written to a single Parquet file
