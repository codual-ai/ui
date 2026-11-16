import CodualUI
import Testing

@Test func theVersionIsSemantic() {
  #expect(codualUIVersion.wholeMatch(of: /\d+\.\d+\.\d+/) != nil)
}
