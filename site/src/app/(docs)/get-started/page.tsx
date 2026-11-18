import { Heading } from "fumadocs-ui/components/heading";
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/notebook/page";
import type { Metadata } from "next";
import Link from "next/link";
import { Code } from "@/components/code.tsx";
import { PlatformTabs } from "@/components/platform-tabs.tsx";
import { AGENTS, manualSkillInstall, platformInstalls, RN_ADAPTERS, skillCommand } from "@content/install.ts";
import { blobUrl } from "@/lib/repo.ts";

export const metadata: Metadata = { title: "Get started" };

const TOC = [
  { title: "Your coding agent", url: "#your-coding-agent", depth: 2 },
  { title: "Your app", url: "#your-app", depth: 2 },
  { title: "First screen", url: "#first-screen", depth: 2 },
];

export default function GetStarted() {
  const installs = platformInstalls();
  return (
    <DocsPage toc={TOC}>
      <DocsTitle>Get started</DocsTitle>
      <DocsDescription>Two parts: the skill for your coding agent, and the package for your app&apos;s platform.</DocsDescription>
      <DocsBody>
        <Heading as="h2" id="your-coding-agent">
          Your coding agent
        </Heading>
        <p>
          The <a href={blobUrl("skills/codual-ui/SKILL.md")}>codual-ui skill</a> tells an agent which behavior fits a
          screen, the minimal correct code on each platform, and the mistakes to avoid. The{" "}
          <a href="https://github.com/vercel-labs/skills">skills</a> CLI installs it into the current project (add{" "}
          <code>-g</code> for every project):
        </p>
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Command</th>
              <th>Where it goes</th>
            </tr>
          </thead>
          <tbody>
            {AGENTS.map((agent) => (
              <tr key={agent.name}>
                <td>{agent.name}</td>
                <td>
                  <code>{skillCommand(agent.flag)}</code>
                </td>
                <td>{agent.folder.startsWith(".") ? <code>{agent.folder}</code> : agent.folder}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>Without the CLI, copy the one file into your agent&apos;s skills folder:</p>
        <Code code={manualSkillInstall()} lang="sh" />
        <p>
          For an agent without skills, save <code>SKILL.md</code> in the repository and point its instructions file
          (<code>AGENTS.md</code>, say) at it.
        </p>
        <Heading as="h2" id="your-app">
          Your app
        </Heading>
        <PlatformTabs>
          {(platform) => (
            <div className="flex flex-col gap-3">
              <p className="text-sm">{installs[platform].requirement}</p>
              {installs[platform].steps.map((step) => (
                <div key={step.code} className="flex flex-col gap-2">
                  <p className="text-sm text-fd-muted-foreground">{step.text}</p>
                  <Code code={step.code} lang={step.lang} />
                </div>
              ))}
              {platform === "android" && (
                <p className="text-sm text-fd-muted-foreground">
                  The Play Billing store is a library of its own so that apps that sell nothing don&apos;t get the
                  billing permission.
                </p>
              )}
              {platform === "rn" && (
                <ul className="text-sm text-fd-muted-foreground">
                  {RN_ADAPTERS.map((adapter) => (
                    <li key={adapter.path}>
                      <code>{adapter.path}</code>: {adapter.library}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </PlatformTabs>
        <Heading as="h2" id="first-screen">
          First screen
        </Heading>
        <p>
          Ask your agent for a screen as usual, or start from <Link href="/behaviors/screen-states">screen states</Link>: a
          screen that loads data, with loading, empty, failed, offline and pull to refresh. Every view you leave out is
          a plain, accessible system one; pass your own where the design needs it, by the same names on every
          platform.
        </p>
      </DocsBody>
    </DocsPage>
  );
}
