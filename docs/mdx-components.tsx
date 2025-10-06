import { Mermaid } from "@/components/mdx/mermaid";
import { UploadDemo } from "@/components/ui/upload-demo";
import * as Accordion from "fumadocs-ui/components/accordion";
import * as Callout from "fumadocs-ui/components/callout";
import * as Card from "fumadocs-ui/components/card";
import * as Steps from "fumadocs-ui/components/steps";
import * as Tabs from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

// use this function to get MDX components, you will need it for rendering MDX
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    UploadDemo,
    Mermaid,
    ...Steps,
    ...Callout,
    ...Tabs,
    ...Card,
    ...Accordion,
    ...components,
  };
}
