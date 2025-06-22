# Framework Usage Examples

This document shows how to use pushduck with different web frameworks.

## Universal API (Framework Agnostic)

```typescript
import { createS3Router, s3 } from 'pushduck/server';

const uploadRouter = createS3Router({
  imageUpload: s3.image().max("5MB"),
  documentUpload: s3.file().max("10MB")
});

// Universal handlers - work with any framework
export const { GET, POST } = uploadRouter.handlers;
```

## Next.js App Router

```typescript
// app/api/upload/route.ts
import { createS3Router, s3 } from 'pushduck/server';

const uploadRouter = createS3Router({
  imageUpload: s3.image().max("5MB"),
  documentUpload: s3.file().max("10MB")
});

// Direct usage (recommended)
export const { GET, POST } = uploadRouter.handlers;

// Or with explicit adapter
import { toNextJsHandler } from 'pushduck/server';
export const { GET, POST } = toNextJsHandler(uploadRouter.handlers);
```

## Next.js Pages Router

```typescript
// pages/api/upload.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { createS3Router, s3, toNextJsPagesHandler } from 'pushduck/server';

const uploadRouter = createS3Router({
  imageUpload: s3.image().max("5MB"),
  documentUpload: s3.file().max("10MB")
});

export default toNextJsPagesHandler(uploadRouter.handlers);
```

## Express.js

```typescript
// server.js
import express from 'express';
import { createS3Router, s3, toExpressHandler } from 'pushduck/server';

const app = express();
app.use(express.json());

const uploadRouter = createS3Router({
  imageUpload: s3.image().max("5MB"),
  documentUpload: s3.file().max("10MB")
});

// Mount the upload handler
app.use('/api/upload', toExpressHandler(uploadRouter.handlers));

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

## Hono

```typescript
// server.ts
import { Hono } from 'hono';
import { createS3Router, s3, toHonoHandler } from 'pushduck/server';

const app = new Hono();

const uploadRouter = createS3Router({
  imageUpload: s3.image().max("5MB"),
  documentUpload: s3.file().max("10MB")
});

// Option 1: Single handler for all methods
app.all('/api/upload/*', toHonoHandler(uploadRouter.handlers));

// Option 2: Separate handlers per method
import { toHonoRouteHandler } from 'pushduck/server';
const { GET, POST } = toHonoRouteHandler(uploadRouter.handlers);
app.get('/api/upload/*', GET);
app.post('/api/upload/*', POST);

export default app;
```

## Fastify

```typescript
// server.ts
import Fastify from 'fastify';
import { createS3Router, s3, toFastifyHandler } from 'pushduck/server';

const fastify = Fastify({ logger: true });

const uploadRouter = createS3Router({
  imageUpload: s3.image().max("5MB"),
  documentUpload: s3.file().max("10MB")
});

// Option 1: Register route with handler
fastify.route({
  method: ['GET', 'POST'],
  url: '/api/upload/*',
  handler: toFastifyHandler(uploadRouter.handlers)
});

// Option 2: Use route helper
import { toFastifyRouteHandler } from 'pushduck/server';
fastify.route({
  url: '/api/upload/*',
  ...toFastifyRouteHandler(uploadRouter.handlers)
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
```

## 🦋 Elysia

```typescript
// main.ts
import { Elysia } from 'elysia';
import { uploadRouter } from '@/lib/upload';
import { toElysiaHandler } from 'pushduck/server';

const app = new Elysia()
  .all('/api/upload/*', toElysiaHandler(uploadRouter.handlers))
  .listen(3000);

// Or with individual route handlers
import { toElysiaRouteHandler } from 'pushduck/server';
const { GET, POST } = toElysiaRouteHandler(uploadRouter.handlers);

app.get('/api/upload/*', GET)
   .post('/api/upload/*', POST);
```

## 🚀 TanStack Start

```typescript
// routes/api/upload/$.ts
import { uploadRouter } from '@/lib/upload';
import { toTanStackStartHandler } from 'pushduck/server';
import { createAPIFileRoute } from '@tanstack/start/api';

export const APIRoute = createAPIFileRoute('/api/upload/$')({
  ...toTanStackStartHandler(uploadRouter.handlers)
});

// This creates:
// GET: ({ request }) => uploadRouter.handlers.GET(request)
// POST: ({ request }) => uploadRouter.handlers.POST(request)
```

## 🔷 SolidJS Start

```typescript
// routes/api/upload/[...path].ts
import { uploadRouter } from '~/lib/upload';
import { toSolidStartHandler } from 'pushduck/server';

export const { GET, POST } = toSolidStartHandler(uploadRouter.handlers);
```

## Client Usage (Same for All Frameworks)

```typescript
// client.ts
import { useUploadRoute } from 'pushduck/client';

function MyUploadComponent() {
  const { uploadFiles, files, isUploading } = useUploadRoute('imageUpload', {
    endpoint: '/api/upload', // Your framework's endpoint
    onUploadComplete: (results) => {
      console.log('Upload complete:', results);
    },
    onUploadError: (error) => {
      console.error('Upload error:', error);
    }
  });

  return (
    <div>
      <input 
        type="file" 
        onChange={(e) => {
          if (e.target.files) {
            uploadFiles(Array.from(e.target.files));
          }
        }}
      />
      
      {files.map(file => (
        <div key={file.id}>
          {file.name} - {file.status} - {file.progress}%
        </div>
      ))}
    </div>
  );
}
```

## Configuration (Same for All Frameworks)

```typescript
// upload.ts
import { createUploadConfig, s3, createS3Router } from 'pushduck/server';

const { config, storage } = createUploadConfig()
  .provider({
    provider: 'aws',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    region: process.env.AWS_REGION!,
    bucket: process.env.AWS_BUCKET!
  })
  .paths({
    prefix: 'uploads',
    generateKey: (file, metadata) => {
      return `${metadata.userId}/${Date.now()}/${file.name}`;
    }
  })
  .build();

// Create your router with schemas
export const uploadRouter = createS3Router({
  imageUpload: s3.image().max("5MB"),
  documentUpload: s3.file().max("10MB")
});
```

## Framework-Specific Features

### Express with Custom Middleware

```typescript
import express from 'express';
import { createS3Router, s3, toExpressHandler } from 'pushduck/server';

const app = express();
app.use(express.json());

// Custom authentication middleware
const authenticateUser = (req, res, next) => {
  // Your auth logic
  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

const uploadRouter = createS3Router({
  imageUpload: s3.image().max("5MB")
});

// Apply auth middleware before upload handler
app.use('/api/upload', authenticateUser, toExpressHandler(uploadRouter.handlers));
```

### Hono with Middleware

```typescript
import { Hono } from 'hono';
import { jwt } from 'hono/jwt';
import { createS3Router, s3, toHonoHandler } from 'pushduck/server';

const app = new Hono();

const uploadRouter = createS3Router({
  imageUpload: s3.image().max("5MB")
});

// Apply JWT middleware
app.use('/api/upload/*', jwt({ secret: 'your-secret' }));
app.all('/api/upload/*', toHonoHandler(uploadRouter.handlers));
```

### Fastify with Plugins

```typescript
import Fastify from 'fastify';
import { createS3Router, s3, toFastifyHandler } from 'pushduck/server';

const fastify = Fastify({ logger: true });

// Register JWT plugin
await fastify.register(import('@fastify/jwt'), {
  secret: 'your-secret'
});

const uploadRouter = createS3Router({
  imageUpload: s3.image().max("5MB")
});

fastify.route({
  method: ['GET', 'POST'],
  url: '/api/upload/*',
  preHandler: async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  },
  handler: toFastifyHandler(uploadRouter.handlers)
});
```

## Migration from Framework-Specific Solutions

### From Next.js only to Universal

**Before:**

```typescript
// Only worked with Next.js
export const { GET, POST } = createS3Handler(uploadRouter);
```

**After:**

```typescript
// Works with any framework
export const { GET, POST } = uploadRouter.handlers;

// Or explicitly with Next.js adapter
export const { GET, POST } = toNextJsHandler(uploadRouter.handlers);
```

### Benefits of Universal Approach

1. **Framework Flexibility**: Switch frameworks without changing upload logic
2. **Code Reuse**: Share upload configuration across different apps
3. **Testing**: Test upload logic independently of framework
4. **Performance**: Direct Web Standard APIs, no framework overhead
5. **Future-Proof**: Works with new frameworks that support Web Standards

## 🟡 Bun Runtime

```typescript
// server.ts
import { uploadRouter } from '@/lib/upload';
import { toBunHandler } from 'pushduck/server';

const handler = toBunHandler(uploadRouter.handlers);

Bun.serve({
  port: 3000,
  async fetch(request) {
    const url = new URL(request.url);
    
    if (url.pathname.startsWith('/api/upload/')) {
      return handler(request);
    }
    
    return new Response('Not Found', { status: 404 });
  }
});

// Or even simpler with direct handlers:
Bun.serve({
  port: 3000,
  async fetch(request) {
    const url = new URL(request.url);
    
    if (url.pathname.startsWith('/api/upload/')) {
      const method = request.method as 'GET' | 'POST';
      return uploadRouter.handlers[method](request);
    }
    
    return new Response('Not Found', { status: 404 });
  }
});
```
