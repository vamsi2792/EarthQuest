import type { ReactNode } from "react";

export const metadata = { title: "EarthQuest" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Fetch the item sprite sheet early; the inventory and map legends use it right away. */}
        <link rel="preload" as="image" href="/sprites/items.v1.svg" type="image/svg+xml" />
      </head>
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#10151c", color: "#e8edf2" }}>
        {children}
      </body>
    </html>
  );
}
