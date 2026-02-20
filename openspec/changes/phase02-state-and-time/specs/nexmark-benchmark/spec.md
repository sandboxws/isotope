## ADDED Requirements

### Requirement: NEXMark data generator
The benchmark SHALL include a NEXMark data generator producing three event streams (Person, Auction, Bid) to Kafka topics. The generator SHALL support configurable event rates and proper temporal distribution (event times with bounded disorder).

#### Scenario: Generate NEXMark events
- **WHEN** the NEXMark generator is started with `rate: 100000`
- **THEN** it SHALL produce approximately 100,000 events/sec distributed across Person (5%), Auction (10%), and Bid (85%) streams

### Requirement: NEXMark queries q0-q8, q11-q12
The benchmark SHALL implement 11 NEXMark queries as Isotope pipelines (both TSX and Go API):
- q0 (passthrough), q1 (currency conversion), q2 (selection), q3 (local item suggestion), q4 (avg price per category), q5 (hot items), q7 (highest bid), q8 (monitor new users), q11 (user sessions), q12 (processing time windows).

#### Scenario: NEXMark q3 correctness
- **WHEN** q3 (Person JOIN Auction WHERE person.state IN ('OR','ID','CA')) runs for 60 seconds
- **THEN** the output SHALL match the reference Flink SQL implementation on the same input data

#### Scenario: NEXMark q5 sliding window TopN
- **WHEN** q5 (sliding window hot items) runs with window_size=10min, slide=5min
- **THEN** the output SHALL contain correct top-N bid counts per sliding window

### Requirement: Correctness validation against Flink reference
Each NEXMark query's output SHALL be validated against a Flink SQL reference implementation running on the same input data. Discrepancies SHALL be documented with root cause analysis.

#### Scenario: Correctness comparison
- **WHEN** both Isotope and Flink run q4 on the same input
- **THEN** the outputs SHALL be semantically identical (same aggregation results per window)

### Requirement: Performance measurements per query
The benchmark SHALL measure and publish per-query: throughput (events/sec), state size (bytes), p50/p95/p99 latency, and checkpoint overhead (when applicable). Profiling-based explanations for performance gaps vs Flink SHALL be documented.

#### Scenario: Published performance results
- **WHEN** all NEXMark queries complete
- **THEN** a summary table SHALL be published with throughput and state-size per query
