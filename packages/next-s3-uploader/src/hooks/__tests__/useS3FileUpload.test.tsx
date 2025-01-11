import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useS3FileUpload } from "../useS3FileUpload";

describe("useS3FileUpload", () => {
  beforeEach(() => {
    (global.fetch as ReturnType<typeof vi.fn>).mockClear();
  });

  it("should initialize with empty state", () => {
    const { result } = renderHook(() => useS3FileUpload());

    expect(result.current.uploadedFiles).toEqual([]);
    expect(result.current.isUploading).toBe(false);
  });

  it("should handle file validation", async () => {
    const maxFileSize = 1024; // 1KB
    const { result } = renderHook(() =>
      useS3FileUpload({
        maxFileSize,
        allowedFileTypes: ["image/jpeg"],
      })
    );

    const file = new File(["test"], "test.txt", { type: "text/plain" });

    await expect(result.current.uploadFiles([file])).rejects.toThrow(
      "File validation failed"
    );
  });

  it("should handle successful upload", async () => {
    const mockPresignedUrl = "https://example.com/upload";
    const mockObjectUrl = "https://example.com/file";

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (url: string) => {
        if (url === "/api/s3upload") {
          return {
            ok: true,
            json: async () => [
              {
                key: "test.txt",
                presignedPutUrl: mockPresignedUrl,
                s3ObjectUrl: mockObjectUrl,
              },
            ],
          };
        }
        return {
          ok: true,
        };
      }
    );

    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useS3FileUpload({
        onSuccess,
      })
    );

    const file = new File(["test"], "test.txt", { type: "text/plain" });
    await result.current.uploadFiles([file]);

    expect(result.current.uploadedFiles).toHaveLength(1);
    expect(result.current.uploadedFiles[0].status).toBe("success");
    expect(result.current.uploadedFiles[0].url).toBe(mockObjectUrl);
    expect(onSuccess).toHaveBeenCalledWith(mockObjectUrl, file);
  });

  it("should handle upload error", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (url: string) => ({
        ok: false,
        statusText: "Server Error",
      })
    );

    const onError = vi.fn();
    const { result } = renderHook(() =>
      useS3FileUpload({
        onError,
      })
    );

    const file = new File(["test"], "test.txt", { type: "text/plain" });

    await expect(result.current.uploadFiles([file])).rejects.toThrow(
      "Failed to get presigned URLs: Server Error"
    );

    expect(onError).toHaveBeenCalled();
  });

  it("should handle upload cancellation", async () => {
    const mockPresignedUrl = "https://example.com/upload";
    const mockObjectUrl = "https://example.com/file";

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      async (url: string) => {
        if (url === "/api/s3upload") {
          return {
            ok: true,
            json: async () => [
              {
                key: "test.txt",
                presignedPutUrl: mockPresignedUrl,
                s3ObjectUrl: mockObjectUrl,
              },
            ],
          };
        }
        return new Promise(() => {}); // Never resolves to simulate long upload
      }
    );

    const { result } = renderHook(() => useS3FileUpload());
    const file = new File(["test"], "test.txt", { type: "text/plain" });

    // Start upload
    const uploadPromise = result.current.uploadFiles([file]);

    // Wait for the upload to start
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Cancel upload
    result.current.cancelUpload("test.txt");

    // Wait for the upload to complete
    await expect(uploadPromise).rejects.toThrow();

    expect(result.current.uploadedFiles[0].status).toBe("error");
    expect(result.current.uploadedFiles[0].error?.code).toBe("CANCELLED");
  });
});
