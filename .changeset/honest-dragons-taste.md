---
"pushduck": patch
"@pushduck/cli": patch
"@pushduck/ui": patch
---

feat(ui): enhance upload components and add utility functions

- Introduced new utility functions for class name merging using clsx and tailwind-merge.
- Updated UploadButton and UploadDropzone components to use new uploadFiles method.
- Added clsx and tailwind-merge as dependencies in the UI package.
- Created a new TypeScript configuration file for the UI package.
- Added changeset validator script to ensure proper changeset formatting.
