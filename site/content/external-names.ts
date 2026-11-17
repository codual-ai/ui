// Names the content files show that belong to the platform or another library, not to Codual UI, so
// `npm run check-names` doesn't look for them in the source. A name here is matched as written or by its first part
// (`AccessibilityInfo` covers `AccessibilityInfo.announceForAccessibilityWithOptions`).
export const EXTERNAL_NAMES = {
  ios: [
    "AccessibilityNotification", "Date", "Double", "EditMode", "Identifiable", "Int", "List", "ScrollView", "TextField",
    "UISelectionFeedbackGenerator", "URLError", "UserDefaults", "chartOverlay", "chartXSelection",
    "interactiveDismissDisabled", "onAppear", "onSubmit", "refreshable", "scrollDismissesKeyboard", "searchScopes",
    "searchSuggestions", "searchable",
  ],
  android: [
    "AlertDialog", "BackHandler", "ConnectException", "KeyboardActions", "LazyColumn", "LazyListState",
    "LocalHapticFeedback", "NoRouteToHostException", "PullToRefreshBox", "SearchBar", "SheetState", "TextField",
    "UnknownHostException", "confirmValueChange", "onDismissRequest", "rememberSaveable", "suspend", "viewModelScope",
  ],
  rn: [
    "AbortSignal", "AccessibilityInfo", "Alert", "BackHandler", "Button", "FlatList", "Map", "Modal", "Pressable", "Set",
    "TextInput", "accessibilityRole", "async", "extraData", "fetch", "onEndReached", "onEndReachedThreshold", "refreshControl", "renderItem",
  ],
};

// Code spans in the content that aren't API names at all (resource names, an artifact, an example's own field
// names, a parameter list), listed exactly so any other unreadable span still fails the check.
export const NOT_API_NAMES: readonly string[] = [
  "codual_ui_*",
  "codual_ui_chart_*",
  "codual-ui-play-billing",
  "password: { active: !usePasskey }",
  "query, scope, token",
];
