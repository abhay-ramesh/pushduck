/**
 * A consumer's client module: imports only `pushduck/client`, plus the router
 * *type* from the server module, as a monorepo's web app does.
 */
import { createUploadClient, useUploadRoute } from "pushduck/client";
import type { AppRouter } from "./server.js";

export const upload = createUploadClient<AppRouter>({
  endpoint: "/api/upload",
});
export const avatarRoute = upload.avatar;
export const useAvatar = () =>
  upload.avatar({ onError: (error) => void error });
export const useDocument = () => useUploadRoute<AppRouter>("document");

// Route names are checked, so no `upload.avatar!()` under
// noUncheckedIndexedAccess: the client is a closed object, not an index
// signature over `any`.
// @ts-expect-error -- not a route on AppRouter
export const missing = upload.notARoute;
