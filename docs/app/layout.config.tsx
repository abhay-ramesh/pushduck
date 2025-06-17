import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

/**
 * Shared layout configurations - Professional and mature design
 *
 * you can customise layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */
export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <>
        <div className="flex gap-3 items-center">
          <div className="relative">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-label="Next S3 Uploader"
              className="text-primary"
            >
              {/* Modern S3 Bucket Icon with gradient effect */}
              <defs>
                <linearGradient
                  id="bucket-gradient"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
                  <stop
                    offset="100%"
                    stopColor="currentColor"
                    stopOpacity="0.7"
                  />
                </linearGradient>
              </defs>
              <path
                d="M3 7V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V7C21 5.89543 20.1046 5 19 5H5C3.89543 5 3 5.89543 3 7Z"
                stroke="url(#bucket-gradient)"
                strokeWidth="2"
                fill="currentColor"
                fillOpacity="0.1"
              />
              {/* Upload Arrow with enhanced styling */}
              <path
                d="M12 9V15M12 9L9 12M12 9L15 12"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full opacity-60 animate-pulse bg-primary" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight">
              Next S3 Uploader
            </span>
            <span className="text-xs font-medium tracking-wide text-muted-foreground">
              File uploads made simple
            </span>
          </div>
        </div>
      </>
    ),
    transparentMode: "top",
  },
  links: [
    {
      text: "Documentation",
      url: "/docs",
      active: "nested-url",
    },
    {
      text: "Examples",
      url: "/docs/examples",
    },
    {
      text: "Changelog",
      url: "/docs/roadmap",
    },
    {
      text: "AI/LLM TXT",
      url: "/llms.txt",
      external: true,
    },
    {
      text: "GitHub",
      url: "https://github.com/abhay-ramesh/next-s3-uploader",
      external: true,
    },
  ],
};
