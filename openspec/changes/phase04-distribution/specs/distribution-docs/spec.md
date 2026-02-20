## ADDED Requirements

### Requirement: Nine distribution documentation chapters
The documentation site SHALL include 9 chapters under `docs/content/docs/distribution/` covering shuffle and partitioning, Arrow Flight, gRPC streaming, credit-based flow, consistent hashing, Job Manager, Task Manager, service discovery, and rescaling.

#### Scenario: All chapters exist
- **WHEN** Phase 4 is complete
- **THEN** the following MDX files SHALL exist: `shuffle-and-partitioning.mdx`, `arrow-flight.mdx`, `grpc-streaming.mdx`, `credit-based-flow.mdx`, `consistent-hashing.mdx`, `job-manager.mdx`, `task-manager.mdx`, `service-discovery.mdx`, `rescaling.mdx`

### Requirement: Section index page
A `docs/content/docs/distribution/index.mdx` SHALL serve as the section landing page with the question "How does a stream processor scale across machines?"

#### Scenario: Section navigation
- **WHEN** a user navigates to `/docs/distribution`
- **THEN** they SHALL see the section overview with links to all 9 chapters
