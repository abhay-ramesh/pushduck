import { baseOptions } from "@/app/layout.config";
import { source } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      {...baseOptions}
      sidebar={{
        defaultOpenLevel: 2,
        collapsible: true,
        banner: (
          <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-400">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              v0.3.0 - Latest Release
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Production-ready file uploads for Next.js
            </p>
          </div>
        ),
        footer: (
          <div className="border-t border-fd-border">
            <div className="flex flex-col gap-3 text-xs text-fd-muted-foreground p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-fd-foreground">
                  Community
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <a
                  href="https://github.com/abhay-ramesh/next-s3-uploader/issues"
                  className="flex items-center gap-2 text-fd-muted-foreground hover:text-fd-foreground transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                  Report Issues
                </a>
                <a
                  href="https://github.com/abhay-ramesh/next-s3-uploader/discussions"
                  className="flex items-center gap-2 text-fd-muted-foreground hover:text-fd-foreground transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M21 6h-2l-3-3H8L5 6H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" />
                  </svg>
                  Discussions
                </a>
              </div>
              <div className="border-t border-fd-border pt-3 mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span>Built with</span>
                  <a
                    href="https://fumadocs.vercel.app"
                    className="text-fd-foreground hover:text-blue-400 font-medium transition-colors"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Fumadocs
                  </a>
                </div>
              </div>
            </div>
          </div>
        ),
      }}
    >
      {children}
    </DocsLayout>
  );
}
