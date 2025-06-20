/**
 * Core Schema System for pushduck
 *
 * This is the foundation of the new gold standard API that provides:
 * - Type-safe, declarative file validation
 * - Chainable API similar to Zod
 * - Runtime validation with TypeScript inference
 * - Transform pipeline support
 */

import { S3Route } from "./router/router-v2";

// ========================================
// Core Types
// ========================================

export interface S3FileConstraints {
  maxSize?: string | number;
  minSize?: string | number;
  allowedTypes?: string[];
  allowedExtensions?: string[];
  required?: boolean;
}

export interface S3ArrayConstraints {
  min?: number;
  max?: number;
  length?: number;
}

export interface S3ValidationContext {
  file: File;
  fieldName: string;
  allFiles?: Record<string, File | File[]>;
}

export interface S3ValidationResult {
  success: boolean;
  error?: {
    code: string;
    message: string;
    path: string[];
  };
  data?: any;
}

export interface S3TransformContext<T = any> {
  file: File;
  metadata?: Record<string, any>;
  originalData: T;
}

// ========================================
// Base Schema Class
// ========================================

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

  abstract _type: string;
  abstract _parse(
    input: unknown
  ): S3ValidationResult | Promise<S3ValidationResult>;

  // Core validation method
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

  // Chainable constraint methods
  optional(): S3Schema<TInput, TOutput | undefined> {
    const cloned = this._clone();
    cloned._optional = true;
    return cloned;
  }

  transform<TNewOutput>(
    transformer: (
      ctx: S3TransformContext<TOutput>
    ) => Promise<TNewOutput> | TNewOutput
  ): S3Schema<TInput, TNewOutput> {
    const cloned = this._clone();
    cloned._transforms.push(transformer as any);
    return cloned as any;
  }

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

  protected abstract _clone(): this;
}

// ========================================
// File Schema Implementation
// ========================================

export class S3FileSchema extends S3Schema<File, File> {
  _type = "file" as const;

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

  // Chainable constraint methods
  max(size: string | number): S3FileSchema {
    return new S3FileSchema({ ...this.constraints, maxSize: size });
  }

  min(size: string | number): S3FileSchema {
    return new S3FileSchema({ ...this.constraints, minSize: size });
  }

  types(allowedTypes: string[]): S3FileSchema {
    return new S3FileSchema({ ...this.constraints, allowedTypes });
  }

  extensions(allowedExtensions: string[]): S3FileSchema {
    return new S3FileSchema({ ...this.constraints, allowedExtensions });
  }

  array(constraints?: S3ArrayConstraints): S3ArraySchema<this> {
    return new S3ArraySchema(this, constraints);
  }

  protected _clone(): this {
    return new S3FileSchema(this.constraints) as this;
  }

  // Router integration methods
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

  onUploadStart(
    hook: (ctx: {
      file: { name: string; size: number; type: string };
      metadata: any;
    }) => Promise<void> | void
  ) {
    return new S3Route(this).onUploadStart(hook);
  }

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
  override max(size: string | number): S3ImageSchema {
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

  array(constraints?: S3ArrayConstraints): S3ArraySchema<this> {
    return new S3ArraySchema(this, constraints);
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
