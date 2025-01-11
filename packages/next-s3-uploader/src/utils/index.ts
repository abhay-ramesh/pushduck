import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CompletedPart,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  GetObjectCommandInput,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
  S3ClientConfig,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type S3Config = {
  provider: "aws" | "minio" | "other";
  endpoint?: string;
  region: string;
  forcePathStyle?: boolean;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  maxRetries?: number;
  timeout?: number;
  customUserAgent?: string;
};

export type ChunkConfig = {
  chunkSize?: number;
  concurrency?: number;
  onProgress?: (progress: number) => void;
};

// Create an S3 Client instance with enhanced configuration
export const createS3Client = (config: S3Config): S3Client => {
  const {
    provider,
    endpoint,
    region,
    forcePathStyle,
    credentials,
    maxRetries = 3,
    customUserAgent,
  } = config;

  const clientConfig: S3ClientConfig = {
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
    maxAttempts: maxRetries,
    ...(customUserAgent && {
      customUserAgent,
    }),
    ...(provider !== "aws" && {
      endpoint,
      forcePathStyle: forcePathStyle !== undefined ? forcePathStyle : true,
    }),
  };

  return new S3Client(clientConfig);
};

// Helper function to create chunks from a file
const createFileChunks = (file: File, chunkSize: number): Blob[] => {
  const chunks: Blob[] = [];
  let start = 0;

  while (start < file.size) {
    const end = Math.min(start + chunkSize, file.size);
    chunks.push(file.slice(start, end));
    start = end;
  }

  return chunks;
};

// Upload a file in chunks
export const uploadFileInChunks = async (
  s3Client: S3Client,
  file: File,
  bucket: string,
  key: string,
  config: ChunkConfig = {}
) => {
  const {
    chunkSize = 5 * 1024 * 1024, // 5MB default chunk size
    concurrency = 3,
    onProgress,
  } = config;

  // Create multipart upload
  const createMultipartResponse = await s3Client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: file.type,
    })
  );

  const uploadId = createMultipartResponse.UploadId;
  if (!uploadId) throw new Error("Failed to create multipart upload");

  try {
    const chunks = createFileChunks(file, chunkSize);
    const completedParts: CompletedPart[] = [];
    let completedSize = 0;

    // Process chunks in batches for controlled concurrency
    for (let i = 0; i < chunks.length; i += concurrency) {
      const batch = chunks.slice(i, i + concurrency);
      const batchPromises = batch.map(async (chunk, index) => {
        const partNumber = i + index + 1;

        const uploadPartResponse = await s3Client.send(
          new UploadPartCommand({
            Bucket: bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
            Body: chunk,
          })
        );

        completedSize += chunk.size;
        onProgress?.(Math.round((completedSize / file.size) * 100));

        return {
          ETag: uploadPartResponse.ETag!,
          PartNumber: partNumber,
        } as CompletedPart;
      });

      const batchResults = await Promise.all(batchPromises);
      completedParts.push(...batchResults);
    }

    // Complete multipart upload
    await s3Client.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: completedParts.sort(
            (a, b) => (a.PartNumber || 0) - (b.PartNumber || 0)
          ),
        },
      })
    );

    return true;
  } catch (error) {
    // Abort multipart upload on failure
    await s3Client.send(
      new AbortMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId: uploadId,
      })
    );
    throw error;
  }
};

// Generate Presigned URLs with enhanced configuration
export async function generatePresignedUrls(
  s3Client: S3Client,
  keys: string[],
  bucket: string,
  prefix?: string,
  privateBucket: boolean = false,
  operation: "upload" | "download" = "upload",
  options?: {
    expiresIn?: number;
    contentType?: string;
    metadata?: Record<string, string>;
    acl?: string;
  }
) {
  const urls = [];

  for (const key of keys) {
    const newKey = `${prefix ?? ""}${key}`;
    const commandInput: PutObjectCommandInput | GetObjectCommandInput = {
      Bucket: bucket,
      Key: newKey,
      ...(options?.contentType && { ContentType: options.contentType }),
      ...(options?.metadata && { Metadata: options.metadata }),
      ...(options?.acl && { ACL: options.acl }),
    };

    if (operation === "upload") {
      const presignedPutUrl = await getSignedUrl(
        s3Client,
        new PutObjectCommand(commandInput as PutObjectCommandInput),
        {
          expiresIn: options?.expiresIn ?? 3600,
        }
      );

      let s3ObjectUrl = "";

      if (!privateBucket) {
        s3ObjectUrl = presignedPutUrl.split("?")[0];
      } else {
        s3ObjectUrl = await getSignedUrl(
          s3Client,
          new GetObjectCommand(commandInput as GetObjectCommandInput),
          {
            expiresIn: options?.expiresIn ?? 3600,
          }
        );
      }

      urls.push({
        key: newKey,
        presignedPutUrl,
        s3ObjectUrl,
      });
    } else if (operation === "download") {
      const s3ObjectUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand(commandInput as GetObjectCommandInput),
        {
          expiresIn: options?.expiresIn ?? 3600,
        }
      );

      urls.push({
        key: newKey,
        s3ObjectUrl,
      });
    }
  }

  return urls;
}
