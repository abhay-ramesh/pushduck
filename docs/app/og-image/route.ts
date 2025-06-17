import { generateOGImage } from "fumadocs-ui/og";

export async function GET() {
  return generateOGImage({
    title: "Next.js S3 Uploader",
    description: "The Complete File Upload Solution",
    site: "next-s3-uploader.dev",
    primaryColor: "hsl(var(--primary))",
  });
}
