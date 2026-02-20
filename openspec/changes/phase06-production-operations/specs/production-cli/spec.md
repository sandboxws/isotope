## ADDED Requirements

### Requirement: isotope deploy --target k8s
The `isotope deploy --target k8s` command SHALL: (1) run `isotope synth` to compile the plan, (2) build a container image with the plan, (3) push the image to a registry, (4) generate an IsotopePipeline CR, (5) apply it to the Kubernetes cluster, (6) monitor until running.

#### Scenario: Deploy to Kubernetes
- **WHEN** `isotope deploy --target k8s` is run in a project directory
- **THEN** the pipeline SHALL be compiled, containerized, and deployed to the current K8s context

### Requirement: isotope deploy --target docker
The `isotope deploy --target docker` command SHALL generate a Docker Compose file with Kafka, the Go runtime, and optionally Prometheus + Grafana, then start it.

#### Scenario: Deploy to Docker Compose
- **WHEN** `isotope deploy --target docker` is run
- **THEN** a Docker Compose stack SHALL start with Kafka and the pipeline runtime

### Requirement: isotope doctor
The `isotope doctor` command SHALL validate the deployment environment: check Kafka connectivity, Kubernetes permissions, container registry access, resource availability, and report issues.

#### Scenario: Doctor finds issues
- **WHEN** `isotope doctor` is run and Kafka is unreachable
- **THEN** it SHALL report: "Kafka bootstrap servers unreachable at localhost:9092"
