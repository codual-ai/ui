import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import type { ReactNode } from "react";
import { GITHUB_URL } from "@/lib/repo.ts";
import { pageTree, VERSION_LABEL } from "@/lib/site.ts";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={pageTree}
      githubUrl={GITHUB_URL}
      nav={{
        mode: "top",
        title: (
          <>
            <span className="font-semibold">Codual UI</span>
            <span className="rounded-md border px-1.5 py-0.5 font-mono text-[0.7rem] text-fd-muted-foreground">
              {VERSION_LABEL}
            </span>
          </>
        ),
      }}
      links={[
        { text: "Behaviors", url: "/behaviors/screen-states", active: "nested-url" },
        { text: "Guides", url: "/get-started" },
        { text: "Specs", url: "/specs" },
      ]}
    >
      {children}
    </DocsLayout>
  );
}
