## ADDED Requirements

### Requirement: Early column elimination
The optimizer SHALL identify columns that are never referenced downstream and eliminate them as early as possible in the plan. This reduces memory usage and network transfer in shuffles.

#### Scenario: Unused columns pruned
- **WHEN** a source has 20 columns but the query only uses 3
- **THEN** the optimizer SHALL insert a projection immediately after the source, dropping 17 columns

### Requirement: Projection through joins
The optimizer SHALL push projections below joins, ensuring each side of a join only carries columns needed by the join condition and downstream operators.

#### Scenario: Projection below join
- **WHEN** a join uses `ON a.id = b.id` and downstream only uses `a.name, b.total`
- **THEN** the left side SHALL carry only `id, name` and the right side only `id, total`

### Requirement: Schema narrowing metrics
The optimizer SHALL report memory savings from projection pruning: estimated bytes/row before and after pruning.

#### Scenario: Memory savings reported
- **WHEN** projection pruning reduces row width from 200 bytes to 40 bytes
- **THEN** the optimizer SHALL log the 80% memory reduction estimate
