import {
  SimpleDocumentUpload,
  SimpleImageUpload,
} from "../components/simple-upload";

export default function Home() {
  return (
    <div className="py-8 min-h-screen bg-gray-50">
      <div className="px-4 mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-4xl font-bold text-gray-900">
            🚀 Next S3 Uploader
          </h1>
          <p className="mb-4 text-lg text-gray-600">
            New Router Architecture Demo
          </p>
          <div className="flex flex-col gap-2 items-center">
            <div className="inline-flex items-center px-3 py-1 text-sm font-medium text-green-800 bg-green-100 rounded-full">
              ✅ Phase 1.2 Complete - File Router Architecture
            </div>
            <div className="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-800 bg-blue-100 rounded-full">
              🌐 Connected to Cloudflare R2
            </div>
          </div>
        </div>

        {/* Upload Components */}
        <div className="grid grid-cols-1 gap-6 mb-8 md:grid-cols-2">
          <SimpleImageUpload />
          <SimpleDocumentUpload />
        </div>

        {/* Features */}
        <div className="p-6 bg-white rounded-lg border shadow-md">
          <h2 className="mb-4 text-2xl font-semibold text-gray-900">
            🎯 Key Features
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex gap-3 items-start">
                <span className="text-lg text-green-500">✓</span>
                <div>
                  <h3 className="font-medium text-gray-900">
                    Type-Safe Routes
                  </h3>
                  <p className="text-sm text-gray-600">
                    End-to-end TypeScript safety from server to client
                  </p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-lg text-green-500">✓</span>
                <div>
                  <h3 className="font-medium text-gray-900">
                    Schema Validation
                  </h3>
                  <p className="text-sm text-gray-600">
                    Built-in file type, size, and format validation
                  </p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-lg text-green-500">✓</span>
                <div>
                  <h3 className="font-medium text-gray-900">
                    Middleware System
                  </h3>
                  <p className="text-sm text-gray-600">
                    Authentication, logging, and custom processing
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex gap-3 items-start">
                <span className="text-lg text-green-500">✓</span>
                <div>
                  <h3 className="font-medium text-gray-900">Lifecycle Hooks</h3>
                  <p className="text-sm text-gray-600">
                    onUploadStart, onUploadComplete, onUploadError
                  </p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-lg text-green-500">✓</span>
                <div>
                  <h3 className="font-medium text-gray-900">
                    Progress Tracking
                  </h3>
                  <p className="text-sm text-gray-600">
                    Real-time upload progress and status updates
                  </p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-lg text-green-500">✓</span>
                <div>
                  <h3 className="font-medium text-gray-900">Error Handling</h3>
                  <p className="text-sm text-gray-600">
                    Comprehensive error states and user feedback
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Code Example */}
        <div className="p-6 mt-8 text-white bg-gray-900 rounded-lg">
          <h3 className="mb-4 text-lg font-semibold">📝 Usage Example</h3>
          <pre className="overflow-x-auto text-sm">
            <code>{`// Define your router
const s3Router = createS3Router({
  imageUpload: s3.image()
    .max("5MB")
    .formats(["jpeg", "png"])
    .middleware(async ({ req }) => {
      const user = await authenticate(req);
      return { userId: user.id };
    })
    .onUploadComplete(async ({ file, url }) => {
      await saveToDatabase(url);
    })
});

// Use in your component
const { startUpload, files, isUploading } = useS3UploadRoute<
  typeof s3Router,
  "imageUpload"
>("imageUpload");`}</code>
          </pre>
        </div>

        {/* Next Steps */}
        <div className="p-4 mt-6 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="mb-2 font-medium text-blue-800">🔮 Coming Next</h4>
          <p className="text-sm text-blue-700">
            Phase 1.3: Zero-config setup with automatic environment detection
            and built-in UI components.
          </p>
        </div>
      </div>
    </div>
  );
}
