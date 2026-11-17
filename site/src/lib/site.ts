import type * as PageTree from "fumadocs-core/page-tree";
import { BEHAVIORS } from "../data/behaviors/index.ts";
import type { Behavior } from "../data/types.ts";
import { type BehaviorContent, readBehaviorContent } from "./content.ts";
import { releaseVersion } from "./repo.ts";
import { skillWhenToUse } from "./skill.ts";
import { readSpec, type SpecEntry } from "./specs.ts";

export interface BehaviorPage extends Behavior {
  readonly url: string;
  readonly specEntry: SpecEntry;
  readonly content: BehaviorContent;
  /** From the skill: when to use the behavior, and when not to. */
  readonly whenToUse: string;
}

export const VERSION = releaseVersion();

/** The version badge: "Pre-release" until the first release sets a version. */
export const VERSION_LABEL = VERSION === "0.0.0" ? "Pre-release" : `v${VERSION}`;

export const behaviorPages: readonly BehaviorPage[] = BEHAVIORS.map((behavior) => ({
  ...behavior,
  url: `/behaviors/${behavior.slug}`,
  specEntry: readSpec(behavior.spec),
  content: readBehaviorContent(behavior.slug),
  whenToUse: skillWhenToUse(behavior.title),
}));

export function behaviorPage(slug: string): BehaviorPage | undefined {
  return behaviorPages.find((page) => page.slug === slug);
}

export const pageTree: PageTree.Root = {
  name: "Codual UI",
  children: [
    { type: "separator", name: "Getting started" },
    { type: "page", name: "Introduction", url: "/" },
    { type: "page", name: "Get started", url: "/get-started" },
    { type: "page", name: "Specs", url: "/specs" },
    { type: "separator", name: "Behaviors" },
    ...behaviorPages.map((page): PageTree.Item => ({ type: "page", name: page.title, url: page.url })),
  ],
};
