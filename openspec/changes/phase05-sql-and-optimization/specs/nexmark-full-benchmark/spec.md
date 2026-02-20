## ADDED Requirements

### Requirement: Complete NEXMark q9-q22 via SQL
All remaining NEXMark queries (q9-q10, q13-q22) SHALL be implemented using the SQL layer. Queries SHALL be expressed as SQL strings compiled through the SQL parser and optimizer.

#### Scenario: NEXMark q9 (winning bids) via SQL
- **WHEN** q9 is expressed as a multi-way join SQL query
- **THEN** it SHALL compile to a valid execution plan and produce correct output

### Requirement: Full 22-query benchmark suite
The complete NEXMark benchmark (q0-q22) SHALL run as an automated suite, with correctness validation and performance measurements for all queries.

#### Scenario: Full benchmark execution
- **WHEN** `run-nexmark.sh` is executed
- **THEN** all 22 queries SHALL run sequentially with correctness and performance results published

### Requirement: SQL layer overhead comparison
The benchmark SHALL compare Phase 2's TSX-compiled NEXMark queries (q0-q8) against Phase 5's SQL-compiled versions of the same queries, measuring any overhead from the SQL compilation path.

#### Scenario: TSX vs SQL comparison
- **WHEN** q4 is run via both TSX-compiled and SQL-compiled paths
- **THEN** performance results SHALL be compared and any overhead documented
