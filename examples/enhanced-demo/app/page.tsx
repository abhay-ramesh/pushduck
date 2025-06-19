import {
  PropertyBasedDocumentUpload,
  PropertyBasedImageUpload,
} from "../components/property-based-upload";
import {
  SimpleDocumentUpload,
  SimpleImageUpload,
  SingleImageUpload,
} from "../components/simple-upload";

export default function Home() {
  return (
    <div className="py-8 min-h-screen bg-gray-50">
      <div className="px-4 mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-4xl font-bold text-gray-900">🚀 Pushduck</h1>
          <p className="mb-4 text-lg text-gray-600">
            Enhanced Type Inference Demo
          </p>
          <div className="flex flex-col gap-2 items-center">
            <div className="inline-flex items-center px-3 py-1 text-sm font-medium text-green-800 bg-green-100 rounded-full">
              ✅ Property-Based Client with Type Inference
            </div>
            <div className="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-800 bg-blue-100 rounded-full">
              🌐 Connected to Cloudflare R2
            </div>
          </div>
        </div>

        {/* Property-Based Upload Components (Enhanced) */}
        <div className="mb-8">
          <h2 className="mb-4 text-2xl font-semibold text-gray-900">
            🎯 Enhanced Type Inference (Property-Based Client)
          </h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <PropertyBasedImageUpload />
            <PropertyBasedDocumentUpload />
          </div>
        </div>

        {/* Original Upload Components (For Comparison) */}
        <div className="mb-8">
          <h2 className="mb-4 text-2xl font-semibold text-gray-900">
            📋 Original Hook-Based Approach (For Comparison)
          </h2>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <SimpleImageUpload />
            <SingleImageUpload />
            <SimpleDocumentUpload />
          </div>
        </div>

        {/* Features */}
        <div className="p-6 bg-white rounded-lg border shadow-md">
          <h2 className="mb-4 text-2xl font-semibold text-gray-900">
            🎯 Enhanced Type Inference Features
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex gap-3 items-start">
                <span className="text-lg text-green-500">✓</span>
                <div>
                  <h3 className="font-medium text-gray-900">
                    Property-Based Access
                  </h3>
                  <p className="text-sm text-gray-600">
                    <code className="px-1 text-xs bg-gray-100 rounded">
                      upload.imageUpload
                    </code>{" "}
                    - Direct property access eliminates string literals and
                    typos
                  </p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-lg text-green-500">✓</span>
                <div>
                  <h3 className="font-medium text-gray-900">
                    Template Literal Types
                  </h3>
                  <p className="text-sm text-gray-600">
                    Full TypeScript inference from server router to client hooks
                  </p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-lg text-green-500">✓</span>
                <div>
                  <h3 className="font-medium text-gray-900">
                    Zero Runtime Overhead
                  </h3>
                  <p className="text-sm text-gray-600">
                    Compile-time type safety with no performance impact
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex gap-3 items-start">
                <span className="text-lg text-green-500">✓</span>
                <div>
                  <h3 className="font-medium text-gray-900">
                    Enhanced IntelliSense
                  </h3>
                  <p className="text-sm text-gray-600">
                    Autocomplete shows available routes and methods from your
                    API
                  </p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-lg text-green-500">✓</span>
                <div>
                  <h3 className="font-medium text-gray-900">
                    Backward Compatible
                  </h3>
                  <p className="text-sm text-gray-600">
                    Works alongside existing hooks - migrate at your own pace
                  </p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-lg text-green-500">✓</span>
                <div>
                  <h3 className="font-medium text-gray-900">tRPC-Style DX</h3>
                  <p className="text-sm text-gray-600">
                    Familiar developer experience inspired by modern type-safe
                    libraries
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Code Example */}
        <div className="p-6 mt-8 text-white bg-gray-900 rounded-lg">
          <h3 className="mb-4 text-lg font-semibold">
            📝 Property-Based Client Usage
          </h3>
          <pre className="overflow-x-auto text-sm">
            <code>{`// Create typed client from your server router
const upload = createUploadClient<AppRouter>({ endpoint: "/api/upload" });

// Property-based access - no string literals!
const { uploadFiles, files, isUploading } = upload.imageUpload;
//            ^ Full TypeScript inference  
//                      ^ Type-safe property access

// Upload with complete type safety
await uploadFiles(selectedFiles);

// Each file gets individual tracking with proper types
files.map(file => (
  <div key={file.id}>
    <span>{file.name}</span>
    <span>{file.status}</span> {/* 'pending' | 'uploading' | 'success' | 'error' */}
    <progress value={file.progress} max={100} />
    {file.url && <a href={file.url}>View</a>}
  </div>
));`}</code>
          </pre>
        </div>

        {/* Demo Instructions */}
        <div className="p-4 mt-6 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="mb-2 font-medium text-blue-800">
            🎮 Try the Enhanced Demo
          </h4>
          <ul className="space-y-1 text-sm text-blue-700">
            <li>
              • <strong>Property-Based Client:</strong> Top section uses the new
              <code className="px-1 ml-1 text-xs bg-blue-100 rounded">
                upload.imageUpload
              </code>{" "}
              syntax
            </li>
            <li>
              • <strong>Hook-Based Original:</strong> Bottom section shows the
              traditional approach for comparison
            </li>
            <li>
              • <strong>Type Safety:</strong> Notice the enhanced IntelliSense
              and compile-time validation
            </li>
            <li>
              • <strong>Zero Changes:</strong> Same underlying functionality,
              better developer experience
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
