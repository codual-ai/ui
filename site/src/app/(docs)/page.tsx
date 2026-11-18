import { Card, Cards } from "fumadocs-ui/components/card";
import { Heading } from "fumadocs-ui/components/heading";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/notebook/page";
import Link from "next/link";
import { Code } from "@/components/code.tsx";
import { RN_PACKAGE, skillCommand } from "@content/install.ts";
import { behaviorPages } from "@/lib/site.ts";

const TOC = [
  { title: "Get started", url: "#get-started", depth: 2 },
  { title: "Behaviors", url: "#behaviors", depth: 2 },
  { title: "How it works", url: "#how-it-works", depth: 2 },
];

export default function Home() {
  const getStarted = [
    `${skillCommand()}   # teach your coding agent the behaviors`,
    `npm install ${RN_PACKAGE}                    # or the Swift package or Android library`,
  ].join("\n");
  return (
    <DocsPage toc={TOC}>
      <DocsTitle>Codual UI</DocsTitle>
      <DocsDescription>
        Headless UI for mobile apps. Tested behaviors your agent can drop in, identical on iOS,
        Android and React Native.
      </DocsDescription>
      <DocsBody>
        <p>
          Codual UI is the logic behind common screens (loading and retry, paging, forms, purchases, sheets, search and
          more) for iOS, Android and React Native, with no look of its own: it shows your app&apos;s views, so each app
          keeps its design. A skill teaches your coding agent when and how to use each behavior.
        </p>
        <Heading as="h2" id="get-started">
          Get started
        </Heading>
        <p>From your app&apos;s repository:</p>
        <Code code={getStarted} lang="sh" />
        <p>
          Then ask your agent for a screen as usual (&ldquo;a paged list of orders with pull to refresh&rdquo;): the
          skill tells it which behavior to use and how to wire it. Works with Claude Code, Codex, Cursor and other
          agents that read skills: <Link href="/get-started">install for your agent and platform</Link>.
        </p>
        <Heading as="h2" id="behaviors">
          Behaviors
        </Heading>
        <Cards>
          {behaviorPages.map((page) => (
            <Card
              key={page.slug}
              title={page.title}
              description={`${page.description} ${page.specEntry.edgeCases.length} edge cases.`}
              href={page.url}
            />
          ))}
        </Cards>
        <Heading as="h2" id="how-it-works">
          How it works
        </Heading>
        <p>
          Every behavior starts as a written <Link href="/specs">spec</Link>: its states, its transitions, and a
          numbered list of the edge cases apps get wrong. Every platform implements the same spec, and each edge case
          has a test on each of them, named by its ID (<code>SS-07</code>). CI fails if an edge case loses its test on
          any platform.
        </p>
      </DocsBody>
    </DocsPage>
  );
}
