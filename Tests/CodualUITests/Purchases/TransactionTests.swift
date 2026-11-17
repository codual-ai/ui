import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct TransactionTests {
  let fake = FakeStore()
  let delivery = Delivery()

  @Test("PU-01 entitlements are checked at start, and unknown until the store answers")
  func entitlementsAreCheckedAtStart() async {
    fake.entitlements = [owned(lifetime)]
    let purchases = purchasesModel(fake, delivery: delivery)
    #expect(purchases.entitlements == nil)
    #expect(!purchases.isEntitled(to: lifetime.id))
    await purchases.settle()
    #expect(purchases.ownedIds == [lifetime.id])
    #expect(purchases.isEntitled(to: lifetime.id))
  }

  @Test("PU-02 a transaction from outside the buy flow is delivered, finished and owned, with no paywall")
  func outsideTransactionsAreHandled() async {
    let purchases = purchasesModel(fake, delivery: delivery)
    await purchases.settle()
    fake.entitlements = [owned(monthly)]
    fake.send(.transaction(transaction("renewal", of: monthly)))
    await waitUntil { purchases.isEntitled(to: monthly.id) }
    #expect(delivery.delivered == ["renewal"])
    #expect(fake.finished == ["renewal"])
    #expect(purchases.statusName == "idle", "a renewal must not show a purchase message")
  }

  @Test("PU-13 a transaction reported by the flow, the listener and at start is delivered and finished once")
  func eachTransactionIsFinishedOnce() async {
    let bought = transaction("t1", of: tip)
    fake.unfinished = [bought]
    let purchases = purchasesModel(fake, delivery: delivery)
    await purchases.settle()
    fake.send(.transaction(bought))
    purchases.buy(tip)
    await fake.answerPurchase(.purchased(bought))
    await purchases.refresh()
    await purchases.settle()
    #expect(delivery.delivered == ["t1"])
    #expect(fake.finished == ["t1"])
  }

  @Test("PU-13 a transaction reported twice at the same time is delivered and finished once")
  func concurrentReportsFinishOnce() async {
    let purchases = purchasesModel(fake, delivery: delivery)
    await purchases.settle()
    delivery.holds = true
    let bought = transaction("t1", of: lifetime)
    fake.send(.transaction(bought))
    await waitUntil { delivery.delivered.count == 1 }
    fake.send(.transaction(bought))
    fake.unfinished = [bought]
    async let refreshed: Void = purchases.refresh()
    for _ in 0..<20 { await Task.yield() }
    await delivery.release()
    await refreshed
    await purchases.settle()
    #expect(delivery.delivered == ["t1"])
    #expect(fake.finished == ["t1"])
  }

  @Test("PU-14 a transaction is left unfinished when deliver throws, and finished when it is given again")
  func deliverThrowingLeavesItUnfinished() async {
    let purchases = purchasesModel(fake, delivery: delivery)
    await purchases.settle()
    delivery.error = TestError()
    purchases.buy(lifetime)
    let bought = transaction("t1", of: lifetime)
    fake.unfinished = [bought]
    await fake.answerPurchase(.purchased(bought))
    await purchases.settle()
    #expect(purchases.statusName == "failed")
    #expect(fake.finished.isEmpty)
    #expect(!purchases.isEntitled(to: lifetime.id), "the store lists it, but it was never delivered")
    delivery.error = nil
    await purchases.refresh()
    #expect(fake.finished == ["t1"])
    #expect(delivery.delivered == ["t1", "t1"])
    #expect(purchases.isEntitled(to: lifetime.id))
  }

  @Test("PU-13 a transaction whose finish failed is finished later without being delivered again")
  func aFailedFinishIsRetriedWithoutDeliveringAgain() async {
    let purchases = purchasesModel(fake, delivery: delivery)
    await purchases.settle()
    fake.finishError = TestError()
    purchases.buy(tip)
    let bought = transaction("t1", of: tip)
    fake.unfinished = [bought]
    await fake.answerPurchase(.purchased(bought))
    await purchases.settle()
    #expect(purchases.statusName == "failed")
    fake.finishError = nil
    await purchases.refresh()
    #expect(delivery.delivered == ["t1"])
    #expect(fake.finished == ["t1"])
  }

  @Test("PU-14 a purchase being delivered unlocks nothing when a check answers meanwhile, nor after deliver throws")
  func aPurchaseBeingDeliveredStaysWithheld() async {
    let purchases = purchasesModel(fake, delivery: delivery)
    await purchases.settle()
    delivery.holds = true
    delivery.error = TestError()
    purchases.buy(lifetime)
    await fake.answerPurchase(.purchased(transaction("t1", of: lifetime)))
    await waitUntil { delivery.delivered == ["t1"] }
    fake.send(.transaction(transaction("refund", of: monthly, isRevoked: true)))
    await waitUntil { fake.entitlementChecks >= 2 }
    for _ in 0..<20 { await Task.yield() }
    #expect(!purchases.isEntitled(to: lifetime.id), "a check while it was delivered unlocked it")
    await delivery.release()
    await purchases.settle()
    #expect(!purchases.isEntitled(to: lifetime.id))
  }

  @Test("PU-15 a purchase left unfinished when the app was killed is delivered and finished at the next start")
  func unfinishedPurchasesAreFinishedAtStart() async {
    fake.unfinished = [transaction("t1", of: lifetime)]
    fake.entitlements = [owned(lifetime)]
    let purchases = purchasesModel(fake, delivery: delivery)
    await purchases.settle()
    #expect(delivery.delivered == ["t1"])
    #expect(fake.finished == ["t1"])
    #expect(purchases.isEntitled(to: lifetime.id))
  }

  @Test("PU-16 a refund arriving as a revoked transaction removes the entitlement, finished but not delivered")
  func aRevocationRemovesTheEntitlement() async {
    fake.entitlements = [owned(lifetime)]
    let purchases = purchasesModel(fake, delivery: delivery)
    await purchases.settle()
    fake.entitlements = []
    fake.send(.transaction(transaction("t1", of: lifetime, isRevoked: true)))
    await waitUntil { !purchases.isEntitled(to: lifetime.id) }
    #expect(!purchases.isEntitled(to: lifetime.id))
    #expect(delivery.delivered.isEmpty)
    #expect(fake.finished == ["t1"])
  }

  @Test("PU-16 a refund the store doesn't announce is removed at the next check")
  func anUnannouncedRefundIsRemovedAtTheNextCheck() async {
    fake.entitlements = [owned(lifetime)]
    let purchases = purchasesModel(fake, delivery: delivery)
    await purchases.settle()
    fake.entitlements = []
    fake.send(.entitlementsMayHaveChanged)
    await waitUntil { !purchases.isEntitled(to: lifetime.id) }
    #expect(purchases.ownedIds == [])
  }

  @Test("PU-17 a subscription that expires while the app runs is checked again and stops being owned")
  func anExpiredSubscriptionStopsBeingOwned() async {
    // The clock stands still, so however slow the start, the check waits the same 0.2 s from it.
    let now = Date.now
    fake.entitlements = [owned(monthly, expiresAt: now.addingTimeInterval(0.2))]
    let purchases = purchasesModel(fake, delivery: delivery, now: { now })
    await purchases.settle()
    #expect(purchases.isEntitled(to: monthly.id))
    fake.entitlements = []
    await waitUntil { !purchases.isEntitled(to: monthly.id) }
    #expect(!purchases.isEntitled(to: monthly.id))
  }

  @Test("PU-17 a subscription that renewed by its expiry date stays owned, with the new date")
  func aRenewedSubscriptionStaysOwned() async {
    let now = Date.now
    fake.entitlements = [owned(monthly, expiresAt: now.addingTimeInterval(0.2))]
    let purchases = purchasesModel(fake, delivery: delivery, now: { now })
    await purchases.settle()
    let renewed = now.addingTimeInterval(3600)
    fake.entitlements = [owned(monthly, expiresAt: renewed)]
    await waitUntil { purchases.entitlements == [owned(monthly, expiresAt: renewed)] }
    #expect(purchases.isEntitled(to: monthly.id))
  }

  @Test("PU-18 a subscription that renewed while the app was closed is owned at launch with its new expiry")
  func aRenewalWhileClosedIsOwnedAtLaunch() async {
    let renewed = Date.now.addingTimeInterval(30 * 24 * 3600)
    fake.entitlements = [owned(monthly, expiresAt: renewed)]
    let purchases = purchasesModel(fake, delivery: delivery)
    await purchases.settle()
    #expect(purchases.entitlements?.first?.expiresAt == renewed)
    fake.entitlements = []
    let relaunched = purchasesModel(fake, delivery: delivery)
    await relaunched.settle()
    #expect(!relaunched.isEntitled(to: monthly.id))
  }

  @Test("PU-21 a failed entitlement check keeps the last entitlements, and unknown stays unknown")
  func aFailedCheckKeepsTheLastEntitlements() async {
    fake.entitlementsError = TestError()
    let purchases = purchasesModel(fake, delivery: delivery)
    await purchases.settle()
    #expect(purchases.entitlements == nil)
    fake.entitlementsError = nil
    fake.entitlements = [owned(lifetime)]
    await purchases.refresh()
    fake.entitlementsError = offlineError
    await purchases.refresh()
    #expect(purchases.isEntitled(to: lifetime.id))
  }

  @Test("PU-21 an older check that answers after a newer one failed is kept")
  func anOlderCheckAfterANewerFailureIsKept() async {
    let purchases = purchasesModel(fake, delivery: delivery)
    await purchases.settle()
    fake.holdsEntitlements = true
    async let older: Void = purchases.refresh()
    await waitUntil { fake.entitlementChecks == 2 }
    async let newer: Void = purchases.refresh()
    await waitUntil { fake.entitlementChecks == 3 }
    await fake.answerLatestEntitlements(.failure(TestError()))
    await fake.answerLatestEntitlements(.success([owned(lifetime)]))
    _ = await (older, newer)
    #expect(purchases.isEntitled(to: lifetime.id))
  }

  @Test("PU-25 a product shared by a family member is owned, marked shared, and lost when sharing ends")
  func familySharedProductsAreOwned() async {
    fake.entitlements = [owned(lifetime, isFamilyShared: true)]
    let purchases = purchasesModel(fake, delivery: delivery)
    await purchases.settle()
    #expect(purchases.isEntitled(to: lifetime.id))
    #expect(purchases.entitlements?.first?.isFamilyShared == true)
    fake.entitlements = []
    fake.send(.transaction(transaction("shared", of: lifetime, isRevoked: true)))
    await waitUntil { !purchases.isEntitled(to: lifetime.id) }
    #expect(!purchases.isEntitled(to: lifetime.id))
  }
}
