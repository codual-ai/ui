// The install steps for each agent and platform. RELEASE is the tag the commands install; once
// Sources/CodualUI/Version.swift names a release, `npm run check-names` fails if the two differ.
export const RELEASE = "0.1.0";

export function skillCommand(agent?: string): string {
  return `npx skills add codual-ai/ui@v${RELEASE} --skill codual-ui${agent ? ` -a ${agent}` : ""}`;
}

export const AGENTS: readonly { name: string; flag?: string; folder: string }[] = [
  { name: "Claude Code", flag: "claude-code", folder: ".claude/skills/codual-ui/" },
  { name: "Codex", flag: "codex", folder: ".agents/skills/codual-ui/" },
  { name: "Cursor", flag: "cursor", folder: ".agents/skills/codual-ui/" },
  { name: "Others", folder: "your agent's skills folder (the CLI asks which agent)" },
];

export function manualSkillInstall(): string {
  return [
    "mkdir -p .claude/skills/codual-ui   # Claude Code; .agents/skills/codual-ui for Codex and Cursor",
    `curl -fsSL https://raw.githubusercontent.com/codual-ai/ui/v${RELEASE}/skills/codual-ui/SKILL.md \\`,
    "  -o .claude/skills/codual-ui/SKILL.md",
  ].join("\n");
}

export const RN_PACKAGE = "@codual/react-native-ui";

export interface PlatformInstall {
  readonly requirement: string;
  readonly steps: readonly { text: string; lang: string; code: string }[];
}

export function platformInstalls(): Readonly<Record<"ios" | "android" | "rn", PlatformInstall>> {
  return {
    ios: {
      requirement: "SwiftUI, iOS 17 or later.",
      steps: [
        {
          text: "Add the package in Xcode (File > Add Package Dependencies) or in Package.swift:",
          lang: "swift",
          code: `.package(url: "https://github.com/codual-ai/ui.git", from: "${RELEASE}")`,
        },
        {
          text: "Then use the CodualUI product in your target:",
          lang: "swift",
          code: `.target(name: "MyApp", dependencies: [.product(name: "CodualUI", package: "ui")])`,
        },
      ],
    },
    android: {
      requirement: "Jetpack Compose, Android 7.0 (API 24) or later. Built by JitPack from the release tag.",
      steps: [
        {
          text: "Add JitPack's repository in settings.gradle.kts:",
          lang: "kotlin",
          code: [
            "dependencyResolutionManagement {",
            "  repositories {",
            "    google()",
            "    mavenCentral()",
            '    maven("https://jitpack.io")',
            "  }",
            "}",
          ].join("\n"),
        },
        {
          text: "Then the libraries in your module's build.gradle.kts:",
          lang: "kotlin",
          code: [
            "dependencies {",
            `  implementation("com.github.codual-ai.ui:codual-ui-compose:v${RELEASE}")`,
            "  // Only for purchases, with Google Play Billing:",
            `  implementation("com.github.codual-ai.ui:codual-ui-play-billing:v${RELEASE}")`,
            "}",
          ].join("\n"),
        },
      ],
    },
    rn: {
      requirement: "React 19 and React Native 0.78 or later.",
      steps: [{ text: "Install the package:", lang: "sh", code: `npm install ${RN_PACKAGE}` }],
    },
  };
}

/** The optional React Native adapters, each for a library the app installs itself. */
export const RN_ADAPTERS: readonly { slug: string; path: string; library: string }[] = [
  { slug: "purchases", path: `${RN_PACKAGE}/react-native-iap`, library: "react-native-iap 17.4 or later" },
  { slug: "permissions", path: `${RN_PACKAGE}/react-native-permissions`, library: "react-native-permissions 5 or later (iOS prompts)" },
  { slug: "chart-interactions", path: `${RN_PACKAGE}/victory-native`, library: "Victory Native (the adapter imports nothing)" },
];
