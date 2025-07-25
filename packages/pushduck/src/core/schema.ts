/**
 * @fileoverview Core Schema System for pushduck
 *
 * This module provides the foundation of the type-safe API that enables:
 * - Declarative file validation with runtime type checking
 * - Chainable API similar to Zod for intuitive schema building
 * - TypeScript inference for compile-time type safety
 * - Transform pipeline support for data processing
 * - Lifecycle hooks for upload events
 *
 * The schema system is the heart of pushduck's type-safe approach to file uploads,
 * allowing developers to define validation rules that are enforced both at
 * compile-time and runtime.
 *
 * @example Basic File Schema
 * ```typescript
 * import { S3FileSchema } from 'pushduck/server';
 *
 * const documentSchema = new S3FileSchema({
 *   maxSize: '10MB',
 *   allowedTypes: ['application/pdf', 'application/msword'],
 *   allowedExtensions: ['.pdf', '.doc', '.docx'],
 * });
 *
 * // Use in router
 * const router = s3.createRouter({
 *   documentUpload: documentSchema,
 * });
 * ```
 *
 * @example Chainable API
 * ```typescript
 * const imageSchema = s3.image()
 *   .maxFileSize('5MB')
 *   .types(['image/jpeg', 'image/png'])
 *   .refine(
 *     async ({ file }) => file.name.includes('avatar'),
 *     'File name must contain "avatar"'
 *   )
 *   .transform(async ({ file, metadata }) => ({
 *     ...metadata,
 *     processedAt: new Date().toISOString(),
 *   }));
 * ```
 *
 *
 * @example Object Schema
 * ```typescript
 * const formSchema = s3.object({
 *   avatar: s3.image().maxFileSize('1MB'),
 *   documents: s3.file().types(['application/pdf']).maxFiles(5),
 *   metadata: s3.object({
 *     title: s3.string(),
 *     description: s3.string().optional(),
 *   }),
 * });
 * ```
 *
 */

import { S3Route } from "./router/router-v2";

// ========================================
// Core Types
// ========================================

/**
 * File validation constraints for S3 schemas.
 * These constraints are applied during validation to ensure uploaded files
 * meet the specified requirements.
 *
 * @interface S3FileConstraints
 *
 * @example
 * ```typescript
 * const constraints: S3FileConstraints = {
 *   maxSize: '10MB',        // or 10485760 (bytes)
 *   minSize: '1KB',         // or 1024 (bytes)
 *   allowedTypes: ['image/jpeg', 'image/png', 'application/pdf'],
 *   allowedExtensions: ['.jpg', '.jpeg', '.png', '.pdf'],
 *   required: true,
 * };
 * ```
 */
export interface S3FileConstraints {
  /** Maximum file size (string like '10MB' or number in bytes) */
  maxSize?: string | number;
  /** Minimum file size (string like '1KB' or number in bytes) */
  minSize?: string | number;
  /** Allowed MIME types (e.g., ['image/jpeg', 'application/pdf']) */
  allowedTypes?: string[];
  /** Allowed file extensions (e.g., ['.jpg', '.pdf']) */
  allowedExtensions?: string[];
  /** Whether the file is required (default: true) */
  required?: boolean;
}

/**
 * Array validation constraints for file arrays.
 * Used when validating multiple files uploaded together.
 *
 * @interface S3ArrayConstraints
 *
 * @example
 * ```typescript
 * const arrayConstraints: S3ArrayConstraints = {
 *   min: 1,      // At least 1 file required
 *   max: 10,     // Maximum 10 files allowed
 *   length: 5,   // Exactly 5 files required
 * };
 * ```
 */
export interface S3ArrayConstraints {
  /** Minimum number of files in the array */
  min?: number;
  /** Maximum number of files in the array */
  max?: number;
  /** Exact number of files required (overrides min/max) */
  length?: number;
}

/**
 * Context object provided to validation functions.
 * Contains information about the file being validated and the validation environment.
 *
 * @interface S3ValidationContext
 *
 * @example
 * ```typescript
 * const validator = async (ctx: S3ValidationContext) => {
 *   console.log(`Validating ${ctx.file.name} in field ${ctx.fieldName}`);
 *
 *   if (ctx.allFiles) {
 *     const totalSize = Object.values(ctx.allFiles)
 *       .flat()
 *       .reduce((sum, file) => sum + file.size, 0);
 *
 *     return totalSize < 50 * 1024 * 1024; // Total < 50MB
 *   }
 *
 *   return true;
 * };
 * ```
 */
export interface S3ValidationContext {
  /** The file being validated */
  file: File;
  /** Name of the field/property being validated */
  fieldName: string;
  /** All files in the upload (for cross-file validation) */
  allFiles?: Record<string, File | File[]>;
}

/**
 * Result object returned from validation operations.
 * Indicates whether validation passed and provides error details if it failed.
 *
 * @interface S3ValidationResult
 *
 * @example Success Result
 * ```typescript
 * const successResult: S3ValidationResult = {
 *   success: true,
 *   data: processedFile,
 * };
 * ```
 *
 * @example Error Result
 * ```typescript
 * const errorResult: S3ValidationResult = {
 *   success: false,
 *   error: {
 *     code: 'FILE_TOO_LARGE',
 *     message: 'File size exceeds 10MB limit',
 *     path: ['avatar'],
 *   },
 * };
 * ```
 */
export interface S3ValidationResult {
  /** Whether validation succeeded */
  success: boolean;
  /** Error details if validation failed */
  error?: {
    /** Error code for programmatic handling */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Path to the field that failed validation */
    path: string[];
  };
  /** Processed/transformed data if validation succeeded */
  data?: any;
}

/**
 * Context object provided to transform functions.
 * Contains the file and metadata for data transformation operations.
 *
 * @template T - Type of the original data being transformed
 * @interface S3TransformContext
 *
 * @example
 * ```typescript
 * const addTimestamp = async (ctx: S3TransformContext<File>) => {
 *   return {
 *     file: ctx.file,
 *     uploadedAt: new Date().toISOString(),
 *     userId: ctx.metadata?.userId,
 *     originalName: ctx.originalData.name,
 *   };
 * };
 * ```
 */
export interface S3TransformContext<T = any> {
  /** The file being transformed */
  file: File;
  /** Additional metadata from the upload context */
  metadata?: Record<string, any>;
  /** The original data before transformation */
  originalData: T;
}

// ========================================
// Base Schema Class
// ========================================

/**
 * Abstract base class for all S3 schema types.
 * Provides the foundation for type-safe file validation and transformation.
 *
 * This class implements the core validation pipeline:
 * 1. Type validation (_parse method)
 * 2. Custom validators (refine method)
 * 3. Data transformation (transform method)
 *
 * @template TInput - The input type expected by this schema
 * @template TOutput - The output type after validation and transformation
 * @abstract
 * @class S3Schema
 *
 * @example Creating a Custom Schema
 * ```typescript
 * class S3VideoSchema extends S3Schema<File, File> {
 *   _type = "video" as const;
 *
 *   _parse(input: unknown): S3ValidationResult {
 *     if (!(input instanceof File)) {
 *       return {
 *         success: false,
 *         error: {
 *           code: 'INVALID_TYPE',
 *           message: 'Expected File object',
 *           path: [],
 *         },
 *       };
 *     }
 *
 *     if (!input.type.startsWith('video/')) {
 *       return {
 *         success: false,
 *         error: {
 *           code: 'INVALID_VIDEO_TYPE',
 *           message: 'File must be a video',
 *           path: [],
 *         },
 *       };
 *     }
 *
 *     return { success: true, data: input };
 *   }
 *
 *   protected _clone(): this {
 *     return new S3VideoSchema() as this;
 *   }
 * }
 * ```
 */
export abstract class S3Schema<TInput = any, TOutput = TInput> {
  protected _constraints: Record<string, any> = {};
  protected _transforms: Array<
    (ctx: S3TransformContext<TInput>) => Promise<any> | any
  > = [];
  protected _validators: Array<
    (
      ctx: S3ValidationContext
    ) => S3ValidationResult | Promise<S3ValidationResult>
  > = [];
  protected _optional = false;

  /** Schema type identifier */
  abstract _type: string;

  /**
   * Abstract method for parsing and validating input data.
   * Must be implemented by concrete schema classes.
   *
   * @param input - The input data to validate
   * @returns Validation result indicating success or failure
   * @abstract
   */
  abstract _parse(
    input: unknown
  ): S3ValidationResult | Promise<S3ValidationResult>;

  /**
   * Core validation method that orchestrates the entire validation pipeline.
   * Handles optional values, type validation, custom validators, and transformations.
   *
   * @param input - The input data to validate
   * @param context - Optional validation context
   * @returns Promise resolving to validation result
   *
   * @example
   * ```typescript
   * const schema = new S3FileSchema({ maxSize: '10MB' });
   * const result = await schema.validate(file, {
   *   fieldName: 'avatar',
   *   allFiles: { avatar: file },
   * });
   *
   * if (result.success) {
   *   console.log('File is valid:', result.data);
   * } else {
   *   console.error('Validation failed:', result.error);
   * }
   * ```
   */
  async validate(
    input: unknown,
    context?: Partial<S3ValidationContext>
  ): Promise<S3ValidationResult> {
    try {
      // Check if optional and undefined
      if (this._optional && (input === undefined || input === null)) {
        return { success: true, data: undefined };
      }

      // Basic type validation
      const parseResult = await this._parse(input);
      if (!parseResult.success) {
        return parseResult;
      }

      // Custom validators
      for (const validator of this._validators) {
        const result = await validator({
          file: input as File,
          fieldName: context?.fieldName || "unknown",
          allFiles: context?.allFiles,
        });

        if (!result.success) {
          return result;
        }
      }

      let data = parseResult.data;

      // Apply transforms
      for (const transform of this._transforms) {
        data = await transform({
          file: input as File,
          metadata: context as any,
          originalData: data,
        });
      }

      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            error instanceof Error ? error.message : "Unknown validation error",
          path: [context?.fieldName || "unknown"],
        },
      };
    }
  }

  /**
   * Makes this schema optional, allowing undefined or null values.
   * Optional schemas will pass validation when no value is provided.
   *
   * @returns New schema instance that accepts optional values
   *
   * @example
   * ```typescript
   * const optionalImage = s3.image().maxFileSize('5MB').optional();
   *
   * // Both of these will pass validation
   * await optionalImage.validate(undefined); // ✅ Success
   * await optionalImage.validate(imageFile); // ✅ Success (if valid)
   * ```
   */
  optional(): S3Schema<TInput, TOutput | undefined> {
    const cloned = this._clone();
    cloned._optional = true;
    return cloned;
  }

  /**
   * Adds a transformation function to process validated data.
   * Transformations are applied after validation succeeds and can modify the output.
   *
   * @template TNewOutput - The type of the transformed output
   * @param transformer - Function to transform the validated data
   * @returns New schema instance with the transformation applied
   *
   * @example Adding Metadata
   * ```typescript
   * const enhancedSchema = s3.file()
   *   .maxFileSize('10MB')
   *   .transform(async ({ file, metadata }) => ({
   *     originalName: file.name,
   *     size: file.size,
   *     uploadedBy: metadata.userId,
   *     uploadedAt: new Date().toISOString(),
   *   }));
   * ```
   *
   * @example Processing File Data
   * ```typescript
   * const processedSchema = s3.image()
   *   .transform(async ({ file }) => {
   *     const buffer = await file.arrayBuffer();
   *     const hash = await crypto.subtle.digest('SHA-256', buffer);
   *     return {
   *       file,
   *       hash: Array.from(new Uint8Array(hash))
   *         .map(b => b.toString(16).padStart(2, '0'))
   *         .join(''),
   *     };
   *   });
   * ```
   */
  transform<TNewOutput>(
    transformer: (
      ctx: S3TransformContext<TOutput>
    ) => Promise<TNewOutput> | TNewOutput
  ): S3Schema<TInput, TNewOutput> {
    const cloned = this._clone();
    cloned._transforms.push(transformer as any);
    return cloned as any;
  }

  /**
   * Adds a custom validation function with a custom error message.
   * Refinements are executed after basic type validation but before transformations.
   *
   * @param validator - Function that returns true if validation passes
   * @param message - Error message to show if validation fails
   * @returns New schema instance with the custom validation
   *
   * @example File Name Validation
   * ```typescript
   * const strictSchema = s3.file()
   *   .refine(
   *     async ({ file }) => !file.name.includes(' '),
   *     'File name cannot contain spaces'
   *   )
   *   .refine(
   *     async ({ file }) => file.name.length <= 50,
   *     'File name must be 50 characters or less'
   *   );
   * ```
   *
   * @example Cross-File Validation
   * ```typescript
   * const totalSizeSchema = s3.file()
   *   .refine(
   *     async ({ allFiles }) => {
   *       if (!allFiles) return true;
   *       const totalSize = Object.values(allFiles)
   *         .flat()
   *         .reduce((sum, file) => sum + file.size, 0);
   *       return totalSize <= 100 * 1024 * 1024; // 100MB total
   *     },
   *     'Total upload size cannot exceed 100MB'
   *   );
   * ```
   */
  refine(
    validator: (ctx: S3ValidationContext) => boolean | Promise<boolean>,
    message: string
  ): this {
    const cloned = this._clone();
    cloned._validators.push(async (ctx) => {
      const isValid = await validator(ctx);
      return isValid
        ? { success: true }
        : {
            success: false,
            error: {
              code: "CUSTOM_VALIDATION",
              message,
              path: [ctx.fieldName],
            },
          };
    });
    return cloned;
  }

  /**
   * Creates a deep clone of this schema instance.
   * Used internally to ensure immutability when chaining methods.
   *
   * @returns Cloned schema instance
   * @protected
   * @abstract
   */
  protected abstract _clone(): this;
}

// ========================================
// File Schema Implementation
// ========================================

/**
 * Schema for validating individual File objects with comprehensive constraints.
 * This is the core schema for handling file uploads with size, type, and extension validation.
 *
 * @class S3FileSchema
 * @extends S3Schema<File, File>
 *
 * @example Basic File Validation
 * ```typescript
 * const documentSchema = new S3FileSchema({
 *   maxSize: '10MB',
 *   allowedTypes: ['application/pdf', 'application/msword'],
 *   allowedExtensions: ['.pdf', '.doc', '.docx'],
 * });
 *
 * // Use in router
 * const router = s3.createRouter({
 *   document: documentSchema,
 * });
 * ```
 *
 * @example Chainable API
 * ```typescript
 * const imageSchema = s3.file()
 *   .maxFileSize('5MB')
 *   .types(['image/jpeg', 'image/png', 'image/webp'])
 *   .extensions(['.jpg', '.jpeg', '.png', '.webp'])
 *   .refine(
 *     async ({ file }) => file.name.length <= 100,
 *     'Filename must be 100 characters or less'
 *   );
 * ```
 *
 * @example With Lifecycle Hooks
 * ```typescript
 * const trackedSchema = new S3FileSchema({ maxSize: '50MB' })
 *   .onUploadStart(async ({ file, metadata }) => {
 *     console.log(`Starting upload: ${file.name}`);
 *     await logUploadStart(file.name, metadata.userId);
 *   })
 *   .onUploadComplete(async ({ file, url, key }) => {
 *     console.log(`Upload complete: ${file.name} -> ${url}`);
 *     await notifyUploadComplete(file.name, url);
 *   })
 *   .onUploadError(async ({ file, error }) => {
 *     console.error(`Upload failed: ${file.name}`, error);
 *     await logUploadError(file.name, error);
 *   });
 * ```
 */
export class S3FileSchema extends S3Schema<File, File> {
  _type = "file" as const;

  /**
   * Creates a new S3FileSchema instance with the specified constraints.
   *
   * @param constraints - File validation constraints
   *
   * @example
   * ```typescript
   * const schema = new S3FileSchema({
   *   maxSize: '10MB',
   *   minSize: '1KB',
   *   allowedTypes: ['image/jpeg', 'image/png'],
   *   allowedExtensions: ['.jpg', '.jpeg', '.png'],
   *   required: true,
   * });
   * ```
   */
  constructor(protected constraints: S3FileConstraints = {}) {
    super();
    this._constraints = { ...constraints };
  }

  _parse(input: unknown): S3ValidationResult {
    if (!(input instanceof File)) {
      return {
        success: false,
        error: {
          code: "INVALID_TYPE",
          message: "Expected File object",
          path: [],
        },
      };
    }

    // Size validation
    if (this.constraints.maxSize) {
      const maxBytes = this._parseSize(this.constraints.maxSize);
      if (input.size > maxBytes) {
        return {
          success: false,
          error: {
            code: "FILE_TOO_LARGE",
            message: `File size ${this._formatSize(input.size)} exceeds maximum ${this._formatSize(maxBytes)}`,
            path: [],
          },
        };
      }
    }

    if (this.constraints.minSize) {
      const minBytes = this._parseSize(this.constraints.minSize);
      if (input.size < minBytes) {
        return {
          success: false,
          error: {
            code: "FILE_TOO_SMALL",
            message: `File size ${this._formatSize(input.size)} is below minimum ${this._formatSize(minBytes)}`,
            path: [],
          },
        };
      }
    }

    // Type validation
    if (this.constraints.allowedTypes?.length) {
      const isAllowed = this.constraints.allowedTypes.some((type) => {
        if (type.endsWith("/*")) {
          return input.type.startsWith(type.slice(0, -1));
        }
        return input.type === type;
      });

      if (!isAllowed) {
        return {
          success: false,
          error: {
            code: "INVALID_FILE_TYPE",
            message: `File type ${input.type} is not allowed. Allowed types: ${this.constraints.allowedTypes.join(", ")}`,
            path: [],
          },
        };
      }
    }

    // Extension validation
    if (this.constraints.allowedExtensions?.length) {
      const extension = input.name.split(".").pop()?.toLowerCase();
      if (
        !extension ||
        !this.constraints.allowedExtensions.includes(extension)
      ) {
        return {
          success: false,
          error: {
            code: "INVALID_FILE_EXTENSION",
            message: `File extension .${extension} is not allowed. Allowed extensions: ${this.constraints.allowedExtensions.join(", ")}`,
            path: [],
          },
        };
      }
    }

    return { success: true, data: input };
  }

  /**
   * Sets the maximum file size constraint.
   *
   * @deprecated Use `maxFileSize()` instead. This method will be removed in a future version.
   * @param size - Maximum size as string (e.g., '10MB', '500KB') or number (bytes)
   * @returns New schema instance with max size constraint
   *
   * @example
   * ```typescript
   * const schema = s3.file().maxFileSize('10MB');
   * const schema2 = s3.file().maxFileSize(10485760); // 10MB in bytes
   * ```
   */
  max(size: string | number): S3FileSchema {
    console.warn(
      "⚠️  The `max()` method is deprecated. Use `maxFileSize()` instead."
    );
    return new S3FileSchema({ ...this.constraints, maxSize: size });
  }

  /**
   * Sets the maximum file size constraint.
   *
   * @param size - Maximum size as string (e.g., '10MB', '500KB') or number (bytes)
   * @returns New schema instance with max size constraint
   *
   * @example
   * ```typescript
   * const schema = s3.file().maxFileSize('10MB');
   * const schema2 = s3.file().maxFileSize(10485760); // 10MB in bytes
   * ```
   */
  maxFileSize(size: string | number): S3FileSchema {
    return new S3FileSchema({ ...this.constraints, maxSize: size });
  }

  /**
   * Sets the minimum file size constraint.
   *
   * @param size - Minimum size as string (e.g., '1KB', '100B') or number (bytes)
   * @returns New schema instance with min size constraint
   *
   * @example
   * ```typescript
   * const schema = s3.file().min('1KB');
   * const schema2 = s3.file().min(1024); // 1KB in bytes
   * ```
   */
  min(size: string | number): S3FileSchema {
    return new S3FileSchema({ ...this.constraints, minSize: size });
  }

  /**
   * Sets the allowed MIME types constraint.
   *
   * @param allowedTypes - Array of allowed MIME types
   * @returns New schema instance with MIME type constraint
   *
   * @example
   * ```typescript
   * const imageSchema = s3.file().types([
   *   'image/jpeg',
   *   'image/png',
   *   'image/webp'
   * ]);
   *
   * const documentSchema = s3.file().types([
   *   'application/pdf',
   *   'application/msword',
   *   'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
   * ]);
   * ```
   */
  types(allowedTypes: string[]): S3FileSchema {
    return new S3FileSchema({ ...this.constraints, allowedTypes });
  }

  /**
   * Sets the allowed file extensions constraint.
   *
   * @param allowedExtensions - Array of allowed file extensions (with or without dots)
   * @returns New schema instance with extension constraint
   *
   * @example
   * ```typescript
   * const imageSchema = s3.file().extensions(['.jpg', '.jpeg', '.png']);
   * const docSchema = s3.file().extensions(['pdf', 'doc', 'docx']); // dots optional
   * ```
   */
  extensions(allowedExtensions: string[]): S3FileSchema {
    return new S3FileSchema({ ...this.constraints, allowedExtensions });
  }

  /**
   * Creates an array schema that validates multiple files of this type with a maximum count.
   * This is a convenience method for creating arrays with a maximum file limit.
   *
   * @param maxCount - Maximum number of files allowed
   * @returns New array schema instance with maximum constraint
   *
   * @example
   * ```typescript
   * const gallerySchema = s3.image()
   *   .maxFileSize('2MB')
   *   .maxFiles(6); // Maximum 6 images, each max 2MB
   *
   * const documentsSchema = s3.file()
   *   .types(['application/pdf'])
   *   .maxFiles(5); // Maximum 5 PDF files
   * ```
   */
  maxFiles(maxCount: number): S3ArraySchema<this> {
    return new S3ArraySchema(this, { max: maxCount });
  }

  protected _clone(): this {
    return new S3FileSchema(this.constraints) as this;
  }

  /**
   * Adds middleware to process requests before file upload.
   * Middleware can modify metadata, perform authentication, or add custom logic.
   *
   * @template TMetadata - Type of metadata returned by middleware
   * @param middleware - Function to process the request and return metadata
   * @returns S3Route instance with middleware applied
   *
   * @example Authentication Middleware
   * ```typescript
   * const authenticatedUpload = s3.file()
   *   .maxFileSize('10MB')
   *   .middleware(async ({ req }) => {
   *     const user = await authenticateRequest(req);
   *     if (!user) throw new Error('Unauthorized');
   *
   *     return {
   *       userId: user.id,
   *       organizationId: user.organizationId,
   *     };
   *   });
   * ```
   *
   * @example Rate Limiting Middleware
   * ```typescript
   * const rateLimitedUpload = s3.file()
   *   .middleware(async ({ req, file }) => {
   *     const clientId = getClientId(req);
   *     await checkRateLimit(clientId, file.size);
   *
   *     return { uploadedBy: clientId };
   *   });
   * ```
   */
  middleware<TMetadata>(
    middleware: (ctx: {
      req: any;
      file: { name: string; size: number; type: string };
      metadata: any;
    }) => Promise<TMetadata> | TMetadata
  ) {
    // Import S3Route dynamically to avoid circular imports
    return new S3Route(this).middleware(middleware);
  }

  /**
   * Adds a hook that executes when file upload starts.
   * Useful for logging, notifications, or initializing upload tracking.
   *
   * @param hook - Function to execute on upload start
   * @returns S3Route instance with upload start hook
   *
   * @example Upload Logging
   * ```typescript
   * const trackedUpload = s3.file()
   *   .onUploadStart(async ({ file, metadata }) => {
   *     console.log(`Upload started: ${file.name} (${file.size} bytes)`);
   *     await logUploadStart({
   *       fileName: file.name,
   *       fileSize: file.size,
   *       userId: metadata.userId,
   *       timestamp: new Date(),
   *     });
   *   });
   * ```
   *
   * @example Progress Initialization
   * ```typescript
   * const progressTrackedUpload = s3.file()
   *   .onUploadStart(async ({ file, metadata }) => {
   *     await initializeUploadProgress(metadata.uploadId, {
   *       fileName: file.name,
   *       totalSize: file.size,
   *       status: 'started',
   *     });
   *   });
   * ```
   */
  onUploadStart(
    hook: (ctx: {
      file: { name: string; size: number; type: string };
      metadata: any;
    }) => Promise<void> | void
  ) {
    return new S3Route(this).onUploadStart(hook);
  }

  /**
   * Adds a hook that executes when file upload completes successfully.
   * Useful for post-processing, notifications, or updating databases.
   *
   * @param hook - Function to execute on upload completion
   * @returns S3Route instance with upload complete hook
   *
   * @example Database Update
   * ```typescript
   * const dbTrackedUpload = s3.file()
   *   .onUploadComplete(async ({ file, url, key, metadata }) => {
   *     await db.files.create({
   *       name: file.name,
   *       size: file.size,
   *       type: file.type,
   *       url: url,
   *       key: key,
   *       uploadedBy: metadata.userId,
   *       uploadedAt: new Date(),
   *     });
   *   });
   * ```
   *
   * @example Notification System
   * ```typescript
   * const notificationUpload = s3.file()
   *   .onUploadComplete(async ({ file, url, metadata }) => {
   *     await sendNotification({
   *       userId: metadata.userId,
   *       message: `File "${file.name}" uploaded successfully`,
   *       fileUrl: url,
   *     });
   *   });
   * ```
   */
  onUploadComplete(
    hook: (ctx: {
      file: { name: string; size: number; type: string };
      metadata: any;
      url?: string;
      key?: string;
    }) => Promise<void> | void
  ) {
    return new S3Route(this).onUploadComplete(hook);
  }

  /**
   * Adds a hook that executes when file upload fails.
   * Useful for error logging, cleanup, or user notifications.
   *
   * @param hook - Function to execute on upload error
   * @returns S3Route instance with upload error hook
   *
   * @example Error Logging
   * ```typescript
   * const errorLoggedUpload = s3.file()
   *   .onUploadError(async ({ file, error, metadata }) => {
   *     console.error(`Upload failed: ${file.name}`, error);
   *     await logUploadError({
   *       fileName: file.name,
   *       error: error.message,
   *       userId: metadata.userId,
   *       timestamp: new Date(),
   *     });
   *   });
   * ```
   *
   * @example User Notification
   * ```typescript
   * const userNotifiedUpload = s3.file()
   *   .onUploadError(async ({ file, error, metadata }) => {
   *     await sendErrorNotification({
   *       userId: metadata.userId,
   *       message: `Failed to upload "${file.name}": ${error.message}`,
   *     });
   *   });
   * ```
   */
  onUploadError(
    hook: (ctx: {
      file: { name: string; size: number; type: string };
      metadata: any;
      error: Error;
    }) => Promise<void> | void
  ) {
    return new S3Route(this).onUploadError(hook);
  }

  // Helper methods
  private _parseSize(size: string | number): number {
    if (typeof size === "number") return size;

    const match = size.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/i);
    if (!match) throw new Error(`Invalid size format: ${size}`);

    const value = parseFloat(match[1]);
    const unit = (match[2] || "B").toUpperCase();

    const multipliers = {
      B: 1,
      KB: 1024,
      MB: 1024 ** 2,
      GB: 1024 ** 3,
      TB: 1024 ** 4,
    };

    return value * (multipliers[unit as keyof typeof multipliers] || 1);
  }

  private _formatSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
  }
}

// ========================================
// Image Schema Implementation
// ========================================

export class S3ImageSchema extends S3FileSchema {
  constructor(constraints: S3FileConstraints = {}) {
    // Default to image types if not specified
    const imageConstraints = {
      allowedTypes: ["image/*"],
      ...constraints,
    };
    super(imageConstraints);
  }

  // Image-specific constraints
  formats(formats: string[]): S3ImageSchema {
    const mimeTypes = formats.map((format) => {
      const mimeMap: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        avif: "image/avif",
        svg: "image/svg+xml",
      };
      return mimeMap[format.toLowerCase()] || `image/${format}`;
    });

    return new S3ImageSchema({ ...this.constraints, allowedTypes: mimeTypes });
  }

  // Override methods to maintain S3ImageSchema type
  /**
   * @deprecated Use `maxFileSize()` instead. This method will be removed in a future version.
   */
  override max(size: string | number): S3ImageSchema {
    console.warn(
      "⚠️  The `max()` method is deprecated. Use `maxFileSize()` instead."
    );
    return new S3ImageSchema({ ...this.constraints, maxSize: size });
  }

  /**
   * Sets the maximum file size constraint.
   *
   * @param size - Maximum size as string (e.g., '10MB', '500KB') or number (bytes)
   * @returns New schema instance with max size constraint
   *
   * @example
   * ```typescript
   * const schema = s3.image().maxFileSize('10MB');
   * const schema2 = s3.image().maxFileSize(10485760); // 10MB in bytes
   * ```
   */
  maxFileSize(size: string | number): S3ImageSchema {
    return new S3ImageSchema({ ...this.constraints, maxSize: size });
  }

  override min(size: string | number): S3ImageSchema {
    return new S3ImageSchema({ ...this.constraints, minSize: size });
  }

  override types(allowedTypes: string[]): S3ImageSchema {
    return new S3ImageSchema({ ...this.constraints, allowedTypes });
  }

  override extensions(allowedExtensions: string[]): S3ImageSchema {
    return new S3ImageSchema({ ...this.constraints, allowedExtensions });
  }

  /**
   * Creates an array schema that validates multiple images with a maximum count.
   * This is a convenience method for creating image arrays with a maximum file limit.
   *
   * @param maxCount - Maximum number of images allowed
   * @returns New array schema instance with maximum constraint
   *
   * @example
   * ```typescript
   * const gallerySchema = s3.image()
   *   .maxFileSize('2MB')
   *   .formats(['jpeg', 'png'])
   *   .maxFiles(6); // Maximum 6 images, each max 2MB
   * ```
   */
  maxFiles(maxCount: number): S3ArraySchema<this> {
    return new S3ArraySchema(this, { max: maxCount });
  }

  protected _clone(): this {
    return new S3ImageSchema(this.constraints) as this;
  }
}

// ========================================
// Array Schema Implementation
// ========================================

export class S3ArraySchema<T extends S3Schema> extends S3Schema<
  File[],
  File[]
> {
  _type = "array" as const;

  constructor(
    private elementSchema: T,
    private arrayConstraints: S3ArrayConstraints = {}
  ) {
    super();
  }

  async _parse(input: unknown): Promise<S3ValidationResult> {
    if (!Array.isArray(input)) {
      return {
        success: false,
        error: {
          code: "INVALID_TYPE",
          message: "Expected array of files",
          path: [],
        },
      };
    }

    // Array length validation
    if (
      this.arrayConstraints.min !== undefined &&
      input.length < this.arrayConstraints.min
    ) {
      return {
        success: false,
        error: {
          code: "ARRAY_TOO_SHORT",
          message: `Array must have at least ${this.arrayConstraints.min} items`,
          path: [],
        },
      };
    }

    if (
      this.arrayConstraints.max !== undefined &&
      input.length > this.arrayConstraints.max
    ) {
      return {
        success: false,
        error: {
          code: "ARRAY_TOO_LONG",
          message: `Array must have at most ${this.arrayConstraints.max} items`,
          path: [],
        },
      };
    }

    if (
      this.arrayConstraints.length !== undefined &&
      input.length !== this.arrayConstraints.length
    ) {
      return {
        success: false,
        error: {
          code: "ARRAY_WRONG_LENGTH",
          message: `Array must have exactly ${this.arrayConstraints.length} items`,
          path: [],
        },
      };
    }

    // Validate each element
    const validatedItems = [];
    for (let i = 0; i < input.length; i++) {
      const result = await this.elementSchema.validate(input[i], {
        fieldName: `[${i}]`,
      });
      if (!result.success) {
        return {
          success: false,
          error: {
            ...result.error!,
            path: [`[${i}]`, ...result.error!.path],
          },
        };
      }
      validatedItems.push(result.data);
    }

    return { success: true, data: validatedItems };
  }

  // Array constraint methods
  min(count: number): S3ArraySchema<T> {
    return new S3ArraySchema(this.elementSchema, {
      ...this.arrayConstraints,
      min: count,
    });
  }

  max(count: number): S3ArraySchema<T> {
    return new S3ArraySchema(this.elementSchema, {
      ...this.arrayConstraints,
      max: count,
    });
  }

  length(count: number): S3ArraySchema<T> {
    return new S3ArraySchema(this.elementSchema, {
      ...this.arrayConstraints,
      length: count,
    });
  }

  protected _clone(): this {
    return new S3ArraySchema(this.elementSchema, this.arrayConstraints) as this;
  }
}

// ========================================
// Object Schema Implementation
// ========================================

export class S3ObjectSchema<
  T extends Record<string, S3Schema>,
> extends S3Schema<
  { [K in keyof T]: T[K] extends S3Schema<any, infer U> ? U : never },
  { [K in keyof T]: T[K] extends S3Schema<any, infer U> ? U : never }
> {
  _type = "object" as const;

  constructor(private shape: T) {
    super();
  }

  async _parse(input: unknown): Promise<S3ValidationResult> {
    if (!input || typeof input !== "object") {
      return {
        success: false,
        error: {
          code: "INVALID_TYPE",
          message: "Expected object",
          path: [],
        },
      };
    }

    const result: Record<string, any> = {};
    const inputObj = input as Record<string, unknown>;

    // Validate each field
    for (const [key, schema] of Object.entries(this.shape)) {
      const fieldResult = await schema.validate(inputObj[key], {
        fieldName: key,
        allFiles: inputObj as Record<string, File | File[]>,
      });

      if (!fieldResult.success) {
        return {
          success: false,
          error: {
            ...fieldResult.error!,
            path: [key, ...fieldResult.error!.path],
          },
        };
      }

      if (fieldResult.data !== undefined) {
        result[key] = fieldResult.data;
      }
    }

    return { success: true, data: result };
  }

  protected _clone(): this {
    return new S3ObjectSchema(this.shape) as this;
  }
}

// ========================================
// Factory Functions (Public API)
// ========================================

const s3 = {
  file: (constraints?: S3FileConstraints) => new S3FileSchema(constraints),
  image: (constraints?: S3FileConstraints) => new S3ImageSchema(constraints),
  object: <T extends Record<string, S3Schema>>(shape: T) =>
    new S3ObjectSchema(shape),
} as const;

// ========================================
// Type Inference Utilities
// ========================================

export type InferS3Input<T extends S3Schema> =
  T extends S3Schema<infer I, any> ? I : never;
export type InferS3Output<T extends S3Schema> =
  T extends S3Schema<any, infer O> ? O : never;

// Helper type for object schemas
export type S3ObjectInput<T extends Record<string, S3Schema>> = {
  [K in keyof T]: InferS3Input<T[K]>;
};

export type S3ObjectOutput<T extends Record<string, S3Schema>> = {
  [K in keyof T]: InferS3Output<T[K]>;
};
