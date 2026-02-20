## ADDED Requirements

### Requirement: Pipeline component
The DSL SHALL provide a `Pipeline` component with props: `name` (required), `mode` ('streaming' | 'batch'), `parallelism`, `checkpoint` (interval, mode), `stateBackend` ('pebble' | 'memory'), `stateTtl`, `restartStrategy`, and `children`. Ported from FlinkReactor with `stateBackend` values changed from 'hashmap'|'rocksdb' to 'pebble'|'memory'.

#### Scenario: Pipeline creates root ConstructNode
- **WHEN** a Pipeline component is rendered
- **THEN** it SHALL produce a ConstructNode with kind='Pipeline' containing all configuration props

### Requirement: Source components
The DSL SHALL provide source components:
- **KafkaSource<T>**: `topic` (required), `bootstrapServers` (required), `schema` (required), `watermark`, `startupMode` ('latest-offset' | 'earliest-offset' | 'group-offsets'), `consumerGroup`, `format` ('json' | 'csv'), `children`
- **GeneratorSource<T>**: `name`, `schema` (required), `rowsPerSecond` (required), `maxRows`, `children`

CDC formats (debezium-json, canal-json, maxwell-json) SHALL NOT be supported. The `inferChangelogMode()` function from FlinkReactor SHALL NOT be ported.

#### Scenario: KafkaSource creates source node
- **WHEN** a KafkaSource is rendered with topic and schema
- **THEN** it SHALL produce a ConstructNode with kind='Source' and component='KafkaSource'

#### Scenario: GeneratorSource for testing
- **WHEN** a GeneratorSource is rendered with schema and rowsPerSecond
- **THEN** it SHALL produce a ConstructNode with kind='Source' and component='GeneratorSource'

### Requirement: Sink components
The DSL SHALL provide sink components:
- **KafkaSink**: `topic` (required), `bootstrapServers` (required), `format` ('json' | 'csv'), `keyBy`, `children`
- **ConsoleSink**: `name`, `maxRows`, `children`

Flink-specific sinks (JdbcSink, FileSystemSink, PaimonSink, IcebergSink, GenericSink) SHALL NOT be ported in this change.

#### Scenario: KafkaSink creates sink node
- **WHEN** a KafkaSink is rendered
- **THEN** it SHALL produce a ConstructNode with kind='Sink' and component='KafkaSink'

### Requirement: Transform components
The DSL SHALL provide transform components ported from FlinkReactor:
- **Filter**: `condition` (SQL WHERE expression), `children`
- **Map**: `select` (Record<outputField, sqlExpression>), `children`
- **FlatMap**: `unnest` (array column name), `as` (Record<fieldName, type>), `children`
- **Aggregate**: `groupBy` (column names), `select` (Record<outputField, aggExpression>), `children`
- **Union**: `children` (multiple inputs)
- **Deduplicate**: `keys`, `orderBy`, `keepFirstRow`, `children`
- **TopN**: `partitionBy`, `orderBy`, `ascending`, `n`, `children`

#### Scenario: Filter preserves SQL condition
- **WHEN** a Filter is rendered with `condition="amount > 100 AND country = 'US'"`
- **THEN** the ConstructNode props SHALL contain the condition string verbatim

### Requirement: Field transform components
The DSL SHALL provide field transform components:
- **Rename**: `columns` (Record<currentName, newName>), `children`
- **Drop**: `columns` (string[]), `children`
- **Cast**: `columns` (Record<fieldName, type>), `children` (no `safe` prop — TRY_CAST removed)
- **Coalesce**: `columns` (Record<fieldName, defaultExpr>), `children`
- **AddField**: `columns` (Record<fieldName, sqlExpr>), `types` (Record<fieldName, type>), `children`

### Requirement: Route component with branching
The DSL SHALL provide `Route`, `Route.Branch`, and `Route.Default` components ported from FlinkReactor with 100% API compatibility.

#### Scenario: Route splits by condition
- **WHEN** a Route with Branch children is rendered
- **THEN** it SHALL produce a tree where each Branch has its condition and child operators

### Requirement: Join components
The DSL SHALL provide join components:
- **Join**: `left`, `right`, `on` (SQL condition), `type` ('inner' | 'left' | 'right' | 'full' | 'anti' | 'semi'), `stateTtl`, `children`
- **IntervalJoin**: `left`, `right`, `on`, `lowerBound`, `upperBound`, `children`
- **TemporalJoin**: `stream`, `temporal`, `on`, `asOf`, `children`
- **LookupJoin**: `input`, `table`, `url`, `on`, `select`, `async`, `cache`, `children`

Broadcast hints (FlinkReactor's `hints.broadcast`) SHALL NOT be ported (Flink optimizer specific).

### Requirement: Window components
The DSL SHALL provide window components:
- **TumbleWindow**: `size` (duration string), `on` (time attribute), `children`
- **SlideWindow**: `size`, `slide`, `on`, `children`
- **SessionWindow**: `gap`, `on`, `children`

Duration strings SHALL use the same format as FlinkReactor ("1 hour", "5 minutes", "30 seconds").

### Requirement: Escape hatch and CEP components
The DSL SHALL provide:
- **RawSQL**: `sql` (arbitrary SQL), `inputs` (ConstructNode[]), `outputSchema`, `children`
- **MatchRecognize**: `input`, `pattern`, `define`, `measures`, `after`, `partitionBy`, `orderBy`, `children`

### Requirement: Query component
The DSL SHALL provide `Query.Select`, `Query.Where`, `Query.GroupBy`, `Query.Having` sub-components ported from FlinkReactor for building complex queries declaratively.
