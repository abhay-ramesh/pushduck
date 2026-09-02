/**
 * @fileoverview Provider constraints for multipart uploads.
 *
 * Multipart is nominally "the S3 API", but the providers disagree in ways that
 * change the design rather than merely the numbers. These were read from each
 * provider's own documentation, not assumed from AWS:
 *
 * | Provider    | Min part | Max part | Max parts | Uniform parts required |
 * |-------------|----------|----------|-----------|------------------------|
 * | AWS S3      | 5 MiB    | 5 GiB    | 10,000    | no                     |
 * | Cloudflare R2 | 5 MiB  | 5 GiB    | 10,000    | **yes**                |
 * | Backblaze B2  | 5 MB*  | 5 GiB    | 10,000    | yes (all but last)     |
 * | GCS (XML)   | 5 MiB    | 5 GiB    | 10,000    | no                     |
 * | DO Spaces   | 5 MiB    | 5 GiB    | 10,000    | no                     |
 * | MinIO       | 5 MiB    | 5 GiB    | 10,000    | no                     |
 *
 * \* Backblaze specifies 5,000,000 bytes (decimal), which 5 MiB (5,242,880)
 * satisfies — so a single 5 MiB floor is safe everywhere.
 *
 * ## The constraint that shapes the design
 *
 * **Cloudflare R2 requires every part except the last to be the same size.**
 * AWS does not. R2 enforces this at completion, rejecting the request with
 * `All non-trailing parts must have the same length` — so a non-uniform plan
 * succeeds for every part upload and only fails at the very end, after the
 * bytes have already been transferred. Rather than branch on provider, we always emit uniform parts
 * with a smaller remainder at the end: that plan is valid on *every* provider
 * listed, so the same client works against any of them, including
 * S3-compatible services we have never heard of.
 *
 * Uniformity is also what makes resume tractable — part N's byte range is
 * derivable from N and the part size alone, so a resumed upload does not need
 * the original plan, only the size.
 *
 * ## Other provider differences worth knowing
 *
 * - **GCS** produces no MD5 for multipart objects, so the composite-ETag
 *   check used elsewhere does not apply there.
 * - **DigitalOcean Spaces** caps presigned `PUT` through its *CDN* endpoint at
 *   7.91 MiB. Parts larger than that fail if a CDN endpoint is used for
 *   upload, which is why the default part size stays at the 5 MiB floor.
 * - Abandoned uploads are auto-aborted after 7 days on R2 and 30 days on
 *   Spaces. AWS has no default — a lifecycle rule is required, or the parts
 *   are billed indefinitely.
 *
 * @see https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html
 * @see https://developers.cloudflare.com/r2/objects/multipart-objects/
 * @see https://docs.digitalocean.com/products/spaces/details/limits/
 * @see https://cloud.google.com/storage/docs/multipart-uploads
 */

/** One mebibyte, in bytes. Multipart limits are specified in binary units. */
export const MIB = 1024 * 1024;

/** One gibibyte, in bytes. */
export const GIB = 1024 * MIB;

/**
 * The limits pushduck plans against.
 *
 * These are the **intersection** of every supported provider's constraints, so
 * a plan valid here is valid everywhere. Individual providers are more
 * permissive in places; we do not exploit that, because doing so would make an
 * upload succeed on one provider and fail on another with the same config.
 */
export interface MultipartLimits {
  /** Smallest allowed part, except the final one. */
  minPartSize: number;
  /** Largest allowed part. */
  maxPartSize: number;
  /** Maximum number of parts in one upload. */
  maxParts: number;
}

/**
 * Universally safe limits.
 *
 * 5 MiB floor satisfies AWS, R2, GCS, Spaces, MinIO (5 MiB) and Backblaze
 * (5,000,000 bytes decimal, which 5 MiB exceeds).
 */
export const UNIVERSAL_LIMITS: Readonly<MultipartLimits> = Object.freeze({
  minPartSize: 5 * MIB,
  maxPartSize: 5 * GIB,
  maxParts: 10_000,
});

/**
 * Largest object expressible under {@link UNIVERSAL_LIMITS}.
 *
 * 10,000 × 5 GiB ≈ 48.8 TiB, which matches AWS's documented maximum object
 * size — the two limits are the same constraint viewed from either end.
 */
export const MAX_OBJECT_SIZE =
  UNIVERSAL_LIMITS.maxParts * UNIVERSAL_LIMITS.maxPartSize;

/**
 * Default threshold above which multipart is used.
 *
 * Below this a single `PUT` is strictly better: one request, one signature, no
 * session to abandon. AWS's own guidance suggests considering multipart from
 * about 100 MB, but the ceiling that actually forces it is the 5 GiB single-PUT
 * limit. 100 MiB is a deliberate middle ground — large enough that the extra
 * round trips are noise, small enough that a failed upload on a poor connection
 * does not restart from zero.
 */
export const DEFAULT_MULTIPART_THRESHOLD = 100 * MIB;
