# Next S3 Uploader Documentation

📚 **Official documentation for Next S3 Uploader**

This is a Fumadocs application providing comprehensive documentation for the Next S3 Uploader library.

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
- [Next S3 Uploader](https://github.com/yourusername/next-s3-uploader) - Main repository
