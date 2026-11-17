import SwiftUI

// The footer `PagedList` shows when the app leaves it out: system components with no colours or fonts of their own.
// Its text is looked up in the app's main bundle, so the app translates or replaces it in its string catalog.

@MainActor
enum PagedListFooterText {
  static let loadingMore: LocalizedStringKey = "Loading More"
  static let failed: LocalizedStringKey = "Couldn't Load More"
  static let loadMore: LocalizedStringKey = "Load More"
  static let end: LocalizedStringKey = "No More Items"
  static let start: LocalizedStringKey = "No Earlier Items"
}

extension EnvironmentValues {
  /// Which way the paged list around a footer runs, so the system footer's end reads as the start of a chat.
  @Entry var pagedListDirection = PagedListDirection.standard
}

public struct SystemPagedListFooter: View {
  private let footer: PagedListFooter
  @Environment(\.pagedListDirection) private var direction
  /// A reversed list's footer keeps one height in every state, so the spinner giving way to the end or Try Again
  /// above rows scrolled into history never moves them. It follows the user's text size.
  @ScaledMetric(relativeTo: .body) private var reversedHeight: CGFloat = 96

  public init(_ footer: PagedListFooter) {
    self.footer = footer
  }

  public var body: some View {
    Group {
      switch footer {
      case .more(let loadMore):
        Button(PagedListFooterText.loadMore, action: loadMore)
      case .loading:
        ProgressView().accessibilityLabel(Text(PagedListFooterText.loadingMore))
      case .failed(_, let retry):
        VStack {
          Text(PagedListFooterText.failed)
          Button(ScreenStatesText.tryAgain, action: retry)
        }
      case .end:
        Text(direction == .reversed ? PagedListFooterText.start : PagedListFooterText.end).foregroundStyle(.secondary)
      }
    }
    .frame(maxWidth: .infinity)
    .frame(height: direction == .reversed ? reversedHeight : nil)
  }
}
