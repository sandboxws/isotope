## ADDED Requirements

### Requirement: Nine sql-and-optimization documentation chapters
The documentation site SHALL include 9 chapters under `docs/content/docs/sql-and-optimization/` covering SQL parsing, logical plans, physical plans, predicate pushdown, projection pruning, operator fusion, vectorized execution, cost models, and full benchmark results.

#### Scenario: All chapters exist
- **WHEN** Phase 5 is complete
- **THEN** the following MDX files SHALL exist: `sql-parsing.mdx`, `logical-plan.mdx`, `physical-plan.mdx`, `predicate-pushdown.mdx`, `projection-pruning.mdx`, `operator-fusion.mdx`, `vectorized-execution.mdx`, `cost-model.mdx`, `nexmark-full-and-tpch.mdx`

### Requirement: Section index page
A `docs/content/docs/sql-and-optimization/index.mdx` SHALL serve as the section landing page with the question "How does a stream processor compile and optimize queries?"

#### Scenario: Section navigation
- **WHEN** a user navigates to `/docs/sql-and-optimization`
- **THEN** they SHALL see the section overview with links to all 9 chapters
