import {
  defineConfig,
  defineDocs,
  frontmatterSchema,
  metaSchema,
} from "fumadocs-mdx/config";

// You can customise Zod schemas for frontmatter and `meta.json` here
// see https://fumadocs.vercel.app/docs/mdx/collections#define-docs
export const docs = defineDocs({
  docs: {
    schema: frontmatterSchema,
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig({
  mdxOptions: {
    // Enhanced MDX options for better code highlighting and features
    remarkPlugins: [],
    rehypePlugins: [],
  },
  // Enhanced search configuration
  search: {
    enabled: true,
    // Add custom search indexing
    index: {
      title: true,
      description: true,
      content: true,
      headings: true,
      keywords: true,
    },
  },
  // Better social meta tags
  global: {
    siteName: "Pushduck",
    description: "The most comprehensive file upload library for Next.js",
    keywords: ["nextjs", "s3", "upload", "aws", "cloudflare", "typescript"],
    author: "Abhay Ramesh",
    twitterCard: "summary_large_image",
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: "Pushduck",
    },
  },
});
