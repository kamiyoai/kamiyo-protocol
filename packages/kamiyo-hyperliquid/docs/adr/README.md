# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) documenting significant architectural and technical decisions made during the development of the Hyperliquid Security Monitor.

## What is an ADR?

An Architecture Decision Record (ADR) is a document that captures an important architectural decision made along with its context and consequences.

## Format

Each ADR follows this structure:
- **Title**: Brief noun phrase
- **Status**: Proposed, Accepted, Deprecated, Superseded
- **Context**: What is the issue we're facing?
- **Decision**: What did we decide?
- **Consequences**: What becomes easier or harder as a result?

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [001](001-async-await-architecture.md) | Async/Await Architecture Throughout | Accepted | 2025-11-04 |
| [002](002-ml-model-selection.md) | ML Model Selection: Isolation Forest + ARIMA | Accepted | 2025-11-04 |
| [003](003-defi-feature-engineering.md) | DeFi-Specific Feature Engineering | Accepted | 2025-11-05 |
| [004](004-prometheus-observability.md) | Prometheus for Observability | Accepted | 2025-11-05 |
| [005](005-test-strategy.md) | Test Strategy: Quality Over Quantity | Accepted | 2025-11-05 |

## References

- [ADR GitHub Organization](https://adr.github.io/)
- [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
