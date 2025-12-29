import { CodeTabsSection } from "@/components/ui/code-tabs";
import { GitHubStars } from "@/components/ui/github-stars";
import { HomepageUploadDemo } from "@/components/ui/homepage-upload-demo";
import {
  ArrowRight,
  CheckCircle,
  Cloud,
  Code,
  Database,
  FileText,
  Gauge,
  Globe,
  Image as ImageIcon,
  Settings,
  Shield,
  Video,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { BundledTheme, codeToHtml } from "shiki";

const serverCode = `import { createUploadConfig } from 'pushduck/server';

const { s3 } = createUploadConfig()
  .provider("aws", {
    bucket: process.env.AWS_BUCKET_NAME!,
    region: process.env.AWS_REGION!,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  })
  .build();

const router = s3.createRouter({
  imageUpload: s3.image().maxFileSize('5MB'),
});

export const { GET, POST } = router.handlers;
export type AppRouter = typeof router;`;

const uploadClientCode = `import { createUploadClient } from 'pushduck/client';
import type { AppRouter } from '@/app/api/upload/route';

export const upload = createUploadClient<AppRouter>({
  endpoint: '/api/upload'
});`;

const clientCode = `'use client';
import { upload } from '@/lib/upload-client';

export function Uploader() {
  const { uploadFiles, files, isUploading } = upload.imageUpload();

  return (
    <div>
      <input
        type="file"
        multiple
        accept="image/*"
        onChange={(e) => uploadFiles(Array.from(e.target.files || []))}
      />
      
      {files.map(file => (
        <div key={file.id}>
          {file.name} - {file.progress}%
        </div>
      ))}
    </div>
  );
}`;

const themes = {
  light: "one-light",
  dark: "one-dark-pro",
} satisfies Record<string, BundledTheme>;

export const frameworks = [
  {
    name: "Next.js",
    category: "Full-Stack",
    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nextjs/nextjs-original.svg",
    url: "https://nextjs.org",
  },
  {
    name: "Remix",
    category: "Full-Stack",
    logo: "https://remix.run/_brand/remix-letter-dark.png",
    url: "https://remix.run",
  },
  {
    name: "SvelteKit",
    category: "Full-Stack",
    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/svelte/svelte-original.svg",
    url: "https://svelte.dev/",
  },
  {
    name: "Nuxt.js",
    category: "Full-Stack",
    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nuxtjs/nuxtjs-original.svg",
    url: "https://nuxt.com",
  },
  {
    name: "TanStack Start",
    category: "Full-Stack",
    logo: "https://github.com/tanstack.png",
    url: "https://tanstack.com/start/latest",
  },
  {
    name: "SolidJS Start",
    category: "Full-Stack",
    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/solidjs/solidjs-original.svg",
    url: "https://start.solidjs.com",
  },
  {
    name: "Qwik",
    category: "Full-Stack",
    logo: "https://github.com/qwikdev.png",
    url: "https://qwik.dev",
  },
  {
    name: "Astro",
    category: "Static/Islands",
    logo: "https://github.com/withastro.png",
    url: "https://astro.build",
  },
  {
    name: "Fresh",
    category: "Static/Islands",
    logo: "https://fresh.deno.dev/logo.svg",
    url: "https://fresh.deno.dev",
  },
  {
    name: "Hono",
    category: "Runtime/Edge",
    logo: "https://hono.dev/images/logo.svg",
    url: "https://hono.dev",
  },
  {
    name: "Elysia",
    category: "Runtime/Edge",
    logo: "https://elysiajs.com/assets/elysia.svg",
    url: "https://elysiajs.com",
  },
  {
    name: "Bun",
    category: "Runtime/Edge",
    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/bun/bun-original.svg",
    url: "https://bun.sh",
  },
  {
    name: "Nitro H3",
    category: "Runtime/Edge",
    logo: "https://nitro.build/icon.svg",
    url: "https://nitro.build/",
  },
  {
    name: "Express",
    category: "Traditional",
    logo: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/express/express-original.svg",
    url: "https://expressjs.com",
  },
  {
    name: "Fastify",
    category: "Traditional",
    logo: "https://github.com/fastify.png",
    url: "https://fastify.dev",
  },
  {
    name: "Expo",
    category: "Mobile",
    logo: "https://github.com/expo.png",
    url: "https://expo.dev",
  },
];

const providers = [
  {
    name: "AWS S3",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/amazonwebservices/amazonwebservices-plain-wordmark.svg",
    description: "Industry standard with global reach",
    url: "https://aws.amazon.com/s3/",
  },
  {
    name: "Cloudflare R2",
    icon: "https://images.seeklogo.com/logo-png/29/2/cloudflare-logo-png_seeklogo-294312.png",
    description: "Zero egress fees, global edge",
    url: "https://developers.cloudflare.com/r2/",
  },
  {
    name: "DigitalOcean Spaces",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/digitalocean/digitalocean-original.svg",
    description: "Simple, predictable pricing",
    url: "https://www.digitalocean.com/products/spaces",
  },
  {
    name: "Google Cloud Storage",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/googlecloud/googlecloud-original.svg",
    description: "AI-ready with advanced features",
    url: "https://cloud.google.com/storage",
  },
  {
    name: "MinIO",
    icon: "https://blog.min.io/content/images/2019/05/minio-publication-icon-7.png",
    description: "Self-hosted S3 compatibility",
    url: "https://min.io",
  },
  {
    name: "Wasabi",
    icon: "https://cdn.document360.io/bef0a1ea-7768-4d5a-b520-c4fe2f7fafad/Images/Documentation/wasabi_symbol.png",
    description: "Hot cloud storage, predictable pricing",
    url: "https://wasabi.com",
  },
  {
    name: "Backblaze B2",
    icon: "https://github.com/backblaze.png",
    description: "Affordable cloud storage",
    url: "https://www.backblaze.com/cloud-storage",
  },
  {
    name: "Linode Object Storage",
    icon: "https://github.com/linode.png",
    description: "Simple, scalable object storage",
    url: "https://www.linode.com/products/object-storage/",
  },
  {
    name: "Any S3-Compatible",
    icon: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/amazonwebservices/amazonwebservices-plain-wordmark.svg",
    description: "Works with any S3-compatible API",
    url: "/docs/providers",
  },
];

const features = [
  {
    icon: Globe,
    title: "16+ Framework Support",
    description:
      "Universal handlers work with any web framework and edge runtime - from Next.js to Hono, Express to Expo to Cloudflare Workers",
    color: "text-blue-500",
  },
  {
    icon: Cloud,
    title: "5+ Storage Providers",
    description:
      "AWS S3, Cloudflare R2, DigitalOcean Spaces, Google Cloud, MinIO, Wasabi, Backblaze - switch anytime",
    color: "text-green-500",
  },
  {
    icon: Shield,
    title: "Type-Safe APIs",
    description:
      "Full TypeScript support with intelligent autocomplete and compile-time validation",
    color: "text-purple-500",
  },
  {
    icon: Zap,
    title: "CLI Setup",
    description:
      "Interactive CLI guides you through setup. Get from zero to uploads in minutes",
    color: "text-yellow-500",
  },
  {
    icon: Settings,
    title: "Advanced Schema Validation",
    description:
      "Built-in file type, size, and custom validation with detailed error messages",
    color: "text-red-500",
  },
  {
    icon: Gauge,
    title: "Production Ready",
    description:
      "Presigned URLs, chunked uploads, progress tracking, retry logic, and error handling",
    color: "text-indigo-500",
  },
];

const uploadTypes = [
  {
    icon: ImageIcon,
    type: "Images",
    description: "JPEG, PNG, WebP with automatic optimization",
    examples: "Profile pics, galleries, thumbnails",
  },
  {
    icon: Video,
    type: "Videos",
    description: "MP4, WebM, AVI with size and duration limits",
    examples: "Course content, demos, clips",
  },
  {
    icon: FileText,
    type: "Documents",
    description: "PDF, DOCX, XLSX with virus scanning",
    examples: "Contracts, reports, spreadsheets",
  },
  {
    icon: Database,
    type: "Any File Type",
    description: "Custom validation rules for any format",
    examples: "3D models, audio, archives",
  },
];

export default async function HomePage() {
  // Pre-render code highlighting server-side
  const [serverCodeHtml, uploadClientCodeHtml, clientCodeHtml] =
    await Promise.all([
      codeToHtml(serverCode, {
        lang: "typescript",
        themes,
        defaultColor: false,
      }),
      codeToHtml(uploadClientCode, {
        lang: "typescript",
        themes,
        defaultColor: false,
      }),
      codeToHtml(clientCode, {
        lang: "typescript",
        themes,
        defaultColor: false,
      }),
    ]);

  return (
    <main className="flex-1">
      {/* Hero Section - Side by Side */}
      <section className="container px-4 py-16 mx-auto sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Left: Marketing Copy */}
            <div className="text-center lg:text-left">
              <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl leading-tight">
                Production-ready file uploads
                <span className="block mt-2 text-foreground">
                  in <span className="font-mono text-primary">3 files</span>,{" "}
                  <span className="font-mono text-primary">~50 lines</span>
                </span>
              </h1>

              <p className="mb-6 text-base text-muted-foreground sm:text-lg leading-relaxed max-w-2xl lg:max-w-none">
                Stop fighting with AWS SDKs and presigned URLs. Pushduck gives
                you type-safe, framework-agnostic file uploads that work
                everywhere—from Next.js to Remix, Cloudflare to AWS.
              </p>

              <div className="flex flex-col gap-2 text-sm font-mono text-muted-foreground mb-6">
                <div className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400">✓</span>
                  <span>~15KB gzipped (no AWS SDK bloat)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400">✓</span>
                  <span>Full type safety</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-600 dark:text-green-400">✓</span>
                  <span>16+ frameworks, any S3 provider</span>
                </div>
              </div>
              {/* CTA Buttons */}
              <div className="flex flex-col gap-3 sm:flex-row lg:justify-start justify-center items-center sm:items-start lg:items-start">
                <Link
                  href="/docs/quick-start"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium border border-primary/20 hover:bg-fd-secondary/90 dark:hover:bg-fd-primary-foreground/90 transition-colors"
                >
                  Quick Start
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <GitHubStars />
              </div>

              {/* Framework Logos */}
              <div className="mt-8 pt-8 border-t">
                <p className="text-xs text-muted-foreground font-mono mb-4">
                  {"// Works with"}
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  {[
                    { name: "Next.js", logo: "https://github.com/nextjs.png" },
                    { name: "Remix", logo: "https://github.com/remix-run.png" },
                    {
                      name: "SvelteKit",
                      logo: "https://github.com/sveltejs.png",
                    },
                    { name: "Astro", logo: "https://github.com/withastro.png" },
                    { name: "Nuxt.js", logo: "https://github.com/nuxt.png" },
                    { name: "Hono", logo: "https://hono.dev/images/logo.svg" },
                  ].map((framework, index) => (
                    <div
                      key={index}
                      className="w-6 h-6 grayscale hover:grayscale-0 transition-all opacity-60 hover:opacity-100"
                      title={framework.name}
                    >
                      <img
                        src={framework.logo}
                        alt={framework.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ))}
                  <span className="text-xs text-muted-foreground font-mono">
                    +10 more
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Code + Demo */}
            <div className="lg:pl-8 space-y-8">
              {/* Code Block */}
              <div>
                <CodeTabsSection
                  serverCodeHtml={serverCodeHtml}
                  uploadClientCodeHtml={uploadClientCodeHtml}
                  clientCodeHtml={clientCodeHtml}
                />
              </div>

              {/* Live Demo */}
              <div>
                <div className="overflow-hidden rounded-2xl border shadow-2xl bg-card">
                  {/* Title Bar */}
                  <div className="px-4 py-3 bg-muted border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">
                          live uploading demo to
                        </span>
                        <img
                          src="https://images.seeklogo.com/logo-png/29/2/cloudflare-logo-png_seeklogo-294312.png"
                          alt="Cloudflare"
                          className="w-4 h-4 object-contain"
                        />
                        <span className="text-xs font-mono text-muted-foreground">
                          Cloudflare R2
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="p-6">
                    <HomepageUploadDemo />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Value Props */}
      <section className="border-t bg-muted/30">
        <div className="container px-4 py-16 mx-auto sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12">
              <h2 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Technical Overview
              </h2>
              <p className="text-sm text-muted-foreground font-mono">
                {"// Key features and architectural decisions"}
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="p-5 rounded-lg border bg-card hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <feature.icon className="w-5 h-5 text-primary flex-shrink-0" />
                    <h3 className="text-base font-semibold font-mono">
                      {feature.title}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Framework Support Section */}
      <section className="border-t">
        <div className="container px-4 py-16 mx-auto sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12">
              <h2 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Framework Support
              </h2>
              <p className="text-sm text-muted-foreground font-mono">
                {"// Universal adapter works everywhere"}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {frameworks.map((framework, index) => (
                <a
                  key={index}
                  href={framework.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 rounded-lg border bg-card hover:border-primary/50 transition-colors group"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 flex-shrink-0">
                      <img
                        src={framework.logo}
                        alt={`${framework.name} logo`}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium group-hover:text-primary transition-colors truncate">
                        {framework.name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {framework.category}
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>

            <div className="mt-8">
              <div className="p-4 rounded-lg border border-dashed bg-muted/30">
                <p className="text-sm text-muted-foreground font-mono">
                  + Any custom HTTP server, edge runtime, or serverless function
                </p>
              </div>
              <div className="mt-4">
                <Link
                  href="/docs/integrations"
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                >
                  View all integrations
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Storage Providers Section */}
      <section className="border-t bg-muted/30">
        <div className="container px-4 py-16 mx-auto sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12">
              <h2 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Storage Providers
              </h2>
              <p className="text-sm text-muted-foreground font-mono">
                {"// S3-compatible storage, swap anytime"}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {providers.map((provider, index) => (
                <a
                  key={index}
                  href={provider.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors group"
                >
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-8 h-8 flex-shrink-0">
                      <img
                        src={provider.icon}
                        alt={`${provider.name} logo`}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <h3 className="text-lg font-semibold group-hover:text-primary transition-colors">
                      {provider.name}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {provider.description}
                  </p>
                </a>
              ))}
            </div>

            <div className="mt-8">
              <div className="p-4 rounded-lg border border-dashed bg-muted/30">
                <p className="text-sm text-muted-foreground font-mono">
                  + Any other S3-compatible storage service
                </p>
              </div>
              <div className="mt-4">
                <Link
                  href="/docs/providers"
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                >
                  Compare providers
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Upload Types Section */}
      <section className="border-t">
        <div className="container px-4 py-16 mx-auto sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12">
              <h2 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">
                File Type Validation
              </h2>
              <p className="text-sm text-muted-foreground font-mono">
                {"// Built-in MIME type checking & custom rules"}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {uploadTypes.map((upload, index) => (
                <div key={index} className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-3 mb-2">
                    <upload.icon className="w-5 h-5 text-primary flex-shrink-0" />
                    <h3 className="text-sm font-semibold font-mono">
                      {upload.type}
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {upload.description}
                  </p>
                  <p className="text-xs text-muted-foreground/70 font-mono">
                    {upload.examples}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="border-t bg-muted/30">
        <div className="container px-4 py-16 mx-auto sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-12">
              <h2 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Key Benefits
              </h2>
              <p className="text-sm text-muted-foreground font-mono">
                {"// What makes Pushduck different"}
              </p>
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
              <div className="space-y-6">
                <div className="flex space-x-4">
                  <CheckCircle className="w-6 h-6 text-green-500 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">Zero vendor lock-in</h3>
                    <p className="text-muted-foreground text-sm">
                      Switch storage providers or frameworks without rewriting
                      code
                    </p>
                  </div>
                </div>

                <div className="flex space-x-4">
                  <CheckCircle className="w-6 h-6 text-green-500 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">
                      Production-ready security
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      Presigned URLs, file validation, size limits, and CORS
                      handling
                    </p>
                  </div>
                </div>

                <div className="flex space-x-4">
                  <CheckCircle className="w-6 h-6 text-green-500 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">
                      Developer experience first
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      CLI setup, TypeScript intellisense, detailed error
                      messages
                    </p>
                  </div>
                </div>

                <div className="flex space-x-4">
                  <CheckCircle className="w-6 h-6 text-green-500 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold mb-1">
                      Performance optimized
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      Direct uploads, chunked transfers, progress tracking,
                      automatic retries
                    </p>
                  </div>
                </div>
              </div>

              <div className="lg:pl-8">
                <div className="p-5 rounded-lg border bg-card">
                  <h3 className="font-semibold font-mono mb-4 text-sm">
                    Setup Steps
                  </h3>
                  <div className="space-y-2 text-sm font-mono">
                    <div className="flex items-center gap-3">
                      <span className="text-primary">1.</span>
                      <code className="text-muted-foreground">
                        npx @pushduck/cli@latest init
                      </code>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-primary">2.</span>
                      <span className="text-muted-foreground">
                        Configure storage provider
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-primary">3.</span>
                      <span className="text-muted-foreground">
                        Add upload routes
                      </span>
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                      <span className="text-green-600 dark:text-green-400">
                        ✓
                      </span>
                      <span className="text-muted-foreground">
                        Production ready
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section with Banner */}
      <section className="border-t bg-muted/30">
        <div className="container px-4 py-16 mx-auto sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            <div className="grid lg:grid-cols-2 gap-8 items-end">
              {/* Left: Banner Image */}
              <div className="order-2 lg:order-1">
                <div className="rounded-lg overflow-hidden border shadow-lg bg-card">
                  <Image
                    src="/banner.png"
                    width={768} // 768
                    height={512} // 512
                    alt="Pushduck Banner"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              {/* Right: CTA */}
              <div className="order-1 lg:order-2 text-center lg:text-left">
                <h2 className="mb-3 text-2xl font-bold tracking-tight sm:text-4xl">
                  Get Started
                </h2>
                <p className="mb-6 text-sm text-muted-foreground font-mono">
                  {"// Production-ready uploads in minutes"}
                </p>
                <div className="flex flex-col gap-3 sm:flex-row lg:justify-start justify-center">
                  <Link
                    href="/docs/quick-start"
                    className="inline-flex justify-center items-center px-5 py-2.5 text-sm font-medium rounded-md border border-transparent transition-colors text-primary-foreground bg-primary hover:bg-primary/90"
                  >
                    Quick Start
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Link>
                  <Link
                    href="/docs/examples"
                    className="inline-flex justify-center items-center px-5 py-2.5 text-sm font-medium rounded-md border transition-colors border-border text-foreground bg-background hover:bg-muted"
                  >
                    <Code className="mr-2 w-4 h-4" />
                    Examples
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="container px-4 py-2 mx-auto sm:px-6 lg:px-8">
          <div className="text-center text-xs text-muted-foreground font-mono">
            MIT Licensed • Built by{" "}
            <a
              href="https://github.com/abhay-ramesh"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors underline"
            >
              Abhay Ramesh
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
