## ADDED Requirements

### Requirement: Pebble LSM tree integration
The runtime SHALL use Pebble (cockroachdb/pebble) as the default state backend. Each operator instance SHALL have its own Pebble key namespace using key-group encoding: `[operator_id | key_group | state_name | user_key]`.

#### Scenario: Isolated operator state
- **WHEN** two operator instances use the same Pebble database
- **THEN** their state SHALL be isolated by operator_id prefix, with no cross-operator reads or writes

### Requirement: ValueState abstraction
The runtime SHALL provide `ValueState[T]` for storing a single value per key. Operations: `Get(key) → (T, error)`, `Put(key, value) error`, `Delete(key) error`.

#### Scenario: ValueState get/put
- **WHEN** `Put("user_1", 42)` is called followed by `Get("user_1")`
- **THEN** the returned value SHALL be `42`

### Requirement: ListState abstraction
The runtime SHALL provide `ListState[T]` for append-only lists per key. Operations: `Append(key, value)`, `Get(key) → []T`, `Clear(key)`.

#### Scenario: ListState append and get
- **WHEN** `Append("k", "a")`, `Append("k", "b")`, `Append("k", "c")` are called
- **THEN** `Get("k")` SHALL return `["a", "b", "c"]`

### Requirement: MapState abstraction
The runtime SHALL provide `MapState[K,V]` for nested key-value maps per key. Operations: `Put(outerKey, innerKey, value)`, `Get(outerKey, innerKey) → V`, `Keys(outerKey) → []K`, `Delete(outerKey, innerKey)`.

#### Scenario: MapState nested operations
- **WHEN** `Put("user_1", "score", 100)` and `Put("user_1", "level", 5)` are called
- **THEN** `Keys("user_1")` SHALL return `["level", "score"]` and `Get("user_1", "score")` SHALL return `100`

### Requirement: ReducingState abstraction
The runtime SHALL provide `ReducingState[T]` that pre-aggregates values using a reduce function. Operations: `Add(key, value)` (applies reduce), `Get(key) → T`.

#### Scenario: ReducingState with sum
- **WHEN** a ReducingState with `reduce = func(a, b int64) int64 { return a + b }` receives `Add("k", 10)`, `Add("k", 20)`, `Add("k", 30)`
- **THEN** `Get("k")` SHALL return `60`

### Requirement: Key-group encoding
State keys SHALL be encoded with key-group prefixes to enable future state redistribution during rescaling. The key-group is computed as `hash(user_key) % max_key_groups`. This encoding SHALL enable efficient prefix scans per key-group range.

#### Scenario: Key-group prefix scan
- **WHEN** a state backend is queried for all keys in key-group range [0, 64)
- **THEN** a prefix scan SHALL return all state entries in that range efficiently

### Requirement: Memory-backed state for tests
The runtime SHALL provide an in-memory state backend implementing the same interface as Pebble, for use in unit tests without disk I/O.

#### Scenario: Memory state backend
- **WHEN** tests use the memory state backend
- **THEN** all state operations SHALL behave identically to Pebble but without persisting to disk

### Requirement: State serialization benchmarks
State get/put operations SHALL be benchmarked for 1M keys with p99 latency ≤10ms.

#### Scenario: Pebble performance at scale
- **WHEN** 1M keys are inserted and randomly queried
- **THEN** p99 get latency SHALL be ≤10ms
