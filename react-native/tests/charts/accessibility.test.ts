import type { AccessibilityActionEvent } from "react-native";
import { data, loadedChart, oneDay, series } from "./helpers/chart";

const day = (x: number) => `day ${x}`;
const action = (actionName: string) => ({ nativeEvent: { actionName } }) as AccessibilityActionEvent;

test("CH-23 next and previous step through the x values in order, stopping at the ends, with each value", async () => {
  const { chart, run } = await loadedChart(
    data(series("Price", [1, 10], [2, 12.5]), series("Volume", [1, 300], [2, 200])),
    { formatX: day },
  );
  expect(chart().accessibilityProps).toMatchObject({
    accessible: true,
    accessibilityRole: "adjustable",
    accessibilityLabel: chart().spokenSummary,
    accessibilityActions: [{ name: "increment" }, { name: "decrement" }],
  });
  await run(() => chart().accessibilityProps.onAccessibilityAction(action("increment")));
  expect(chart().accessibilityProps.accessibilityValue).toEqual({ text: "day 1: Price 10, Volume 300" });
  await run(() => chart().accessibilityProps.onAccessibilityAction(action("increment")));
  await run(() => chart().accessibilityProps.onAccessibilityAction(action("increment")));
  expect(chart().selectionDescription).toBe("day 2: Price 12.5, Volume 200");
  await run(() => chart().accessibilityProps.onAccessibilityAction(action("decrement")));
  await run(() => chart().accessibilityProps.onAccessibilityAction(action("decrement")));
  expect(chart().selection?.x).toBe(1);
  await run(chart().clearSelection);
  await run(chart().selectPreviousPoint);
  expect(chart().selection?.x).toBe(2);
});

test("CH-23 one series' point reads its x and value without the series' name", async () => {
  const { chart, run } = await loadedChart(oneDay, { formatX: day });
  await run(chart().selectNextPoint);
  expect(chart().selectionDescription).toBe("day 1, 10");
});
