import { docs } from "@/.source";
import { loader } from "fumadocs-core/source";
import { icons } from "lucide-react";
import {
  cloneElement,
  createElement,
  isValidElement,
  type ReactNode,
} from "react";
import { frameworkIcons, providerIcons } from "./logos";

// Fumadocs renders a sidebar folder link as `[icon, name]` nested inside
// another children array, so React checks it as a list and wants the icon
// element keyed. The icon name is stable and unique within that pair.
function withKey(node: ReactNode, key: string): ReactNode {
  return isValidElement(node) ? cloneElement(node, { key }) : node;
}

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
      return withKey(frameworkIcons[icon], icon);
    }

    // Check for custom provider icons
    if (icon in providerIcons) {
      return withKey(providerIcons[icon], icon);
    }

    // Fallback to Lucide icons
    if (icon in icons) {
      return createElement(icons[icon as keyof typeof icons], { key: icon });
    }
  },
});
