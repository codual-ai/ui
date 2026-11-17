import { act, render, screen, userEvent } from "@testing-library/react-native";
import { AppState, type AppStateStatus, Pressable, Text, View } from "react-native";
import type { PermissionAccess } from "../../src/permissions/access";
import { usePermission } from "../../src/permissions/use-permission";
import { FakeAccess, GRANTED, settle } from "./helpers/fake-permission";

const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

let appStateListeners: ((state: AppStateStatus) => void)[];
let removed: number;

beforeEach(() => {
  appStateListeners = [];
  removed = 0;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListeners.push(listener);
    return { remove: () => (removed += 1) };
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});

function Scanner({ access }: { readonly access: PermissionAccess }) {
  const camera = usePermission(access, { memory: new Set() });
  return (
    <View>
      <Text>{camera.isUsable ? "Scanning" : "Not scanning"}</Text>
      <Pressable accessibilityRole="button" onPress={() => void camera.ask()}>
        <Text>Scan</Text>
      </Pressable>
      {camera.phase === "explaining" ? (
        <Pressable accessibilityRole="button" onPress={camera.accept}>
          <Text>Continue</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

test("PM-03 a screen's explanation shows on the tap, and the system prompt after its button", async () => {
  const access = new FakeAccess();
  await render(<Scanner access={access} />);
  await act(settle);
  await user.press(screen.getByRole("button", { name: "Scan" }));
  expect(screen.getByRole("button", { name: "Continue" })).toBeOnTheScreen();
  expect(access.requests).toBe(0);
  await user.press(screen.getByRole("button", { name: "Continue" }));
  await act(() => access.answerRequest(GRANTED));
  expect(screen.getByText("Scanning")).toBeOnTheScreen();
  expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
});

test("PM-11 the screen reads the status again when the app becomes active, and stops listening when it goes", async () => {
  const access = new FakeAccess();
  const { unmount } = await render(<Scanner access={access} />);
  await act(settle);
  access.current = GRANTED;
  await act(async () => {
    for (const listener of appStateListeners) listener("active");
    await settle();
  });
  expect(screen.getByText("Scanning")).toBeOnTheScreen();
  await unmount();
  expect(removed).toBe(1);
});
