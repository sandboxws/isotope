## ADDED Requirements

### Requirement: JDBC source via pgx
The JDBC source SHALL read from a PostgreSQL table via `pgx`, producing Arrow RecordBatches. It SHALL support full table scans for bounded reads.

#### Scenario: Read from PostgreSQL table
- **WHEN** a JdbcSource is configured with `url: "postgres://localhost:5432/db"`, `table: "users"`
- **THEN** it SHALL read all rows from the `users` table and emit them as Arrow RecordBatches

### Requirement: JDBC sink with upsert mode
The JDBC sink SHALL write Arrow RecordBatches to a PostgreSQL table. In upsert mode, it SHALL use `INSERT ... ON CONFLICT (key_fields) DO UPDATE SET ...`.

#### Scenario: Upsert to PostgreSQL
- **WHEN** a JdbcSink is configured with `upsert_mode: true`, `key_fields: ["user_id"]`
- **THEN** records SHALL be upserted: new keys are inserted, existing keys are updated

#### Scenario: Append-only insert
- **WHEN** a JdbcSink is configured with `upsert_mode: false`
- **THEN** all records SHALL be inserted (duplicates cause constraint violations if keys conflict)
