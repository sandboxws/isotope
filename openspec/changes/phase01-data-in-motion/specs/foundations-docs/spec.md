## ADDED Requirements

### Requirement: Ten foundations documentation chapters
The documentation site SHALL include 10 chapters under `docs/content/docs/foundations/` covering the core concepts of Phase 1. Each chapter SHALL be written as a course lesson: explaining concepts, showing diagrams, referencing academic papers where applicable, and including hands-on exercises.

#### Scenario: All chapters exist
- **WHEN** Phase 1 is complete
- **THEN** the following MDX files SHALL exist under `docs/content/docs/foundations/`: `goroutines-and-channels.mdx`, `arrow-columnar-model.mdx`, `arrow-memory-management.mdx`, `protobuf-as-contract.mdx`, `operator-model.mdx`, `kafka-consumer-internals.mdx`, `expression-evaluation.mdx`, `batch-size-tuning.mdx`, `benchmarking-streaming-systems.mdx`, `duckdb-micro-batch.mdx`

### Requirement: Chapter structure with exercises
Each documentation chapter SHALL include: an introduction with learning objectives, conceptual explanation with diagrams, code examples from the Isotope codebase, references to relevant papers or resources, and at least one hands-on exercise with expected outcome.

#### Scenario: Chapter with exercise
- **WHEN** a reader opens `foundations/arrow-columnar-model.mdx`
- **THEN** it SHALL contain an exercise such as "Compare row vs column scan performance on 1M records" with instructions and expected observations

### Requirement: Documentation site builds and serves
The fumadocs documentation site under `docs/` SHALL build successfully with `pnpm build` and serve all foundations chapters with proper navigation, search indexing (Orama), and LLM content endpoints.

#### Scenario: Build and navigate
- **WHEN** `pnpm build` is run in the `docs/` directory
- **THEN** the site SHALL build without errors and all foundations chapters SHALL be accessible via navigation

### Requirement: Index page for foundations section
A `docs/content/docs/foundations/index.mdx` file SHALL serve as the section landing page with the question "How does data flow through a stream processor?" and links to all 10 chapters.

#### Scenario: Foundations index page
- **WHEN** a user navigates to `/docs/foundations`
- **THEN** they SHALL see the section overview with links to all 10 foundation chapters
