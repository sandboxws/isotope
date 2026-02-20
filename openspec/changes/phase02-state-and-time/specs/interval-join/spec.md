## ADDED Requirements

### Requirement: Time-bounded interval join
The IntervalJoin operator SHALL join two streams where records match within a configurable time interval: `l.time + lower_bound <= r.time <= l.time + upper_bound`. Both sides SHALL be buffered in Pebble state indexed by time and key.

#### Scenario: Order-payment join within 30 minutes
- **WHEN** IntervalJoin has `condition: "l.order_id = r.order_id"`, `lower_bound: -1 MINUTE`, `upper_bound: 30 MINUTE`
- **THEN** an order at time T SHALL match payments between T-1min and T+30min with the same order_id

### Requirement: Per-record state probing
When a record arrives on either side, the operator SHALL immediately probe the opposite side's buffered state for matching records within the time interval. This is Arrow-native (not DuckDB) because there's no natural batch boundary.

#### Scenario: Left record probes right state
- **WHEN** an order record arrives
- **THEN** the operator SHALL scan Pebble for payment records within the time bounds and emit joined results

### Requirement: Watermark-driven state cleanup
Buffered records SHALL be cleaned up when the watermark advances past the maximum possible match time. For the left side: cleanup when `watermark > record.time + upper_bound`.

#### Scenario: State cleanup on watermark advance
- **WHEN** the watermark advances to T and upper_bound=30 min
- **THEN** all left-side records with `record.time < T - 30min` SHALL be evicted from state
