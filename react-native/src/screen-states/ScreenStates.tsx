import { type ReactElement, type ReactNode, useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  type HostInstance,
  RefreshControl,
  type RefreshControlProps,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  View,
} from "react-native";
import { isShowingLoading, type Load } from "./machine";
import {
  defaultScreenStatesLabels,
  type ScreenStatesLabels,
  SystemEmptyView,
  SystemFailedView,
  SystemLoadingView,
  SystemOfflineView,
  SystemRefreshErrorAlert,
} from "./system-views";
import { type ScreenStatesController, type ScreenStatesOptions, useScreenStates } from "./use-screen-states";

export interface ScreenStatesProps<T> extends ScreenStatesOptions<T>, ScreenStatesViews<T> {
  readonly load: Load<T>;
}

/** The app's views for each state; any it leaves out is a plain system one. */
export interface ScreenStatesViews<T> {
  /** The loaded data. Pass `refreshControl` to your list or scroll view so it can be pulled to refresh. */
  readonly content: (value: T, refreshControl: ReactElement<RefreshControlProps>) => ReactNode;
  readonly loading?: () => ReactNode;
  readonly empty?: () => ReactNode;
  readonly failed?: (error: unknown, retry: () => void) => ReactNode;
  readonly offline?: (retry: () => void) => ReactNode;
  /** A refresh that failed while content was shown, over the content. By default, a system alert. */
  readonly refreshError?: (error: unknown, dismiss: () => void) => ReactNode;
  /** The text of the views you leave out. */
  readonly labels?: Partial<ScreenStatesLabels>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, fill: { flexGrow: 1 } });

/**
 * A screen that loads data, shown through the app's own views: loading, then content, empty, failed or offline.
 * It loads on mount, aborts on unmount, retries from the failed and offline views and refreshes on pull, keeping
 * the current view on screen. A view the app leaves out is a plain system one.
 */
export function ScreenStates<T>(props: ScreenStatesProps<T>) {
  const { load, isEmpty, isOffline } = props;
  const screen = useScreenStates(load, { ...(isEmpty && { isEmpty }), ...(isOffline && { isOffline }) });
  return <ScreenStatesView views={props} screen={screen} />;
}

/** The views of a screen state, for `ScreenStates` and the behaviours built on it. */
export function ScreenStatesView<T>({
  views: props,
  screen,
  focusWhenLoaded = "move",
  pullToRefreshProps,
}: {
  readonly views: ScreenStatesViews<T>;
  readonly screen: ScreenStatesController<T>;
  /** `stay` leaves the screen reader where it is, for a behaviour whose field keeps focus, such as search. */
  readonly focusWhenLoaded?: FocusWhenLoaded;
  /** For the scroll view around the empty, failed and offline views: search's keyboard dismissal, say. */
  readonly pullToRefreshProps?: ScrollViewProps | undefined;
}) {
  const labels = { ...defaultScreenStatesLabels, ...props.labels };
  const refreshControl = <RefreshControl refreshing={screen.isRefreshing} onRefresh={screen.refresh} />;
  const { refreshError, dismissRefreshError } = screen;
  const view = useFocusWhenLoadingEnds(isShowingLoading(screen.state), focusWhenLoaded);
  return (
    <>
      <View ref={view} style={styles.screen}>
        {stateView(props, screen, labels, refreshControl, (view) => (
          <PullToRefresh refreshControl={refreshControl} scrollViewProps={pullToRefreshProps}>
            {view}
          </PullToRefresh>
        ))}
      </View>
      {refreshError === undefined
        ? null
        : refreshErrorView(props, refreshError.error, dismissRefreshError, labels)}
    </>
  );
}

/** Whether the screen reader moves to the view that replaced the spinner, once loading ends. */
export type FocusWhenLoaded = "move" | "stay";

/** Moves the screen reader to the view that replaced the spinner, once loading ends. */
function useFocusWhenLoadingEnds(isLoading: boolean, focusWhenLoaded: FocusWhenLoaded) {
  const view = useRef<HostInstance>(null);
  const wasLoading = useRef(isLoading);
  useEffect(() => {
    if (focusWhenLoaded === "move" && wasLoading.current && !isLoading && view.current) {
      AccessibilityInfo.sendAccessibilityEvent(view.current, "focus");
    }
    wasLoading.current = isLoading;
  }, [isLoading, focusWhenLoaded]);
  return view;
}

/** The app's view for the current state, or the system one. */
function stateView<T>(
  props: ScreenStatesViews<T>,
  { state, retry }: ScreenStatesController<T>,
  labels: ScreenStatesLabels,
  refreshControl: ReactElement<RefreshControlProps>,
  pullable: (view: ReactNode) => ReactNode,
): ReactNode {
  // A slot the app passes is used even when it renders nothing.
  switch (state.status) {
    case "idle":
    case "loading":
      return props.loading ? props.loading() : <SystemLoadingView labels={labels} />;
    case "content":
      return props.content(state.value, refreshControl);
    case "empty":
      return pullable(props.empty ? props.empty() : <SystemEmptyView labels={labels} />);
    case "failed":
      return pullable(
        props.failed ? (
          props.failed(state.error, retry)
        ) : (
          <SystemFailedView error={state.error} retry={retry} labels={labels} />
        ),
      );
    case "offline":
      return pullable(
        props.offline ? props.offline(retry) : <SystemOfflineView retry={retry} labels={labels} />,
      );
  }
}

function refreshErrorView<T>(
  props: ScreenStatesViews<T>,
  error: unknown,
  dismiss: () => void,
  labels: ScreenStatesLabels,
): ReactNode {
  if (props.refreshError) return props.refreshError(error, dismiss);
  return <SystemRefreshErrorAlert error={error} dismiss={dismiss} labels={labels} />;
}

/** A full-size scroll view, so a view that may not scroll can still be pulled to refresh. */
function PullToRefresh(props: {
  readonly refreshControl: ReactElement<RefreshControlProps>;
  readonly scrollViewProps: ScrollViewProps | undefined;
  readonly children: ReactNode;
}) {
  return (
    <ScrollView
      {...props.scrollViewProps}
      testID="screen-states-pull-to-refresh"
      contentContainerStyle={styles.fill}
      refreshControl={props.refreshControl}
    >
      {props.children}
    </ScrollView>
  );
}
