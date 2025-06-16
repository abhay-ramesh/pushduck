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
          <h1 className="mb-2 text-4xl font-bold text-gray-900">
            🚀 Next S3 Uploader
          </h1>
          <p className="mb-4 text-lg text-gray-600">
            Multiple File Upload Demo
          </p>
          <div className="flex flex-col gap-2 items-center">
            <div className="inline-flex items-center px-3 py-1 text-sm font-medium text-green-800 bg-green-100 rounded-full">
              ✅ Multiple File Upload Support
            </div>
            <div className="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-800 bg-blue-100 rounded-full">
              🌐 Connected to Cloudflare R2
            </div>
          </div>
        </div>

        {/* Upload Components */}
        <div className="grid grid-cols-1 gap-6 mb-8 lg:grid-cols-3">
          <SimpleImageUpload />
          <SingleImageUpload />
          <SimpleDocumentUpload />
        </div>

        {/* Features */}
        <div className="p-6 bg-white rounded-lg border shadow-md">
          <h2 className="mb-4 text-2xl font-semibold text-gray-900">
            🎯 Multiple File Upload Features
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex gap-3 items-start">
                <span className="text-lg text-green-500">✓</span>
                <div>
                  <h3 className="font-medium text-gray-900">
                    Parallel Uploads
                  </h3>
                  <p className="text-sm text-gray-600">
                    Multiple files upload simultaneously with individual
                    progress tracking
                  </p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-lg text-green-500">✓</span>
                <div>
                  <h3 className="font-medium text-gray-900">
                    Individual Status
                  </h3>
                  <p className="text-sm text-gray-600">
                    Each file has its own status: pending, uploading, success,
                    or error
                  </p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-lg text-green-500">✓</span>
                <div>
                  <h3 className="font-medium text-gray-900">Fault Tolerance</h3>
                  <p className="text-sm text-gray-600">
                    One file failing doesn&apos;t stop others from uploading
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex gap-3 items-start">
                <span className="text-lg text-green-500">✓</span>
                <div>
                  <h3 className="font-medium text-gray-900">
                    Progress Tracking
                  </h3>
                  <p className="text-sm text-gray-600">
                    Real-time progress bars for each file and overall completion
                  </p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-lg text-green-500">✓</span>
                <div>
                  <h3 className="font-medium text-gray-900">File Management</h3>
                  <p className="text-sm text-gray-600">
                    Add/remove files before upload, view file details
                  </p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-lg text-green-500">✓</span>
                <div>
                  <h3 className="font-medium text-gray-900">Type Safety</h3>
                  <p className="text-sm text-gray-600">
                    Full TypeScript support for multiple file operations
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Code Example */}
        <div className="p-6 mt-8 text-white bg-gray-900 rounded-lg">
          <h3 className="mb-4 text-lg font-semibold">
            📝 Multiple File Upload Usage
          </h3>
          <pre className="overflow-x-auto text-sm">
            <code>{`// The hook handles multiple files automatically
const { startUpload, files, isUploading } = useS3UploadRoute("imageUpload");

// Upload multiple files at once
const handleUpload = async (selectedFiles: File[]) => {
  await startUpload(selectedFiles); // Pass array of files
};

// Each file gets individual tracking
files.map(file => (
  <div key={file.id}>
    <span>{file.name}</span>
    <span>{file.status}</span> {/* pending | uploading | success | error */}
    <progress value={file.progress} max={100} />
    {file.url && <a href={file.url}>View</a>}
  </div>
));`}</code>
          </pre>
        </div>

        {/* Demo Instructions */}
        <div className="p-4 mt-6 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="mb-2 font-medium text-blue-800">🎮 Try the Demo</h4>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>
              • <strong>Multiple Images:</strong> Select multiple images to see
              parallel upload
            </li>
            <li>
              • <strong>Single Image:</strong> Traditional single file upload
              for comparison
            </li>
            <li>
              • <strong>Documents:</strong> Upload PDFs, DOCs, and text files
            </li>
            <li>
              • <strong>Progress:</strong> Watch individual and overall progress
              bars
            </li>
            <li>
              • <strong>Error Handling:</strong> Try uploading invalid files to
              see error states
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
