import SwiftUI

// The footer `PagedList` shows when the app leaves it out: system components with no colours or fonts of their own.
// Its text is looked up in the app's main bundle, so the app translates or replaces it in its string catalog.

@MainActor
enum PagedListFooterText {
  static let loadingMore: LocalizedStringKey = "Loading More"
  static let failed: LocalizedStringKey = "Couldn't Load More"
  static let loadMore: LocalizedStringKey = "Load More"
  static let end: LocalizedStringKey = "No More Items"
}

public struct SystemPagedListFooter: View {
  private let footer: PagedListFooter

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
        Text(PagedListFooterText.end).foregroundStyle(.secondary)
      }
    }
    .frame(maxWidth: .infinity)
  }
}
