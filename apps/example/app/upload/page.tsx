"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { useS3FileUpload } from "next-s3-uploader";
import Image from "next/image";
import { useRef, useState } from "react";

const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "image/gif"];

export default function UploadPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>(
    {}
  );

  const { uploadedFiles, uploadFiles, reset } = useS3FileUpload({
    multiple: true,
    maxFiles: 5,
    maxFileSize: 5 * 1024 * 1024, // 5MB limit
    onProgress(progress: number, file: File) {
      setUploadProgress((prev) => ({
        ...prev,
        [file.name]: progress,
      }));
    },
    onError(error: Error, file: File) {
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: `Failed to upload ${file.name}: ${error.message}`,
      });
      setUploadProgress((prev) => {
        const newProgress = { ...prev };
        delete newProgress[file.name];
        return newProgress;
      });
    },
    onSuccess(url: string, file: File) {
      toast({
        title: "Upload Complete",
        description: `Successfully uploaded ${file.name}`,
      });
      setUploadProgress((prev) => {
        const newProgress = { ...prev };
        delete newProgress[file.name];
        return newProgress;
      });
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // Validate file types
      const invalidFiles = Array.from(files).filter(
        (file) => !ALLOWED_FILE_TYPES.includes(file.type)
      );

      if (invalidFiles.length > 0) {
        toast({
          variant: "destructive",
          title: "Invalid File Type",
          description: `Only JPEG, PNG, and GIF files are allowed.`,
        });
        return;
      }

      try {
        await uploadFiles(files);
      } catch (error) {
        console.error("Upload failed:", error);
      }
    }
  };

  const isUploading = Object.keys(uploadProgress).length > 0;

  return (
    <div className="container py-10">
      <Card>
        <CardHeader>
          <CardTitle>File Upload Example</CardTitle>
          <CardDescription>
            Upload images to S3 (max 5MB per file, JPEG/PNG/GIF only)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="file">Choose Files</Label>
                <Input
                  id="file"
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_FILE_TYPES.join(",")}
                  multiple
                  onChange={handleFileChange}
                  disabled={isUploading}
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => reset(fileInputRef)}
                  disabled={isUploading || uploadedFiles.length === 0}
                >
                  Reset
                </Button>
              </div>
            </div>

            {uploadedFiles.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {uploadedFiles.map((file, index) => (
                  <Card key={index} className="overflow-hidden">
                    <CardHeader className="p-4">
                      <CardTitle className="text-sm truncate">
                        {file.key.split("/").pop()}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 space-y-2">
                      <div className="space-y-1">
                        <div className="flex gap-2 items-center">
                          <Progress
                            value={file.progress}
                            className={
                              file.status === "success"
                                ? "bg-green-100"
                                : file.status === "error"
                                ? "bg-red-100"
                                : "bg-blue-100"
                            }
                          />
                          <span className="text-sm tabular-nums">
                            {file.progress}%
                          </span>
                        </div>
                        {file.timeLeft && (
                          <p className="text-xs text-muted-foreground">
                            Time left: {file.timeLeft}
                          </p>
                        )}
                      </div>

                      {file.status === "success" && (
                        <div className="relative aspect-video">
                          <Image
                            src={file.url}
                            alt={file.key}
                            fill
                            className="object-cover rounded-md"
                          />
                        </div>
                      )}

                      {file.status === "error" && (
                        <p className="text-sm text-red-500">Upload failed</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
