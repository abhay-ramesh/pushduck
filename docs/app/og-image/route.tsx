import { ImageResponse } from "next/og";

export async function GET() {
  // Fetch the mascot image
  const mascotImage = await fetch(
    new URL("/pushduck-mascot.png", "https://pushduck.dev")
  ).then((res) => res.arrayBuffer());

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
          position: "relative",
        }}
      >
        {/* Subtle vertical accent line */}
        <div
          style={{
            position: "absolute",
            left: "0",
            top: "0",
            bottom: "0",
            width: "3px",
            background:
              "linear-gradient(180deg, transparent 0%, rgba(59, 130, 246, 0.3) 20%, rgba(59, 130, 246, 0.6) 50%, rgba(59, 130, 246, 0.3) 80%, transparent 100%)",
            display: "flex",
          }}
        />

        {/* Subtle grid pattern */}
        <div
          style={{
            position: "absolute",
            inset: "0",
            backgroundImage: `
              linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px)
            `,
            backgroundSize: "32px 32px",
            display: "flex",
          }}
        />

        {/* Header with mascot */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            zIndex: 1,
          }}
        >
          <img
            src={`data:image/png;base64,${Buffer.from(mascotImage).toString(
              "base64"
            )}`}
            alt="Pushduck"
            width="40"
            height="40"
            style={{
              borderRadius: "8px",
              display: "flex",
            }}
          />
          <div
            style={{
              color: "#ffffff",
              fontSize: "24px",
              fontWeight: "600",
              letterSpacing: "0.5px",
              display: "flex",
            }}
          >
            Pushduck
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
              display: "flex",
              flexDirection: "column",
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
              display: "flex",
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
              display: "flex",
            }}
          >
            Open Source
          </div>
          <div
            style={{
              color: "#666666",
              fontSize: "16px",
              fontWeight: "400",
              display: "flex",
            }}
          >
            pushduck.dev
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
