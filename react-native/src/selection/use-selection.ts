import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  AccessibilityInfo,
  type AccessibilityState,
  BackHandler,
} from "react-native";
import type { SelectionAction, SelectionActivation, SelectionKind, SelectionSource } from "./config";
import { announcementText, defaultSelectionLabels, type SelectionLabels } from "./labels";
import { SelectionMachine } from "./machine";
import type { SelectionSnapshot } from "./snapshot";

export interface SelectionOptions<Item> {
  /** The identity of an item: the selection keeps keys, so an item stays selected across refreshes and pages. */
  readonly keyExtractor: (item: Item) => string;
  /** `"multiple"` (the default) or `"single"`: at most one item. */
  readonly kind?: SelectionKind;
  /** The most items a multiple selection may have: a whole number, 1 or more. */
  readonly max?: number;
  /** `"onDemand"` (the default): a Select button or a long press turns the mode on. `"always"`: a picker. */
  readonly activation?: SelectionActivation;
  /** Items that can't be selected. */
  readonly isDisabled?: (item: Item) => boolean;
  /**
   * The data of a list the app draws itself, kept in step as it changes: an item gone from it drops out. Pass it
   * once loaded. `PagedList` gives its own.
   */
  readonly items?: readonly Item[];
  /** What a filter or search shows now: a selected item missing from it is hidden, and stays selected. */
  readonly visibleItems?: readonly Item[];
  /** How many items the server has, to offer select all on the server once every visible item is selected. */
  readonly serverTotal?: number;
  /** The text of the count title and the announcements. */
  readonly labels?: Partial<SelectionLabels>;
}

/** Props for a row's `Pressable`: a tap, a long press, and its selected state for screen readers. */
export interface SelectionRowProps {
  readonly onPress: () => void;
  readonly onLongPress: () => void;
  readonly disabled: boolean;
  readonly accessibilityState: AccessibilityState;
  readonly accessibilityActions: readonly AccessibilityActionInfo[];
  readonly onAccessibilityAction: (event: AccessibilityActionEvent) => void;
}

export interface SelectionController<Item> extends SelectionSnapshot {
  readonly kind: SelectionKind;
  readonly activation: SelectionActivation;
  /** "3 Selected", or "3 Selected, 1 Hidden" while a filter hides some, for the screen's title. */
  readonly title: string;
  readonly isSelected: (item: Item) => boolean;
  readonly enter: () => void;
  readonly exit: () => void;
  readonly toggle: (item: Item) => void;
  readonly longPress: (item: Item) => void;
  readonly selectAll: () => void;
  readonly deselectAll: () => void;
  readonly selectAllOnServer: () => void;
  /** Leaves the mode first; returns whether it handled back. Android's hardware back already calls it. */
  readonly back: () => boolean;
  /** The list's items, once loaded. Pass the `items` option or a `PagedList` instead where you can. */
  readonly updateItems: (items: readonly Item[]) => void;
  /** What a filter or search shows, or `undefined` to clear it. Pass the `visibleItems` option instead where you can. */
  readonly updateVisibleItems: (items: readonly Item[] | undefined) => void;
  readonly perform: (action: SelectionAction) => void;
  readonly performAfterConfirmation: (action: SelectionAction) => void;
  readonly confirmPendingAction: () => void;
  readonly cancelPendingAction: () => void;
  readonly dismissActionError: () => void;
  /**
   * Spread on a row's `Pressable`: in the mode a tap toggles the row, outside it `onPress` runs; a long press, or
   * the screen reader's Select action, turns the mode on with the row selected.
   */
  readonly rowProps: (item: Item, options?: { readonly onPress?: () => void }) => SelectionRowProps;
}

const LONG_PRESS_ACTION = "longpress";
const notDisabled = () => false;

/**
 * Which items of a list are selected, by key, and the selection mode, for the app's own rows. Announces each
 * change to screen readers and, while the mode is on, leaves it on Android's hardware back.
 */
export function useSelection<Item>(options: SelectionOptions<Item>): SelectionController<Item> {
  const labels = { ...defaultSelectionLabels, ...options.labels };
  const source: SelectionSource<Item> = {
    keyExtractor: options.keyExtractor,
    isDisabled: options.isDisabled ?? notDisabled,
    serverTotal: options.serverTotal,
    // Queued on iOS, after whatever VoiceOver is saying; Android's TalkBack queues announcements anyway.
    announce: (announcement) =>
      AccessibilityInfo.announceForAccessibilityWithOptions(announcementText(announcement, labels), {
        queue: true,
      }),
  };
  const latest = useRef(source);
  useLayoutEffect(() => {
    latest.current = source;
  });
  const [machine] = useState(
    () =>
      new SelectionMachine(() => latest.current, {
        kind: options.kind ?? "multiple",
        max: options.max,
        activation: options.activation ?? "onDemand",
      }),
  );
  const snapshot = useSyncExternalStore(machine.subscribe, machine.getSnapshot);

  const { items, visibleItems } = options;
  const hadVisibleItems = useRef(false);
  // Every render, after `latest` takes the new options: a changed `isDisabled` or `serverTotal` counts as new items
  // do. Each update publishes only what changed.
  useLayoutEffect(() => {
    const known = machine.knownLists;
    const data = items ?? known.items;
    if (data !== undefined) machine.updateItems(data);
    // Leaving the option out after giving it clears the filter; otherwise a list given to the method stays.
    const visible = visibleItems ?? (hadVisibleItems.current ? undefined : known.visible);
    if (visible !== undefined || hadVisibleItems.current) machine.updateVisibleItems(visible);
    hadVisibleItems.current = visibleItems !== undefined;
    machine.sourceChanged();
  });

  useEffect(() => {
    if (!snapshot.handlesBack) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", machine.back);
    return () => subscription.remove();
  }, [machine, snapshot.handlesBack]);

  const title =
    snapshot.hiddenCount === 0
      ? labels.title(snapshot.count)
      : labels.titleWithHidden(snapshot.count, snapshot.hiddenCount);
  const selectLabel = labels.select;
  // This render's predicate, not the one `latest` held at the last render, so rows follow it at once.
  const { isDisabled } = source;
  return useMemo(
    () => ({
      ...snapshot,
      kind: machine.config.kind,
      activation: machine.config.activation,
      title,
      isSelected: machine.isSelected,
      enter: machine.enter,
      exit: machine.exit,
      toggle: machine.toggle,
      longPress: machine.longPress,
      selectAll: machine.selectAll,
      deselectAll: machine.deselectAll,
      selectAllOnServer: machine.selectAllOnServer,
      back: machine.back,
      updateItems: machine.updateItems,
      updateVisibleItems: machine.updateVisibleItems,
      perform: machine.perform,
      performAfterConfirmation: machine.performAfterConfirmation,
      confirmPendingAction: machine.confirmPendingAction,
      cancelPendingAction: machine.cancelPendingAction,
      dismissActionError: machine.dismissActionError,
      rowProps: (item: Item, rowOptions?: { readonly onPress?: () => void }) =>
        rowProps(machine, snapshot, item, selectLabel, isDisabled(item), rowOptions?.onPress),
    }),
    [snapshot, machine, title, selectLabel, isDisabled],
  );
}

function rowProps<Item>(
  machine: SelectionMachine<Item>,
  snapshot: SelectionSnapshot,
  item: Item,
  selectLabel: string,
  isDisabled: boolean,
  onPress: (() => void) | undefined,
): SelectionRowProps {
  const { isActive } = snapshot;
  const longPress = () => machine.longPress(item);
  return {
    // Read when pressed, so a row drawn before the mode changed still does the right thing.
    onPress: () => (machine.getSnapshot().isActive ? machine.toggle(item) : onPress?.()),
    onLongPress: longPress,
    disabled: isActive && isDisabled,
    accessibilityState: isActive ? { selected: machine.isSelected(item), disabled: isDisabled } : {},
    accessibilityActions: isActive || isDisabled ? [] : [{ name: LONG_PRESS_ACTION, label: selectLabel }],
    onAccessibilityAction: (event) => {
      if (event.nativeEvent.actionName === LONG_PRESS_ACTION) longPress();
    },
  };
}
