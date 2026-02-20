## ADDED Requirements

### Requirement: Eight fault-tolerance documentation chapters
The documentation site SHALL include 8 chapters under `docs/content/docs/fault-tolerance/` covering the Chandy-Lamport algorithm, barrier alignment, unaligned checkpoints (theory), state snapshots, exactly-once semantics, two-phase commit, recovery protocol, and failure modes.

#### Scenario: All chapters exist
- **WHEN** Phase 3 is complete
- **THEN** the following MDX files SHALL exist: `chandy-lamport.mdx`, `barrier-alignment.mdx`, `unaligned-checkpoints.mdx`, `state-snapshots.mdx`, `exactly-once-semantics.mdx`, `two-phase-commit.mdx`, `recovery-protocol.mdx`, `failure-modes.mdx`

### Requirement: Section index page
A `docs/content/docs/fault-tolerance/index.mdx` SHALL serve as the section landing page with the question "How does a stream processor survive failure?"

#### Scenario: Section navigation
- **WHEN** a user navigates to `/docs/fault-tolerance`
- **THEN** they SHALL see the section overview with links to all 8 chapters
