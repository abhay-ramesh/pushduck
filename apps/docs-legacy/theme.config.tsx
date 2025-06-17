import React from "react";
import { DocsThemeConfig, Tabs } from "nextra-theme-docs";
import Link from "next/link";

const config: DocsThemeConfig = {
  useNextSeoProps() {
    return {
      titleTemplate: "%s - Next S3 Uploader",
      description: "A simple, lightweight, and customizable S3 uploader.",
    };
  },
  logo: <span>Next S3 Uploader</span>,
  project: {
    link: "https://github.com/abhay-ramesh/next-s3-uploader",
  },
  docsRepositoryBase:
    "https://github.com/abhay-ramesh/next-s3-uploader/tree/main/apps/docs",
  footer: {
    text: (
      <>
        <span>
          MIT {new Date().getFullYear()} &copy;{" "}
          <Link href="https://github.com/abhay-ramesh">Abhay Ramesh</Link>.
        </span>
      </>
    ),
  },

  components: {},
  banner: {
    dismissible: true,
    text: (
      <>
        <b className="nx-font-bold">🎉 Next S3 Uploader</b> is now in beta!
        Please report any bugs or issues on{" "}
        <a
          className="nx-underline nx-font-bold"
          href="https://github.com/abhay-ramesh/next-s3-uploader/issues"
        >
          GitHub
        </a>
        .
      </>
    ),
  },
  toc: {
    backToTop: true,
  },
};

export default config;
