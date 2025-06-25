import posthog from "posthog-js"

// Initialize PostHog when this module is loaded by Next.js
posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: "/ingest",
  ui_host: "https://us.posthog.com",
  capture_pageview: 'history_change',
  capture_pageleave: true,    // Enable pageleave capture
  capture_exceptions: true,   // Enable exception tracking
  debug: process.env.NODE_ENV === "development",
})