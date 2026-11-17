package ai.codual.ui.selection

import ai.codual.ui.screenstates.ScreenState
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class SelectionModeTest {
  @Test
  fun `SL-01 in the mode a tap toggles a row, and outside it selects nothing`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    selection.updateItems(items(1, 2))
    selection.toggle(item(1))
    assertEquals(emptyList<Any>(), fixture.keys)
    selection.enter()
    selection.toggle(item(1))
    selection.toggle(item(2))
    assertEquals(listOf(1, 2), fixture.keys)
    selection.toggle(item(1))
    assertEquals(listOf(2), fixture.keys)
    assertFalse(selection.isSelected(item(1)))
    assertTrue(selection.isSelected(item(2)))
  }

  @Test
  fun `SL-02 a single selection keeps one item, and selecting it again deselects it`() = runTest {
    val fixture = SelectionFixture(this, kind = SelectionKind.Single)
    fixture.activeWith(listOf(1, 2, 3), selected = listOf(1))
    fixture.selection.toggle(item(2))
    assertEquals(listOf(2), fixture.keys)
    fixture.selection.selectAll()
    assertEquals(listOf(2), fixture.keys)
    fixture.selection.toggle(item(2))
    assertEquals(emptyList<Any>(), fixture.keys)
  }

  @Test
  fun `SL-02 a single selection takes no max`() = runTest {
    assertThrows(IllegalArgumentException::class.java) {
      SelectionState<Int, Int>(backgroundScope, key = { it }, kind = SelectionKind.Single, max = 1)
    }
    assertThrows(IllegalArgumentException::class.java) {
      SelectionState<Int, Int>(backgroundScope, key = { it }, max = 0)
    }
  }

  @Test
  fun `SL-03 Select enters with nothing selected, and a long press enters with its row`() = runTest {
    val fixture = SelectionFixture(this, disabled = setOf(3))
    val selection = fixture.selection
    selection.updateItems(items(1, 2, 3))
    selection.enter()
    assertTrue(selection.isActive)
    assertEquals(emptyList<Any>(), fixture.keys)
    selection.exit()
    selection.longPress(item(3))
    assertFalse(selection.isActive)
    selection.longPress(item(2))
    assertTrue(selection.isActive)
    assertEquals(listOf(2), fixture.keys)
    selection.longPress(item(1))
    selection.longPress(item(2))
    assertEquals(listOf(1), fixture.keys)
  }

  @Test
  fun `SL-04 Done clears the selection, and nothing is selected outside the mode`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2), selected = listOf(1, 2))
    selection.exit()
    assertFalse(selection.isActive)
    assertEquals(0, selection.count)
    selection.selectAll()
    selection.toggle(item(1))
    assertEquals(0, selection.count)
    selection.enter()
    assertEquals(0, selection.count)
  }

  @Test
  fun `SL-05 an always active selection is active from the start, and Done and back do nothing`() = runTest {
    val fixture = SelectionFixture(this, activation = SelectionActivation.Always)
    val selection = fixture.selection
    assertTrue(selection.isActive)
    selection.updateItems(items(1, 2))
    selection.toggle(item(1))
    selection.exit()
    assertFalse(selection.back())
    assertFalse(selection.handlesBack)
    assertTrue(selection.isActive)
    assertEquals(listOf(1), fixture.keys)
    selection.updateItems(emptyList())
    assertTrue(selection.isActive)
  }

  @Test
  fun `SL-20 a restored selection keeps to its kind and maximum, with no key twice`() = runTest {
    val multiple = SelectionFixture(this, max = 2)
    multiple.selection.restore(isActive = true, keys = listOf(1, 1, 2, 3))
    assertEquals(listOf(1, 2), multiple.keys)
    val single = SelectionFixture(this, kind = SelectionKind.Single)
    single.selection.restore(isActive = true, keys = listOf(4, 5))
    assertEquals(listOf(4), single.keys)
  }

  @Test
  fun `SL-19 back leaves the mode first and is handled, and outside the mode it isn't`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    assertFalse(selection.back())
    fixture.activeWith(listOf(1, 2), selected = listOf(1))
    assertTrue(selection.handlesBack)
    assertTrue(selection.back())
    assertFalse(selection.isActive)
    assertEquals(0, selection.count)
    assertFalse(selection.back())
  }

  @Test
  fun `SL-19 back during a confirmation cancels it and stays in the mode`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2), selected = listOf(1))
    selection.performAfterConfirmation(fixture.action)
    assertTrue(selection.back())
    assertFalse(selection.isConfirming)
    assertTrue(selection.isActive)
    assertEquals(listOf(1), fixture.keys)
  }

  @Test
  fun `SL-25 Select on a list that is already empty stays in the mode when the same empty list comes again`() =
    runTest {
      val fixture = SelectionFixture(this)
      val selection = fixture.selection
      selection.updateItems(emptyList())
      selection.enter()
      selection.updateItems(emptyList())
      selection.updateItems(ScreenState.Empty)
      assertTrue(selection.isActive)
    }

  @Test
  fun `SL-25 the items becoming none ends the mode`() = runTest {
    val fixture = SelectionFixture(this)
    val selection = fixture.selection
    fixture.activeWith(listOf(1, 2), selected = listOf(1))
    selection.updateItems(ScreenState.Loading)
    assertTrue(selection.isActive)
    selection.updateItems(ScreenState.Empty)
    assertFalse(selection.isActive)
    assertEquals(0, selection.count)
  }
}
