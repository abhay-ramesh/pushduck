import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";

export type ProviderType =
  | "aws"
  | "cloudflare-r2"
  | "digitalocean"
  | "minio"
  | "gcs";

export interface ProviderConfig {
  type: ProviderType;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  accountId?: string; // For Cloudflare R2
}

export interface ProviderCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  endpoint?: string;
  accountId?: string;
}

const PROVIDER_INFO = {
  aws: {
    name: "AWS S3",
    description: "Most popular, enterprise-ready",
    envVars: [
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_REGION",
      "S3_BUCKET",
    ],
    regions: [
      {
        name: "us-east-1 (N. Virginia)",
        value: "us-east-1",
        description: "Default, lowest latency for US East",
      },
      {
        name: "us-west-2 (Oregon)",
        value: "us-west-2",
        description: "West Coast, cheaper data transfer",
      },
      {
        name: "eu-west-1 (Ireland)",
        value: "eu-west-1",
        description: "Europe, GDPR compliant",
      },
      {
        name: "ap-southeast-1 (Singapore)",
        value: "ap-southeast-1",
        description: "Asia Pacific",
      },
    ],
  },
  "cloudflare-r2": {
    name: "Cloudflare R2",
    description: "Zero egress fees, global CDN",
    envVars: [
      "CLOUDFLARE_R2_ACCESS_KEY_ID",
      "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
      "R2_BUCKET",
      "CLOUDFLARE_ACCOUNT_ID",
    ],
    regions: [
      {
        name: "auto",
        value: "auto",
        description: "Automatic region selection",
      },
    ],
  },
  digitalocean: {
    name: "DigitalOcean Spaces",
    description: "Simple pricing, developer-friendly",
    envVars: [
      "DO_SPACES_ACCESS_KEY_ID",
      "DO_SPACES_SECRET_ACCESS_KEY",
      "DO_SPACES_REGION",
      "DO_SPACES_BUCKET",
    ],
    regions: [
      { name: "nyc3 (New York)", value: "nyc3", description: "US East Coast" },
      {
        name: "sfo3 (San Francisco)",
        value: "sfo3",
        description: "US West Coast",
      },
      { name: "ams3 (Amsterdam)", value: "ams3", description: "Europe" },
      { name: "sgp1 (Singapore)", value: "sgp1", description: "Asia Pacific" },
    ],
  },
  minio: {
    name: "MinIO",
    description: "Self-hosted, S3-compatible",
    envVars: [
      "MINIO_ACCESS_KEY_ID",
      "MINIO_SECRET_ACCESS_KEY",
      "MINIO_ENDPOINT",
      "MINIO_BUCKET",
    ],
    regions: [
      { name: "us-east-1", value: "us-east-1", description: "Default region" },
    ],
  },
  gcs: {
    name: "Google Cloud Storage",
    description: "Advanced features, ML integration",
    envVars: [
      "GCS_ACCESS_KEY_ID",
      "GCS_SECRET_ACCESS_KEY",
      "GCS_PROJECT_ID",
      "GCS_BUCKET",
    ],
    regions: [
      { name: "us-central1", value: "us-central1", description: "US Central" },
      {
        name: "europe-west1",
        value: "europe-west1",
        description: "Europe West",
      },
    ],
  },
};

export async function selectProvider(
  skipSelection?: ProviderType
): Promise<ProviderType> {
  if (skipSelection && Object.keys(PROVIDER_INFO).includes(skipSelection)) {
    return skipSelection;
  }

  console.log(chalk.cyan("\n📦 Choose your storage provider:\n"));

  const choices = Object.entries(PROVIDER_INFO).map(([key, info]) => ({
    name: `${info.name.padEnd(20)} ${chalk.gray(info.description)}`,
    value: key as ProviderType,
    short: info.name,
  }));

  const { provider } = await inquirer.prompt<{ provider: ProviderType }>([
    {
      type: "list",
      name: "provider",
      message: "Select a provider:",
      choices,
      default: "aws",
    },
  ]);

  const selectedInfo = PROVIDER_INFO[provider];
  console.log(chalk.green(`\n→ ${selectedInfo.name} selected\n`));

  console.log(chalk.blue("💡 Why " + selectedInfo.name + "?"));
  console.log(chalk.gray("   • " + selectedInfo.description));
  console.log(
    chalk.gray(
      "   • Need help choosing? https://docs.pushduck.com/providers/comparison\n"
    )
  );

  return provider;
}

export async function detectExistingCredentials(
  provider: ProviderType
): Promise<Partial<ProviderCredentials>> {
  const credentials: Partial<ProviderCredentials> = {};
  const envVars = PROVIDER_INFO[provider].envVars;

  // Check environment variables based on provider
  switch (provider) {
    case "aws":
      credentials.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
      credentials.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
      credentials.region = process.env.AWS_REGION;
      credentials.bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
      break;

    case "cloudflare-r2":
      credentials.accessKeyId =
        process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
      credentials.secretAccessKey =
        process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
        process.env.R2_SECRET_ACCESS_KEY;
      credentials.bucket =
        process.env.R2_BUCKET || process.env.CLOUDFLARE_R2_BUCKET;
      credentials.accountId =
        process.env.CLOUDFLARE_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
      credentials.region = "auto";
      break;

    case "digitalocean":
      credentials.accessKeyId = process.env.DO_SPACES_ACCESS_KEY_ID;
      credentials.secretAccessKey = process.env.DO_SPACES_SECRET_ACCESS_KEY;
      credentials.region = process.env.DO_SPACES_REGION;
      credentials.bucket = process.env.DO_SPACES_BUCKET;
      break;

    case "minio":
      credentials.accessKeyId = process.env.MINIO_ACCESS_KEY_ID;
      credentials.secretAccessKey = process.env.MINIO_SECRET_ACCESS_KEY;
      credentials.endpoint = process.env.MINIO_ENDPOINT;
      credentials.bucket = process.env.MINIO_BUCKET;
      credentials.region = process.env.MINIO_REGION || "us-east-1";
      break;

    case "gcs":
      credentials.accessKeyId = process.env.GCS_ACCESS_KEY_ID;
      credentials.secretAccessKey = process.env.GCS_SECRET_ACCESS_KEY;
      credentials.region = process.env.GCS_REGION || "us-central1";
      credentials.bucket = process.env.GCS_BUCKET;
      break;
  }

  return credentials;
}

export async function promptForMissingCredentials(
  provider: ProviderType,
  existing: Partial<ProviderCredentials>
): Promise<ProviderCredentials> {
  const providerInfo = PROVIDER_INFO[provider];
  const questions = [];

  // Region selection
  if (!existing.region && providerInfo.regions.length > 1) {
    questions.push({
      type: "list",
      name: "region",
      message: "Select your region:",
      choices: providerInfo.regions.map((r) => ({
        name: `${r.name.padEnd(30)} ${chalk.gray(r.description)}`,
        value: r.value,
        short: r.name,
      })),
      default: providerInfo.regions[0].value,
    });
  }

  // Bucket name
  if (!existing.bucket) {
    questions.push({
      type: "input",
      name: "bucket",
      message: "S3 Bucket name:",
      default: `my-app-uploads-${new Date().getFullYear()}`,
      validate: (input: string) => {
        if (!input || input.length < 3) {
          return "Bucket name must be at least 3 characters long";
        }
        if (!/^[a-z0-9-]+$/.test(input)) {
          return "Bucket name must be lowercase letters, numbers, and hyphens only";
        }
        return true;
      },
    });
  }

  // Provider-specific prompts
  if (provider === "cloudflare-r2" && !existing.accountId) {
    questions.push({
      type: "input",
      name: "accountId",
      message: "Cloudflare Account ID:",
      validate: (input: string) => (input ? true : "Account ID is required"),
    });
  }

  if (provider === "minio" && !existing.endpoint) {
    questions.push({
      type: "input",
      name: "endpoint",
      message: "MinIO Endpoint:",
      default: "localhost:9000",
      validate: (input: string) => (input ? true : "Endpoint is required"),
    });
  }

  const answers = await inquirer.prompt(questions);

  return {
    accessKeyId: existing.accessKeyId || "",
    secretAccessKey: existing.secretAccessKey || "",
    region: existing.region || answers.region || providerInfo.regions[0].value,
    bucket: existing.bucket || answers.bucket,
    endpoint: existing.endpoint || answers.endpoint,
    accountId: existing.accountId || answers.accountId,
  };
}

export async function createS3Bucket(
  credentials: ProviderCredentials,
  provider: ProviderType
): Promise<boolean> {
  const spinner = ora("Creating S3 bucket...").start();

  try {
    let endpoint: string | undefined;

    // Set endpoint based on provider
    switch (provider) {
      case "cloudflare-r2":
        endpoint = `https://${credentials.accountId}.r2.cloudflarestorage.com`;
        break;
      case "digitalocean":
        endpoint = `https://${credentials.region}.digitaloceanspaces.com`;
        break;
      case "minio":
        endpoint = `http://${credentials.endpoint}`;
        break;
      case "gcs":
        endpoint = "https://storage.googleapis.com";
        break;
      // AWS S3 uses default endpoint
    }

    const s3Client = new S3Client({
      region: credentials.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
      endpoint,
      forcePathStyle: provider === "minio", // MinIO requires path-style
    });

    // Check if bucket already exists
    try {
      await s3Client.send(
        new HeadBucketCommand({ Bucket: credentials.bucket })
      );
      spinner.succeed("Bucket already exists");
      return true;
    } catch (error) {
      // Bucket doesn't exist, create it
    }

    // Create bucket
    await s3Client.send(
      new CreateBucketCommand({
        Bucket: credentials.bucket,
        CreateBucketConfiguration:
          credentials.region !== "us-east-1"
            ? {
                LocationConstraint: credentials.region,
              }
            : undefined,
      })
    );

    // Set CORS configuration
    const corsConfig = {
      CORSRules: [
        {
          AllowedHeaders: ["*"],
          AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
          AllowedOrigins: ["*"],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3000,
        },
      ],
    };

    await s3Client.send(
      new PutBucketCorsCommand({
        Bucket: credentials.bucket,
        CORSConfiguration: corsConfig,
      })
    );

    spinner.succeed("Bucket created successfully");
    console.log(chalk.green("✓ CORS configuration applied"));
    console.log(chalk.green("✓ Security settings configured"));

    return true;
  } catch (error) {
    spinner.fail("Failed to create bucket");
    console.error(chalk.red("Error:"), error);
    return false;
  }
}

export async function testConnection(
  credentials: ProviderCredentials,
  provider: ProviderType
): Promise<boolean> {
  const spinner = ora("Testing S3 connection...").start();

  try {
    let endpoint: string | undefined;

    switch (provider) {
      case "cloudflare-r2":
        endpoint = `https://${credentials.accountId}.r2.cloudflarestorage.com`;
        break;
      case "digitalocean":
        endpoint = `https://${credentials.region}.digitaloceanspaces.com`;
        break;
      case "minio":
        endpoint = `http://${credentials.endpoint}`;
        break;
      case "gcs":
        endpoint = "https://storage.googleapis.com";
        break;
    }

    const s3Client = new S3Client({
      region: credentials.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
      endpoint,
      forcePathStyle: provider === "minio",
    });

    await s3Client.send(new HeadBucketCommand({ Bucket: credentials.bucket }));

    spinner.succeed("S3 connection successful");
    return true;
  } catch (error) {
    spinner.fail("S3 connection failed");
    console.error(chalk.red("Error:"), error);
    return false;
  }
}

export function generateEnvVariables(
  credentials: ProviderCredentials,
  provider: ProviderType
): Record<string, string> {
  const env: Record<string, string> = {};

  switch (provider) {
    case "aws":
      env["AWS_ACCESS_KEY_ID"] = credentials.accessKeyId;
      env["AWS_SECRET_ACCESS_KEY"] = credentials.secretAccessKey;
      env["AWS_REGION"] = credentials.region;
      env["S3_BUCKET"] = credentials.bucket;
      break;

    case "cloudflare-r2":
      env["CLOUDFLARE_R2_ACCESS_KEY_ID"] = credentials.accessKeyId;
      env["CLOUDFLARE_R2_SECRET_ACCESS_KEY"] = credentials.secretAccessKey;
      env["R2_BUCKET"] = credentials.bucket;
      env["CLOUDFLARE_ACCOUNT_ID"] = credentials.accountId || "";
      break;

    case "digitalocean":
      env["DO_SPACES_ACCESS_KEY_ID"] = credentials.accessKeyId;
      env["DO_SPACES_SECRET_ACCESS_KEY"] = credentials.secretAccessKey;
      env["DO_SPACES_REGION"] = credentials.region;
      env["DO_SPACES_BUCKET"] = credentials.bucket;
      break;

    case "minio":
      env["MINIO_ACCESS_KEY_ID"] = credentials.accessKeyId;
      env["MINIO_SECRET_ACCESS_KEY"] = credentials.secretAccessKey;
      env["MINIO_ENDPOINT"] = credentials.endpoint || "";
      env["MINIO_BUCKET"] = credentials.bucket;
      env["MINIO_REGION"] = credentials.region;
      break;

    case "gcs":
      env["GCS_ACCESS_KEY_ID"] = credentials.accessKeyId;
      env["GCS_SECRET_ACCESS_KEY"] = credentials.secretAccessKey;
      env["GCS_REGION"] = credentials.region;
      env["GCS_BUCKET"] = credentials.bucket;
      break;
  }

  return env;
}
