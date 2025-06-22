# Framework Standards Analysis

## ✅ **Frameworks That DON'T Need Adapters (Web Standards Native)**

### **1. Hono**

- **Uses Web Standards directly**: `c.req.raw` is already a Web `Request`
- **Returns Web Response**: Accepts standard `Response` objects
- **Usage**: `uploadRouter.handlers.GET(c.req.raw)`
- **Conclusion**: ❌ Remove adapter, ✅ Document only

### **2. Elysia**

- **Uses Web Standards**: `context.request` is Web `Request`
- **Returns Web Response**: Accepts standard `Response` objects
- **Usage**: `uploadRouter.handlers.GET(context.request)`
- **Conclusion**: ❌ Remove adapter, ✅ Document only

### **3. Bun Runtime**

- **Uses Web Standards**: `request` parameter is Web `Request`
- **Returns Web Response**: Expects standard `Response` objects
- **Usage**: `uploadRouter.handlers.GET(request)`
- **Conclusion**: ❌ Remove adapter, ✅ Document only

### **4. TanStack Start**

- **Uses Web Standards**: `{ request }` is Web `Request`
- **Returns Web Response**: Expects standard `Response` objects
- **Usage**: `uploadRouter.handlers.GET(request)`
- **Conclusion**: ❌ Remove adapter, ✅ Document only

### **5. SolidJS Start**

- **Uses Web Standards**: `event.request` is Web `Request`
- **Returns Web Response**: Expects standard `Response` objects
- **Usage**: `uploadRouter.handlers.GET(event.request)`
- **Conclusion**: ❌ Remove adapter, ✅ Document only

## 🔧 **Frameworks That NEED Adapters (Legacy/Different APIs)**

### **1. Express**

- **Legacy API**: Uses `req`/`res` objects, not Web Standards
- **Conversion needed**: `req` → `Request`, `Response` → `res`
- **Conclusion**: ✅ Keep adapter

### **2. Fastify**

- **Legacy API**: Uses `request`/`reply` objects, not Web Standards
- **Conversion needed**: `request` → `Request`, `Response` → `reply`
- **Conclusion**: ✅ Keep adapter

### **3. Next.js Pages Router**

- **Legacy API**: Uses `req`/`res` objects, not Web Standards
- **Conversion needed**: `NextApiRequest` → `Request`, `Response` → `NextApiResponse`
- **Conclusion**: ✅ Keep adapter

## 📝 **Next.js App Router Special Case**

- **Web Standards Compatible**: Uses Web `Request`/`Response`
- **Direct Usage**: `uploadRouter.handlers` works directly
- **Optional Adapter**: For explicit typing only
- **Conclusion**: 🤔 Keep minimal adapter for typing, document direct usage

## 🎯 **Recommendation**

**Remove these adapters** (use documentation only):

- ❌ `toHonoHandler` / `toHonoRouteHandler`
- ❌ `toElysiaHandler` / `toElysiaRouteHandler`
- ❌ `toBunHandler`
- ❌ `toTanStackStartHandler`
- ❌ `toSolidStartHandler`

**Keep these adapters** (actually needed):

- ✅ `toExpressHandler`
- ✅ `toFastifyHandler`
- ✅ `toNextJsPagesHandler`
- ✅ `toNextJsHandler` (minimal, for typing)
