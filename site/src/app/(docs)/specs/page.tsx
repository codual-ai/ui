import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/notebook/page";
import type { Metadata } from "next";
import Link from "next/link";
import { blobUrl, GITHUB_URL } from "@/lib/repo.ts";
import { behaviorPages } from "@/lib/site.ts";

export const metadata: Metadata = { title: "Specs" };

export default function Specs() {
  const total = behaviorPages.reduce((sum, page) => sum + page.specEntry.edgeCases.length, 0);
  return (
    <DocsPage>
      <DocsTitle>Specs</DocsTitle>
      <DocsDescription>
        Each behavior is written down once, before any code, and every platform follows it.
      </DocsDescription>
      <DocsBody>
        <p>
          A spec says what a behavior does, never how it looks: its states, its transitions, a numbered list of the
          edge cases apps get wrong, accessibility, and what is left to the app. Each edge case has a test on every
          platform it applies to, named by its ID, and CI fails when one is missing. {behaviorPages.length} specs,{" "}
          {total} edge cases.
        </p>
        <table>
          <thead>
            <tr>
              <th>Behavior</th>
              <th>Prefix</th>
              <th>Status</th>
              <th>Edge cases</th>
              <th>Spec</th>
            </tr>
          </thead>
          <tbody>
            {behaviorPages.map((page) => (
              <tr key={page.slug}>
                <td>
                  <Link href={page.url}>{page.title}</Link>
                </td>
                <td>
                  <code>{page.specEntry.prefix}</code>
                </td>
                <td>{page.specEntry.status}</td>
                <td>{page.specEntry.edgeCases.length}</td>
                <td>
                  <a href={blobUrl(`spec/${page.spec}`)}>{page.spec}</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          The format, and how tests are named on each platform: <a href={blobUrl("spec/README.md")}>spec/README.md</a>.
          A new behavior starts with its spec (<a href={`${GITHUB_URL}/blob/main/CONTRIBUTING.md`}>CONTRIBUTING.md</a>).
        </p>
      </DocsBody>
    </DocsPage>
  );
}
