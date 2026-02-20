## ADDED Requirements

### Requirement: Fourteen state-and-time documentation chapters
The documentation site SHALL include 14 chapters under `docs/content/docs/state-and-time/` covering event time, watermarks, LSM trees, keyed state, key-group encoding, all window types, late data, all join types, and the NEXMark benchmark. Each chapter SHALL follow the course structure: introduction, conceptual explanation, diagrams, code examples, paper references, exercises.

#### Scenario: All chapters exist
- **WHEN** Phase 2 is complete
- **THEN** the following MDX files SHALL exist: `event-time-vs-processing.mdx`, `watermarks.mdx`, `lsm-trees.mdx`, `keyed-state.mdx`, `key-group-encoding.mdx`, `tumble-windows.mdx`, `slide-windows.mdx`, `session-windows.mdx`, `late-data.mdx`, `hash-joins.mdx`, `interval-joins.mdx`, `temporal-joins.mdx`, `lookup-joins.mdx`, `nexmark-benchmark.mdx`

### Requirement: Section index page
A `docs/content/docs/state-and-time/index.mdx` SHALL serve as the section landing page with the question "How does a stream processor remember and reason about time?" and links to all 14 chapters.

#### Scenario: Section navigation
- **WHEN** a user navigates to `/docs/state-and-time`
- **THEN** they SHALL see the section overview with links to all 14 chapters
