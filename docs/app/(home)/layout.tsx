import { baseOptions } from "@/app/layout.config";
import { baseUrl } from "@/lib/metadata";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Pushduck - Universal File Upload Library",
  description:
    "The most comprehensive file upload library. Works with 16+ frameworks (Next.js, Remix, Hono, Express, etc.), edge runtimes (Cloudflare Workers, Vercel Edge, etc.), and 5+ storage providers (AWS S3, Cloudflare R2, DigitalOcean, etc.) with type-safe APIs.",
  openGraph: {
    title: "Pushduck - Universal File Upload Library",
    description:
      "The most comprehensive file upload library. Works with 16+ frameworks (Next.js, Remix, Hono, Express, etc.), edge runtimes (Cloudflare Workers, Vercel Edge, etc.), and 5+ storage providers (AWS S3, Cloudflare R2, DigitalOcean, etc.) with type-safe APIs.",
    type: "website",
    url: baseUrl.origin,
    images: {
      url: `${baseUrl.origin}/og-image`,
      width: 1200,
      height: 630,
      alt: "Pushduck - Universal File Upload Library",
    },
  },
  twitter: {
    card: "summary_large_image",
    title: "Pushduck - Universal File Upload Library",
    description:
      "The most comprehensive file upload library. Works with 16+ frameworks (Next.js, Remix, Hono, Express, etc.), edge runtimes (Cloudflare Workers, Vercel Edge, etc.), and 5+ storage providers (AWS S3, Cloudflare R2, DigitalOcean, etc.) with type-safe APIs.",
    images: `${baseUrl.origin}/og-image`,
  },
  keywords: [
    "nextjs",
    "file upload",
    "s3",
    "aws",
    "cloudflare r2",
    "digitalocean spaces",
    "typescript",
    "react",
    "presigned urls",
    "upload library",
    "edge runtime",
    "cloudflare workers",
    "vercel edge",
    "serverless",
  ],
};

export default function Layout({ children }: { children: ReactNode }) {
  return <HomeLayout {...baseOptions}>{children}</HomeLayout>;
}
