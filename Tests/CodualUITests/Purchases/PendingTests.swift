import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct PendingTests {
  let fake = FakeStore()
  let delivery = Delivery()
  let purchases: PurchasesModel

  init() {
    purchases = purchasesModel(fake, delivery: delivery)
  }

  private func pendingPurchase(of product: StoreProduct) async {
    await purchases.settle()
    purchases.buy(product)
    await fake.answerPurchase(.pending)
    await purchases.settle()
  }

  @Test("PU-11 a pending purchase approved later is delivered, finished, owned, and shows purchased")
  func anApprovedPurchaseShowsPurchased() async {
    await pendingPurchase(of: lifetime)
    fake.entitlements = [owned(lifetime)]
    fake.send(.transaction(transaction("approved", of: lifetime)))
    await waitUntil { purchases.statusName == "purchased" }
    #expect(purchases.statusName == "purchased")
    #expect(purchases.isEntitled(to: lifetime.id))
    #expect(fake.finished == ["approved"])
  }

  @Test("PU-11 an approval found when purchases checks again shows purchased")
  func anApprovalFoundByACheckShowsPurchased() async {
    await pendingPurchase(of: lifetime)
    fake.unfinished = [transaction("approved", of: lifetime)]
    fake.entitlements = [owned(lifetime)]
    fake.send(.entitlementsMayHaveChanged)
    await waitUntil { purchases.statusName == "purchased" }
    #expect(purchases.statusName == "purchased")
    #expect(fake.finished == ["approved"])
  }

  @Test("PU-11 an approval of another product owns it without replacing the pending message")
  func anApprovalOfAnotherProductKeepsTheMessage() async {
    await pendingPurchase(of: lifetime)
    fake.entitlements = [owned(monthly)]
    fake.send(.transaction(transaction("approved", of: monthly)))
    await waitUntil { purchases.isEntitled(to: monthly.id) }
    #expect(purchases.statusName == "pending")
  }

  @Test("PU-12 a declined pending purchase unlocks nothing, shows no error, and stays until dismissed")
  func aDeclinedPurchaseStaysPendingUntilDismissed() async {
    await pendingPurchase(of: lifetime)
    // A decline: the App Store sends nothing, and Google Play's next check lists nothing.
    fake.send(.entitlementsMayHaveChanged)
    await waitUntil { fake.entitlementChecks >= 2 }
    await purchases.settle()
    #expect(purchases.statusName == "pending")
    #expect(!purchases.isEntitled(to: lifetime.id))
    purchases.dismissMessage()
    #expect(purchases.statusName == "idle")
  }

  @Test("PU-22 a purchase that failed offline but completed at the store is owned and shows purchased")
  func anOfflineFailureThatCompletesShowsPurchased() async {
    await purchases.settle()
    purchases.buy(lifetime)
    await fake.failPurchase(offlineError)
    await purchases.settle()
    #expect(purchases.statusName == "failed")
    fake.entitlements = [owned(lifetime)]
    fake.send(.transaction(transaction("late", of: lifetime)))
    await waitUntil { purchases.statusName == "purchased" }
    #expect(purchases.isEntitled(to: lifetime.id))
  }
}
