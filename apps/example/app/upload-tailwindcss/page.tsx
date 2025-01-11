"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";
import { useS3FileUpload } from "next-s3-uploader";
import Image from "next/image";
import React, { useRef } from "react";

function UploadPage() {
  const ref = useRef<HTMLInputElement>(null);
  const { uploadedFiles, uploadFiles, reset } = useS3FileUpload({
    multiple: true,
    maxFiles: 10,
    maxFileSize: 10 * 1024 * 1024, // 10MB limit
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await uploadFiles(files, undefined);
    }
  };

  const handleDownload = async (filekey: string) => {
    const element = document.createElement("a");
    element.href =
      filekey +
      `?response-content-disposition=attachment%3B%20filename%3D${filekey
        .split("/")
        .pop()}`;
    element.download = filekey.split("/").pop()!;
    document.body.appendChild(element);
    element.click();

    element.remove();
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container p-4 pt-24 mx-auto prose">
        <h1 className="">File Upload to Amazon S3</h1>
        <div className="flex gap-2">
          <input
            title="Upload File"
            ref={ref}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="flex w-full h-10 px-3 py-2 text-sm border rounded-md border-input bg-background ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <Button
            onClick={() => {
              reset(ref);
            }}
          >
            Reset
          </Button>
        </div>
        <div className="mt-4">
          {uploadedFiles.map((file, index) => (
            <div
              key={index}
              className={cn("mt-4 border border-gray-300 p-4 rounded-md", {
                "ring-2 ring-green-500": file.status === "success",
                "ring-2 ring-red-500": file.status === "error",
                "ring-2 ring-blue-800": file.status === "uploading",
              })}
            >
              <div className="gap-4 mt-4">
                <pre>
                  <code lang="json">{JSON.stringify(file, null, 2)}</code>
                </pre>

                <div>
                  <Label>File Name</Label>
                  <Input
                    type="text"
                    value={file.key.split("/").pop()}
                    className="bg-gray-100"
                    readOnly
                  />
                </div>
                <div>
                  <Label>File Key</Label>
                  <Input
                    type="text"
                    value={file.key}
                    className="bg-gray-100"
                    readOnly
                  />
                </div>
                {file.status !== "error" && (
                  <div className="w-full">
                    <Label>File URL</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        value={file.url}
                        className="bg-gray-100"
                        readOnly
                      />
                      <a
                        href={
                          file.url +
                          `?response-content-disposition=attachment%3B%20filename%3D${file.key
                            .split("/")
                            .pop()}`
                        }
                        download={file.key.split("/").pop()}
                        className={cn(
                          buttonVariants({ variant: "default", size: "icon" }),
                          "aspect-square"
                        )}
                      >
                        <Download />
                      </a>
                    </div>
                  </div>
                )}
              </div>
              <p>Status: {file.status}</p>
              <Label>Progress</Label>
              <div className="flex items-center">
                <Progress
                  value={file.progress}
                  color={cn({
                    "bg-green-500": file.status === "success",
                    "bg-red-500": file.status === "error",
                    "bg-blue-800": file.status === "uploading",
                  })}
                  className="bg-blue-200"
                />
                <text className="ml-2">{file.progress}% </text>
              </div>
              {file.status === "uploading"
                ? "Estimated Time Left: (" + file.timeLeft + ")"
                : null}
              {file.status === "success" && (
                <Image
                  src={file.url}
                  alt={`Uploaded File ${index}`}
                  width={200}
                  height={200}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default UploadPage;
