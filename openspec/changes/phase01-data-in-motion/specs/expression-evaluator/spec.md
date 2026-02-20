## ADDED Requirements

### Requirement: SQL expression parsing via vitess/sqlparser
The expression evaluator SHALL parse SQL expression strings using `vitess/sqlparser`, producing an AST that is walked to dispatch Arrow compute kernels. Supported expressions SHALL include column references, string/numeric literals, binary comparisons (`=`, `!=`, `>`, `<`, `>=`, `<=`), arithmetic (`+`, `-`, `*`, `/`, `%`), logical operators (`AND`, `OR`, `NOT`), and `IS NULL` / `IS NOT NULL`.

#### Scenario: Parse comparison expression
- **WHEN** the expression `"amount > 100"` is parsed against a schema containing column `amount: Int64`
- **THEN** the evaluator SHALL produce an Arrow boolean array by dispatching `compute.Greater(amount_col, scalar(100))`

#### Scenario: Parse compound logical expression
- **WHEN** the expression `"amount > 100 AND country = 'US'"` is parsed
- **THEN** the evaluator SHALL compose `compute.And(compute.Greater(...), compute.Equal(...))`

### Requirement: String function support
The evaluator SHALL support string functions: `UPPER(col)`, `LOWER(col)`, `TRIM(col)`, `CONCAT(a, b, ...)`, `SUBSTRING(col, start, len)`, `REGEXP_EXTRACT(col, pattern, group)`.

#### Scenario: UPPER function evaluation
- **WHEN** `UPPER(name)` is evaluated against a RecordBatch with column `name: ["alice", "bob"]`
- **THEN** the result SHALL be a Utf8 array `["ALICE", "BOB"]`

#### Scenario: REGEXP_EXTRACT evaluation
- **WHEN** `REGEXP_EXTRACT(url, '^https?://[^/]+(/.*)$', 1)` is evaluated
- **THEN** the result SHALL extract the path component from each URL string

### Requirement: CASE WHEN and COALESCE
The evaluator SHALL support `CASE WHEN condition THEN value [ELSE default] END` and `COALESCE(a, b, ...)` expressions.

#### Scenario: CASE WHEN with multiple branches
- **WHEN** `CASE WHEN status = 'active' THEN 1 WHEN status = 'pending' THEN 0 ELSE -1 END` is evaluated
- **THEN** the result SHALL be an Int64 array with values mapped according to the status column

#### Scenario: COALESCE with nullable columns
- **WHEN** `COALESCE(preferred_name, full_name, 'Unknown')` is evaluated where `preferred_name` has nulls
- **THEN** the result SHALL use `preferred_name` where non-null, then `full_name`, then the literal `'Unknown'`

### Requirement: Type coercion for mixed-type operations
The evaluator SHALL perform implicit type coercion following SQL rules: Int32 + Int64 → Int64, Int + Float → Float, numeric comparison with string literal → parse string as number.

#### Scenario: Mixed-type arithmetic
- **WHEN** `price * 1.1` is evaluated where `price` is Int64 and `1.1` is a float literal
- **THEN** the result SHALL be a Float64 array with `price` cast to Float64 before multiplication

### Requirement: Batch-level evaluation
All expression evaluation SHALL operate on entire Arrow columns (vectorized), not row-by-row. The evaluator SHALL accept an `arrow.Record` and return an `arrow.Array` (the result column).

#### Scenario: Vectorized filter evaluation
- **WHEN** a filter expression is evaluated on a RecordBatch of 4096 rows
- **THEN** the evaluator SHALL process all 4096 rows in a single Arrow compute call, not in a loop
