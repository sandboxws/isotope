## ADDED Requirements

### Requirement: Async JDBC lookup with LRU cache
The LookupJoin operator SHALL perform async lookups against an external database (PostgreSQL via pgx) for each incoming record. An LRU cache SHALL reduce database round-trips for repeated keys.

#### Scenario: Lookup join with cache hit
- **WHEN** a record with `product_id=42` arrives and product_id=42 is in the LRU cache
- **THEN** the operator SHALL return the cached dimension data without a database query

#### Scenario: Lookup join with cache miss
- **WHEN** a record with `product_id=99` arrives and it's not in cache
- **THEN** the operator SHALL execute an async PostgreSQL query, cache the result, and emit the joined record

### Requirement: Configurable cache TTL and capacity
The LRU cache SHALL support configurable `ttl` (time-to-live for entries) and `capacity` (max entries). Expired entries SHALL be evicted on access.

#### Scenario: Cache TTL expiration
- **WHEN** a cache entry was written 10 minutes ago and TTL=5 minutes
- **THEN** the entry SHALL be treated as a cache miss and re-fetched from the database

### Requirement: Async I/O with configurable concurrency
The LookupJoin SHALL support configurable `async_capacity` controlling how many concurrent database queries can be in-flight.

#### Scenario: Concurrent lookups
- **WHEN** async_capacity=16 and 20 cache misses arrive simultaneously
- **THEN** 16 queries SHALL execute concurrently, with 4 waiting for available slots
