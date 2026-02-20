## 1. Pebble State Backend

- [ ] 1.1 Add `cockroachdb/pebble` dependency to `runtime/go.mod`
- [ ] 1.2 Implement Pebble initialization: open database, configure compaction, memtable sizing
- [ ] 1.3 Implement key-group encoding: `[operator_id | key_group | state_name | user_key]` with murmur3 hashing
- [ ] 1.4 Implement `ValueState[T]`: Get, Put, Delete with serialization via encoding/gob or custom codec
- [ ] 1.5 Implement `ListState[T]`: Append (sequential key suffix), Get (prefix scan), Clear
- [ ] 1.6 Implement `MapState[K,V]`: Put, Get, Keys (prefix scan), Delete with composite key encoding
- [ ] 1.7 Implement `ReducingState[T]`: Add (get-reduce-put), Get
- [ ] 1.8 Implement memory-backed state backend for tests (same interface, Go maps)
- [ ] 1.9 Implement `StatefulOperator` interface: `InitializeState`, `SnapshotState`, `RestoreState`
- [ ] 1.10 Benchmark: 1M keys get/put with p99 latency measurement, compaction impact
- [ ] 1.11 Write unit tests for all state abstractions with edge cases (empty state, large values, concurrent access)

## 2. Watermark System

- [ ] 2.1 Implement watermark generator: track max event_time per source, emit `max_event_time - max_delay`
- [ ] 2.2 Implement watermark propagation: forward watermarks through single-input operators
- [ ] 2.3 Implement min-watermark for multi-input operators (Union, Join): emit min(all_input_watermarks)
- [ ] 2.4 Implement watermark tracking per operator: `ProcessWatermark(wm)` callback on advancement
- [ ] 2.5 Implement idle source handling: exclude idle partitions from min-watermark after timeout
- [ ] 2.6 Add watermark to runtime metrics: current watermark per operator, watermark lag
- [ ] 2.7 Write integration tests: watermark propagation through multi-operator DAGs, idle handling

## 3. Tumble Window

- [ ] 3.1 Implement TumbleWindow assigner: assign record to fixed-size epoch-aligned window
- [ ] 3.2 Implement per-window Arrow RecordBatch accumulation buffer
- [ ] 3.3 Implement EventTimeTrigger: fire when watermark >= window.end
- [ ] 3.4 Implement window state eviction: delete state when watermark >= window.end + allowed_lateness
- [ ] 3.5 Wire tumble window with DuckDB micro-batch: on trigger → RegisterView(buffer) → SQL → emit
- [ ] 3.6 Write tests: correct window assignment, trigger timing, late data within allowed lateness, state cleanup

## 4. Slide Window

- [ ] 4.1 Implement SlideWindow assigner: assign record to ceil(size/slide) overlapping windows
- [ ] 4.2 Implement shared record references across overlapping windows
- [ ] 4.3 Implement independent trigger and eviction per slide window instance
- [ ] 4.4 Write tests: multi-window assignment, overlapping window results, memory usage comparison vs tumble

## 5. Session Window

- [ ] 5.1 Implement SessionWindow assigner: detect gaps, create new sessions per key
- [ ] 5.2 Implement session merge-on-arrival: find overlapping sessions, merge, update Pebble state
- [ ] 5.3 Implement cascading merge: handle late events that bridge multiple existing sessions
- [ ] 5.4 Implement session window trigger: fire on watermark >= session.end + gap
- [ ] 5.5 Implement session state cleanup: evict when watermark >= session.end + allowed_lateness + gap
- [ ] 5.6 Write extensive tests: gap detection, single merge, cascading merge, out-of-order events

## 6. Late Data Handling

- [ ] 6.1 Implement `allowed_lateness` configuration per window operator
- [ ] 6.2 Implement late record acceptance: records within allowed lateness update window and re-trigger
- [ ] 6.3 Implement side output: records beyond allowed lateness routed to configured side output
- [ ] 6.4 Implement retraction semantics: emit [-old_result, +new_result] on window re-fire
- [ ] 6.5 Write tests: late record within lateness, late record beyond lateness, retraction correctness

## 7. Windowed DuckDB Operators

- [ ] 7.1 Implement windowed Aggregate operator: accumulate → DuckDB SQL → emit on window trigger
- [ ] 7.2 Implement windowed TopN operator: accumulate → DuckDB ROW_NUMBER + QUALIFY → emit
- [ ] 7.3 Implement windowed HashJoin operator: accumulate both sides → DuckDB JOIN → emit
- [ ] 7.4 Implement non-windowed aggregate: configurable interval trigger → DuckDB partial aggregate → Pebble merge
- [ ] 7.5 Write tests: windowed aggregate correctness, TopN ranking, hash join with all join types

## 8. Arrow-Native Stateful Operators

- [ ] 8.1 Implement Deduplicate operator: per-key ValueState in Pebble, TTL via `within` parameter
- [ ] 8.2 Implement IntervalJoin: dual-side Pebble state, time-indexed, per-record probe, watermark cleanup
- [ ] 8.3 Implement TemporalJoin: versioned Pebble state keyed by [key|timestamp], reverse-scan lookup
- [ ] 8.4 Implement LookupJoin: async pgx queries, LRU cache with TTL, configurable concurrency
- [ ] 8.5 Write IntervalJoin tests: matching within bounds, no match, state cleanup on watermark, both-sides arrival order
- [ ] 8.6 Write TemporalJoin tests: version lookup correctness, INSERT/UPDATE/DELETE changelog
- [ ] 8.7 Write LookupJoin tests: cache hit/miss, TTL expiry, concurrent queries (mock database)

## 9. JDBC and File Connectors

- [ ] 9.1 Add `jackc/pgx/v5` dependency, implement JDBC source: table scan → Arrow RecordBatches
- [ ] 9.2 Implement JDBC sink: Arrow → pgx batch insert, upsert mode with ON CONFLICT
- [ ] 9.3 Implement Parquet file source: Arrow Go Parquet reader, predicate pushdown via row group stats
- [ ] 9.4 Implement Parquet file sink: Arrow Go Parquet writer, Hive-style partitioned writes
- [ ] 9.5 Write integration tests for JDBC (testcontainers-postgres) and Parquet (local file roundtrip)

## 10. NEXMark Benchmark

- [ ] 10.1 Implement NEXMark data generator: Person/Auction/Bid with configurable rate and temporal distribution
- [ ] 10.2 Implement q0 (passthrough): source → sink baseline
- [ ] 10.3 Implement q1 (currency conversion): Map with `price * 0.908`
- [ ] 10.4 Implement q2 (selection): Filter with range predicate
- [ ] 10.5 Implement q3 (local item suggestion): Person × Auction hash join + filter
- [ ] 10.6 Implement q4 (avg price per category): Join + tumble window + aggregate
- [ ] 10.7 Implement q5 (hot items): Sliding window + TopN
- [ ] 10.8 Implement q7 (highest bid): Tumble window + max aggregate
- [ ] 10.9 Implement q8 (monitor new users): Tumble window join Person × Auction
- [ ] 10.10 Implement q11 (user sessions): Session window
- [ ] 10.11 Implement q12 (processing time windows): Processing time semantics
- [ ] 10.12 Build validation harness: run Isotope and Flink on same deterministic input, compare outputs
- [ ] 10.13 Run benchmarks: measure throughput, state size, latency per query
- [ ] 10.14 Profile performance gaps vs Flink, document bottleneck analysis

## 11. Documentation (State & Time Chapters)

- [ ] 11.1 Create `docs/content/docs/state-and-time/index.mdx`: section landing page
- [ ] 11.2 Write `state-and-time/event-time-vs-processing.mdx`: time domains, ordering, why wall-clock is unreliable
- [ ] 11.3 Write `state-and-time/watermarks.mdx`: theory, generation strategies, propagation through DAGs
- [ ] 11.4 Write `state-and-time/lsm-trees.mdx`: memtable, SST levels, compaction, read/write amplification
- [ ] 11.5 Write `state-and-time/keyed-state.mdx`: state interface design, serialization, key encoding
- [ ] 11.6 Write `state-and-time/key-group-encoding.mdx`: key-group assignment, prefix scan, rescaling math
- [ ] 11.7 Write `state-and-time/tumble-windows.mdx`: fixed window assignment, accumulator, trigger
- [ ] 11.8 Write `state-and-time/slide-windows.mdx`: multi-window assignment, shared state optimization
- [ ] 11.9 Write `state-and-time/session-windows.mdx`: gap detection, merge-on-arrival, cascading merges
- [ ] 11.10 Write `state-and-time/late-data.mdx`: allowed lateness, retraction, update-and-retract semantics
- [ ] 11.11 Write `state-and-time/hash-joins.mdx`: build/probe phases, memory management
- [ ] 11.12 Write `state-and-time/interval-joins.mdx`: time bounds, state cleanup, watermark interaction
- [ ] 11.13 Write `state-and-time/temporal-joins.mdx`: versioned state, point-in-time lookup, changelog
- [ ] 11.14 Write `state-and-time/lookup-joins.mdx`: async I/O, LRU cache, cache invalidation
- [ ] 11.15 Write `state-and-time/nexmark-benchmark.mdx`: NEXMark data model, query results, profiling

## 12. Integration & Verification

- [ ] 12.1 Verify all 28 FlinkReactor example pipelines produce correct output on the Go runtime
- [ ] 12.2 Verify Pebble handles 1M keys with ≤10ms p99 get latency
- [ ] 12.3 Verify window state is correctly evicted after lateness expires (no memory leaks over 24h test)
- [ ] 12.4 Verify IntervalJoin produces identical output to Flink for order-payment join example
- [ ] 12.5 Verify NEXMark q0-q8, q11-q12 correctness against Flink reference
- [ ] 12.6 Verify NEXMark throughput and state-size measurements published per query
- [ ] 12.7 Verify all 14 documentation chapters build and render correctly
- [ ] 12.8 Run full test suite, fix any failures
