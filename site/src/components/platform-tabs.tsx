import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import type { ReactNode } from "react";
import { PLATFORMS, type Platform } from "@/lib/specs.ts";

const LABELS = PLATFORMS.map((platform) => platform.name);

/** iOS, Android and React Native tabs; every set on the site switches together and remembers the choice. */
export function PlatformTabs({ children }: { children: (platform: Platform) => ReactNode }) {
  return (
    <Tabs items={LABELS} groupId="platform" persist>
      {PLATFORMS.map((platform) => (
        <Tab key={platform.id} value={platform.name}>
          {children(platform.id)}
        </Tab>
      ))}
    </Tabs>
  );
}
