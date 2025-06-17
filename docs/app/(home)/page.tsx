"use client";

import {
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  Github,
  Shield,
  Upload,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BundledTheme, codeToHtml } from "shiki";

const codeExample = `import { uploadConfig } from "next-s3-uploader/server";

export const { uploadHandler } = uploadConfig
  .s3({
    bucket: process.env.S3_BUCKET!,
    region: process.env.AWS_REGION!,
  })
  .build();`;

const packageManagers = [
  { name: "npm", command: "npm install next-s3-uploader" },
  { name: "pnpm", command: "pnpm add next-s3-uploader" },
  { name: "yarn", command: "yarn add next-s3-uploader" },
  { name: "bun", command: "bun add next-s3-uploader" },
];

const themes = {
  light: "one-light",
  dark: "one-dark-pro",
} satisfies Record<string, BundledTheme>;

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
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-6xl">
            Next.js S3 Uploads
            <span className="block mt-2 text-primary">Made Simple</span>
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-xl text-muted-foreground">
            The most comprehensive file upload library for Next.js. Handle
            uploads to AWS S3, Cloudflare R2, DigitalOcean Spaces, and more with
            type-safe APIs.
          </p>

          <div className="flex flex-col gap-4 justify-center mb-12 sm:flex-row">
            <Link
              href="/docs"
              className="inline-flex justify-center items-center px-6 py-3 text-base font-medium rounded-lg border border-transparent transition-colors text-primary-foreground bg-primary hover:bg-primary/90"
            >
              Get Started
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
            <Link
              href="https://github.com/abhay-ramesh/next-s3-uploader"
              className="inline-flex justify-center items-center px-6 py-3 text-base font-medium rounded-lg border transition-colors border-border text-foreground bg-background hover:bg-muted"
            >
              <Github className="mr-2 w-4 h-4" />
              View on GitHub
            </Link>
          </div>

          {/* Quick Install */}
          <InstallCommand />

          {/* Code Example */}
          <div className="mx-auto max-w-2xl">
            <div className="overflow-hidden rounded-xl border shadow-sm bg-card">
              <div className="px-4 py-2 border-b bg-muted">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="ml-4 text-sm text-muted-foreground">
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
        <div className="container px-4 py-16 mx-auto sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="mb-12 text-center">
              <h2 className="mb-4 text-3xl font-bold tracking-tight">
                Everything you need
              </h2>
              <p className="text-lg text-muted-foreground">
                Built with developer experience in mind
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              <div className="text-center">
                <div className="flex justify-center items-center mx-auto mb-4 w-12 h-12 rounded-lg bg-primary/10">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">
                  Multiple Providers
                </h3>
                <p className="text-sm text-muted-foreground">
                  AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO, and Google
                  Cloud Storage
                </p>
              </div>

              <div className="text-center">
                <div className="flex justify-center items-center mx-auto mb-4 w-12 h-12 rounded-lg bg-primary/10">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">Type Safe</h3>
                <p className="text-sm text-muted-foreground">
                  Full TypeScript support with intelligent autocomplete and
                  error checking
                </p>
              </div>

              <div className="text-center">
                <div className="flex justify-center items-center mx-auto mb-4 w-12 h-12 rounded-lg bg-primary/10">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">Zero Config</h3>
                <p className="text-sm text-muted-foreground">
                  Works out of the box with sensible defaults. Customize only
                  what you need
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t">
        <div className="container px-4 py-16 mx-auto text-center sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-4 text-3xl font-bold tracking-tight">
              Ready to start uploading?
            </h2>
            <p className="mb-8 text-lg text-muted-foreground">
              Get started in minutes with our comprehensive documentation.
            </p>
            <Link
              href="/docs"
              className="inline-flex justify-center items-center px-8 py-3 text-base font-medium rounded-lg border border-transparent transition-colors text-primary-foreground bg-primary hover:bg-primary/90"
            >
              Start Building
              <ArrowRight className="ml-2 w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
