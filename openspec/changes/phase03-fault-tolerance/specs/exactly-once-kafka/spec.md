## ADDED Requirements

### Requirement: Kafka transactional sink
The Kafka sink SHALL support transactional writes coordinated with checkpoints. Each parallel sink instance SHALL use a unique `transactional.id`. Transactions SHALL be opened at checkpoint start and committed on checkpoint completion.

#### Scenario: Transactional write flow
- **WHEN** a Kafka transactional sink receives checkpoint barrier 42
- **THEN** it SHALL: (1) flush pending records to the open transaction, (2) pre-commit (report ready to coordinator), (3) on checkpoint-complete signal, commit the transaction

### Requirement: Transaction abort on failure
If a checkpoint is aborted, the sink SHALL abort its open transaction. On recovery, any uncommitted transactions from the previous run SHALL be aborted (fenced by `transactional.id` with epoch bumping).

#### Scenario: Transaction abort on checkpoint failure
- **WHEN** checkpoint 42 is aborted by the coordinator
- **THEN** the Kafka sink SHALL abort its transaction for checkpoint 42

#### Scenario: Fence zombie transactions on recovery
- **WHEN** the runtime recovers with a new process
- **THEN** the Kafka sink SHALL initialize with a bumped epoch, fencing any zombie transactions from the previous incarnation

### Requirement: Exactly-once verification
After kill-and-recover, the output Kafka topic SHALL contain exactly the expected number of records with no duplicates, verified by counting and deduplication checks.

#### Scenario: No duplicates after recovery
- **WHEN** a pipeline with transactional Kafka sink is killed and recovered 3 times during a 60-second run
- **THEN** the output topic SHALL contain exactly the same records as an uninterrupted run (no duplicates, no missing)
