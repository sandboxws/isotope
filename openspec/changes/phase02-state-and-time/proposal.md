## Why

After Phase 1 establishes the stateless data path, the runtime needs to remember things and reason about time. Every meaningful streaming operation — windowed aggregations, joins, deduplication — requires state management and temporal semantics. Without state, you can only filter and project. Without watermarks and event time, you can't know when a window is complete. This is the phase where Isotope becomes a real streaming engine.

This phase introduces Pebble (LSM tree) as the state backend, watermark-driven windowing (tumble, slide, session), four join types (hash, interval, temporal, lookup), and the NEXMark benchmark for correctness and performance validation.

## What Changes

- Integrate Pebble as the state backend with key-group encoding for future rescaling
- Implement `ValueState[T]`, `ListState[T]`, `MapState[K,V]`, `ReducingState[T]` state abstractions
- Implement watermark generation, propagation, and tracking through the operator DAG
- Implement TumbleWindow, SlideWindow, and SessionWindow assigners with watermark-driven triggers
- Implement late data handling: allowed lateness, side output
- Implement stateful DuckDB micro-batch operators: windowed Aggregate, TopN, windowed HashJoin
- Implement Arrow-native + Pebble operators: Deduplicate, IntervalJoin, TemporalJoin, LookupJoin
- Add JDBC source/sink connectors (PostgreSQL via pgx) and File source/sink (Parquet via Arrow Go)
- Implement the NEXMark benchmark (q0-q8, q11-q12) with data generators and correctness validation
- Write 14 documentation chapters under `docs/content/docs/state-and-time/`

## Capabilities

### New Capabilities
- `pebble-state-backend`: Pebble LSM tree integration with key-group encoding, ValueState, ListState, MapState, ReducingState, state serialization, memory-backed state for tests
- `watermark-system`: Watermark generation from event-time columns, propagation through DAG (min-watermark for multi-input operators), watermark tracking and advancement
- `tumble-window`: Fixed-size tumble window assigner, per-window state accumulation in Pebble, watermark-driven trigger (EventTimeTrigger), state eviction after window + lateness expires
- `slide-window`: Overlapping slide window assigner with size and slide parameters, multi-window assignment per record, shared state optimization
- `session-window`: Gap-based session window assigner, dynamic window merging when late events bridge sessions, merge-on-arrival algorithm
- `late-data-handling`: Allowed lateness configuration, side output for late records, retraction/update semantics for updated window results
- `windowed-duckdb-operators`: Windowed Aggregate via DuckDB (GROUP BY + SUM/COUNT/AVG on window batch), TopN via DuckDB (ROW_NUMBER QUALIFY), windowed HashJoin via DuckDB (load both sides, run JOIN)
- `interval-join`: Time-bounded join with Pebble state (Arrow-native), watermark-driven state cleanup, configurable lower/upper bounds
- `temporal-join`: Point-in-time versioned state join (Arrow-native + Pebble), changelog semantics
- `lookup-join`: Async JDBC lookup via pgx with LRU cache (Arrow-native), configurable cache TTL and capacity
- `hash-join-windowed`: Hash join within window boundaries via DuckDB micro-batch (both sides loaded, SQL JOIN executed)
- `jdbc-connectors`: JDBC source/sink via pgx (PostgreSQL) — table scan source, upsert/append sink with key fields
- `file-connectors`: Parquet file source/sink via Arrow Go Parquet — partitioned writes, predicate pushdown reads
- `nexmark-benchmark`: NEXMark data generator (Person/Auction/Bid), queries q0-q8 + q11-q12 as Isotope pipelines, correctness validation against Flink reference, performance measurements
- `state-and-time-docs`: 14 documentation chapters covering event time, watermarks, LSM trees, keyed state, key-group encoding, all window types, late data, all join types, NEXMark benchmark

### Modified Capabilities

_None — Phase 1 capabilities are extended, not modified at the spec level._

## Impact

- **Modified directories**: `runtime/pkg/` (new packages: state/, window/, watermark/, checkpoint/ stubs, connector/jdbc/, connector/file/)
- **New dependencies**: `cockroachdb/pebble`, `jackc/pgx/v5`, `apache/arrow/go` Parquet module
- **New documentation**: `docs/content/docs/state-and-time/` with 14 MDX chapters
- **Benchmark infrastructure**: `docker/benchmark/generators/nexmark-generator/`, NEXMark pipeline implementations
- **Runtime interface change**: Operators implementing `StatefulOperator` interface (extends `Operator` with `InitializeState`, `SnapshotState`, `RestoreState`)
