import SwiftUI
import Testing
import UIKit

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(2)))
struct PaywallTests {
  let fake = FakeStore()
  let purchases: PurchasesModel
  let views = PaywallRecorder()

  init() {
    purchases = purchasesModel(fake)
  }

  private func showPaywall(productIds: [String] = [monthly.id, yearly.id], initialSelection: String? = nil)
    -> UIWindow
  {
    show(
      Paywall(purchases, productIds: productIds, initialSelection: initialSelection) { paywall in
        Text("Products").onAppear { views.paywall = paywall }.id(paywall.selected?.id)
      } loading: {
        Text("Loading").onAppear { views.shown.append("loading") }
      } empty: {
        Text("Empty").onAppear { views.shown.append("empty") }
      } failed: { _, retry in
        Text("Failed").onAppear {
          views.shown.append("failed")
          views.retry = retry
        }
      } offline: { _ in
        Text("Offline").onAppear { views.shown.append("offline") }
      } message: { message, dismiss in
        Text("Message").onAppear {
          views.message = message
          views.dismiss = dismiss
        }
      })
  }

  @Test("PU-03 the products load as a screen state: loading, then failed with a retry that loads them")
  func productsLoadAsAScreenState() async {
    fake.productsError = TestError()
    let window = showPaywall()
    defer { window.isHidden = true }
    await waitUntil { views.retry != nil }
    #expect(views.shown == ["loading", "failed"])
    fake.productsError = nil
    views.retry?()
    await waitUntil { views.paywall != nil }
    #expect(views.paywall?.products == [monthly, yearly])
  }

  @Test("PU-03 no connection shows the offline view, and none of the products sold shows the empty view")
  func offlineAndEmpty() async {
    fake.productsError = offlineError
    let window = showPaywall()
    await waitUntil { views.shown.contains("offline") }
    window.isHidden = true
    fake.productsError = nil
    fake.sold = []
    let emptyWindow = showPaywall()
    defer { emptyWindow.isHidden = true }
    await waitUntil { views.shown.contains("empty") }
    #expect(views.shown.contains("offline"))
    #expect(views.shown.contains("empty"))
  }

  @Test("PU-04 products show in the app's order, and one the store doesn't sell is left out")
  func productsKeepTheAppsOrder() async throws {
    let products = try await purchases.products(for: [lifetime.id, "not.sold", monthly.id, lifetime.id])
    #expect(products == [lifetime, monthly])
  }

  @Test("PU-05 rows and the buy button show the store's own price string")
  func pricesAreTheStoresStrings() async throws {
    let paywall = PaywallContent(purchases: purchases, products: [yearly], selected: yearly, select: { _ in })
    #expect(paywall.buyButton == .ready(yearly))
    let row = try await recognizedText(in: SystemProductRow(yearly, paywall: paywall), height: 80)
    #expect(row.contains("$19.99"))
    let button = try await recognizedText(in: SystemBuyButton(paywall).padding(), height: 100)
    #expect(button == ["Buy for $19.99"])
  }

  @Test("PU-27 pending shows the message, which the app dismisses back to idle")
  func pendingShowsAMessageUntilDismissed() async {
    let window = showPaywall()
    defer { window.isHidden = true }
    await waitUntil { views.paywall != nil }
    views.paywall?.buy()
    await fake.answerPurchase(.pending)
    await waitUntil { views.dismiss != nil }
    guard case .pending = views.message else {
      Issue.record("no pending message")
      return
    }
    views.dismiss?()
    #expect(purchases.statusName == "idle")
  }

  @Test("PU-27 purchasing, cancelled and purchased show no message")
  func quietStatusesShowNoMessage() async {
    await purchases.settle()
    purchases.buy(monthly)
    #expect(purchases.status.message == nil)
    await fake.answerPurchase(.cancelled)
    await purchases.settle()
    #expect(purchases.status.message == nil)
    purchases.buy(monthly)
    await fake.answerPurchase(.purchased(transaction("t1", of: monthly)))
    await purchases.settle()
    #expect(purchases.statusName == "purchased")
    #expect(purchases.status.message == nil)
  }

  @Test("PU-27 a message the app leaves out is a system alert")
  func theDefaultMessageIsASystemAlert() {
    let paywall = Paywall(purchases, productIds: [monthly.id]) { _ in EmptyView() }
    let expected = Paywall<
      EmptyView, SystemLoadingView, SystemEmptyView, SystemFailedView, SystemOfflineView,
      SystemPurchaseMessageAlert
    >.self
    #expect(type(of: paywall) == expected)
  }

  @Test("PU-28 the buy button is unavailable, ready, purchasing and owned")
  func theBuyButtonStates() async {
    await purchases.settle()
    let nothing = PaywallContent(purchases: purchases, products: [], selected: nil, select: { _ in })
    #expect(nothing.buyButton == .unavailable)
    let paywall = PaywallContent(purchases: purchases, products: [lifetime], selected: lifetime, select: { _ in })
    #expect(paywall.buyButton == .ready(lifetime))
    fake.entitlements = [owned(lifetime)]
    paywall.buy()
    #expect(paywall.buyButton == .purchasing)
    await fake.answerPurchase(.purchased(transaction("t1", of: lifetime)))
    await purchases.settle()
    #expect(paywall.buyButton == .owned(lifetime))
  }

  @Test("PU-28 the system buy button names the product and price for screen readers, and is enabled only when ready")
  func theSystemBuyButtonIsLabelled() {
    #expect(PaywallText.buyLabel(monthly) == "Buy Pro Monthly, $2.99")
    #expect(PaywallText.buy(lifetime) == "Buy for 4,99 €")
    #expect(SystemBuyButton.isEnabled(.ready(monthly)))
    #expect(!SystemBuyButton.isEnabled(.unavailable))
    #expect(!SystemBuyButton.isEnabled(.purchasing))
    #expect(!SystemBuyButton.isEnabled(.owned(lifetime)))
  }

  @Test("PU-29 the first product is selected, unless the app's initial selection was returned")
  func theFirstProductIsSelected() async {
    let window = showPaywall()
    await waitUntil { views.paywall != nil }
    #expect(views.paywall?.selected == monthly)
    window.isHidden = true
    views.paywall = nil
    let chosen = showPaywall(initialSelection: yearly.id)
    await waitUntil { views.paywall != nil }
    #expect(views.paywall?.selected == yearly)
    chosen.isHidden = true
    views.paywall = nil
    let missing = showPaywall(initialSelection: "not.sold")
    defer { missing.isHidden = true }
    await waitUntil { views.paywall != nil }
    #expect(views.paywall?.selected == monthly)
  }

  @Test("PU-29 selecting another product changes what buy buys")
  func selectingChangesWhatBuyBuys() async {
    let window = showPaywall()
    defer { window.isHidden = true }
    await waitUntil { views.paywall != nil }
    views.paywall?.select(yearly)
    await waitUntil { views.paywall?.selected == yearly }
    views.paywall?.buy()
    await fake.answerPurchase(.cancelled)
    #expect(fake.purchaseCalls == [yearly.id])
  }
}

@MainActor
final class PaywallRecorder {
  var paywall: PaywallContent?
  var shown: [String] = []
  var retry: (() -> Void)?
  var message: PurchaseMessage?
  var dismiss: (() -> Void)?
}
