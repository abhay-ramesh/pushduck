import { source } from "@/lib/source";
import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";

// export const runtime = "edge";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const page = source.getPage(slug.slice(0, -1));
  if (!page) notFound();

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

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: "6px",
              height: "32px",
              backgroundColor: "#ffffff",
              borderRadius: "0px",
              display: "flex",
            }}
          />
          <div
            style={{
              color: "#ffffff",
              fontSize: "20px",
              fontWeight: "500",
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
              fontSize: "56px",
              fontWeight: "600",
              lineHeight: "1.1",
              margin: "0 0 24px 0",
              letterSpacing: "-0.02em",
              display: "flex",
            }}
          >
            {page.data.title}
          </h1>
          {page.data.description && (
            <p
              style={{
                color: "#888888",
                fontSize: "24px",
                lineHeight: "1.5",
                margin: "0",
                fontWeight: "400",
                display: "flex",
              }}
            >
              {page.data.description}
            </p>
          )}
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
            Documentation
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

export function generateStaticParams() {
  return source.generateParams().map((page) => ({
    ...page,
    slug: [...page.slug, "image.png"],
  }));
}
