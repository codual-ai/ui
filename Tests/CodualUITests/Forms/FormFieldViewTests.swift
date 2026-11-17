import SwiftUI
import Testing
import UIKit

@testable import CodualUI

@MainActor
@Suite(.timeLimit(.minutes(2)), .drawsViews)
struct FormFieldViewTests {
  let fixture = FormFixture([
    FormField(.name, rules: [.required("Enter your name")]),
    FormField(.email, rules: [.required("Enter your email"), .email("Not an email")]),
  ])
  var form: FormModel<TestField> { fixture.form }

  @Test("FM-28 every field but the last has the Next key and the last the Done key")
  func theReturnKeysAreNextThenDone() async throws {
    let window = show(SignUpView(form: form))
    defer { window.isHidden = true }
    let fields = try #require(await textFields(in: window, count: 2))
    #expect(fields.map(\.returnKeyType) == [.next, .done])
  }

  @Test("FM-28 Next moves to the next field and Done closes the keyboard and runs the done action; both leave")
  func nextAndDoneMoveThroughTheFields() {
    var doneCalls = 0
    #expect(form.returnPressed(on: .name) { doneCalls += 1 } == .email)
    #expect(doneCalls == 0)
    #expect(form.error(.name) == "Enter your name")
    #expect(form.returnPressed(on: .email) { doneCalls += 1 } == nil)
    #expect(doneCalls == 1)
    #expect(form.error(.email) == "Enter your email")
  }

  @Test("FM-22 a submit with errors moves the app's focus state, and the keyboard, to the first invalid field")
  func aSubmitMovesTheFocusState() async throws {
    let window = show(SignUpView(form: form))
    defer { window.isHidden = true }
    let fields = try #require(await textFields(in: window, count: 2))
    form.setValue(.name, "Ann")
    await fixture.submit()
    await waitForView { fields[1].isFirstResponder }
    #expect(fields.map(\.isFirstResponder) == [false, true])
    #expect(form.fieldToFocus == nil)
  }

  @Test("FM-29 a field's shown error, which `.formField` makes its hint, follows its value; typing announces nothing")
  func theErrorFollowsTheValueSilently() {
    fixture.fill(.email, "ann")
    #expect(form.error(.email) == "Not an email")
    form.setValue(.email, "ann@example.com")
    #expect(form.error(.email) == nil)
    for text in ["a", "an", "ann", ""] { form.setValue(.name, text) }
    #expect(fixture.announcements.isEmpty)
  }

  /// The text fields in the window, top first, once SwiftUI has drawn `count` of them.
  private func textFields(in window: UIWindow, count: Int) async -> [UITextField]? {
    var found: [UITextField] = []
    await waitForView {
      found = allTextFields(in: window).sorted { $0.convert(.zero, to: nil).y < $1.convert(.zero, to: nil).y }
      return found.count == count
    }
    return found.count == count ? found : nil
  }

  private func allTextFields(in view: UIView) -> [UITextField] {
    (view as? UITextField).map { [$0] } ?? view.subviews.flatMap(allTextFields)
  }
}

private struct SignUpView: View {
  let form: FormModel<TestField>
  @FocusState private var focus: TestField?

  var body: some View {
    VStack {
      TextField("Name", text: form.binding(.name)).formField(form, .name, focus: $focus)
      TextField("Email", text: form.binding(.email)).formField(form, .email, focus: $focus)
    }
  }
}
