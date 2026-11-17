import Foundation
import StoreKit
import StoreKitTest
import Testing
import UIKit

@testable import CodualUI

// StoreKit Testing, from a `.storekit` file. Inside `xcodebuild test` without a host app it serves products, but
// purchases, transactions and entitlements need an app (their sequences never end there), so those are tested
// through the fake store instead.
@Suite(.serialized, .timeLimit(.minutes(1)))
struct StoreKitStoreTests {
  let session: SKTestSession

  init() throws {
    let url = try #require(Bundle.module.url(forResource: "Products", withExtension: "storekit"))
    session = try SKTestSession(contentsOf: url)
    session.disableDialogs = true
  }

  @Test("PU-05 StoreKitStore gives the App Store's localized price string")
  func storeKitGivesTheLocalizedPrice() async throws {
    let products = try await StoreKitStore().products(for: ["lifetime", "tip", "pro.monthly"])
    let prices = Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0.displayPrice) })
    #expect(prices == ["lifetime": "$4.99", "tip": "$0.99", "pro.monthly": "$2.99"])
    let kinds = Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0.kind) })
    #expect(kinds == ["lifetime": .nonConsumable, "tip": .consumable, "pro.monthly": .subscription])
    #expect(products.first { $0.id == "lifetime" }?.displayName == "Lifetime")
  }

  @Test("PU-04 a product the App Store doesn't return is left out")
  func storeKitLeavesOutMissingProducts() async throws {
    let products = try await StoreKitStore().products(for: ["pro.monthly", "not.in.store", "lifetime"])
    #expect(Set(products.map(\.id)) == ["pro.monthly", "lifetime"])
  }

  @Test("PU-03 none of the products in the App Store is an empty list, for the empty view")
  func storeKitWithNoneOfTheProductsIsEmpty() async throws {
    let products = try await StoreKitStore().products(for: ["not.in.store"])
    #expect(products.isEmpty)
  }

  @Test("StoreKitStore checks again when the app returns to the foreground")
  func storeKitChecksAgainInTheForeground() async {
    let updates = StoreKitStore().updates()
    // Posted until the stream has heard it, however soon it starts listening.
    let poster = Task { @MainActor in
      while !Task.isCancelled {
        NotificationCenter.default.post(name: UIApplication.willEnterForegroundNotification, object: nil)
        try? await Task.sleep(for: .milliseconds(10))
      }
    }
    let first = await updates.first { _ in true }
    poster.cancel()
    #expect(first == .entitlementsMayHaveChanged)
  }
}
