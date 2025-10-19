import { RootProvider } from "fumadocs-ui/provider";
import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import "./global.css";

const inter = Inter({
  subsets: ["latin"],
});

export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
  title: {
    default: "Pushduck - Simple S3 Uploads for Next.js",
    template: "%s | Pushduck",
  },
  description: "🦆 Simple, type-safe S3 uploads for Next.js with guided setup",
  keywords: [
    "nextjs",
    "s3",
    "upload",
    "typescript",
    "react",
    "aws",
    "file-upload",
  ],
  authors: [{ name: "Abhay Ramesh" }],
  creator: "Abhay Ramesh",
  metadataBase: new URL("https://pushduck.dev"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://pushduck.dev",
    title: "Pushduck - Simple S3 Uploads for Next.js",
    description:
      "🦆 Simple, type-safe S3 uploads for Next.js with guided setup",
    siteName: "Pushduck",
    images: [
      {
        url: "/pushduck-mascot.png",
        width: 1200,
        height: 630,
        alt: "Pushduck - S3 Upload Library",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pushduck - Simple S3 Uploads for Next.js",
    description:
      "🦆 Simple, type-safe S3 uploads for Next.js with guided setup",
    images: ["/pushduck-mascot.png"],
    creator: "@abhayramesh",
  },
  icons: {
    icon: [
      { url: "/pushduck-mascot.png", sizes: "32x32", type: "image/png" },
      { url: "/pushduck-mascot.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/pushduck-mascot.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/pushduck-mascot.png",
  },
  manifest: "/site.webmanifest",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.className} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="icon" href="/pushduck-mascot.png" sizes="any" />
        <link rel="icon" href="/pushduck-mascot.png" type="image/png" />
        <link rel="apple-touch-icon" href="/pushduck-mascot.png" />
      </head>
      <body className="flex flex-col min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
