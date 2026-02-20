## ADDED Requirements

### Requirement: Six production documentation chapters
The documentation site SHALL include 6 chapters under `docs/content/docs/production/` covering the K8s operator, CRD design, auto-scaling, observability, deployment strategies, and security.

#### Scenario: All chapters exist
- **WHEN** Phase 6 is complete
- **THEN** the following MDX files SHALL exist: `kubernetes-operator.mdx`, `crd-design.mdx`, `auto-scaling.mdx`, `observability.mdx`, `deployment-strategies.mdx`, `security.mdx`

### Requirement: Section index page
A `docs/content/docs/production/index.mdx` SHALL serve as the section landing page with the question "How does a stream processor run in production?"

#### Scenario: Section navigation
- **WHEN** a user navigates to `/docs/production`
- **THEN** they SHALL see the section overview with links to all 6 chapters

### Requirement: Full course site deployment
The complete documentation site (all 56+ chapters across 6 sections plus reference material) SHALL build and deploy successfully as a navigable course.

#### Scenario: Full site builds
- **WHEN** `pnpm build` is run in the docs directory
- **THEN** the entire site SHALL build without errors with all sections and chapters accessible
