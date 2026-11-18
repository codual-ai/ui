import { Heading } from "fumadocs-ui/components/heading";
import { RN_ADAPTERS } from "@content/install.ts";
import type { BehaviorPage } from "@/lib/site.ts";
import { PLATFORMS, type Platform } from "@/lib/specs.ts";
import { Code } from "./code.tsx";
import { Inline } from "./inline.tsx";
import { PlatformTabs } from "./platform-tabs.tsx";

const PLATFORM_NAME = Object.fromEntries(PLATFORMS.map((p) => [p.id, p.name])) as Record<Platform, string>;

export function Usage({ page }: { page: BehaviorPage }) {
  return (
    <>
      <Heading as="h2" id="usage">
        Usage
      </Heading>
      <PlatformTabs>
        {(platform) => {
          const adapter = platform === "rn" ? RN_ADAPTERS.find((a) => a.slug === page.slug) : undefined;
          return (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-fd-muted-foreground">
                {page.api.map((names, index) => (
                  <span key={names[platform]}>
                    {index > 0 && " · "}
                    <code>{names[platform]}</code>
                  </span>
                ))}
              </p>
              {adapter && (
                <p className="text-sm text-fd-muted-foreground">
                  Adapter: <code>{adapter.path}</code>, for {adapter.library}.
                </p>
              )}
              <Code code={page.content.code[platform].code} lang={page.content.code[platform].lang} />
            </div>
          );
        }}
      </PlatformTabs>
    </>
  );
}

export function States({ page }: { page: BehaviorPage }) {
  return (
    <>
      <Heading as="h2" id="states">
        States
      </Heading>
      {page.statesNote && <p className="text-sm text-fd-muted-foreground">{page.statesNote}</p>}
      <div className="not-prose flex flex-col gap-3">
        {page.states.map((group) => (
          <div key={group.names.join()} className="flex flex-wrap items-center gap-2">
            {group.label && <span className="w-24 shrink-0 text-xs text-fd-muted-foreground">{group.label}</span>}
            {group.names.map((name) => (
              <span
                key={name}
                className={
                  group.onTop
                    ? "rounded-full border border-dashed px-2.5 py-0.5 font-mono text-xs text-fd-foreground"
                    : "rounded-full border bg-fd-secondary px-2.5 py-0.5 font-mono text-xs text-fd-secondary-foreground"
                }
              >
                {group.onTop ? `+ ${name}` : name}
              </span>
            ))}
          </div>
        ))}
      </div>
      {page.states.some((group) => group.onTop) && (
        <p className="text-sm text-fd-muted-foreground">Dashed states sit on top of the others.</p>
      )}
    </>
  );
}

function KindBadge({ kind }: { kind: "action" | "read" }) {
  return (
    <span
      className={
        kind === "action"
          ? "rounded border border-fd-primary/30 bg-fd-primary/10 px-1.5 py-0.5 font-mono text-[0.65rem] font-medium uppercase tracking-wide text-fd-primary"
          : "rounded border px-1.5 py-0.5 font-mono text-[0.65rem] font-medium uppercase tracking-wide text-fd-muted-foreground"
      }
    >
      {kind}
    </span>
  );
}

export function Actions({ page }: { page: BehaviorPage }) {
  return (
    <>
      <Heading as="h2" id="actions">
        Actions
      </Heading>
      <p className="text-sm text-fd-muted-foreground">
        What the app calls (action) and what it reads to draw its views (read), by their names on each platform.
      </p>
      <PlatformTabs>
        {(platform) => (
          <ul className="not-prose divide-y text-sm" aria-label={`${page.title} on ${PLATFORM_NAME[platform]}`}>
            {page.actions.map((action) => (
              <li
                key={action.api[platform]}
                className="flex flex-col gap-1 py-2.5 sm:grid sm:grid-cols-[4.5rem_minmax(0,16rem)_1fr] sm:items-baseline sm:gap-3"
              >
                <span>
                  <KindBadge kind={action.kind} />
                </span>
                <code className="font-mono text-[0.8125rem] break-words">{action.api[platform]}</code>
                <span className="text-fd-muted-foreground">{action.does}</span>
              </li>
            ))}
          </ul>
        )}
      </PlatformTabs>
    </>
  );
}

export function Reference({ page }: { page: BehaviorPage }) {
  return (
    <>
      <Heading as="h2" id="reference">
        Reference
      </Heading>
      <PlatformTabs>
        {(platform) => (
          <dl className="not-prose divide-y text-sm">
            {page.content.reference.map((row) => (
              <div key={row.label} className="flex flex-col gap-1 py-2.5 sm:grid sm:grid-cols-[14rem_1fr] sm:gap-4">
                <dt className="text-fd-muted-foreground">
                  <Inline markdown={row.label} />
                </dt>
                <dd className="break-words [&_code]:rounded [&_code]:bg-fd-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.8125rem]">
                  <Inline markdown={row.cells[platform]} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </PlatformTabs>
    </>
  );
}

function testedLabel(testedOn: readonly Platform[]): string {
  const names = testedOn.map((id) => PLATFORM_NAME[id]);
  if (names.length <= 1) return `tested on ${names.join("")}`;
  return `tested on ${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function EdgeCases({ page, specUrl }: { page: BehaviorPage; specUrl: string }) {
  const cases = page.specEntry.edgeCases;
  return (
    <>
      <Heading as="h2" id="edge-cases">
        Edge cases
      </Heading>
      <p className="text-sm text-fd-muted-foreground">
        {cases.length} cases, {cases[0]?.id} to {cases.at(-1)?.id}, from the{" "}
        <a href={specUrl}>spec</a>. Each has a test, named by its ID, on every platform it lists.
      </p>
      <ul className="not-prose divide-y rounded-xl border">
        {cases.map((edgeCase) => (
          <li key={edgeCase.id} id={edgeCase.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
            <span className="w-14 shrink-0 font-mono text-xs leading-6 text-fd-muted-foreground">{edgeCase.id}</span>
            <span className="flex-1 text-sm leading-6">
              <Inline markdown={edgeCase.summary} />
            </span>
            <span className="shrink-0 text-xs leading-6 text-fd-muted-foreground sm:text-end">
              {edgeCase.isWithdrawn ? "withdrawn" : edgeCase.testedOn.length > 0 ? `✓ ${testedLabel(edgeCase.testedOn)}` : "not tested yet"}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
