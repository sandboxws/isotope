## ADDED Requirements

### Requirement: TPC-H table generators
The benchmark SHALL include generators that produce TPC-H tables (lineitem, orders, customer, nation, region, part, partsupp, supplier) as append-only Kafka topic streams. Generators SHALL support scale factors SF-1 (1GB) and SF-10 (10GB).

#### Scenario: Generate TPC-H at SF-1
- **WHEN** the TPC-H generator runs at SF-1
- **THEN** approximately 6M lineitem, 1.5M orders, and 150K customer records SHALL be produced to Kafka

### Requirement: Adapted TPC-H queries
The benchmark SHALL implement 5 TPC-H queries adapted for streaming: Q1 (pricing summary — tumble window aggregate), Q3 (shipping priority — 3-table join), Q5 (local supplier volume — 6-table join + aggregate), Q6 (forecasting revenue — filter + sum), Q10 (returned items — join + filter + aggregate).

#### Scenario: TPC-H Q5 with 6-table join
- **WHEN** TPC-H Q5 is executed via the SQL layer
- **THEN** the optimizer SHALL determine join order and the query SHALL produce correct aggregation results

### Requirement: Optimizer impact measurement
Each TPC-H query SHALL be run with and without optimization (predicate pushdown, projection pruning, operator fusion). Speedup ratios SHALL be published with before/after query plan visualizations.

#### Scenario: Optimizer speedup documented
- **WHEN** Q3 runs with and without predicate pushdown
- **THEN** the speedup ratio SHALL be measured and the before/after query plans SHALL be visualized in documentation
