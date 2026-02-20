## ADDED Requirements

### Requirement: Relational algebra plan nodes
The logical plan SHALL represent queries as a tree of relational algebra nodes: Scan (table source), Filter (WHERE), Project (SELECT), Aggregate (GROUP BY), Join (all types), Window (TUMBLE/HOP/SESSION), Sort (ORDER BY), Limit. Each node SHALL carry input/output schema information.

#### Scenario: Build logical plan from SQL
- **WHEN** `SELECT user_id, SUM(amount) FROM orders WHERE country='US' GROUP BY user_id` is compiled
- **THEN** the logical plan SHALL be: Scan(orders) → Filter(country='US') → Aggregate(GROUP BY user_id, SUM(amount)) → Project(user_id, sum_amount)

### Requirement: Schema propagation through plan
Each logical plan node SHALL compute its output schema from its input schema and operation. Schema mismatches SHALL be detected at plan construction time.

#### Scenario: Schema inference through filter and project
- **WHEN** a Filter node preserves all columns and a Project node selects 2 of 5 columns
- **THEN** the plan nodes SHALL correctly propagate schema changes through the tree

### Requirement: Equivalence rules for optimization
The logical plan SHALL support transformation rules: filter pushdown (Filter ↔ Join reordering), projection pushdown (Project below Join), and aggregate decomposition (partial + final aggregate).

#### Scenario: Equivalent plan generation
- **WHEN** the optimizer applies filter pushdown to `Scan → Join → Filter`
- **THEN** it SHALL produce `Scan → Filter → Join` (filter moved below join)
