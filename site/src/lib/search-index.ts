import type { Index } from "fumadocs-core/search/server";
import { behaviorPages } from "./site.ts";
import { plainText } from "./text.ts";

export function searchIndexes(): Index[] {
  return [
    {
      title: "Introduction",
      url: "/",
      description: "Headless UI for mobile apps.",
      content: "Tested behaviors your agent can drop in, identical on iOS, Android and React Native.",
    },
    { title: "Get started", url: "/get-started", content: "Install the skill for your agent and the package for your platform." },
    { title: "Specs", url: "/specs", content: "Every behavior's written spec and its numbered edge cases." },
    ...behaviorPages.map((page) => ({
      title: page.title,
      description: page.description,
      url: page.url,
      keywords: page.actions.flatMap((action) => Object.values(action.api)).join(" "),
      content: [
        ...page.content.intro.map(plainText),
        ...page.actions.map((action) => action.does),
        ...page.specEntry.edgeCases.map((edgeCase) => `${edgeCase.id} ${plainText(edgeCase.summary)}`),
      ].join(" "),
    })),
  ];
}
