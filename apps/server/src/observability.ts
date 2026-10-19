import * as Sentry from "@sentry/node";

const enabled = Boolean(process.env.SENTRY_DSN);

if (enabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.1,
  });
}

/** Reports to Sentry when SENTRY_DSN is set; always logs locally so nothing is silently swallowed. */
export function captureError(err: unknown, context: Record<string, unknown> = {}): void {
  console.error("error:", err instanceof Error ? err.message : err, context);
  if (enabled) Sentry.captureException(err, { extra: context });
}

/** Sentry breadcrumb for non-fatal events worth seeing next to an error (rejections, reconnects). */
export function breadcrumb(message: string, data: Record<string, unknown> = {}): void {
  if (enabled) Sentry.addBreadcrumb({ category: "party", message, data });
}
