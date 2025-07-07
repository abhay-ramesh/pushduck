import type { Router } from "@/app/api/upload/route";
import { createUploadClient } from "pushduck/client";

const upload = createUploadClient<Router>({ endpoint: "/api/upload" });

export function PushDuckUpload() {
  const { uploadFiles, files, isUploading } = upload.imageUpload();

  return (
    <input
      type="file"
      onChange={(e) => uploadFiles(Array.from(e.target.files || []))}
      disabled={isUploading}
    />
  );
}
