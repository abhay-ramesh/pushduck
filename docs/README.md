# Pushduck Documentation

[![NPM Version](https://img.shields.io/npm/v/pushduck?style=flat&colorA=18181B&colorB=374151)](https://www.npmjs.com/package/pushduck)
[![NPM Downloads](https://img.shields.io/npm/dm/pushduck?style=flat&colorA=18181B&colorB=374151)](https://www.npmjs.com/package/pushduck)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat&colorA=18181B&colorB=3178C6)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat&colorA=18181B&colorB=F59E0B)](https://opensource.org/licenses/MIT)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-7289DA?style=flat&colorA=18181B&colorB=7289DA)](https://discord.gg/pushduck)
[![Twitter](https://img.shields.io/badge/Twitter-Share%20on%20Twitter-1DA1F2?style=flat&colorA=18181B&colorB=1DA1F2)](https://twitter.com/intent/tweet?text=Just%20discovered%20%40pushduck%20-%20the%20fastest%20way%20to%20add%20file%20uploads%20to%20any%20web%20app!%20🦆%20https%3A//github.com/abhay-ramesh/pushduck)

📚 **Official documentation for Pushduck**

This is a Fumadocs application providing comprehensive documentation for the Pushduck library.

## 🚀 Development

Run the documentation site locally:

```bash
pnpm dev
# or
npm run dev
# or
yarn dev
```

Open <http://localhost:3000> with your browser to see the result.

## 🏗️ Structure

Following **Option A** pattern used by successful repositories:

```
docs/                        # 🖥️ Full Fumadocs app (root level)
├── app/                     # Next.js app router
├── content/                 # 📝 All documentation content
│   └── docs/               # Main docs content
├── components/             # Custom components
├── lib/                    # Utilities and configurations
└── package.json           # Dependencies
```

## 📝 Content

| Route                     | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| `app/(home)`              | Landing page and marketing content                     |
| `app/docs`                | Documentation layout and pages                         |
| `app/api/search/route.ts` | Search functionality for docs                          |
| `content/docs/`           | All documentation markdown/MDX files                   |

## ✨ Features

- **Fumadocs MDX**: Enhanced markdown with interactive components
- **Type-safe**: Full TypeScript integration
- **Fast Search**: Built-in document search
- **Beautiful UI**: Clean, responsive design
- **Components**: Interactive examples and live demos

## 🔧 Configuration

- `source.config.ts`: Content source configuration and frontmatter schema
- `lib/source.ts`: Content source adapter with `loader()` interface
- `app/layout.config.tsx`: Shared layout options

## 📚 Learn More

- [Fumadocs Documentation](https://fumadocs.dev) - Learn about Fumadocs
- [Next.js Documentation](https://nextjs.org/docs) - Next.js features and API
- [Pushduck](https://github.com/yourusername/pushduck) - Main repository
