import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "space-between",
          backgroundColor: "#0a0a0a",
          padding: "80px",
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        {/* Subtle grid pattern */}
        <div
          style={{
            position: "absolute",
            inset: "0",
            backgroundImage: `
              linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
            `,
            backgroundSize: "32px 32px",
          }}
        />

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: "8px",
              height: "32px",
              backgroundColor: "#ffffff",
              borderRadius: "2px",
            }}
          />
          <div
            style={{
              color: "#ffffff",
              fontSize: "20px",
              fontWeight: "500",
              letterSpacing: "0.5px",
            }}
          >
            NEXT S3 UPLOADER
          </div>
        </div>

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
            maxWidth: "900px",
            zIndex: 1,
          }}
        >
          <h1
            style={{
              color: "#ffffff",
              fontSize: "64px",
              fontWeight: "600",
              lineHeight: "1.1",
              margin: "0 0 32px 0",
              letterSpacing: "-0.02em",
            }}
          >
            File uploads
            <br />
            <span style={{ color: "#888888" }}>made simple</span>
          </h1>
          <p
            style={{
              color: "#666666",
              fontSize: "24px",
              lineHeight: "1.5",
              margin: "0",
              fontWeight: "400",
              maxWidth: "600px",
            }}
          >
            Type-safe file uploads for Next.js with S3-compatible storage
          </p>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            zIndex: 1,
          }}
        >
          <div
            style={{
              color: "#444444",
              fontSize: "16px",
              fontWeight: "400",
            }}
          >
            Open Source
          </div>
          <div
            style={{
              color: "#666666",
              fontSize: "16px",
              fontWeight: "400",
            }}
          >
            next-s3-uploader.dev
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
