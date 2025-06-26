import { FileManagementDemo } from "../components/file-management-demo";
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
            Complete S3 File Management Demo with Overall Progress Tracking
          </p>
          <div className="flex flex-col gap-2 items-center">
            <div className="inline-flex items-center px-3 py-1 text-sm font-medium text-orange-800 bg-orange-100 rounded-full">
              ⚡ NEW: Overall Progress Tracking
            </div>
            <div className="inline-flex items-center px-3 py-1 text-sm font-medium text-green-800 bg-green-100 rounded-full">
              ✅ List Files & Metadata Operations
            </div>
            <div className="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-800 bg-blue-100 rounded-full">
              🌐 Connected to S3-Compatible Storage
            </div>
            <div className="inline-flex items-center px-3 py-1 text-sm font-medium text-purple-800 bg-purple-100 rounded-full">
              🔧 Real S3 API Implementation
            </div>
          </div>
        </div>

        {/* File Management Demo */}
        <div className="mb-8">
          <FileManagementDemo userId="demo-user" />
        </div>

        {/* Property-Based Upload Components (Enhanced) */}
        <div className="mb-8">
          <h2 className="mb-4 text-2xl font-semibold text-gray-900">
            🎯 Enhanced Type Inference (Property-Based Client) + Overall
            Progress
          </h2>
          <div className="p-4 mb-4 bg-orange-50 rounded-lg border border-orange-200">
            <h3 className="mb-2 text-lg font-medium text-orange-800">
              ⚡ NEW: Overall Progress Tracking
            </h3>
            <p className="mb-2 text-sm text-orange-700">
              Get real-time overall progress metrics across all files:
            </p>
            <div className="grid grid-cols-1 gap-2 text-sm text-orange-700 md:grid-cols-3">
              <div>
                • <code className="px-1 bg-orange-100 rounded">progress</code> -
                0-100% across all files
              </div>
              <div>
                •{" "}
                <code className="px-1 bg-orange-100 rounded">uploadSpeed</code>{" "}
                - Combined transfer rate
              </div>
              <div>
                • <code className="px-1 bg-orange-100 rounded">eta</code> -
                Overall time remaining
              </div>
            </div>
          </div>
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

        {/* API Operations Reference */}
        <div className="p-6 bg-white rounded-lg border shadow-md">
          <h2 className="mb-4 text-2xl font-semibold text-gray-900">
            🔧 S3 Operations Reference
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-lg font-medium text-gray-800">
                List Operations
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex gap-3 items-start">
                  <span className="text-green-500">✓</span>
                  <div>
                    <code className="px-1 text-xs bg-gray-100 rounded">
                      listFiles()
                    </code>
                    <p className="text-gray-600">
                      Basic file listing with filtering
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="text-green-500">✓</span>
                  <div>
                    <code className="px-1 text-xs bg-gray-100 rounded">
                      listFilesPaginated()
                    </code>
                    <p className="text-gray-600">
                      Pagination support for large datasets
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="text-green-500">✓</span>
                  <div>
                    <code className="px-1 text-xs bg-gray-100 rounded">
                      listFilesByExtension()
                    </code>
                    <p className="text-gray-600">
                      Filter by file type (.jpg, .pdf, etc.)
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="text-green-500">✓</span>
                  <div>
                    <code className="px-1 text-xs bg-gray-100 rounded">
                      listFilesBySize()
                    </code>
                    <p className="text-gray-600">Filter by file size ranges</p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="text-green-500">✓</span>
                  <div>
                    <code className="px-1 text-xs bg-gray-100 rounded">
                      listDirectories()
                    </code>
                    <p className="text-gray-600">
                      List common prefixes (directories)
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-medium text-gray-800">
                Metadata Operations
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex gap-3 items-start">
                  <span className="text-green-500">✓</span>
                  <div>
                    <code className="px-1 text-xs bg-gray-100 rounded">
                      getFileInfo()
                    </code>
                    <p className="text-gray-600">
                      Comprehensive file information
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="text-green-500">✓</span>
                  <div>
                    <code className="px-1 text-xs bg-gray-100 rounded">
                      getFilesInfo()
                    </code>
                    <p className="text-gray-600">Batch metadata retrieval</p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="text-green-500">✓</span>
                  <div>
                    <code className="px-1 text-xs bg-gray-100 rounded">
                      validateFile()
                    </code>
                    <p className="text-gray-600">
                      File validation against rules
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="text-green-500">✓</span>
                  <div>
                    <code className="px-1 text-xs bg-gray-100 rounded">
                      setFileMetadata()
                    </code>
                    <p className="text-gray-600">Custom metadata management</p>
                  </div>
                </div>
                <div className="flex gap-3 items-start">
                  <span className="text-green-500">✓</span>
                  <div>
                    <code className="px-1 text-xs bg-gray-100 rounded">
                      fileExistsWithInfo()
                    </code>
                    <p className="text-gray-600">
                      Check existence with metadata
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Features */}
        <div className="p-6 mt-8 bg-white rounded-lg border shadow-md">
          <h2 className="mb-4 text-2xl font-semibold text-gray-900">
            🎯 Complete S3 Operations
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-3">
              <h3 className="text-lg font-medium text-gray-800">
                ✅ Upload Operations
              </h3>
              <div className="space-y-1 text-sm text-gray-600">
                <div>• Presigned URL generation</div>
                <div>• Direct server uploads</div>
                <div>• Progress tracking</div>
                <div>• Multi-file batching</div>
                <div>• Custom metadata</div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-medium text-gray-800">
                ✅ List & Browse
              </h3>
              <div className="space-y-1 text-sm text-gray-600">
                <div>• Directory-like listing</div>
                <div>• Pagination support</div>
                <div>• Filter by type/size/date</div>
                <div>• Async generators</div>
                <div>• Sorting options</div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-medium text-gray-800">
                ✅ Metadata & Info
              </h3>
              <div className="space-y-1 text-sm text-gray-600">
                <div>• File size, type, dates</div>
                <div>• Custom metadata CRUD</div>
                <div>• Batch operations</div>
                <div>• File validation</div>
                <div>• Existence checking</div>
              </div>
            </div>
          </div>
        </div>

        {/* Code Example */}
        <div className="p-6 mt-8 text-white bg-gray-900 rounded-lg">
          <h3 className="mb-4 text-lg font-semibold">
            📝 Real S3 API Usage Examples + Overall Progress Tracking
          </h3>
          <pre className="overflow-x-auto text-sm">
            <code>{`// Upload with overall progress tracking
const { uploadFiles, files, progress, uploadSpeed, eta } = useUploadRoute("imageUpload");

// Real-time overall metrics
console.log({
  overallProgress: progress,     // 0-100% across all files
  overallSpeed: uploadSpeed,     // Combined bytes/sec
  overallETA: eta               // Time remaining in seconds
});

// List user files with metadata
const files = await listFilesWithPrefix("users/123/", {
  maxFiles: 100,
  includeMetadata: true,
  sortBy: "modified",
  sortOrder: "desc"
});

// Get comprehensive file information
const fileInfo = await getFileInfo("users/123/avatar.jpg");
console.log({
  size: fileInfo.size,
  contentType: fileInfo.contentType,
  lastModified: fileInfo.lastModified,
  customMetadata: fileInfo.metadata
});

// Batch operations for efficiency
const filesInfo = await getFilesInfo([
  "users/123/avatar.jpg",
  "users/123/document.pdf",
  "users/123/report.docx"
]);

// Filter files by criteria
const images = await listFilesByExtension("jpg", "users/123/");
const largeFiles = await listFilesBySize(5000000, undefined, "users/123/");
const recentFiles = await listFilesByDate(
  new Date("2024-01-01"),
  new Date(),
  "users/123/"
);

// Paginated listing for large datasets
const result = await listFilesPaginated({
  prefix: "users/123/",
  pageSize: 50,
  continuationToken: nextPageToken
});

// File validation
const validation = await validateFile("users/123/avatar.jpg", {
  maxSize: 5000000,
  allowedTypes: ["image/jpeg", "image/png"],
  requiredExtensions: ["jpg", "jpeg", "png"]
});`}</code>
          </pre>
        </div>

        {/* Demo Instructions */}
        <div className="p-4 mt-6 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="mb-2 font-medium text-blue-800">
            🎮 Try the Complete Demo
          </h4>
          <ul className="space-y-1 text-sm text-blue-700">
            <li>
              • <strong>File Management:</strong> Top section demonstrates list
              files, metadata operations, and filtering
            </li>
            <li>
              • <strong>Pagination:</strong> Shows how to handle large datasets
              efficiently with continuation tokens
            </li>
            <li>
              • <strong>Real API:</strong> Uses actual S3 operations from
              pushduck server package
            </li>
            <li>
              • <strong>Multi-Provider:</strong> Works with AWS S3, Cloudflare
              R2, DigitalOcean Spaces, MinIO
            </li>
            <li>
              • <strong>Type Safety:</strong> Full TypeScript support with
              comprehensive interfaces
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
