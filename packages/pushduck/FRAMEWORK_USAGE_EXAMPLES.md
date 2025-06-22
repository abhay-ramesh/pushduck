# Framework Usage Examples

This document shows how to use pushduck with different web frameworks.

## 🌟 Universal API (Framework Agnostic)

```typescript
import { createS3Router, s3 } from 'pushduck/server';

const uploadRouter = createS3Router({
  imageUpload: s3.image().max("5MB"),
  documentUpload: s3.file().max("10MB")
});

// Universal handlers - work with any framework
export const { GET, POST } = uploadRouter.handlers;
```

## 🚀 **Web Standards Native Frameworks** (No Adapter Needed!)

These modern frameworks use Web Standards directly. Just use `uploadRouter.handlers` directly:

### **Hono**

```typescript
// app.ts
import { Hono } from 'hono';
import { uploadRouter } from '@/lib/upload';

const app = new Hono();

// Direct usage - no adapter needed!
app.on(["POST", "GET"], "/api/upload/*", (c) => {
  const method = c.req.method as 'GET' | 'POST';
  return uploadRouter.handlers[method](c.req.raw);
});

// Or with route-specific handlers
app.get('/api/upload/*', (c) => uploadRouter.handlers.GET(c.req.raw));
app.post('/api/upload/*', (c) => uploadRouter.handlers.POST(c.req.raw));
```

### **Elysia**

```typescript
// main.ts
import { Elysia } from 'elysia';
import { uploadRouter } from '@/lib/upload';

const app = new Elysia()
  .all('/api/upload/*', (context) => {
    const method = context.request.method as 'GET' | 'POST';
    return uploadRouter.handlers[method](context.request);
  })
  .listen(3000);

// Or with individual handlers
app.get('/api/upload/*', (ctx) => uploadRouter.handlers.GET(ctx.request))
   .post('/api/upload/*', (ctx) => uploadRouter.handlers.POST(ctx.request));
```

### **Bun Runtime**

```typescript
// server.ts
import { uploadRouter } from '@/lib/upload';

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

### **TanStack Start**

```typescript
// routes/api/upload/$.ts
import { uploadRouter } from '@/lib/upload';
import { createAPIFileRoute } from '@tanstack/start/api';

export const APIRoute = createAPIFileRoute('/api/upload/$')({
  GET: ({ request }) => uploadRouter.handlers.GET(request),
  POST: ({ request }) => uploadRouter.handlers.POST(request)
});
```

### **SolidJS Start**

```typescript
// routes/api/upload/[...path].ts
import { uploadRouter } from '@/lib/upload';

export const GET = (event: { request: Request }) => {
  return uploadRouter.handlers.GET(event.request);
};

export const POST = (event: { request: Request }) => {
  return uploadRouter.handlers.POST(event.request);
};
```

## 🔧 **Legacy Frameworks** (Adapters Required)

These frameworks use older APIs and need adapters:

### **Next.js App Router**

```typescript
// app/api/upload/route.ts
import { createS3Router, s3 } from 'pushduck/server';

const uploadRouter = createS3Router({
  imageUpload: s3.image().max("5MB"),
  documentUpload: s3.file().max("10MB")
});

// Direct usage (recommended)
export const { GET, POST } = uploadRouter.handlers;

// Or with explicit adapter for type safety
import { toNextJsHandler } from 'pushduck/server';
export const { GET, POST } = toNextJsHandler(uploadRouter.handlers);
```

### **Next.js Pages Router**

```typescript
// pages/api/upload/[...path].ts
import { uploadRouter } from '@/lib/upload';
import { toNextJsPagesHandler } from 'pushduck/server';

export default toNextJsPagesHandler(uploadRouter.handlers);
```

### **Express**

```typescript
// server.js
import express from 'express';
import { uploadRouter } from '@/lib/upload';
import { toExpressHandler } from 'pushduck/server';

const app = express();

app.all("/api/upload/*", toExpressHandler(uploadRouter.handlers));
app.listen(3000);
```

### **Fastify**

```typescript
// server.js
import Fastify from 'fastify';
import { uploadRouter } from '@/lib/upload';
import { toFastifyHandler } from 'pushduck/server';

const fastify = Fastify();

fastify.all('/api/upload/*', toFastifyHandler(uploadRouter.handlers));
fastify.listen({ port: 3000 });
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

## 🎯 **Summary**

**Modern frameworks using Web Standards**: Use `uploadRouter.handlers` directly  
**Legacy frameworks**: Use provided adapters like `toExpressHandler()`  

The universal design means you write your upload logic once and it works everywhere! 🚀
