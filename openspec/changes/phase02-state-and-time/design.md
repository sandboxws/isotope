## Context

Phase 1 established the stateless data path. Phase 2 adds state management and temporal semantics — the core of what makes a stream processor different from a batch processor. This involves:
1. A persistent state backend (Pebble LSM tree) with key-group encoding for future rescaling
2. Watermark generation, propagation, and tracking for event-time reasoning
3. Window semantics (tumble, slide, session) with watermark-driven triggers
4. Four join algorithms (hash, interval, temporal, lookup), each with different state patterns
5. Late data handling with retractions

The dual execution strategy from Phase 1 becomes critical here: windowed aggregates/joins run in DuckDB (window close = micro-batch boundary), while continuous operations (interval join, temporal join, dedup) run Arrow-native with Pebble state.

## Goals / Non-Goals

**Goals:**
- Pebble state backend with key-group encoding, 4 state abstractions (Value, List, Map, Reducing)
- All 3 window types: tumble, slide, session (with merge logic)
- All 4 join types: hash (windowed), interval, temporal, lookup
- Watermark system: generation, propagation, idle handling
- Late data: allowed lateness, side output, retractions
- DuckDB micro-batch path for windowed aggregate, TopN, windowed hash join
- JDBC and Parquet connectors
- NEXMark q0-q8, q11-q12 with correctness validation
- 14 documentation chapters

**Non-Goals:**
- Checkpointing and state snapshots (Phase 3) — state is persistent but not checkpoint-recoverable yet
- Multi-node distribution (Phase 4) — all operators run in a single process
- SQL query compilation (Phase 5) — operators are configured via Protobuf plan, not parsed from SQL
- Processing-time windows beyond q12 proof-of-concept
- Incremental state snapshots — full snapshots only (Phase 3)

## Decisions

### Decision 1: Pebble over RocksDB for state backend

**Choice:** Pebble (cockroachdb/pebble) as the default LSM tree state backend.

**Rationale:** Pebble is pure Go — no CGO dependency (DuckDB already brings CGO). It's maintained by CockroachDB and designed for Go's concurrency model. It supports `Checkpoint()` which creates a hardlinked snapshot in ~1ms — critical for Phase 3 checkpointing. The API is simpler than RocksDB's Go bindings.

**Alternatives considered:**
- RocksDB (gorocksdb) — proven in Flink, but CGO-based, complex build, two CGO deps would be painful
- BadgerDB — pure Go but different design (value-log separation), less suitable for range scans
- BoltDB/bbolt — B+ tree, not LSM — worse write amplification for streaming workloads

### Decision 2: Key-group encoding for state keys

**Choice:** State keys use composite encoding: `[operator_id(4B) | key_group(2B) | state_name(var) | user_key(var)]`.

**Rationale:** Key-groups enable state redistribution during rescaling (Phase 4). The key-group is `murmur3(user_key) % max_key_groups` (default: 128). At rescale time, key-group ranges are reassigned to new operator instances. Prefix scans efficiently iterate all state for a key-group range.

**Tradeoff:** Extra 6 bytes per key. At 1M keys, this is ~6MB overhead — negligible vs the value data.

### Decision 3: DuckDB for windowed stateful operators, Pebble for continuous stateful operators

**Choice:** Operators with natural batch boundaries (windowed aggregate, TopN, windowed hash join) use DuckDB. Operators with continuous per-record state (interval join, temporal join, dedup) use Arrow-native + Pebble.

**Rationale:** A window close event creates a natural "micro-batch" of all records in that window — perfect for DuckDB's SQL execution. Continuous operators process records as they arrive with no bounded set. Loading/unloading DuckDB per record would add unacceptable overhead.

### Decision 4: Session window merge-on-arrival algorithm

**Choice:** When a new record arrives for a session window, the system: (1) finds all existing sessions that the record could extend (within gap distance), (2) merges all found sessions plus the new record into a single session, (3) updates Pebble state atomically.

**Rationale:** This handles the difficult case where a late record bridges two previously separate sessions. The alternative (deferred merge on watermark) is simpler but can produce incorrect intermediate results.

### Decision 5: Retraction semantics for late window updates

**Choice:** When a window re-fires due to late data, emit `[-old_result, +new_result]` as a retraction pair.

**Rationale:** Downstream operators (sinks, further aggregations) need to know the previous result was superseded. Without retractions, downstream state would double-count. This matches Flink's retract stream semantics.

**Tradeoff:** Doubles output volume for late-data scenarios. Downstream operators must handle retractions.

### Decision 6: Async pgx for lookup join

**Choice:** `jackc/pgx/v5` with connection pooling and async query execution for LookupJoin.

**Rationale:** pgx is the most performant pure-Go PostgreSQL driver. Async queries with configurable concurrency (`async_capacity`) prevent a slow database from blocking the pipeline. LRU cache reduces database round-trips for hot keys.

## Risks / Trade-offs

- **Session window merge is the hardest algorithm** → Budget 2 weeks. Cascading merges when a late event bridges multiple sessions require careful state management. Test extensively with out-of-order data.
- **IntervalJoin state management** → Both sides stored with time index, efficient probing within time bounds, watermark cleanup. This is the most complex state pattern. Start with a correct but slow implementation, optimize later.
- **Watermark propagation bugs** → Too fast: windows fire prematurely (data loss). Too slow: windows never fire (infinite state). Add watermark tracking to metrics/logging.
- **Pebble compaction stalls** → Under sustained write pressure, periodic latency spikes during L0→L1 compaction. Mitigate with compaction rate tuning and pre-warmed memtables.
- **DuckDB memory for large windows** → A 10-minute window at 100K events/sec = 60M records. DuckDB memory limit prevents OOM but query may fail. Need batched aggregation for very large windows.
- **NEXMark correctness validation is manual** → Comparing Isotope vs Flink output requires running both on identical input. Build a validation harness that generates deterministic input.

## Open Questions

- Should Pebble instances be shared across operators (one DB, prefix-separated) or one DB per operator (simpler isolation, more file handles)?
- For session window merges, should we use a timer-based cleanup or watermark-based only?
- Should the retraction protocol be opt-in (operators that support it) or always-on?
- For NEXMark validation, should we use pre-recorded input files (deterministic) or live Kafka (more realistic)?
