import Foundation
import Testing

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(1)))
struct RestoreTests {
  let fake = FakeStore()
  let purchases: PurchasesModel

  init() {
    purchases = purchasesModel(fake)
  }

  @Test("PU-19 restore syncs, checks entitlements, and shows restored when the user owns anything")
  func restoreShowsRestored() async {
    await purchases.settle()
    fake.entitlementsAfterSync = [owned(lifetime)]
    purchases.restore()
    #expect(purchases.statusName == "restoring")
    await purchases.settle()
    #expect(fake.syncCalls == 1)
    #expect(purchases.statusName == "restored")
    #expect(purchases.isEntitled(to: lifetime.id))
  }

  @Test("PU-19 restore with nothing to restore says so, and it is not an error")
  func restoreWithNothingSaysSo() async {
    await purchases.settle()
    purchases.restore()
    await purchases.settle()
    #expect(purchases.statusName == "nothing to restore")
    guard case .nothingToRestore = purchases.status.message else {
      Issue.record("no nothing-to-restore message")
      return
    }
  }

  @Test("PU-20 a restore the user cancels returns to idle with no message")
  func aCancelledRestoreReturnsToIdle() async {
    await purchases.settle()
    fake.syncResult = .success(.cancelled)
    purchases.restore()
    await purchases.settle()
    #expect(purchases.statusName == "idle")
    #expect(purchases.status.message == nil)
  }

  @Test("PU-20 a restore that fails shows restore failed and keeps the entitlements")
  func aFailedRestoreKeepsEntitlements() async {
    fake.entitlements = [owned(lifetime)]
    await purchases.settle()
    fake.syncResult = .failure(TestError())
    purchases.restore()
    await purchases.settle()
    #expect(purchases.statusName == "restore failed")
    #expect(purchases.isEntitled(to: lifetime.id))
  }
}
