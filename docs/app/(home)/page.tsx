import {
  ArrowRight,
  Code,
  Github,
  Shield,
  Star,
  Upload,
  Zap,
} from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex-1">
      {/* Hero Section */}
      <section className="overflow-hidden relative bg-gradient-to-b border-b from-background to-muted/20">
        <div className="container px-4 py-16 mx-auto sm:px-6 lg:px-8">
          <div className="grid gap-12 items-center lg:grid-cols-2">
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full border bg-muted text-muted-foreground">
                  <Star className="mr-2 w-4 h-4" />
                  Open Source S3 Upload Solution
                </div>
                <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
                  Next.js S3 Uploads
                  <span className="text-primary"> Made Simple</span>
                </h1>
                <p className="max-w-2xl text-lg text-muted-foreground">
                  The most comprehensive file upload library for Next.js. Handle
                  uploads to AWS S3, Cloudflare R2, DigitalOcean Spaces, and
                  more with type-safe APIs and zero configuration.
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <Link
                  href="/docs"
                  className="inline-flex justify-center items-center px-6 py-3 text-base font-medium text-white rounded-lg border border-transparent transition-colors bg-primary hover:bg-primary/90"
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

              <div className="flex items-center space-x-6 text-sm text-muted-foreground">
                <div className="flex items-center">
                  <div className="mr-2 w-2 h-2 bg-green-500 rounded-full"></div>
                  TypeScript Support
                </div>
                <div className="flex items-center">
                  <div className="mr-2 w-2 h-2 bg-blue-500 rounded-full"></div>
                  Zero Config
                </div>
                <div className="flex items-center">
                  <div className="mr-2 w-2 h-2 bg-purple-500 rounded-full"></div>
                  Production Ready
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="overflow-hidden relative rounded-xl border shadow-2xl bg-card">
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
                <div className="p-6 bg-card">
                  <pre className="text-sm leading-relaxed text-foreground">
                    <code>{`import { uploadConfig } from "next-s3-uploader/server";

export const { s3, uploadHandler } = uploadConfig
  .s3({
    bucket: process.env.S3_BUCKET!,
    region: process.env.AWS_REGION!,
  })
  .defaults({
    maxFileSize: "10MB",
    allowedTypes: ["image/*", "video/*"],
  })
  .build();`}</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-background">
        <div className="container px-4 mx-auto sm:px-6 lg:px-8">
          <div className="mb-16 space-y-4 text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Everything you need for file uploads
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Built with developer experience in mind. From local development to
              production scale.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            <div className="relative group">
              <div className="p-6 rounded-xl border transition-all duration-200 border-border bg-card hover:shadow-lg">
                <Upload className="mb-4 w-12 h-12 text-primary" />
                <h3 className="mb-2 text-xl font-semibold">
                  Multiple Providers
                </h3>
                <p className="text-muted-foreground">
                  Support for AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO,
                  and Google Cloud Storage.
                </p>
              </div>
            </div>

            <div className="relative group">
              <div className="p-6 rounded-xl border transition-all duration-200 border-border bg-card hover:shadow-lg">
                <Shield className="mb-4 w-12 h-12 text-primary" />
                <h3 className="mb-2 text-xl font-semibold">Type Safe</h3>
                <p className="text-muted-foreground">
                  Full TypeScript support with intelligent autocomplete and
                  compile-time error checking.
                </p>
              </div>
            </div>

            <div className="relative group">
              <div className="p-6 rounded-xl border transition-all duration-200 border-border bg-card hover:shadow-lg">
                <Zap className="mb-4 w-12 h-12 text-primary" />
                <h3 className="mb-2 text-xl font-semibold">Zero Config</h3>
                <p className="text-muted-foreground">
                  Works out of the box with sensible defaults. Customize only
                  what you need.
                </p>
              </div>
            </div>

            <div className="relative group">
              <div className="p-6 rounded-xl border transition-all duration-200 border-border bg-card hover:shadow-lg">
                <Code className="mb-4 w-12 h-12 text-primary" />
                <h3 className="mb-2 text-xl font-semibold">
                  Developer Experience
                </h3>
                <p className="text-muted-foreground">
                  Beautiful APIs, comprehensive docs, and helpful error
                  messages.
                </p>
              </div>
            </div>

            <div className="relative group">
              <div className="p-6 rounded-xl border transition-all duration-200 border-border bg-card hover:shadow-lg">
                <Shield className="mb-4 w-12 h-12 text-primary" />
                <h3 className="mb-2 text-xl font-semibold">Security First</h3>
                <p className="text-muted-foreground">
                  Built-in validation, file type checking, and security best
                  practices.
                </p>
              </div>
            </div>

            <div className="relative group">
              <div className="p-6 rounded-xl border transition-all duration-200 border-border bg-card hover:shadow-lg">
                <Zap className="mb-4 w-12 h-12 text-primary" />
                <h3 className="mb-2 text-xl font-semibold">Production Ready</h3>
                <p className="text-muted-foreground">
                  Battle-tested in production with proper error handling and
                  monitoring.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-muted/20">
        <div className="container px-4 mx-auto text-center sm:px-6 lg:px-8">
          <div className="space-y-6">
            <h2 className="text-3xl font-bold tracking-tight">
              Ready to start uploading?
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Get started in minutes with our comprehensive documentation and
              examples.
            </p>
            <div className="flex justify-center">
              <Link
                href="/docs/quick-start"
                className="inline-flex justify-center items-center px-8 py-3 text-base font-medium text-white rounded-lg border border-transparent transition-colors bg-primary hover:bg-primary/90"
              >
                Start Building
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
