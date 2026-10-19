const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

type SentryModule = typeof import("@sentry/browser");
let sentry: Promise<SentryModule> | undefined;

/**
 * Loads and initialises Sentry once, and only when a DSN is configured. The SDK is imported
 * dynamically so it stays out of the initial bundle (it is about 26 kB gzipped).
 */
export function initSentry(): void {
  if (sentry || !dsn) return;
  sentry = import("@sentry/browser").then((mod) => {
    mod.init({ dsn, tracesSampleRate: 0.1 });
    return mod;
  });
}

export function reportAnomaly(name: string, detail: Record<string, unknown>): void {
  console.warn(`party anomaly: ${name}`, detail);
  void sentry?.then((mod) =>
    mod.captureMessage(`party anomaly: ${name}`, { level: "warning", extra: detail }),
  );
}
