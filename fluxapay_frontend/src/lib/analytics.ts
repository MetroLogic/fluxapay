/**
 * Event Analytics Service
 * Tracks user interactions for conversion funnel performance
 * Supports Mixpanel, PostHog, or Segment via environment configuration
 */

type AnalyticsWindow = Window & {
  mixpanel?: { track: (event: string, properties?: Record<string, unknown>) => void };
  posthog?: { capture: (event: string, properties?: Record<string, unknown>) => void };
  analytics?: { track: (event: string, properties?: Record<string, unknown>) => void };
};

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
      const win =
        typeof window !== "undefined" ? (window as AnalyticsWindow) : undefined;

      switch (ANALYTICS_PROVIDER.toLowerCase()) {
        case "mixpanel":
          if (MIXPANEL_TOKEN && win?.mixpanel) {
            win.mixpanel.track(eventName, properties);
          }
          break;
        case "posthog":
          if (POSTHOG_KEY && win?.posthog) {
            win.posthog.capture(eventName, properties);
          }
          break;
        case "segment":
          if (SEGMENT_WRITE_KEY && win?.analytics) {
            win.analytics.track(eventName, properties);
          }
          break;
        default:
          if (process.env.NODE_ENV === "development") {
            console.log("[Analytics]", eventName, properties);
          }
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[Analytics Error]", error);
      }
    }
  })();
}
