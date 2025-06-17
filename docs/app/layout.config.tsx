import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

/**
 * Shared layout configurations - Clean and minimal design
 *
 * you can customise layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */
export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Next S3 Uploader"
          className="mr-2"
        >
          {/* S3 Bucket Icon */}
          <path
            d="M3 7V17C3 18.1046 3.89543 19 5 19H19C20.1046 19 21 18.1046 21 17V7C21 5.89543 20.1046 5 19 5H5C3.89543 5 3 5.89543 3 7Z"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
          {/* Upload Arrow */}
          <path
            d="M12 9V15M12 9L9 12M12 9L15 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="font-semibold">Next S3 Uploader</span>
      </>
    ),
  },
  links: [
    {
      text: "Docs",
      url: "/docs",
      active: "nested-url",
    },
    {
      text: "Examples",
      url: "/docs/examples",
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
