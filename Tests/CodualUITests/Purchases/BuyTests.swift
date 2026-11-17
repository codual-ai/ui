import Foundation
import StoreKit
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct BuyTests {
  let fake = FakeStore()
  let delivery = Delivery()
  let purchases: PurchasesModel

  init() {
    purchases = purchasesModel(fake, delivery: delivery)
  }

  @Test("PU-06 buying shows purchasing, then purchased, and delivers the transaction before finishing it")
  func buyingDeliversThenFinishes() async {
    await purchases.settle()
    delivery.holds = true
    purchases.buy(monthly)
    #expect(purchases.statusName == "purchasing")
    fake.entitlements = [owned(monthly)]
    await fake.answerPurchase(.purchased(transaction("t1", of: monthly)))
    await waitUntil { delivery.delivered == ["t1"] }
    #expect(fake.finished.isEmpty, "finished before deliver returned")
    #expect(purchases.statusName == "purchasing")
    await delivery.release()
    await purchases.settle()
    #expect(fake.finished == ["t1"])
    #expect(purchases.statusName == "purchased")
    #expect(purchases.isEntitled(to: monthly.id))
  }

  @Test("PU-07 a purchase the user cancels is not an error and leaves buy available")
  func aCancelledPurchaseIsNotAnError() async {
    await purchases.settle()
    purchases.buy(monthly)
    await fake.answerPurchase(.cancelled)
    await purchases.settle()
    #expect(purchases.statusName == "cancelled")
    #expect(purchases.status.message == nil)
    #expect(!purchases.isEntitled(to: monthly.id))
    purchases.buy(monthly)
    #expect(purchases.statusName == "purchasing")
    await fake.answerPurchase(.cancelled)
  }

  @Test("PU-08 a failed purchase shows the failed message with the error and unlocks nothing")
  func aFailedPurchaseShowsTheError() async {
    await purchases.settle()
    purchases.buy(lifetime)
    await fake.failPurchase(TestError())
    await purchases.settle()
    guard case .failed(let productId, let error) = purchases.status else {
      Issue.record("not failed: \(purchases.statusName)")
      return
    }
    #expect(productId == lifetime.id)
    #expect(error is TestError)
    #expect(purchases.status.message != nil)
    #expect(!purchases.isEntitled(to: lifetime.id))
    #expect(!purchases.isBusy)
  }

  @Test("PU-09 buying or restoring while a purchase runs makes one request to the store")
  func doubleTapsMakeOneRequest() async {
    await purchases.settle()
    purchases.buy(monthly)
    purchases.buy(monthly)
    purchases.buy(yearly)
    purchases.restore()
    await fake.answerPurchase(.cancelled)
    await purchases.settle()
    #expect(fake.purchaseCalls == [monthly.id])
    #expect(fake.syncCalls == 0)
  }

  @Test("PU-09 buying while a restore runs does nothing")
  func buyingWhileRestoringDoesNothing() async {
    await purchases.settle()
    purchases.restore()
    purchases.buy(monthly)
    purchases.restore()
    await purchases.settle()
    #expect(fake.purchaseCalls.isEmpty)
    #expect(fake.syncCalls == 1)
  }

  @Test("PU-10 a pending purchase shows pending, unlocks nothing, and leaves buy available")
  func aPendingPurchaseUnlocksNothing() async {
    await purchases.settle()
    purchases.buy(monthly)
    await fake.answerPurchase(.pending)
    await purchases.settle()
    #expect(purchases.statusName == "pending")
    #expect(!purchases.isEntitled(to: monthly.id))
    #expect(!purchases.isBusy)
    guard case .pending(let productId) = purchases.status.message else {
      Issue.record("no pending message")
      return
    }
    #expect(productId == monthly.id)
    purchases.buy(yearly)
    #expect(purchases.statusName == "purchasing")
    await fake.answerPurchase(.cancelled)
  }

  @Test("PU-23 buying a product the user owns does nothing")
  func buyingAnOwnedProductDoesNothing() async {
    fake.entitlements = [owned(lifetime), owned(monthly)]
    await purchases.settle()
    purchases.buy(lifetime)
    purchases.buy(monthly)
    #expect(purchases.statusName == "idle")
    #expect(fake.purchaseCalls.isEmpty)
    purchases.buy(yearly)
    #expect(purchases.statusName == "purchasing")
    await fake.answerPurchase(.cancelled)
  }

  @Test("PU-23 an already-owned answer that gives the existing transaction shows purchased, not an error")
  func anAlreadyOwnedAnswerShowsPurchased() async {
    await purchases.settle()
    purchases.buy(lifetime)
    fake.entitlements = [owned(lifetime)]
    // What PlayBillingStore and the React Native adapter answer for "already owned": the purchase the store has.
    await fake.answerPurchase(.purchased(transaction("earlier", of: lifetime)))
    await purchases.settle()
    #expect(purchases.statusName == "purchased")
    #expect(purchases.isEntitled(to: lifetime.id))
  }

  @Test("PU-24 a consumable is delivered and finished on every purchase and never becomes an entitlement")
  func consumablesCanBeBoughtAgain() async {
    await purchases.settle()
    purchases.buy(tip)
    await fake.answerPurchase(.purchased(transaction("tip1", of: tip)))
    await purchases.settle()
    #expect(!purchases.isEntitled(to: tip.id))
    #expect(!purchases.isOwned(tip))
    purchases.buy(tip)
    await fake.answerPurchase(.purchased(transaction("tip2", of: tip)))
    await purchases.settle()
    #expect(delivery.delivered == ["tip1", "tip2"])
    #expect(fake.finished == ["tip1", "tip2"])
    #expect(purchases.statusName == "purchased")
  }

  @Test("PU-30 a purchase belongs to purchases, not the paywall: it lands with no view on screen")
  func aPurchaseOutlivesThePaywall() async {
    await purchases.settle()
    var paywall: PaywallContent? = PaywallContent(
      purchases: purchases, products: [lifetime], selected: lifetime, select: { _ in })
    paywall?.buy()
    paywall = nil
    fake.entitlements = [owned(lifetime)]
    await fake.answerPurchase(.purchased(transaction("t1", of: lifetime)))
    await purchases.settle()
    #expect(fake.finished == ["t1"])
    #expect(purchases.statusName == "purchased")
  }

  @Test("PU-31 deliver gets the transaction's ID, product and the store's signed proof")
  func deliverGetsTheProof() async {
    var given: StoreTransaction?
    let purchases = PurchasesModel(store: fake.store, deliver: { given = $0 })
    await purchases.settle()
    purchases.buy(monthly)
    await fake.answerPurchase(.purchased(transaction("t9", of: monthly)))
    await purchases.settle()
    #expect(given?.id == "t9")
    #expect(given?.productId == monthly.id)
    #expect(given?.proof == "signed-t9")
  }

  @Test("PU-26 a purchase the store refuses as unverified shows failed, and nothing is delivered or finished")
  func anUnverifiedTransactionFails() async {
    await purchases.settle()
    purchases.buy(lifetime)
    // What StoreKitStore throws for an unverified purchase. Its own check (`payloadValue`) needs a purchase from a host
    // app to test, which `xcodebuild test` of a package doesn't have.
    await fake.failPurchase(VerificationResult<Transaction>.VerificationError.invalidSignature)
    await purchases.settle()
    #expect(purchases.statusName == "failed")
    #expect(fake.finished.isEmpty)
    #expect(delivery.delivered.isEmpty)
    #expect(!purchases.isEntitled(to: lifetime.id))
  }
}
