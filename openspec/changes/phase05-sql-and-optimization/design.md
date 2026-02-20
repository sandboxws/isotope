## Context

Phases 1-4 built a distributed streaming framework configured via Protobuf plans compiled from TSX. Phase 5 adds a SQL compilation layer: SQL queries are parsed, converted to logical plans (relational algebra), optimized, and compiled to the same Protobuf execution plans. This enables users who prefer SQL over TSX, completes the NEXMark benchmark suite, and adds query optimization that benefits all pipelines.

The expression evaluator from Phase 1 already uses vitess/sqlparser for individual expressions. Phase 5 extends this to full SQL queries: SELECT, WHERE, GROUP BY, JOIN, window functions, and streaming-specific extensions (TUMBLE, HOP, SESSION).

## Goals / Non-Goals

**Goals:**
- SQL parser with streaming extensions (TUMBLE, HOP, SESSION)
- Logical plan representation (relational algebra nodes)
- Physical plan generation (parallelism, shuffle, execution strategy)
- Query optimizer: predicate pushdown, projection pruning, operator fusion
- Basic cost model for join ordering
- `<RawSQL>` and `<Query>` TSX components
- Full NEXMark (all 22 queries) via SQL
- TPC-H stream adaptation (Q1, Q3, Q5, Q6, Q10) at SF-1 and SF-10
- Optimizer impact: ≥2x speedup on at least 3 TPC-H queries
- 9 documentation chapters

**Non-Goals:**
- Full ANSI SQL compliance — Tier 1 coverage (SELECT/WHERE/GROUP BY/JOIN/window functions)
- CTEs (WITH clauses) — complex to implement, low priority
- Materialized views — this is a streaming framework, not a streaming database
- Adaptive query optimization (re-optimize during execution) — static optimization only
- User-defined functions via SQL (custom UDFs) — use Go API or TSX for custom logic

## Decisions

### Decision 1: Extend vitess/sqlparser (not build a custom parser)

**Choice:** Fork/extend vitess/sqlparser to support TUMBLE, HOP, SESSION as special table-valued functions.

**Rationale:** vitess/sqlparser is already used for expression evaluation. Extending it for full SQL parsing avoids maintaining two parsers. The MySQL dialect covers most of the SQL we need. Streaming extensions (TUMBLE, HOP, SESSION) can be added as special function calls in the GROUP BY clause.

**Tradeoff:** MySQL dialect means some ANSI SQL syntax isn't supported. vitess/sqlparser updates may conflict with our extensions. Pin to a specific version and document divergences.

**Alternatives considered:**
- Custom recursive descent parser — full control but months of work, bugs, and edge cases
- cockroachdb/cockroach parser — PostgreSQL dialect, more complete but much heavier dependency
- go-mysql-server parser — lighter than cockroach but less battle-tested

### Decision 2: Rule-based optimizer (not cost-based for most rules)

**Choice:** Predicate pushdown, projection pruning, and operator fusion are rule-based (always applied). Only join ordering uses the cost model.

**Rationale:** Rule-based optimizations like predicate pushdown are always beneficial — there's no scenario where pushing a filter closer to the source makes things worse. Cost-based optimization is needed for join ordering because the best order depends on data statistics. Starting with a simple cost model (heuristic selectivity) and upgrading later is the right approach.

**Tradeoff:** The cost model's heuristic selectivities (equality = 0.1, range = 0.3) may be wildly wrong for specific datasets. But even a bad cost model is better than no cost model for multi-way joins.

### Decision 3: Same Protobuf output for SQL and TSX paths

**Choice:** SQL-compiled plans produce the exact same Protobuf `ExecutionPlan` format as TSX-compiled plans. The Go runtime doesn't know or care which path produced the plan.

**Rationale:** This keeps the runtime simple — one plan format, one execution path. It also enables gradual migration: users can write some pipelines in TSX and some in SQL, and they all run on the same runtime.

### Decision 4: Optimizer as plan-to-plan transformation

**Choice:** The optimizer takes a logical plan and produces an optimized logical plan. It doesn't modify the physical plan or runtime behavior directly.

**Rationale:** Clean separation of concerns. The optimizer's job is to find the best logical plan. The physical planner's job is to translate it to a physical plan. The runtime's job is to execute it. This makes each component testable in isolation.

### Decision 5: Vectorized execution chapter as theory (not new runtime changes)

**Choice:** The `vectorized-execution.mdx` chapter documents the theory of vectorized execution and how Arrow's columnar model enables it. No new runtime changes beyond what Phase 1 already implemented.

**Rationale:** The Arrow-native operators from Phase 1 already use vectorized execution (column-at-a-time processing). The chapter explains the theory: why it's faster, how SIMD can be applied, comparison with tuple-at-a-time models (Volcano). This is educational content, not new code.

## Risks / Trade-offs

- **SQL scope creep** → Users expect every SQL query that works in Flink/PostgreSQL to work here. Scope strictly to Tier 1 coverage. Document what's NOT supported and why.
- **vitess/sqlparser extension complexity** → Adding TUMBLE/HOP/SESSION requires understanding the parser internals. Budget 2 weeks for parser work.
- **Cost model without statistics** → Streaming sources don't have table statistics. Heuristic selectivities may produce bad join orders. Accept this and document as a known limitation.
- **TPC-H Q5 (6-table join) may be extremely slow without good optimization** → The unoptimized plan may be unusable. This is the point — it forces building a real optimizer.
- **22 NEXMark queries is a lot of SQL to validate** → Build an automated test harness that runs all queries and compares output.

## Open Questions

- Should the SQL parser support CREATE TABLE statements for source/sink registration, or should sources always be registered via TSX/config?
- Should we support INSERT INTO ... SELECT for the SQL-to-sink compilation?
- For the cost model: should we sample Kafka topics to estimate cardinality, or use static hints?
- Should operator fusion be done in the logical plan or the physical plan?
