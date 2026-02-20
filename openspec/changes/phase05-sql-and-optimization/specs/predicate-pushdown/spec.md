## ADDED Requirements

### Requirement: Push filters through joins
The optimizer SHALL push filter predicates below join operators where the predicate references columns from only one side of the join. This reduces the number of rows entering the join.

#### Scenario: Filter pushed below join
- **WHEN** `SELECT * FROM orders o JOIN customers c ON o.cid = c.id WHERE c.country = 'US'`
- **THEN** the optimizer SHALL push `c.country = 'US'` below the join, filtering customers before the join

### Requirement: Push filters into Parquet sources
For Parquet file sources, filter predicates on partition columns or columns with row-group statistics SHALL be pushed into the source for predicate pushdown (skip non-matching row groups).

#### Scenario: Parquet row group pruning
- **WHEN** a filter `amount > 1000` is applied to a Parquet source with row-group statistics showing max(amount)=500
- **THEN** the optimizer SHALL skip that row group entirely

### Requirement: Measurable data reduction
Predicate pushdown SHALL demonstrably reduce data scanned. The optimizer SHALL log the estimated selectivity and data reduction ratio.

#### Scenario: Data reduction logged
- **WHEN** predicate pushdown is applied
- **THEN** the optimizer SHALL log: "Predicate pushdown: estimated 95% of rows filtered before join"
