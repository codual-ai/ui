import { act, renderHook } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { type SelectionOptions, useSelection } from "../../../src/selection/use-selection";

export interface Row {
  readonly id: number;
  readonly disabled?: boolean;
}

export const keyOf = (row: Row): string => String(row.id);

/** Rows with these IDs, none disabled. */
export function rows(...ids: readonly number[]): Row[] {
  return ids.map((id) => ({ id }));
}

type Options = Omit<SelectionOptions<Row>, "keyExtractor" | "items" | "visibleItems">;

interface ListProps {
  readonly items: readonly Row[] | undefined;
  readonly visibleItems: readonly Row[] | undefined;
}

/**
 * Renders `useSelection` over `items` (or none known yet, for `undefined`), recording what it announces. A row with
 * `disabled: true` is disabled.
 */
export async function renderSelection(items: readonly Row[] | undefined, options: Options = {}) {
  const announce = jest
    .spyOn(AccessibilityInfo, "announceForAccessibilityWithOptions")
    .mockImplementation(() => {});
  let props: ListProps = { items, visibleItems: undefined };
  const hook = await renderHook(
    (current: ListProps) =>
      useSelection<Row>({
        keyExtractor: keyOf,
        isDisabled: (row) => row.disabled === true,
        ...options,
        ...(current.items !== undefined && { items: current.items }),
        ...(current.visibleItems !== undefined && { visibleItems: current.visibleItems }),
      }),
    { initialProps: props },
  );
  const rerender = (next: ListProps) =>
    act(async () => {
      props = next;
      hook.rerender(props);
    });
  const selection = () => hook.result.current;
  return {
    hook,
    selection,
    /** The selected rows' IDs, in the order they were selected. */
    selectedIds: () => selection().selectedKeys.map(Number),
    run: (action: () => unknown) => act(async () => void action()),
    setItems: (next: readonly Row[]) => rerender({ ...props, items: next }),
    /** Gives the `visibleItems` option, or leaves it out for `undefined`. */
    setVisibleItems: (next: readonly Row[] | undefined) => rerender({ ...props, visibleItems: next }),
    announcements: () => announce.mock.calls.map(([text]) => text),
  };
}

/** A bulk action whose calls wait until the test settles them, recording the keys of each. */
export class FakeAction {
  readonly calls: (readonly string[])[] = [];
  private settle: { resolve: () => void; reject: (error: unknown) => void } | undefined;

  readonly run = (keys: readonly string[]): Promise<void> => {
    this.calls.push(keys);
    return new Promise<void>((resolve, reject) => {
      this.settle = { resolve, reject };
    });
  };

  succeed(): Promise<void> {
    return act(async () => this.pending().resolve());
  }

  fail(error: unknown): Promise<void> {
    return act(async () => this.pending().reject(error));
  }

  private pending() {
    if (this.settle === undefined) throw new Error("the action never ran");
    return this.settle;
  }
}
