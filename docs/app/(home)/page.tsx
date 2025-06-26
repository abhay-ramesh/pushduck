"use client";

import {
  ArrowRight,
  Check,
  CheckCircle,
  ChevronDown,
  Cloud,
  Code,
  Copy,
  Database,
  FileText,
  Gauge,
  Github,
  Globe,
  Image,
  Settings,
  Shield,
  Star,
  Video,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BundledTheme, codeToHtml } from "shiki";

const codeExample = `import { uploadConfig } from "pushduck/server";

// Universal API - works with ANY framework
export const { s3, uploadRouter } = uploadConfig
  .provider("cloudflareR2", {
    bucket: process.env.S3_BUCKET!,
    region: process.env.AWS_REGION!,
  })
  .build();

// Framework-agnostic handlers
export const { GET, POST } = uploadRouter.handlers;`;

const packageManagers = [
  { name: "npm", command: "npm install pushduck" },
  { name: "pnpm", command: "pnpm add pushduck" },
  { name: "yarn", command: "yarn add pushduck" },
  { name: "bun", command: "bun add pushduck" },
];

const themes = {
  light: "one-light",
  dark: "one-dark-pro",
} satisfies Record<string, BundledTheme>;

const frameworks = [
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
    url: "https://kit.svelte.dev",
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
    url: "https://tanstack.com/start",
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
    logo: "https://nitro.unjs.io/icon.svg",
    url: "https://nitro.unjs.io",
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
    url: "https://www.backblaze.com/b2/cloud-storage.html",
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
    icon: Image,
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

function InstallCommand() {
  const [selectedPM, setSelectedPM] = useState(packageManagers[0]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedCommand, setHighlightedCommand] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function highlightCommand() {
      try {
        const html = await codeToHtml(selectedPM.command, {
          lang: "bash",
          themes,
          defaultColor: false,
        });
        setHighlightedCommand(html);
      } catch (error) {
        console.error("Failed to highlight command:", error);
        setHighlightedCommand(`<code>${selectedPM.command}</code>`);
      }
    }

    highlightCommand();
  }, [selectedPM]);

  const handleCopy = async (command: string) => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setShowDropdown(false);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative mx-auto mb-12 max-w-md">
      <div className="flex gap-2 items-center p-3 font-mono text-sm rounded-lg border bg-muted">
        <span className="text-muted-foreground">$</span>
        <div
          className="flex-1 [&_pre]:m-0 [&_pre]:p-0 [&_pre]:bg-transparent [&_code]:bg-transparent text-start"
          dangerouslySetInnerHTML={{ __html: highlightedCommand }}
        />
        <div className="relative">
          <button
            className="flex gap-1 items-center p-1 rounded transition-colors hover:bg-background"
            title="Copy to clipboard"
            onClick={() => setShowDropdown(!showDropdown)}
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            <ChevronDown className="w-3 h-3" />
          </button>

          {showDropdown && (
            <div className="absolute right-0 top-full mt-1 bg-fd-background border border-fd-border rounded-md shadow-xl py-1 z-50 min-w-[160px]">
              {packageManagers.map((pm) => (
                <button
                  key={pm.name}
                  className="flex justify-between items-center px-3 py-2 w-full text-sm text-left transition-colors hover:bg-fd-muted text-fd-foreground"
                  onClick={() => {
                    setSelectedPM(pm);
                    handleCopy(pm.command);
                  }}
                >
                  <span className="font-medium">{pm.name}</span>
                  {selectedPM.name === pm.name && (
                    <Check className="w-3 h-3 text-fd-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Click outside to close */}
      {showDropdown && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
}

function CodeBlock() {
  const [highlightedCode, setHighlightedCode] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function highlightCode() {
      try {
        const html = await codeToHtml(codeExample, {
          lang: "typescript",
          themes,
          defaultColor: false,
        });
        setHighlightedCode(html);
      } catch (error) {
        console.error("Failed to highlight code:", error);
        // Fallback to plain text
        setHighlightedCode(
          `<pre><code class="flex text-start">${codeExample}</code></pre>`
        );
      } finally {
        setIsLoading(false);
      }
    }

    highlightCode();
  }, []);

  if (isLoading) {
    return (
      <div className="p-6 text-left animate-pulse bg-muted">
        <div className="space-y-2">
          <div className="w-3/4 h-4 rounded bg-muted-foreground/20"></div>
          <div className="w-1/2 h-4 rounded bg-muted-foreground/20"></div>
          <div className="w-5/6 h-4 rounded bg-muted-foreground/20"></div>
          <div className="w-2/3 h-4 rounded bg-muted-foreground/20"></div>
          <div className="w-3/5 h-4 rounded bg-muted-foreground/20"></div>
          <div className="w-1/3 h-4 rounded bg-muted-foreground/20"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div
        className="[&_pre]:m-0 [&_pre]:border-none [&_pre]:bg-transparent text-start [&_code]:bg-transparent [&_pre]:p-6"
        dangerouslySetInnerHTML={{ __html: highlightedCode }}
      />
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="flex-1">
      {/* Hero Section */}
      <section className="container px-4 py-24 mx-auto sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center px-3 py-1 mb-6 text-xs font-medium rounded-full bg-primary/10 text-primary">
            <Star className="w-3 h-3 mr-1" />
            Universal • Type-Safe • Production Ready
          </div>

          <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            File Uploads for
            <span className="block mt-2 bg-gradient-to-r from-primary via-purple-500 to-indigo-500 bg-clip-text text-transparent">
              Any Framework
            </span>
          </h1>

          <p className="mx-auto mb-8 max-w-3xl text-xl text-muted-foreground sm:text-2xl">
            The most comprehensive file upload library. Works with 16+
            frameworks, 5+ storage providers, edge runtimes, with type-safe APIs
            and guided setup.
          </p>

          <div className="flex flex-col gap-4 justify-center mb-12 sm:flex-row">
            <Link
              href="/docs"
              className="inline-flex justify-center items-center px-8 py-4 text-lg font-medium rounded-xl border border-transparent transition-all shadow-lg text-primary-foreground bg-primary hover:bg-primary/90 hover:shadow-xl hover:scale-105"
            >
              Get Started
              <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
            <Link
              href="https://github.com/abhay-ramesh/pushduck"
              className="inline-flex justify-center items-center px-8 py-4 text-lg font-medium rounded-xl border transition-all shadow-md border-border text-foreground bg-background hover:bg-muted hover:shadow-lg hover:scale-105"
            >
              <Github className="mr-2 w-5 h-5" />
              View on GitHub
            </Link>
          </div>

          {/* Quick Install */}
          <InstallCommand />

          {/* Code Example */}
          <div className="mx-auto max-w-4xl">
            <div className="overflow-hidden rounded-2xl border shadow-2xl bg-card">
              <div className="px-6 py-3 border-b bg-muted">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="ml-4 text-sm font-mono text-muted-foreground">
                    upload.ts
                  </span>
                </div>
              </div>
              <CodeBlock />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-t bg-muted/20">
        <div className="container px-4 py-20 mx-auto sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Everything you need for file uploads
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Built with developer experience in mind, pushduck handles the
                complexity so you can focus on your application
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="p-6 rounded-2xl border bg-card hover:shadow-lg transition-all hover:scale-105"
                >
                  <div
                    className={`flex justify-center items-center mx-auto mb-4 w-12 h-12 rounded-xl bg-muted ${feature.color}`}
                  >
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <h3 className="mb-3 text-lg font-semibold text-center">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground text-center leading-relaxed">
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
        <div className="container px-4 py-20 mx-auto sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Works with your favorite framework & edge runtime
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Universal API that adapts to any framework and edge runtime -
                write once, deploy anywhere from traditional servers to the edge
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {frameworks.map((framework, index) => (
                <a
                  key={index}
                  href={framework.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-4 rounded-xl border bg-card hover:shadow-md transition-all hover:scale-105 group"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 flex-shrink-0">
                      <img
                        src={framework.logo}
                        alt={`${framework.name} logo`}
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          // Fallback to text if image fails to load
                          const target = e.target as HTMLImageElement;
                          target.style.display = "none";
                          const fallback = document.createElement("div");
                          fallback.className =
                            "w-8 h-8 bg-primary/10 rounded flex items-center justify-center text-xs font-bold text-primary";
                          fallback.textContent = framework.name.charAt(0);
                          target.parentNode?.appendChild(fallback);
                        }}
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

            <div className="mt-12 text-center">
              <div className="inline-flex items-center px-4 py-2 rounded-lg bg-muted/50 text-sm text-muted-foreground mb-4">
                <span className="mr-2">+</span>
                Any custom HTTP server, edge runtime, or serverless function
              </div>
              <br />
              <Link
                href="/docs/integrations"
                className="inline-flex items-center px-6 py-3 text-base font-medium rounded-lg transition-colors text-primary hover:text-primary/80"
              >
                View all integrations
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Storage Providers Section */}
      <section className="border-t bg-muted/20">
        <div className="container px-4 py-20 mx-auto sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Store files anywhere
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Switch between storage providers without changing your code.
                Works with any service that implements the S3 API.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {providers.map((provider, index) => (
                <a
                  key={index}
                  href={provider.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-6 rounded-2xl border bg-card hover:shadow-lg transition-all hover:scale-105 group"
                >
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-8 h-8 flex-shrink-0">
                      <img
                        src={provider.icon}
                        alt={`${provider.name} logo`}
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          // Fallback to text if image fails to load
                          const target = e.target as HTMLImageElement;
                          target.style.display = "none";
                          const fallback = document.createElement("div");
                          fallback.className =
                            "w-8 h-8 bg-primary/10 rounded flex items-center justify-center text-xs font-bold text-primary";
                          fallback.textContent = provider.name.charAt(0);
                          target.parentNode?.appendChild(fallback);
                        }}
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

            <div className="mt-12 text-center">
              <div className="inline-flex items-center px-4 py-2 rounded-lg bg-muted/50 text-sm text-muted-foreground mb-4">
                <span className="mr-2">+</span>
                Any other S3-compatible storage service
              </div>
              <br />
              <Link
                href="/docs/providers"
                className="inline-flex items-center px-6 py-3 text-base font-medium rounded-lg transition-colors text-primary hover:text-primary/80"
              >
                Compare providers
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Upload Types Section */}
      <section className="border-t">
        <div className="container px-4 py-20 mx-auto sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Handle any file type
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Built-in validation and optimization for common file types, with
                custom rules for anything else
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              {uploadTypes.map((upload, index) => (
                <div key={index} className="text-center">
                  <div className="flex justify-center items-center mx-auto mb-4 w-16 h-16 rounded-2xl bg-primary/10">
                    <upload.icon className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{upload.type}</h3>
                  <p className="mb-3 text-sm text-muted-foreground font-medium">
                    {upload.description}
                  </p>
                  <p className="text-xs text-muted-foreground/80">
                    {upload.examples}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="border-t bg-muted/20">
        <div className="container px-4 py-20 mx-auto sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="mb-16 text-center">
              <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Why developers choose pushduck
              </h2>
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
                <div className="p-6 rounded-2xl border bg-card">
                  <h3 className="font-semibold mb-4">Quick Setup Example</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-mono">
                        1
                      </span>
                      <code className="text-muted-foreground">
                        npx @pushduck/cli@latest init
                      </code>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-mono">
                        2
                      </span>
                      <span className="text-muted-foreground">
                        Configure your storage provider
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-mono">
                        3
                      </span>
                      <span className="text-muted-foreground">
                        Add upload routes to your app
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-green-500 text-white text-xs flex items-center justify-center">
                        ✓
                      </span>
                      <span className="text-muted-foreground">
                        Start uploading files!
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t">
        <div className="container px-4 py-20 mx-auto text-center sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to handle file uploads like a pro?
            </h2>
            <p className="mb-8 text-lg text-muted-foreground">
              Join developers building the next generation of applications with
              pushduck. Get started in minutes with our comprehensive
              documentation.
            </p>
            <div className="flex flex-col gap-4 justify-center sm:flex-row">
              <Link
                href="/docs"
                className="inline-flex justify-center items-center px-8 py-4 text-lg font-medium rounded-xl border border-transparent transition-all shadow-lg text-primary-foreground bg-primary hover:bg-primary/90 hover:shadow-xl hover:scale-105"
              >
                Start Building
                <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
              <Link
                href="/docs/examples"
                className="inline-flex justify-center items-center px-8 py-4 text-lg font-medium rounded-xl border transition-all shadow-md border-border text-foreground bg-background hover:bg-muted hover:shadow-lg hover:scale-105"
              >
                <Code className="mr-2 w-5 h-5" />
                View Examples
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
