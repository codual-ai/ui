import { renderHook } from "@testing-library/react-native";
import { type Reanimated, useVictoryScrub, type VictoryPressState } from "../../src/victory-native";

/** Reanimated stand-in: a reaction runs when the test says the shared values changed, with JS calls direct. */
function fakeReanimated(version: 3 | 4) {
  const reactions: (() => void)[] = [];
  const useAnimatedReaction: Reanimated["useAnimatedReaction"] = (prepare, react) => {
    let previous: ReturnType<typeof prepare> | null = null;
    reactions.push(() => {
      const current = prepare();
      react(current, previous);
      previous = current;
    });
  };
  const reanimated: Reanimated =
    version === 4
      ? { useAnimatedReaction, scheduleOnRN: (action, ...args) => action(...args) }
      : { useAnimatedReaction, runOnJS: (action) => action };
  return { reanimated, changed: () => reactions.at(-1)?.() };
}

function pressState() {
  const state = { isActive: { value: false }, x: { value: { value: 0 } } };
  const press: VictoryPressState = state;
  return { press, state };
}

async function setUp(version: 3 | 4 = 4) {
  const calls: string[] = [];
  const chart = { scrub: (x: number) => calls.push(`scrub ${x}`), endScrub: () => calls.push("end") };
  const { reanimated, changed } = fakeReanimated(version);
  const { press, state } = pressState();
  await renderHook(() => useVictoryScrub(chart, press, reanimated));
  return { calls, changed, state };
}

test("scrubs to the pressed x while the press is active", async () => {
  const { calls, changed, state } = await setUp();
  changed();
  state.isActive.value = true;
  state.x.value.value = 12;
  changed();
  state.x.value.value = 30;
  changed();
  expect(calls).toEqual(["scrub 12", "scrub 30"]);
});

test("ends the scrub when the press ends, once", async () => {
  const { calls, changed, state } = await setUp();
  state.isActive.value = true;
  state.x.value.value = 5;
  changed();
  state.isActive.value = false;
  changed();
  changed();
  expect(calls).toEqual(["scrub 5", "end"]);
});

test("a press state that hasn't changed calls nothing again", async () => {
  const { calls, changed, state } = await setUp();
  state.isActive.value = true;
  state.x.value.value = 5;
  changed();
  changed();
  expect(calls).toEqual(["scrub 5"]);
});

test("an idle press state on the first run ends nothing", async () => {
  const { calls, changed } = await setUp();
  changed();
  expect(calls).toEqual([]);
});

test("works with Reanimated 3's runOnJS too", async () => {
  const { calls, changed, state } = await setUp(3);
  state.isActive.value = true;
  state.x.value.value = 7;
  changed();
  state.isActive.value = false;
  changed();
  expect(calls).toEqual(["scrub 7", "end"]);
});
