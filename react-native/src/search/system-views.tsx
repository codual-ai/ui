import { Button, Text, View } from "react-native";
import type { SearchLabels } from "./labels";
import type { RecentSearches } from "./recent-searches";

// System components only, with no styles of their own.

export function SystemNoResultsView({
  query,
  labels,
}: {
  readonly query: string;
  readonly labels: SearchLabels;
}) {
  return (
    <View>
      <Text accessibilityRole="header">{labels.noResults(query)}</Text>
      <Text>{labels.noResultsMessage}</Text>
    </View>
  );
}

/** The recent searches, each picking the search, with a Remove button each and a Clear button. Nothing when empty. */
export function SystemRecentSearches({
  recent,
  labels,
}: {
  readonly recent: RecentSearches;
  readonly labels: SearchLabels;
}) {
  if (recent.searches.length === 0) return null;
  return (
    <View>
      <Text accessibilityRole="header">{labels.recentSearches}</Text>
      <Button title={labels.clear} onPress={recent.clear} />
      {recent.searches.map((search) => (
        <View key={search}>
          <Button title={search} onPress={() => recent.pick(search)} />
          <Button
            title="×"
            accessibilityLabel={labels.remove(search)}
            onPress={() => recent.remove(search)}
          />
        </View>
      ))}
    </View>
  );
}
