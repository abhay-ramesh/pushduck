import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  detectExistingCredentials,
  generateEnvVariables,
  type ProviderCredentials,
} from "./provider-setup";

/** Every variable detectExistingCredentials reads, for the providers tested. */
const READ_VARS = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "AWS_ENDPOINT_URL_S3",
  "S3_BUCKET",
  "AWS_S3_BUCKET",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "CLOUDFLARE_R2_BUCKET",
  "CLOUDFLARE_ACCOUNT_ID",
  "R2_ACCOUNT_ID",
  "DO_SPACES_ACCESS_KEY_ID",
  "DO_SPACES_SECRET_ACCESS_KEY",
  "DO_SPACES_REGION",
  "DO_SPACES_BUCKET",
  "MINIO_ACCESS_KEY_ID",
  "MINIO_SECRET_ACCESS_KEY",
  "MINIO_ENDPOINT",
  "MINIO_BUCKET",
  "MINIO_REGION",
  "NEON_STORAGE_BUCKET",
];

function setEnv(vars: Record<string, string>) {
  for (const [name, value] of Object.entries(vars)) {
    vi.stubEnv(name, value);
  }
}

describe("detectExistingCredentials", () => {
  // Start every test from a clean slate, whatever the developer's shell or
  // CI exports, and put the real environment back afterwards.
  beforeEach(() => {
    for (const name of READ_VARS) {
      vi.stubEnv(name, undefined);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const original = Object.fromEntries(
    READ_VARS.map((name) => [name, process.env[name]]),
  );
  afterAll(() => {
    // Guard the guard: nothing a test set may outlive the suite.
    for (const name of READ_VARS) {
      expect(process.env[name]).toBe(original[name]);
    }
  });

  describe("aws", () => {
    it("reads the AWS variables", async () => {
      setEnv({
        AWS_ACCESS_KEY_ID: "aws-key",
        AWS_SECRET_ACCESS_KEY: "aws-secret",
        AWS_REGION: "eu-west-1",
        S3_BUCKET: "aws-bucket",
      });

      expect(await detectExistingCredentials("aws")).toEqual({
        accessKeyId: "aws-key",
        secretAccessKey: "aws-secret",
        region: "eu-west-1",
        bucket: "aws-bucket",
      });
    });

    it("falls back to AWS_S3_BUCKET", async () => {
      setEnv({ AWS_S3_BUCKET: "fallback-bucket" });

      const credentials = await detectExistingCredentials("aws");
      expect(credentials.bucket).toBe("fallback-bucket");
    });

    it("prefers S3_BUCKET over AWS_S3_BUCKET", async () => {
      setEnv({ S3_BUCKET: "primary", AWS_S3_BUCKET: "fallback" });

      const credentials = await detectExistingCredentials("aws");
      expect(credentials.bucket).toBe("primary");
    });

    it("leaves every field undefined when nothing is set", async () => {
      expect(await detectExistingCredentials("aws")).toEqual({
        accessKeyId: undefined,
        secretAccessKey: undefined,
        region: undefined,
        bucket: undefined,
      });
    });
  });

  describe("cloudflare-r2", () => {
    it("reads the CLOUDFLARE_* variables and fixes the region to auto", async () => {
      setEnv({
        CLOUDFLARE_R2_ACCESS_KEY_ID: "r2-key",
        CLOUDFLARE_R2_SECRET_ACCESS_KEY: "r2-secret",
        R2_BUCKET: "r2-bucket",
        CLOUDFLARE_ACCOUNT_ID: "account-1",
      });

      expect(await detectExistingCredentials("cloudflare-r2")).toEqual({
        accessKeyId: "r2-key",
        secretAccessKey: "r2-secret",
        bucket: "r2-bucket",
        accountId: "account-1",
        region: "auto",
      });
    });

    it("falls back to the short R2_* names", async () => {
      setEnv({
        R2_ACCESS_KEY_ID: "short-key",
        R2_SECRET_ACCESS_KEY: "short-secret",
        CLOUDFLARE_R2_BUCKET: "short-bucket",
        R2_ACCOUNT_ID: "short-account",
      });

      expect(await detectExistingCredentials("cloudflare-r2")).toEqual({
        accessKeyId: "short-key",
        secretAccessKey: "short-secret",
        bucket: "short-bucket",
        accountId: "short-account",
        region: "auto",
      });
    });

    it("prefers the CLOUDFLARE_* names over the short ones", async () => {
      setEnv({
        CLOUDFLARE_R2_ACCESS_KEY_ID: "long-key",
        R2_ACCESS_KEY_ID: "short-key",
        CLOUDFLARE_ACCOUNT_ID: "long-account",
        R2_ACCOUNT_ID: "short-account",
      });

      const credentials = await detectExistingCredentials("cloudflare-r2");
      expect(credentials.accessKeyId).toBe("long-key");
      expect(credentials.accountId).toBe("long-account");
    });

    it("reports region auto even when nothing is set", async () => {
      const credentials = await detectExistingCredentials("cloudflare-r2");
      expect(credentials.region).toBe("auto");
      expect(credentials.accessKeyId).toBeUndefined();
      expect(credentials.bucket).toBeUndefined();
    });
  });

  describe("digitalocean", () => {
    it("reads the DO_SPACES_* variables", async () => {
      setEnv({
        DO_SPACES_ACCESS_KEY_ID: "do-key",
        DO_SPACES_SECRET_ACCESS_KEY: "do-secret",
        DO_SPACES_REGION: "nyc3",
        DO_SPACES_BUCKET: "do-bucket",
      });

      expect(await detectExistingCredentials("digitalocean")).toEqual({
        accessKeyId: "do-key",
        secretAccessKey: "do-secret",
        region: "nyc3",
        bucket: "do-bucket",
      });
    });

    it("does not read the AWS variables", async () => {
      setEnv({ AWS_ACCESS_KEY_ID: "aws-key", AWS_REGION: "us-west-2" });

      const credentials = await detectExistingCredentials("digitalocean");
      expect(credentials.accessKeyId).toBeUndefined();
      expect(credentials.region).toBeUndefined();
    });
  });

  describe("minio", () => {
    it("reads the MINIO_* variables", async () => {
      setEnv({
        MINIO_ACCESS_KEY_ID: "minio-key",
        MINIO_SECRET_ACCESS_KEY: "minio-secret",
        MINIO_ENDPOINT: "localhost:9000",
        MINIO_BUCKET: "minio-bucket",
        MINIO_REGION: "eu-west-1",
      });

      expect(await detectExistingCredentials("minio")).toEqual({
        accessKeyId: "minio-key",
        secretAccessKey: "minio-secret",
        endpoint: "localhost:9000",
        bucket: "minio-bucket",
        region: "eu-west-1",
      });
    });

    it("defaults the region to us-east-1", async () => {
      const credentials = await detectExistingCredentials("minio");
      expect(credentials.region).toBe("us-east-1");
    });
  });

  describe("neon", () => {
    it("reads the variables `neon env pull` writes", async () => {
      setEnv({
        AWS_ACCESS_KEY_ID: "neon-key",
        AWS_SECRET_ACCESS_KEY: "neon-secret",
        AWS_ENDPOINT_URL_S3: "https://br-x.storage.example.neon.tech",
        AWS_REGION: "us-east-2",
        NEON_STORAGE_BUCKET: "neon-bucket",
      });

      expect(await detectExistingCredentials("neon")).toEqual({
        accessKeyId: "neon-key",
        secretAccessKey: "neon-secret",
        endpoint: "https://br-x.storage.example.neon.tech",
        region: "us-east-2",
        bucket: "neon-bucket",
      });
    });

    it("ignores S3_BUCKET, which belongs to the aws provider", async () => {
      setEnv({ S3_BUCKET: "aws-bucket" });

      const credentials = await detectExistingCredentials("neon");
      expect(credentials.bucket).toBeUndefined();
    });
  });
});

describe("generateEnvVariables", () => {
  const credentials: ProviderCredentials = {
    accessKeyId: "key-id",
    secretAccessKey: "secret",
    region: "eu-west-1",
    bucket: "my-bucket",
    endpoint: "https://storage.example.com",
    accountId: "account-1",
  };

  it("aws", () => {
    expect(generateEnvVariables(credentials, "aws")).toEqual({
      AWS_ACCESS_KEY_ID: "key-id",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_REGION: "eu-west-1",
      S3_BUCKET: "my-bucket",
    });
  });

  it("cloudflare-r2", () => {
    expect(generateEnvVariables(credentials, "cloudflare-r2")).toEqual({
      CLOUDFLARE_R2_ACCESS_KEY_ID: "key-id",
      CLOUDFLARE_R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "my-bucket",
      CLOUDFLARE_ACCOUNT_ID: "account-1",
    });
  });

  it("cloudflare-r2 writes an empty account id when there is none", () => {
    const withoutAccount = { ...credentials, accountId: undefined };
    expect(
      generateEnvVariables(withoutAccount, "cloudflare-r2")
        .CLOUDFLARE_ACCOUNT_ID,
    ).toBe("");
  });

  it("digitalocean", () => {
    expect(generateEnvVariables(credentials, "digitalocean")).toEqual({
      DO_SPACES_ACCESS_KEY_ID: "key-id",
      DO_SPACES_SECRET_ACCESS_KEY: "secret",
      DO_SPACES_REGION: "eu-west-1",
      DO_SPACES_BUCKET: "my-bucket",
    });
  });

  it("minio", () => {
    expect(generateEnvVariables(credentials, "minio")).toEqual({
      MINIO_ACCESS_KEY_ID: "key-id",
      MINIO_SECRET_ACCESS_KEY: "secret",
      MINIO_ENDPOINT: "https://storage.example.com",
      MINIO_BUCKET: "my-bucket",
      MINIO_REGION: "eu-west-1",
    });
  });

  it("minio writes an empty endpoint when there is none", () => {
    const withoutEndpoint = { ...credentials, endpoint: undefined };
    expect(generateEnvVariables(withoutEndpoint, "minio").MINIO_ENDPOINT).toBe(
      "",
    );
  });

  it("neon", () => {
    expect(generateEnvVariables(credentials, "neon")).toEqual({
      AWS_ACCESS_KEY_ID: "key-id",
      AWS_SECRET_ACCESS_KEY: "secret",
      AWS_ENDPOINT_URL_S3: "https://storage.example.com",
      AWS_REGION: "eu-west-1",
      NEON_STORAGE_BUCKET: "my-bucket",
    });
  });

  it("neon writes an empty endpoint when there is none", () => {
    const withoutEndpoint = { ...credentials, endpoint: undefined };
    expect(
      generateEnvVariables(withoutEndpoint, "neon").AWS_ENDPOINT_URL_S3,
    ).toBe("");
  });
});
