I'll analyze the current pushduck architecture and create comprehensive mermaid diagrams showing how everything works together.

```mermaid
graph TB
    subgraph "Client Side"
        A[React Component] --> B[useUploadRoute Hook]
        B --> C[Upload Client]
        C --> D[File Validation]
        D --> E[Presigned URL Request]
        E --> F[Direct S3 Upload]
        F --> G[Upload Completion]
    end
    
    subgraph "Server Side"
        H[Next.js API Route] --> I[S3 Handler]
        I --> J[S3 Router]
        J --> K[Route Validation]
        K --> L[Schema Validation]
        L --> M[Middleware Chain]
        M --> N[Presigned URL Generation]
        N --> O[S3 Client]
        O --> P[Provider Config]
    end
    
    subgraph "Configuration Layer"
        Q[Upload Config] --> R[Provider Setup]
        R --> S[AWS/R2/Spaces/MinIO]
        Q --> T[Schema Builders]
        T --> U[File/Image/Array/Object]
    end
    
    subgraph "Storage Layer"
        V[S3 Compatible Client] --> W[aws4fetch]
        W --> X[HTTP Requests]
        X --> Y[Cloud Storage]
    end
    
    E --> H
    G --> I
    P --> V
    U --> L
    
    style A fill:#e1f5fe
    style H fill:#f3e5f5
    style Q fill:#e8f5e8
    style V fill:#fff3e0
```

```mermaid
sequenceDiagram
    participant Client as React Component
    participant Hook as useUploadRoute
    participant API as Next.js API Route
    participant Router as S3Router
    participant Schema as Schema Validator
    participant Middleware as Middleware Chain
    participant S3Client as S3 Client
    participant Storage as Cloud Storage
    
    Client->>Hook: uploadFiles(files)
    Hook->>Hook: Validate files locally
    Hook->>API: POST /api/upload?action=presign
    API->>Router: generatePresignedUrls()
    Router->>Schema: validate(file, schema)
    Schema-->>Router: validation result
    Router->>Middleware: execute middleware
    Middleware-->>Router: processed metadata
    Router->>S3Client: generatePresignedUploadUrl()
    S3Client->>Storage: create presigned URL
    Storage-->>S3Client: presigned URL + fields
    S3Client-->>Router: presigned response
    Router-->>API: presigned URLs
    API-->>Hook: presigned URLs
    
    loop For each file
        Hook->>Storage: Direct upload with presigned URL
        Storage-->>Hook: Upload progress
        Hook->>Client: Progress update
    end
    
    Hook->>API: POST /api/upload?action=complete
    API->>Router: handleUploadComplete()
    Router->>Router: Execute onUploadComplete hooks
    Router-->>API: completion response
    API-->>Hook: success response
    Hook->>Client: Upload complete
```

```mermaid
graph TD
    subgraph "Router System Architecture"
        A[s3.createRouter] --> B[S3Router Instance]
        B --> C[Route Definition Map]
        
        subgraph "Route Types"
            D[s3.file] --> E[S3FileSchema]
            F[s3.image] --> G[S3ImageSchema]
            H[s3.array] --> I[S3ArraySchema]
            J[s3.object] --> K[S3ObjectSchema]
        end
        
        subgraph "Route Configuration"
            L[Schema Validation]
            M[Middleware Chain]
            N[Lifecycle Hooks]
            O[Path Configuration]
        end
        
        subgraph "Handler Creation"
            P[createS3Handler] --> Q[GET Handler]   (deprecated)
            P --> R[POST Handler]
            Q --> S[Route Introspection]
            R --> T[Request Processing]
        end
        
        subgraph "Request Flow"
            T --> U{Action Type}
            U -->|presign| V[Generate Presigned URLs]
            U -->|complete| W[Handle Upload Complete]
            V --> X[S3 Client Operations]
            W --> Y[Lifecycle Hook Execution]
        end
    end
    
    C --> L
    C --> M
    C --> N
    C --> O
    E --> L
    G --> L
    I --> L
    K --> L
    
    style A fill:#4caf50
    style B fill:#2196f3
    style P fill:#ff9800
    style T fill:#9c27b0
```

```mermaid
graph LR
    subgraph "Multi-Provider System"
        A[Provider Config] --> B{Provider Type}
        
        B -->|aws| C[AWS S3]
        B -->|cloudflare-r2| D[Cloudflare R2]
        B -->|digitalocean-spaces| E[DigitalOcean Spaces]
        B -->|minio| F[MinIO]
        B -->|gcs| G[Google Cloud Storage]
        B -->|azure-blob| H[Azure Blob Storage]
        B -->|s3-compatible| I[Generic S3 Compatible]
        
        subgraph "Provider Tiers"
            J[Tier 1: Supported]
            K[Tier 2: Enterprise]
            L[Tier 3: Cost-Optimized]
            M[Tier 4: Specialized]
        end
        
        C --> J
        D --> J
        E --> J
        F --> J
        
        G --> K
        H --> K
        
        N[Wasabi] --> L
        O[Backblaze B2] --> L
        P[Storj DCS] --> L
        
        Q[Telnyx Storage] --> M
        R[Tigris Data] --> M
        
        subgraph "Configuration Processing"
            S[validateProviderConfig] --> T[getProviderEndpoint]
            T --> U[S3CompatibleConfig]
            U --> V[aws4fetch Client]
        end
        
        A --> S
        B --> T
    end
    
    style A fill:#e3f2fd
    style J fill:#4caf50
    style K fill:#ff9800
    style L fill:#2196f3
    style M fill:#9c27b0
```

```mermaid
graph LR
    subgraph "Multi-Provider System"
        A[Provider Config] --> B{Provider Type}
        
        B -->|aws| C[AWS S3]
        B -->|cloudflare-r2| D[Cloudflare R2]
        B -->|digitalocean-spaces| E[DigitalOcean Spaces]
        B -->|minio| F[MinIO]
        B -->|gcs| G[Google Cloud Storage]
        B -->|azure-blob| H[Azure Blob Storage]
        B -->|s3-compatible| I[Generic S3 Compatible]
        
        subgraph "Provider Tiers"
            J[Tier 1: Supported]
            K[Tier 2: Enterprise]
            L[Tier 3: Cost-Optimized]
            M[Tier 4: Specialized]
        end
        
        C --> J
        D --> J
        E --> J
        F --> J
        
        G --> K
        H --> K
        
        N[Wasabi] --> L
        O[Backblaze B2] --> L
        P[Storj DCS] --> L
        
        Q[Telnyx Storage] --> M
        R[Tigris Data] --> M
        
        subgraph "Configuration Processing"
            S[validateProviderConfig] --> T[getProviderEndpoint]
            T --> U[S3CompatibleConfig]
            U --> V[aws4fetch Client]
        end
        
        A --> S
        B --> T
    end
    
    style A fill:#e3f2fd
    style J fill:#4caf50
    style K fill:#ff9800
    style L fill:#2196f3
    style M fill:#9c27b0
```

```mermaid
graph TB
    subgraph "Configuration & Initialization Flow"
        A[createUploadConfig] --> B[UploadConfigBuilder]
        B --> C[provider]
        B --> D[defaults]
        B --> E[paths]
        B --> F[security]
        B --> G[hooks]
        
        C --> H[Provider Validation]
        H --> I[S3 Client Creation]
        I --> J[Storage Instance]
        
        subgraph "Auto Configuration"
            K[Environment Detection] --> L[Provider Auto-Config]
            L --> M[Default Settings]
        end
        
        subgraph "Global State"
            N[Global Upload Config] --> O[setGlobalUploadConfig]
            O --> P[getUploadConfig]
            P --> Q[isConfigInitialized]
        end
        
        G --> R[Build Result]
        J --> R
        
        subgraph "Build Result Components"
            R --> S[config: UploadConfig]
            R --> T[storage: StorageInstance]  
            R --> U[s3: Schema Builder]
            R --> V[createS3Handler: Function]  (deprecated)
        end
        
        subgraph "Schema Builder (s3)"
            U --> W[s3.file]
            U --> X[s3.image]
            U --> Y[s3.array]
            U --> Z[s3.object]
            U --> AA[s3.createRouter]
        end
        
        AA --> BB[S3Router Instance]
        BB --> V
        V --> CC[HTTP Handlers]
        
        K --> B
        N --> B
    end
    
    style A fill:#4caf50
    style R fill:#2196f3
    style CC fill:#ff9800
    style U fill:#9c27b0
```

```mermaid
graph TD
    A[S3 Client Creation] --> B[aws4fetch Client]
    B --> C[Provider Endpoint Configuration]
    
    C --> D[generatePresignedUploadUrl]
    C --> E[generatePresignedDownloadUrl]
    C --> F[uploadFileToS3]
    C --> G[checkFileExists]
    C --> H[getFileInfo]
    C --> I[listFiles]
    C --> J[deleteFile]
    C --> K[validateS3Connection]
    
    D --> L[S3 PUT Request Signing]
    E --> M[S3 GET Request Signing]
    F --> N[Direct File Upload]
    G --> O[HEAD Request]
    H --> P[Metadata Retrieval]
    I --> Q[LIST Objects Request]
    J --> R[DELETE Request]
    K --> S[Connection Test]
    
    T[generateFileKey] --> U[Key Generation Logic]
    V[getFileUrl] --> W[Public URL Generation]
    X[buildS3Url] --> Y[URL Construction]
    
    Z[ProgressCallback] --> AA[Upload Progress Tracking]
    BB[Metrics Collection] --> CC[Operation Monitoring]
    DD[Health Checks] --> EE[System Status]
```

```mermaid
graph LR
    subgraph "Current Next.js-Only Handler"
        A[createS3Handler] --> B[NextRequest/NextResponse]  (deprecated)
        B --> C[Next.js Specific Logic]
        C --> D[GET/POST Handlers]
    end
    
    subgraph "Proposed Framework-Agnostic Architecture"
        E[S3Router] --> F[.handlers Property]
        F --> G[Web Standard Request/Response]
        G --> H[Universal Core Logic]
        
        H --> I[toNextJsHandler]
        H --> J[toExpressHandler]
        H --> K[toHonoHandler]
        H --> L[toFastifyHandler]
        
        I --> M[Next.js Compatible]
        J --> N[Express Compatible]
        K --> O[Hono Compatible]
        L --> P[Fastify Compatible]
    end
    
    subgraph "Migration Path"
        Q[Current Usage] --> R[export const GET POST = createS3Handler]  (deprecated)
        S[New Usage] --> T[export const GET POST = uploadRouter.handlers]
        S --> U[export const GET POST = toNextJsHandler uploadRouter.handlers]
        
        style Q fill:#ffcdd2
        style S fill:#c8e6c9
    end
```

## Pushduck Current Architecture Analysis

Based on my analysis of the pushduck codebase, here's how everything currently works:

## 🏗️ Overall Architecture

The first diagram shows the **complete system architecture** with:

- **Client Side**: React components using `useUploadRoute` hook
- **Server Side**: Next.js API routes with S3 handlers and routers
- **Configuration Layer**: Upload config and provider setup
- **Storage Layer**: S3-compatible client with aws4fetch

## 🔄 Upload Flow Sequence

The second diagram shows the **complete upload sequence**:

1. Client initiates upload through React hook
2. Request goes to Next.js API route for presigned URLs
3. Server validates files and generates presigned URLs
4. Client uploads directly to S3 storage
5. Client notifies server of completion
6. Server executes completion hooks

## 🎯 Router System Architecture

The third diagram shows how the **S3 router system** works:

- Route definitions using schema builders (`s3.file()`, `s3.image()`, etc.)
- Request processing with action-based routing (presign/complete)
- Integration with validation, middleware, and lifecycle hooks

## 🌐 Multi-Provider System

The fourth diagram shows the **provider architecture**:

- Support for 16+ cloud storage providers organized in tiers
- Configuration validation and endpoint generation
- Unified S3-compatible interface using aws4fetch

## ✅ Schema Validation System  

The fifth diagram shows the **validation pipeline**:

- Different schema types (file, image, array, object)
- Builder pattern for configuration
- Comprehensive validation pipeline with transforms and refinements

## ⚙️ Configuration & Initialization

The sixth diagram shows **how configuration works**:

- Upload config builder with provider, defaults, paths, security, hooks
- Auto-configuration and environment detection
- Global state management
- Build result with all necessary components

## 📁 S3 Client & Storage Operations

The seventh diagram shows the **storage layer operations**:

- Core operations (presigned URLs, uploads, file checks)
- Advanced operations (listing, deletion, batch operations)
- Helper functions and progress monitoring

## 🔧 Current vs Proposed Architecture

The final diagram shows the **migration path**:

- **Current**: Tightly coupled to Next.js with `NextRequest`/`NextResponse`
- **Proposed**: Framework-agnostic with Web Standard handlers and adapters
- **Migration**: Clean transition from current API to new universal API

## Key Insights

1. **Next.js Dependency**: Current system is hardcoded for Next.js only
2. **Solid Foundation**: The core logic (schemas, validation, S3 operations) is framework-agnostic
3. **Clear Separation**: Handler creation is the only part that needs framework adapters
4. **Migration Path**: Can maintain backward compatibility while adding new universal API

The architecture is well-designed with clear separation of concerns. The main task for framework-agnostic support is to extract the Next.js-specific handler logic and create universal Web Standard handlers with framework adapters.
