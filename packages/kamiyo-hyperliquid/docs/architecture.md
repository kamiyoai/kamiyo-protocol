# KAMIYO Hyperliquid Architecture

## System Overview

```mermaid
graph TB
    subgraph "Data Sources"
        HL[Hyperliquid API]
        GH[GitHub Historical]
        CG[CoinGlass]
        TW[Twitter/X]
        DC[Discord/Telegram]
    end

    subgraph "Aggregation Layer"
        AGG[Orchestrator]
        HL_AGG[Hyperliquid Aggregator]
        GH_AGG[GitHub Aggregator]
        CG_AGG[CoinGlass Aggregator]
        SOC_AGG[Social Aggregator]

        AGG --> HL_AGG
        AGG --> GH_AGG
        AGG --> CG_AGG
        AGG --> SOC_AGG
    end

    subgraph "Processing Layer"
        NORM[Normalizer]
        DEDUP[Deduplicator]
        VALID[Validator]

        HL_AGG --> NORM
        GH_AGG --> NORM
        CG_AGG --> NORM
        SOC_AGG --> NORM

        NORM --> DEDUP
        DEDUP --> VALID
    end

    subgraph "Storage Layer"
        PG[(PostgreSQL)]
        REDIS[(Redis Cache)]

        VALID --> PG
        VALID --> REDIS
    end

    subgraph "API Layer"
        API[FastAPI Server]
        WS[WebSocket]
        REST[REST Endpoints]

        PG --> API
        REDIS --> API
        API --> WS
        API --> REST
    end

    subgraph "Clients"
        WEB[Web Dashboard]
        CLI[CLI Tool]
        SDK[SDK Clients]
    end

    HL --> HL_AGG
    GH --> GH_AGG
    CG --> CG_AGG
    TW --> SOC_AGG
    DC --> SOC_AGG

    REST --> WEB
    WS --> WEB
    REST --> CLI
    REST --> SDK

    style HL fill:#f9f,stroke:#333
    style GH fill:#f9f,stroke:#333
    style PG fill:#bbf,stroke:#333
    style REDIS fill:#fbb,stroke:#333
    style API fill:#bfb,stroke:#333
```

## Data Flow

```mermaid
sequenceDiagram
    participant DS as Data Source
    participant AGG as Aggregator
    participant PROC as Processor
    participant DB as Database
    participant API as API Server
    participant CLIENT as Client

    DS->>AGG: Raw Data
    AGG->>AGG: Parse & Extract
    AGG->>PROC: Structured Data
    PROC->>PROC: Normalize Format
    PROC->>PROC: Deduplicate
    PROC->>PROC: Validate
    PROC->>DB: Store Exploit
    PROC->>DB: Cache Result
    CLIENT->>API: GET /exploits
    API->>DB: Query Cache
    DB->>API: Cached Results
    API->>CLIENT: JSON Response
```

## Component Details

### Aggregators

```mermaid
classDiagram
    class BaseAggregator {
        +name: string
        +logger: Logger
        +session: Session
        +fetch_exploits() List~Dict~
        +normalize_exploit() Dict
        +validate_exploit() bool
        +make_request() Response
    }

    class HyperliquidAPIAggregator {
        +MAINNET_URL: string
        +TESTNET_URL: string
        +fetch_exploits() List~Dict~
        +get_meta() Dict
        +get_all_mids() Dict
        -_fetch_large_liquidations() List
        -_analyze_for_exploit() Dict
    }

    class GitHubHistoricalAggregator {
        +BASE_URL: string
        +fetch_exploits() List~Dict~
        +get_trades() List~Dict~
        -_create_exploit_from_liquidations() Dict
    }

    BaseAggregator <|-- HyperliquidAPIAggregator
    BaseAggregator <|-- GitHubHistoricalAggregator
```

### Data Models

```mermaid
erDiagram
    EXPLOIT {
        string tx_hash PK
        string chain
        string protocol
        float amount_usd
        datetime timestamp
        string source
        string source_url
        string category
        string description
        string recovery_status
    }

    LIQUIDATION {
        string liquidation_id PK
        string user
        string asset
        string side
        float size
        float liquidation_price
        float mark_price
        float amount_usd
        float leverage
        datetime timestamp
        string source
        json metadata
    }

    SOURCE {
        string name PK
        string type
        string url
        int priority
        bool active
        datetime last_fetch
    }

    EXPLOIT ||--o{ SOURCE : "aggregated_from"
    LIQUIDATION ||--o{ SOURCE : "aggregated_from"
```

## API Architecture

```mermaid
graph LR
    subgraph "Client Layer"
        C1[Web Browser]
        C2[Mobile App]
        C3[CLI Tool]
    end

    subgraph "API Gateway"
        CORS[CORS Middleware]
        RATE[Rate Limiter]
        AUTH[Auth Middleware]
    end

    subgraph "Route Handlers"
        R1[GET /exploits]
        R2[GET /stats]
        R3[GET /meta]
        R4[GET /health]
        R5[WS /stream]
    end

    subgraph "Business Logic"
        BL1[Exploit Service]
        BL2[Stats Service]
        BL3[Meta Service]
    end

    subgraph "Data Access"
        DA1[PostgreSQL]
        DA2[Redis Cache]
    end

    C1 --> CORS
    C2 --> CORS
    C3 --> CORS

    CORS --> RATE
    RATE --> AUTH

    AUTH --> R1
    AUTH --> R2
    AUTH --> R3
    AUTH --> R4
    AUTH --> R5

    R1 --> BL1
    R2 --> BL2
    R3 --> BL3

    BL1 --> DA1
    BL1 --> DA2
    BL2 --> DA1
    BL2 --> DA2
    BL3 --> DA1
```

## Deployment Architecture

```mermaid
graph TB
    subgraph "Load Balancer"
        LB[nginx]
    end

    subgraph "Application Tier"
        APP1[API Server 1]
        APP2[API Server 2]
        APP3[API Server 3]
    end

    subgraph "Data Tier"
        PG_PRIMARY[(PostgreSQL Primary)]
        PG_REPLICA[(PostgreSQL Replica)]
        REDIS_PRIMARY[(Redis Primary)]
        REDIS_REPLICA[(Redis Replica)]
    end

    subgraph "Background Services"
        AGG1[Aggregator Worker 1]
        AGG2[Aggregator Worker 2]
        SCHEDULER[Task Scheduler]
    end

    subgraph "Monitoring"
        PROM[Prometheus]
        GRAF[Grafana]
        ALERT[AlertManager]
    end

    LB --> APP1
    LB --> APP2
    LB --> APP3

    APP1 --> PG_PRIMARY
    APP2 --> PG_PRIMARY
    APP3 --> PG_REPLICA

    APP1 --> REDIS_PRIMARY
    APP2 --> REDIS_PRIMARY
    APP3 --> REDIS_REPLICA

    PG_PRIMARY --> PG_REPLICA
    REDIS_PRIMARY --> REDIS_REPLICA

    SCHEDULER --> AGG1
    SCHEDULER --> AGG2

    AGG1 --> PG_PRIMARY
    AGG2 --> PG_PRIMARY

    APP1 --> PROM
    APP2 --> PROM
    APP3 --> PROM
    AGG1 --> PROM
    AGG2 --> PROM

    PROM --> GRAF
    PROM --> ALERT
```

## Security Architecture

```mermaid
graph TB
    subgraph "External"
        CLIENT[Client]
        ATTACKER[Potential Attacker]
    end

    subgraph "Perimeter Security"
        WAF[Web Application Firewall]
        DDOS[DDoS Protection]
        SSL[SSL/TLS Termination]
    end

    subgraph "Application Security"
        INPUT_VAL[Input Validation]
        AUTH_LAYER[Authentication]
        AUTHZ_LAYER[Authorization]
        RATE_LIMIT[Rate Limiting]
        SANITIZE[SQL Injection Prevention]
    end

    subgraph "Data Security"
        ENCRYPT[Encryption at Rest]
        BACKUP[Encrypted Backups]
        AUDIT[Audit Logging]
    end

    CLIENT --> SSL
    ATTACKER -.-> WAF
    ATTACKER -.-> DDOS

    SSL --> WAF
    WAF --> INPUT_VAL
    DDOS --> RATE_LIMIT

    INPUT_VAL --> AUTH_LAYER
    AUTH_LAYER --> AUTHZ_LAYER
    AUTHZ_LAYER --> SANITIZE

    SANITIZE --> ENCRYPT
    ENCRYPT --> BACKUP
    SANITIZE --> AUDIT

    style WAF fill:#f88,stroke:#333
    style DDOS fill:#f88,stroke:#333
    style ENCRYPT fill:#8f8,stroke:#333
    style AUDIT fill:#8f8,stroke:#333
```

## Performance Optimization

```mermaid
graph LR
    subgraph "Request Path"
        REQ[Request]
        CDN[CDN Cache]
        REDIS[Redis Cache]
        DB[Database]
    end

    subgraph "Cache Strategy"
        L1[L1: Application Cache]
        L2[L2: Redis Cache]
        L3[L3: Database]
    end

    REQ --> CDN
    CDN -->|MISS| REDIS
    REDIS -->|MISS| DB

    CDN -->|HIT| REQ
    REDIS -->|HIT| REQ
    DB --> REDIS
    REDIS --> CDN

    L1 --> L2
    L2 --> L3

    style CDN fill:#9f9,stroke:#333
    style REDIS fill:#99f,stroke:#333
    style DB fill:#f99,stroke:#333
```

## Scaling Strategy

```mermaid
graph TB
    subgraph "Horizontal Scaling"
        HS1[Auto-scaling Group]
        HS2[Load Balancer]
        HS3[Health Checks]
    end

    subgraph "Vertical Scaling"
        VS1[CPU Optimization]
        VS2[Memory Optimization]
        VS3[Database Tuning]
    end

    subgraph "Data Sharding"
        DS1[Shard by Chain]
        DS2[Shard by Timestamp]
        DS3[Shard by Protocol]
    end

    HS1 --> HS2
    HS2 --> HS3

    VS1 --> VS2
    VS2 --> VS3

    DS1 --> DS2
    DS2 --> DS3
```
