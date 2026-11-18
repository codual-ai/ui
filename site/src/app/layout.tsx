import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./global.css";

export const metadata: Metadata = {
  title: { default: "Codual UI", template: "%s · Codual UI" },
  description:
    "Headless UI for mobile apps. Tested behaviors your agent can drop in, identical on iOS, Android and React Native.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider
          theme={{ defaultTheme: "dark" }}
          search={{ options: { type: "static", api: `${process.env.NEXT_PUBLIC_BASE_PATH}/api/search` } }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
