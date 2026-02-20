## ADDED Requirements

### Requirement: Point-in-time versioned state join
The TemporalJoin operator SHALL join a fact stream against a versioned dimension table. For each fact record, it SHALL look up the dimension record that was valid at the fact's event time (point-in-time lookup).

#### Scenario: Join with slowly-changing dimension
- **WHEN** a fact record at time T joins against a dimension table with versions at T-10 and T+5
- **THEN** the operator SHALL return the dimension record from T-10 (the latest version before or at T)

### Requirement: Versioned state in Pebble
The dimension side SHALL be stored in Pebble keyed by `[dimension_key | version_timestamp]`. Lookups SHALL use prefix scan + reverse iteration to find the latest version ≤ fact time.

#### Scenario: Version lookup via Pebble
- **WHEN** dimension "product_1" has versions at timestamps [100, 200, 300] and a fact at time 250 arrives
- **THEN** the Pebble lookup SHALL return the version at timestamp 200

### Requirement: Changelog semantics
The dimension stream SHALL support changelog semantics: INSERT, UPDATE, DELETE operations that maintain the versioned state.

#### Scenario: Dimension update followed by lookup
- **WHEN** dimension "product_1" receives UPDATE(price=50) at T=200 after INSERT(price=40) at T=100
- **THEN** a fact at T=150 SHALL see price=40 and a fact at T=250 SHALL see price=50
