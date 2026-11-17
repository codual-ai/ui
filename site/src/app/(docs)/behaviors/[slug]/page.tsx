import { Callout } from "fumadocs-ui/components/callout";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/notebook/page";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Actions, EdgeCases, Reference, States, Usage } from "@/components/behavior-sections.tsx";
import { Inline } from "@/components/inline.tsx";
import { blobUrl } from "@/lib/repo.ts";
import { behaviorPage, behaviorPages } from "@/lib/site.ts";

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return behaviorPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = behaviorPage((await params).slug);
  return page ? { title: page.title, description: page.description } : {};
}

const TOC = [
  { title: "Usage", url: "#usage", depth: 2 },
  { title: "States", url: "#states", depth: 2 },
  { title: "Actions", url: "#actions", depth: 2 },
  { title: "Reference", url: "#reference", depth: 2 },
  { title: "Edge cases", url: "#edge-cases", depth: 2 },
];

export default async function Page({ params }: Props) {
  const page = behaviorPage((await params).slug);
  if (!page) notFound();
  const specUrl = blobUrl(`spec/${page.spec}`);
  return (
    <DocsPage toc={TOC}>
      <DocsTitle>{page.title}</DocsTitle>
      <DocsDescription>{page.description}</DocsDescription>
      <DocsBody>
        {page.content.intro.map((paragraph) => (
          <p key={paragraph}>
            <Inline markdown={paragraph} />
          </p>
        ))}
        <Callout title="When to use it">
          <Inline markdown={page.whenToUse} />
        </Callout>
        <p>
          <a href={specUrl}>Read the full spec on GitHub</a>: states, transitions, edge cases, accessibility and what
          is left to the app.
        </p>
        <Usage page={page} />
        <States page={page} />
        <Actions page={page} />
        <Reference page={page} />
        <EdgeCases page={page} specUrl={specUrl} />
      </DocsBody>
    </DocsPage>
  );
}
