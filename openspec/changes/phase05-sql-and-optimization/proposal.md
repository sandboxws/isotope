## Why

Phases 1-4 built a distributed streaming framework where operators are configured via Protobuf plans compiled from TSX. Phase 5 adds a SQL layer: users write SQL queries that are parsed, optimized, and compiled to the same Protobuf execution plans. This enables the full NEXMark benchmark suite (all 22 queries) and TPC-H stream adaptation. More importantly, the query optimizer (predicate pushdown, projection pruning, operator fusion) makes existing pipelines faster.

## What Changes

- Integrate vitess/sqlparser with streaming SQL extensions (TUMBLE, HOP, SESSION)
- Build a logical plan representation (relational algebra: Scan, Filter, Project, Aggregate, Join)
- Build logical → physical plan translation (parallelism, shuffle insertion)
- Implement query optimizer: predicate pushdown, projection pruning, operator fusion
- Implement basic cost model for join ordering
- Add `<RawSQL>` and `<Query>` TSX components backed by the SQL layer
- Complete NEXMark q9-q10, q13-q22 via SQL
- Implement TPC-H stream adaptation (Q1, Q3, Q5, Q6, Q10) with scale factor testing
- Write 9 documentation chapters under `docs/content/docs/sql-and-optimization/`

## Capabilities

### New Capabilities
- `sql-parser`: vitess/sqlparser integration with streaming SQL extensions (TUMBLE, HOP, SESSION, EMIT AFTER WATERMARK), AST construction and validation
- `logical-plan`: Relational algebra plan representation — Scan, Filter, Project, Aggregate, Join, Window, Sort, Limit nodes with schema propagation
- `physical-plan`: Logical → physical plan translation — parallelism assignment, shuffle insertion, plan fragment generation per Task Manager
- `predicate-pushdown`: Move filter expressions closer to sources, push predicates through joins, partition pruning for Parquet sources
- `projection-pruning`: Eliminate unused columns early in the plan, narrow schemas through the DAG, reduce memory and network transfer
- `operator-fusion`: Fuse adjacent stateless operators into single goroutines, reduce channel overhead, identify pipeline-breaking boundaries
- `cost-model`: Basic cardinality estimation, selectivity estimation for filters, join ordering based on estimated output size
- `sql-components`: `<RawSQL>` and `<Query>` TSX components that accept SQL strings and compile through the SQL layer
- `nexmark-full-benchmark`: Complete NEXMark q9-q22 via SQL layer, full 22-query benchmark suite
- `tpch-stream-benchmark`: TPC-H tables as Kafka topics, adapted queries Q1/Q3/Q5/Q6/Q10 at SF-1 and SF-10
- `sql-optimization-docs`: 9 documentation chapters covering SQL parsing, logical plan, physical plan, predicate pushdown, projection pruning, operator fusion, vectorized execution, cost model, full benchmarks

### Modified Capabilities

_None at spec level._

## Impact

- **New packages**: `runtime/pkg/sql/` (parser, planner, optimizer), `packages/dsl/src/components/` (Query, RawSQL updates)
- **New dependencies**: vitess/sqlparser (already used for expressions, now extended)
- **New benchmarks**: Full NEXMark (22 queries), TPC-H stream (5 queries at SF-1/SF-10)
- **Performance improvement**: Optimizer reduces data scanned, columns transferred, and goroutine count
- **New documentation**: `docs/content/docs/sql-and-optimization/` with 9 MDX chapters
