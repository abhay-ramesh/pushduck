# Complete Implementation Requirements

## Step-by-Step Implementation Plan

### 🎯 Phase 1: Core Foundation (Essential)

#### Step 1: Extract Universal Handler Logic

**Priority: CRITICAL - This is the foundation**

**Current Issue**: `createS3Handler` in `router-v2.ts` is tightly coupled to Next.js

**Action**: Create universal handler logic that uses Web Standards

**File**: `packages/pushduck/src/core/handler/universal-handler.ts` (new)

```typescript
// Extract current logic from createS3Handler but use Web Standards
export async function createUniversalHandler<TRoutes extends S3RouterDefinition>(
  router: S3Router<TRoutes>
): Promise<{
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
}> {
  // Port existing logic from lines 450-537 in router-v2.ts
  // Replace NextRequest/NextResponse with Request/Response
}
```

**Changes Needed**:

- [ ] Copy existing POST logic from `router-v2.ts` lines 450-522
- [ ] Copy existing GET logic from `router-v2.ts` lines 523-537
- [ ] Replace `NextRequest` with `Request`
- [ ] Replace `NextResponse.json()` with `new Response()`
- [ ] Replace `req.json()` with `request.json()`
- [ ] Replace `new URL(req.url)` with `new URL(request.url)`

#### Step 2: Add .handlers Property to S3Router

**Priority: CRITICAL - This is the main API**

**File**: `packages/pushduck/src/core/router/router-v2.ts`

**Current Code** (lines 242-254):

```typescript
export class S3Router<TRoutes extends S3RouterDefinition> {
  constructor(private routes: TRoutes) {}

  getRoute<K extends keyof TRoutes>(routeName: K): TRoutes[K] | undefined {
    return this.routes[routeName];
  }

  getRouteNames(): (keyof TRoutes)[] {
    return Object.keys(this.routes);
  }
}
```

**Add After Line 254**:

```typescript
  // Add the .handlers property
  get handlers() {
    return createUniversalHandler(this);
  }
```

**Changes Needed**:

- [ ] Import `createUniversalHandler` from `../handler/universal-handler`
- [ ] Add `.handlers` getter property
- [ ] Remove Next.js imports from top of file

#### Step 3: Update createS3Handler to Use Universal Handler

**Priority: HIGH - Maintains current Next.js compatibility**

**File**: `packages/pushduck/src/core/router/router-v2.ts`

**Current Code** (lines 444-537):

```typescript
export function createS3Handler<TRoutes extends S3RouterDefinition>(
  router: S3Router<TRoutes>
) {
  // ... existing Next.js specific logic
  return { GET, POST };
}
```

**Replace With**:

```typescript
export function createS3Handler<TRoutes extends S3RouterDefinition>(
  router: S3Router<TRoutes>
) {
  // Use the new universal handlers with Next.js adapter
  return toNextJsHandler(router.handlers);
}
```

**Changes Needed**:

- [ ] Replace entire `createS3Handler` function body
- [ ] Import `toNextJsHandler` from `../adapters/nextjs`

### 🎯 Phase 2: Next.js Adapter (Compatibility)

#### Step 4: Create Next.js Adapter

**Priority: HIGH - Needed for current users**

**File**: `packages/pushduck/src/adapters/nextjs.ts` (new)

```typescript
import type { NextRequest } from 'next/server';

export function toNextJsHandler(handlers: {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
}) {
  return {
    GET: async (req: NextRequest) => {
      const response = await handlers.GET(req);
      return response; // Response is compatible with NextResponse
    },
    POST: async (req: NextRequest) => {
      const response = await handlers.POST(req);
      return response;
    }
  };
}
```

**Changes Needed**:

- [ ] Create new adapter file
- [ ] Handle NextRequest → Request conversion (if needed)
- [ ] Handle Response → NextResponse conversion (if needed)
- [ ] Test compatibility with Next.js runtime

#### Step 5: Update Package Dependencies

**Priority: MEDIUM - Needed for adapters**

**File**: `packages/pushduck/package.json`

**Add to existing package.json**:

```json
{
  "peerDependencies": {
    "next": ">=13.0.0",
    "express": ">=4.18.0",
    "@types/express": "*",
    "hono": ">=3.0.0",
    "fastify": ">=4.0.0"
  },
  "peerDependenciesMeta": {
    "next": { "optional": true },
    "express": { "optional": true },
    "@types/express": { "optional": true },
    "hono": { "optional": true },
    "fastify": { "optional": true }
  }
}
```

### 🎯 Phase 3: Additional Framework Adapters

#### Step 6: Create Express Adapter

**Priority: HIGH - Popular framework**

**File**: `packages/pushduck/src/adapters/express.ts` (new)

```typescript
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';

export function toExpressHandler(handlers: {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
}) {
  return async (req: ExpressRequest, res: ExpressResponse) => {
    const method = req.method as 'GET' | 'POST';
    const webRequest = convertExpressToWebRequest(req);
    const response = await handlers[method](webRequest);
    await convertWebResponseToExpress(response, res);
  };
}
```

#### Step 7: Create Hono Adapter

**Priority: HIGH - Growing framework**

**File**: `packages/pushduck/src/adapters/hono.ts` (new)

```typescript
import type { Context } from 'hono';

export function toHonoHandler(handlers: {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
}) {
  return async (c: Context) => {
    const method = c.req.method as 'GET' | 'POST';
    const response = await handlers[method](c.req.raw);
    return response; // Hono accepts standard Response
  };
}
```

#### Step 8: Create Request/Response Converters

**Priority: MEDIUM - Needed for Express/Fastify**

**File**: `packages/pushduck/src/adapters/utils/request-converters.ts` (new)

```typescript
export function convertExpressToWebRequest(req: any): Request {
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const headers = new Headers();
  
  Object.entries(req.headers).forEach(([key, value]) => {
    if (value) headers.append(key, value as string);
  });

  return new Request(url, {
    method: req.method,
    headers,
    body: req.method === 'POST' ? JSON.stringify(req.body) : undefined,
  });
}
```

**File**: `packages/pushduck/src/adapters/utils/response-converters.ts` (new)

```typescript
export async function convertWebResponseToExpress(
  response: Response, 
  res: any
): Promise<void> {
  res.status(response.status);
  
  response.headers.forEach((value, key) => {
    res.header(key, value);
  });
  
  const body = await response.text();
  res.send(body);
}
```

### 🎯 Phase 4: Type System & Exports

#### Step 9: Create Handler Types

**Priority: MEDIUM - TypeScript support**

**File**: `packages/pushduck/src/types/handlers.ts` (new)

```typescript
export interface UniversalHandlers {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
}

export interface NextJsHandlers {
  GET: (req: NextRequest) => Promise<Response>;
  POST: (req: NextRequest) => Promise<Response>;
}

export interface ExpressHandler {
  (req: ExpressRequest, res: ExpressResponse): Promise<void>;
}

export interface HonoHandler {
  (c: Context): Promise<Response>;
}
```

#### Step 10: Update Exports

**Priority: HIGH - Public API**

**File**: `packages/pushduck/src/server.ts`

**Add to existing exports**:

```typescript
// Framework adapters
export { toNextJsHandler } from "./adapters/nextjs";
export { toExpressHandler } from "./adapters/express";
export { toHonoHandler } from "./adapters/hono";

// Handler types
export type { UniversalHandlers, NextJsHandlers, ExpressHandler, HonoHandler } from "./types/handlers";
```

### 🎯 Phase 5: Testing & Validation

#### Step 11: Create Tests

**Priority: HIGH - Ensure compatibility**

**File**: `packages/pushduck/src/core/handler/universal-handler.test.ts` (new)

```typescript
import { describe, it, expect } from 'vitest';
import { createUniversalHandler } from './universal-handler';

describe('Universal Handler', () => {
  it('should handle GET requests', async () => {
    // Test with mock router
  });
  
  it('should handle POST requests', async () => {
    // Test presign and complete actions
  });
});
```

#### Step 12: Update Documentation

**Priority: MEDIUM - User guidance**

**Files to Update**:

- [ ] `packages/pushduck/README.md`
- [ ] `docs/content/docs/api/` files
- [ ] Example applications

### 🎯 Implementation Order Summary

**Week 1: Core Foundation**

1. ✅ Step 1: Extract universal handler logic
2. ✅ Step 2: Add .handlers property to S3Router
3. ✅ Step 3: Update createS3Handler to use universal handler

**Week 2: Next.js Compatibility**
4. ✅ Step 4: Create Next.js adapter
5. ✅ Step 5: Update package dependencies

**Week 3: Framework Expansion**
6. ✅ Step 6: Create Express adapter
7. ✅ Step 7: Create Hono adapter
8. ✅ Step 8: Create request/response converters

**Week 4: Polish & Release**
9. ✅ Step 9: Create handler types
10. ✅ Step 10: Update exports
11. ✅ Step 11: Create tests
12. ✅ Step 12: Update documentation

## Critical Dependencies Between Steps

- **Step 2 depends on Step 1** - Can't add .handlers property without universal handler
- **Step 3 depends on Step 4** - Can't update createS3Handler without Next.js adapter
- **Step 6 depends on Step 8** - Express adapter needs request/response converters
- **Step 10 depends on Steps 4,6,7** - Can't export adapters that don't exist

## Validation Checkpoints

After each phase, validate:

1. **Phase 1**: Existing Next.js apps still work
2. **Phase 2**: `uploadRouter.handlers` works in Next.js
3. **Phase 3**: Express and Hono examples work
4. **Phase 4**: TypeScript inference works correctly
5. **Phase 5**: All tests pass, documentation is complete

## Risk Mitigation

- **Keep createS3Handler working** - Don't break existing users
- **Test with real frameworks** - Don't rely on mocks only
- **Gradual rollout** - Phase by phase implementation
- **Type safety** - Ensure TypeScript support throughout

---

## 1. Core Architecture Changes

### 1.1 Enhance S3Router Class

**File:** `packages/pushduck/src/core/router/router-v2.ts`

**Requirements:**

- [ ] Add `.handlers` property that returns `{ GET, POST }` using Web Standard `Request`/`Response`
- [ ] Refactor existing Next.js-specific code to use Web Standards internally
- [ ] Create core `handleRequest(method: string, request: Request)` method
- [ ] Remove Next.js imports from core router (move to adapter)

### 1.2 Create Universal Handler Logic

**File:** `packages/pushduck/src/core/handler/universal-handler.ts` (new)

**Requirements:**

- [ ] Implement Web Standard Request/Response handling
- [ ] Port existing logic from Next.js-specific handlers
- [ ] Handle URL parsing, route detection, action detection using Web APIs
- [ ] Implement error handling with standard Response objects
- [ ] Support both presign and complete actions

## 2. Framework Adapters

### 2.1 Next.js Adapter

**File:** `packages/pushduck/src/adapters/nextjs.ts` (new)

**Requirements:**

- [ ] `toNextJsHandler()` function that converts Web handlers to Next.js format
- [ ] Support for Next.js App Router (`NextRequest`/`NextResponse`)
- [ ] Support for Next.js Pages Router (Node.js style)
- [ ] Handle Next.js-specific request/response conversion
- [ ] Preserve Next.js streaming and edge runtime compatibility

### 2.2 Express Adapter  

**File:** `packages/pushduck/src/adapters/express.ts` (new)

**Requirements:**

- [ ] `toExpressHandler()` function for Express middleware format
- [ ] Convert Express `req`/`res` to/from Web `Request`/`Response`
- [ ] Handle Express body parsing integration
- [ ] Support both individual route handlers and middleware patterns
- [ ] Handle Express error propagation

### 2.3 Hono Adapter

**File:** `packages/pushduck/src/adapters/hono.ts` (new)

**Requirements:**

- [ ] `toHonoHandler()` function for Hono context
- [ ] Convert Hono `Context` to/from Web Standards
- [ ] Support Hono's streaming responses
- [ ] Handle Hono middleware integration

### 2.4 Fastify Adapter

**File:** `packages/pushduck/src/adapters/fastify.ts` (new)

**Requirements:**

- [ ] `toFastifyHandler()` function for Fastify request/reply
- [ ] Convert Fastify request/reply to/from Web Standards
- [ ] Handle Fastify schema integration
- [ ] Support Fastify plugins pattern

## 3. Request/Response Conversion Utilities

### 3.1 Request Converters

**File:** `packages/pushduck/src/adapters/utils/request-converters.ts` (new)

**Requirements:**

- [ ] `convertExpressToWebRequest(req: ExpressRequest): Request`
- [ ] `convertFastifyToWebRequest(request: FastifyRequest): Request`
- [ ] `convertHonoToWebRequest(c: Context): Request`
- [ ] Handle headers, body, URL, method conversion consistently

### 3.2 Response Converters  

**File:** `packages/pushduck/src/adapters/utils/response-converters.ts` (new)

**Requirements:**

- [ ] `convertWebResponseToExpress(response: Response, res: ExpressResponse): void`
- [ ] `convertWebResponseToFastify(response: Response, reply: FastifyReply): void`
- [ ] Handle status codes, headers, body streaming
- [ ] Preserve response timing and performance

## 4. Package Dependencies

### 4.1 Package.json Updates

**File:** `packages/pushduck/package.json`

**Requirements:**

- [ ] Add peer dependencies for all supported frameworks:

  ```json
  {
    "peerDependencies": {
      "next": ">=13.0.0",
      "express": ">=4.18.0",
      "@types/express": "*",
      "hono": ">=3.0.0",
      "fastify": ">=4.0.0"
    },
    "peerDependenciesMeta": {
      "next": { "optional": true },
      "express": { "optional": true },
      "@types/express": { "optional": true },
      "hono": { "optional": true },
      "fastify": { "optional": true }
    }
  }
  ```

### 4.2 Dynamic Import Handling

**Requirements:**

- [ ] Implement graceful fallbacks when frameworks aren't installed
- [ ] Use dynamic imports for framework-specific code
- [ ] Provide clear error messages when missing dependencies
- [ ] Type-only imports for TypeScript definitions

## 5. Type System Updates

### 5.1 Universal Handler Types

**File:** `packages/pushduck/src/types/handlers.ts` (new)

**Requirements:**

- [ ] `UniversalHandlers` interface for Web Standard handlers
- [ ] `FrameworkAdapter<T>` generic type for adapters
- [ ] Framework-specific handler types (NextJsHandlers, ExpressHandler, etc.)
- [ ] Request/Response conversion utility types

### 5.2 Update Existing Types

**File:** `packages/pushduck/src/types/index.ts`

**Requirements:**

- [ ] Export new handler types
- [ ] Update S3Router type to include new `.handlers` property
- [ ] Remove old framework-specific method types

## 6. File Structure Changes

### 6.1 New Directory Structure

```
packages/pushduck/src/
├── core/
│   ├── handler/
│   │   └── universal-handler.ts          # New universal handler
│   └── router/
│       └── router-v2.ts                  # Enhanced router
├── adapters/
│   ├── index.ts                          # Export all adapters
│   ├── nextjs.ts                         # Next.js adapter
│   ├── express.ts                        # Express adapter
│   ├── hono.ts                           # Hono adapter
│   ├── fastify.ts                        # Fastify adapter
│   └── utils/
│       ├── request-converters.ts         # Request conversion utils
│       └── response-converters.ts        # Response conversion utils
├── types/
│   └── handlers.ts                       # New handler types
└── index.ts                              # Updated exports
```

### 6.2 Export Updates

**File:** `packages/pushduck/src/index.ts`

**Requirements:**

- [ ] Export all adapter functions
- [ ] Export new handler types
- [ ] Remove old createS3Handler export

## 7. Testing Requirements

### 7.1 Unit Tests

**Requirements:**

- [ ] Test universal handler with standard Request/Response
- [ ] Test each framework adapter individually
- [ ] Test request/response conversion utilities
- [ ] Test error handling across all adapters
- [ ] Test type inference still works correctly

### 7.2 Integration Tests

**Requirements:**

- [ ] Test actual framework integration (Next.js, Express, Hono)
- [ ] Test file upload flow end-to-end with each adapter
- [ ] Test middleware and lifecycle hooks work with adapters
- [ ] Performance benchmarks comparing old vs new approach

### 7.3 Framework-Specific Test Setup

**Requirements:**

- [ ] Next.js test server setup
- [ ] Express test server setup  
- [ ] Hono test server setup
- [ ] Mocked S3 operations for testing

## 8. Documentation Updates

### 8.1 API Documentation

**Requirements:**

- [ ] Document new `.handlers` property
- [ ] Document all framework adapters
- [ ] Framework-specific setup guides

### 8.2 Examples

**Requirements:**

- [ ] Update existing Next.js examples
- [ ] Create Express.js example
- [ ] Create Hono example
- [ ] Create Fastify example
- [ ] Show both universal and framework-specific usage

## 9. Error Handling & Validation

### 9.1 Runtime Checks

**Requirements:**

- [ ] Validate framework is installed before using adapter
- [ ] Graceful error messages for missing peer dependencies
- [ ] Validate Web Standard Request/Response compatibility
- [ ] Framework-specific error handling patterns

## 10. Performance Considerations

### 10.1 Bundle Size

**Requirements:**

- [ ] Tree-shakeable framework adapters
- [ ] Lazy loading of framework-specific code
- [ ] Minimize core bundle impact
- [ ] Bundle size analysis and comparison

### 10.2 Runtime Performance  

**Requirements:**

- [ ] Minimize request/response conversion overhead
- [ ] Maintain streaming support where possible
- [ ] Performance benchmarks vs current implementation

## Implementation Priority

**Phase 1: Core (Essential)**

1. Enhance S3Router with `.handlers` property
2. Create universal handler logic
3. Next.js adapter (since currently used)

**Phase 2: Additional Frameworks**
4. Express adapter
5. Hono adapter
6. Request/response converters

**Phase 3: Polish**
7. Fastify adapter
8. Comprehensive testing
9. Documentation updates
10. Performance optimization

## Usage Examples

### Clean Universal API (Your Preference)

```typescript
const uploadRouter = s3.createRouter({
  imageUpload: s3.image().max("5MB")
});

// Works with any framework supporting Web Standards
export const { GET, POST } = uploadRouter.handlers;
```

### Framework-Specific Usage

```typescript
// Next.js
export const { GET, POST } = toNextJsHandler(uploadRouter.handlers);

// Express
app.use('/api/upload', toExpressHandler(uploadRouter.handlers));

// Hono
app.on(['GET', 'POST'], '/api/upload/*', toHonoHandler(uploadRouter.handlers));

// Fastify
fastify.route({
  method: ['GET', 'POST'],
  url: '/api/upload/*',
  handler: toFastifyHandler(uploadRouter.handlers)
});
```

Would you like me to start implementing any specific phase or component from this list?
