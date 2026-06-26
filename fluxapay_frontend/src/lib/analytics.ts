/**
 * Event Analytics Service
 * Tracks user interactions for conversion funnel performance
 * Supports Mixpanel, PostHog, or Segment via environment configuration
 */

// Define analytics configuration from environment variables
const ANALYTICS_PROVIDER = process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER || "none";
const MIXPANEL_TOKEN = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const SEGMENT_WRITE_KEY = process.env.NEXT_PUBLIC_SEGMENT_WRITE_KEY;

/**
 * Track an analytics event
 * @param eventName - Name of the event to track
 * @param properties - Additional properties to send with the event
 */
export function track(eventName: string, properties: Record<string, unknown> = {}) {
  // Fire-and-forget: don't block rendering
  (async () => {
    try {
      switch (ANALYTICS_PROVIDER.toLowerCase()) {
        case "mixpanel":
          if (MIXPANEL_TOKEN && typeof window !== "undefined" && (window as any).mixpanel) {
          (window as any).mixpanel.track(eventName, properties);
        }
          break;
        case "posthog":
          if (POSTHOG_KEY && typeof window !== "undefined" && (window as any).posthog) {
          (window as any).posthog.capture(eventName, properties);
        }
          break;
        case "segment":
          if (SEGMENT_WRITE_KEY && typeof window !== "undefined" && (window as any).analytics) {
          (window as any).analytics.track(eventName, properties);
        }
          break;
        default:
          // No provider configured, just log to console in development
          if (process.env.NODE_ENV === "development") {
            console.log("[Analytics]", eventName, properties);
          }
      }
    } catch (error) {
      // Silently fail to avoid affecting user experience
      if (process.env.NODE_ENV === "development") {
        console.error("[Analytics Error]", error);
      }
    }
  })();
}
