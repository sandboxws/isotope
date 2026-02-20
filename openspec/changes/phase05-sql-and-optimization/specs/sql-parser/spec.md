## ADDED Requirements

### Requirement: Streaming SQL extensions
The SQL parser SHALL support streaming-specific syntax on top of vitess/sqlparser's MySQL dialect: `TUMBLE(time_column, INTERVAL 'N' UNIT)`, `HOP(time_column, INTERVAL 'N' UNIT, INTERVAL 'M' UNIT)`, `SESSION(time_column, INTERVAL 'N' UNIT)` as table-valued functions in GROUP BY clauses.

#### Scenario: Parse TUMBLE window in GROUP BY
- **WHEN** `SELECT user_id, COUNT(*) FROM events GROUP BY user_id, TUMBLE(ts, INTERVAL '5' MINUTE)` is parsed
- **THEN** the AST SHALL contain a TUMBLE function call with `time_column=ts` and `size=5 MINUTE`

### Requirement: Tier 1 SQL coverage
The parser SHALL support: SELECT with expressions, WHERE, GROUP BY with aggregates (SUM, COUNT, AVG, MIN, MAX, COUNT DISTINCT), HAVING, JOIN (INNER, LEFT, RIGHT, FULL), subqueries in WHERE (EXISTS, IN), ORDER BY, LIMIT, UNION ALL, and window functions (ROW_NUMBER, RANK, LAG, LEAD).

#### Scenario: Parse multi-table join
- **WHEN** `SELECT a.id, b.name FROM orders a JOIN customers b ON a.customer_id = b.id WHERE a.amount > 100` is parsed
- **THEN** the AST SHALL represent the JOIN, ON condition, filter, and projection correctly

### Requirement: Validation against registered schemas
The parser SHALL validate column references, table names, and function arguments against registered source schemas. Invalid references SHALL produce descriptive errors with line/column information.

#### Scenario: Invalid column reference
- **WHEN** a query references column `nonexistent_col` that doesn't exist in any registered table
- **THEN** the parser SHALL return an error: "Unknown column 'nonexistent_col' at line X, column Y"
