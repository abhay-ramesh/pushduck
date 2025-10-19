import { docs } from "@/.source";
import { loader } from "fumadocs-core/source";
import { icons } from "lucide-react";
import { createElement } from "react";
import { frameworkIcons, providerIcons } from "./logos";

// See https://fumadocs.vercel.app/docs/headless/source-api for more info
export const source = loader({
  // it assigns a URL to your pages
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  icon(icon) {
    if (!icon) {
      // No default icon set
      return;
    }

    // Check for custom framework icons first
    if (icon in frameworkIcons) {
      return frameworkIcons[icon];
    }

    // Check for custom provider icons
    if (icon in providerIcons) {
      return providerIcons[icon];
    }

    // Fallback to Lucide icons
    if (icon in icons) {
      return createElement(icons[icon as keyof typeof icons]);
    }
  },
});
