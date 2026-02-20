## 1. SQL Parser Extensions

- [ ] 1.1 Fork/vendor vitess/sqlparser at a pinned version
- [ ] 1.2 Add TUMBLE(column, INTERVAL) as a recognized table-valued function in GROUP BY
- [ ] 1.3 Add HOP(column, INTERVAL, INTERVAL) as a recognized table-valued function
- [ ] 1.4 Add SESSION(column, INTERVAL) as a recognized table-valued function
- [ ] 1.5 Implement schema registry: register source schemas for validation
- [ ] 1.6 Implement column reference validation against registered schemas
- [ ] 1.7 Write parser tests: SELECT, WHERE, GROUP BY, JOIN, window functions, TUMBLE/HOP/SESSION

## 2. Logical Plan

- [ ] 2.1 Define logical plan node types: Scan, Filter, Project, Aggregate, Join, Window, Sort, Limit
- [ ] 2.2 Implement schema propagation through logical plan nodes
- [ ] 2.3 Implement SQL AST → logical plan builder for SELECT/WHERE/GROUP BY
- [ ] 2.4 Implement SQL AST → logical plan builder for JOINs (INNER, LEFT, RIGHT, FULL)
- [ ] 2.5 Implement SQL AST → logical plan builder for window functions (ROW_NUMBER, RANK)
- [ ] 2.6 Implement SQL AST → logical plan builder for TUMBLE/HOP/SESSION windows
- [ ] 2.7 Implement SQL AST → logical plan builder for subqueries (EXISTS, IN)
- [ ] 2.8 Write tests: plan construction correctness, schema propagation

## 3. Query Optimizer

- [ ] 3.1 Implement predicate pushdown: push filters below joins where predicate references single side
- [ ] 3.2 Implement predicate pushdown: push filters into Parquet sources for row-group pruning
- [ ] 3.3 Implement projection pruning: identify unused columns, insert early projections
- [ ] 3.4 Implement projection below joins: narrow each side to needed columns
- [ ] 3.5 Implement operator fusion: detect stateless chains, fuse into single operators
- [ ] 3.6 Implement fusion boundary detection: stop at shuffles, stateful ops, strategy changes
- [ ] 3.7 Implement optimizer logging: log applied rules, estimated selectivity, data reduction ratios
- [ ] 3.8 Write optimizer tests: before/after plan comparison for each rule

## 4. Cost Model

- [ ] 4.1 Implement cardinality estimator: source cardinality from Kafka lag or Parquet metadata
- [ ] 4.2 Implement selectivity heuristics: equality=0.1, range=0.3, LIKE=0.2, default=0.5
- [ ] 4.3 Implement join selectivity estimation based on key cardinality
- [ ] 4.4 Implement join ordering: enumerate join orders for ≤6 tables, select minimum intermediate size
- [ ] 4.5 Write tests: cardinality estimation accuracy, join ordering correctness

## 5. Physical Plan

- [ ] 5.1 Implement logical → physical plan translation: assign parallelism per operator
- [ ] 5.2 Implement shuffle insertion: HASH for keyed ops, FORWARD for chains, BROADCAST for small sides
- [ ] 5.3 Implement execution strategy assignment: ARROW_NATIVE vs DUCKDB_MICRO_BATCH per operator
- [ ] 5.4 Implement physical plan → Protobuf ExecutionPlan serialization
- [ ] 5.5 Implement plan fragment generation for multi-node execution
- [ ] 5.6 Write tests: physical plan correctness, Protobuf roundtrip

## 6. SQL TSX Components

- [ ] 6.1 Implement `<RawSQL>` component: SQL string → SQL layer compilation → operators in plan
- [ ] 6.2 Implement `<Query>` component: standalone SQL → complete pipeline compilation
- [ ] 6.3 Wire SQL components into the plan-compiler's ConstructNode processing
- [ ] 6.4 Write tests: RawSQL within window, Query standalone, schema validation errors

## 7. NEXMark Full Benchmark (q9-q22)

- [ ] 7.1 Implement q9 (winning bids): multi-way join via SQL
- [ ] 7.2 Implement q10 (log to GCS): filter + aggregation via SQL
- [ ] 7.3 Implement q13 (bounded side input): hybrid bounded/unbounded join via SQL
- [ ] 7.4 Implement q14-q18: extended NEXMark queries via SQL
- [ ] 7.5 Implement q19-q22: complex NEXMark queries via SQL
- [ ] 7.6 Run full 22-query benchmark: correctness validation for all queries
- [ ] 7.7 Compare TSX-compiled vs SQL-compiled performance for q0-q8 overlap
- [ ] 7.8 Publish full NEXMark results with query plan visualizations

## 8. TPC-H Stream Benchmark

- [ ] 8.1 Implement TPC-H data generator: dbgen output → Kafka topics for all 8 tables
- [ ] 8.2 Implement TPC-H Q1 (pricing summary): tumble window aggregate on lineitem
- [ ] 8.3 Implement TPC-H Q3 (shipping priority): 3-table join (customer × orders × lineitem)
- [ ] 8.4 Implement TPC-H Q5 (local supplier volume): 6-table join + aggregate
- [ ] 8.5 Implement TPC-H Q6 (forecasting revenue): filter + sum on lineitem
- [ ] 8.6 Implement TPC-H Q10 (returned items): join + filter + aggregate
- [ ] 8.7 Run at SF-1 and SF-10, measure throughput and correctness
- [ ] 8.8 Measure optimizer impact: run each query with/without optimization, compute speedup ratios
- [ ] 8.9 Generate before/after query plan visualizations
- [ ] 8.10 Publish TPC-H results in documentation

## 9. Documentation (SQL & Optimization Chapters)

- [ ] 9.1 Create `docs/content/docs/sql-and-optimization/index.mdx`: section landing page
- [ ] 9.2 Write `sql-and-optimization/sql-parsing.mdx`: tokenizer, recursive descent, Pratt parsing, AST design
- [ ] 9.3 Write `sql-and-optimization/logical-plan.mdx`: relational algebra, plan nodes, equivalence rules
- [ ] 9.4 Write `sql-and-optimization/physical-plan.mdx`: parallelism, shuffle insertion, plan fragments
- [ ] 9.5 Write `sql-and-optimization/predicate-pushdown.mdx`: filter reordering, pushing through joins
- [ ] 9.6 Write `sql-and-optimization/projection-pruning.mdx`: column elimination, early projection
- [ ] 9.7 Write `sql-and-optimization/operator-fusion.mdx`: chaining stateless ops, pipeline breaking
- [ ] 9.8 Write `sql-and-optimization/vectorized-execution.mdx`: column-at-a-time, SIMD, selection vectors
- [ ] 9.9 Write `sql-and-optimization/cost-model.mdx`: cardinality estimation, histogram statistics
- [ ] 9.10 Write `sql-and-optimization/nexmark-full-and-tpch.mdx`: full results, optimizer impact, visualizations

## 10. Integration & Verification

- [ ] 10.1 Verify SQL: `SELECT user_id, COUNT(*) FROM events GROUP BY user_id, TUMBLE(ts, INTERVAL '5' MINUTE)` produces correct results
- [ ] 10.2 Verify predicate pushdown reduces data scanned from Parquet source
- [ ] 10.3 Verify operator fusion reduces goroutine count for chained stateless operators
- [ ] 10.4 Verify all 22 NEXMark queries produce correct output via SQL
- [ ] 10.5 Verify TPC-H Q1, Q3, Q5, Q6, Q10 produce correct output at SF-1
- [ ] 10.6 Verify optimizer impact: ≥2x speedup on at least 3 TPC-H queries
- [ ] 10.7 Verify query plan visualizations published (before/after optimization)
- [ ] 10.8 Verify all 9 documentation chapters build and render correctly
- [ ] 10.9 Run full test suite
