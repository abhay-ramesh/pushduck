# @pushduck/ui

React UI components for pushduck - File upload components you can copy and paste into your apps.

## Overview

`@pushduck/ui` provides a collection of beautiful, accessible file upload components built with React, TypeScript, and Tailwind CSS. These components are designed to work seamlessly with the pushduck library and can be customized to match your application's design.

## Philosophy

Following the shadcn/ui approach, these are **not distributed as an npm package**. Instead, you copy the component code directly into your project, giving you:

- ✅ **Complete ownership** of the component code
- ✅ **Full customization** freedom
- ✅ **No version conflicts** or breaking changes
- ✅ **Zero bundle impact** - only install what you use
- ✅ **AI-friendly** - LLMs can read and modify your components

## Installation

Use the pushduck CLI to add components to your project:

```bash
# Install a specific component
npx @pushduck/cli@latest add upload-dropzone

# Install multiple components
npx @pushduck/cli@latest add upload-dropzone file-list progress-bar

# Install the complete demo
npx @pushduck/cli@latest add upload-demo
```

## Available Components

### Core Components

- **`upload-dropzone`** - Drag-and-drop file upload zone with validation
- **`file-list`** - Display files with upload progress and status
- **`progress-bar`** - Upload progress indicator with status states
- **`upload-button`** - Simple file upload button

### Composed Components

- **`upload-demo`** - Complete upload interface combining all components

## Quick Start

After installing components with the CLI, use them in your React app:

```tsx
import { UploadDropzone } from "@/components/ui/upload-dropzone"
import { FileList } from "@/components/ui/file-list"
import { useUploadRoute } from "pushduck/client"

export function MyUploader() {
  const { files, upload } = useUploadRoute("documentUpload")
  
  return (
    <div className="space-y-4">
      <UploadDropzone
        route="documentUpload"
        accept="application/pdf"
        maxSize={10 * 1024 * 1024} // 10MB
        onFilesAdded={(files) => console.log('Files added:', files)}
      />
      
      <FileList
        files={files}
        onRemove={(fileId) => console.log('Remove:', fileId)}
      />
    </div>
  )
}
```

## Component Documentation

### UploadDropzone

A drag-and-drop upload zone with file validation and visual feedback.

```tsx
<UploadDropzone
  route="myRoute"
  accept="image/*"
  maxSize={5 * 1024 * 1024}
  maxFiles={5}
  multiple={true}
  onFilesAdded={(files) => console.log(files)}
  onUploadComplete={(results) => console.log(results)}
/>
```

**Props:**

- `route` (required): Upload route name from your API
- `accept`: Accepted file types (MIME types or extensions)
- `maxSize`: Maximum file size in bytes (default: 10MB)
- `maxFiles`: Maximum number of files (default: 10)
- `multiple`: Allow multiple files (default: true)
- `validator`: Custom validation function
- `onFilesAdded`: Callback when files are dropped/selected
- `onUploadComplete`: Callback when upload completes
- `onUploadError`: Callback when upload fails

### FileList

Display a list of files with upload progress and status indicators.

```tsx
<FileList
  files={files}
  allowRemove={true}
  onRemove={(fileId) => removeFile(fileId)}
  onRetry={(fileId) => retryUpload(fileId)}
/>
```

**Props:**

- `files` (required): Array of FileItem objects
- `allowRemove`: Whether files can be removed (default: true)
- `onRemove`: Callback when file is removed
- `onRetry`: Callback when file upload is retried
- `renderFile`: Custom file item renderer

### ProgressBar

Upload progress indicator with customizable styling.

```tsx
<ProgressBar
  value={progress}
  size="md"
  variant="default"
  showValue={true}
  animated={true}
/>
```

**Props:**

- `value` (required): Progress value (0-100)
- `max`: Maximum value (default: 100)
- `size`: Size variant ("sm" | "md" | "lg")
- `variant`: Color variant ("default" | "success" | "error" | "warning")
- `showValue`: Show percentage text
- `animated`: Enable animation

### UploadButton

Simple file upload button with built-in file input.

```tsx
<UploadButton
  route="myRoute"
  accept="image/*"
  multiple={false}
  variant="default"
  size="md"
>
  Upload Photo
</UploadButton>
```

**Props:**

- `route` (required): Upload route name from your API
- `accept`: Accepted file types
- `multiple`: Allow multiple files (default: false)
- `variant`: Button style variant
- `size`: Button size variant
- `onFilesSelected`: Callback when files are selected

## Customization

Since you own the component code, you can customize anything:

### Styling

Components use Tailwind CSS classes. Modify the `className` props or edit the component source directly:

```tsx
<UploadDropzone
  className="border-blue-500 bg-blue-50"
  // ... other props
/>
```

### Behavior

Edit the component files directly to change behavior:

```tsx
// In your copied upload-dropzone.tsx
const handleDrop = React.useCallback((e: React.DragEvent) => {
  // Add your custom logic here
  console.log('Custom drop behavior')
  
  // Original logic...
  e.preventDefault()
  // ...
}, [])
```

### Add New Props

Extend component interfaces to add new functionality:

```tsx
export interface UploadDropzoneProps {
  // ... existing props
  
  // Your custom props
  onCustomEvent?: () => void
  customOption?: boolean
}
```

## Dependencies

Components require these peer dependencies:

- `react` >= 18.0.0
- `react-dom` >= 18.0.0  
- `tailwindcss` >= 3.0.0
- `pushduck` (for upload functionality)
- `lucide-react` (for icons)

## Registry URL

Components are served from: `https://pushduck.dev/r/[component-name].json`

Example:

- <https://pushduck.dev/r/upload-dropzone.json>
- <https://pushduck.dev/r/file-list.json>

## Development

To contribute or modify the registry:

```bash
# Clone the repo
git clone https://github.com/abhay-ramesh/pushduck.git
cd pushduck/packages/ui

# Install dependencies
pnpm install

# Build the registry
pnpm build

# Watch for changes
pnpm dev
```

## License

MIT License - feel free to use these components in any project!

## Credits

Inspired by [shadcn/ui](https://ui.shadcn.com) - the best component distribution system for React.
