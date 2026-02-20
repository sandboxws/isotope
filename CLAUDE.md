# Isotope

Isotope is a streaming framework built from scratch as both a working runtime and an educational course.

## Architecture

- **TypeScript DSL** (`packages/dsl/`): Pipeline definition via TSX/JSX, compiles to Protobuf ExecutionPlan
- **Go Runtime** (`runtime/`): Executes pipelines using Apache Arrow RecordBatches, goroutine pools, and channels
- **Protobuf Contract** (`proto/isotope/v1/`): Cross-language schema shared between TS and Go
- **CLI** (`packages/cli/`): Developer workflow — `isotope new`, `isotope synth`, `isotope dev`, `isotope inspect`
- **Docs** (`docs/`): Fumadocs documentation site (TanStack Start)

## Build Commands

```bash
# TypeScript (from root)
pnpm install          # Install all workspace dependencies
pnpm build            # Build all packages
pnpm test             # Run all tests

# Go runtime
cd runtime && go build ./...    # Build
cd runtime && go test ./...     # Test
cd runtime && go test -tags duckdb ./...  # Test with DuckDB

# Protobuf generation
buf generate           # Generate TS + Go stubs from proto/

# CLI
pnpm synth            # Compile TSX pipelines to Protobuf
pnpm dev              # Start dev environment with Docker Compose
```

## Key Conventions

- All inter-operator data flows as Apache Arrow RecordBatches (columnar, batch-oriented)
- Expressions use raw SQL strings parsed by vitess/sqlparser at runtime
- DuckDB is optional via `//go:build duckdb` build tags
- Kafka connector uses franz-go (pure Go, no CGO)
- Arrow memory management: always Retain/Release with reference counting
