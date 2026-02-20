## ADDED Requirements

### Requirement: Cardinality estimation
The cost model SHALL estimate output cardinality for each plan node based on: source cardinality (from Kafka lag or Parquet metadata), filter selectivity (heuristic: equality = 0.1, range = 0.3, default = 0.5), and join selectivity (based on key cardinality estimates).

#### Scenario: Filter selectivity estimation
- **WHEN** a filter `country = 'US'` is applied to a source with estimated 1M rows
- **THEN** the cost model SHALL estimate output cardinality as ~100K (0.1 selectivity for equality)

### Requirement: Join ordering
For multi-way joins (3+ tables), the cost model SHALL determine join order by minimizing estimated intermediate result sizes. Smaller tables SHALL be joined first.

#### Scenario: Three-table join ordering
- **WHEN** tables A (1M rows), B (10K rows), C (100K rows) are joined: A⋈B⋈C
- **THEN** the cost model SHALL choose B⋈C first (smaller intermediate), then join with A

### Requirement: Cost-based optimization impact
The cost model SHALL improve at least 3 TPC-H queries by ≥2x via better join ordering or pushed predicates compared to the naive unoptimized plan.

#### Scenario: Measurable optimization
- **WHEN** TPC-H Q5 (6-table join) is optimized
- **THEN** the optimized plan SHALL execute at least 2x faster than the unoptimized plan
