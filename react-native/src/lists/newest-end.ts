/** The bottom of an inverted list: whether its newest row is on screen, and what arrived while it wasn't. */
export interface NewestEndSnapshot {
  /** Whether the newest row is on screen, so newer items scroll into view. */
  readonly isAtBottom: boolean;
  /** How many newer items arrived while the newest row was off screen. */
  readonly newItemCount: number;
  /** Goes up by one each time the view should scroll to the newest row: `scrollToOffset({ offset: 0 })`. */
  readonly scrollToBottomRequest: number;
}

/** Keeps a `NewestEndSnapshot`, a new object for each change, and tells its listener. */
export class NewestEnd {
  private current: NewestEndSnapshot = { isAtBottom: true, newItemCount: 0, scrollToBottomRequest: 0 };
  /**
   * A scroll to the newest row is on its way: until it lands, or the user takes over, the newest row going off screen
   * (as a burst of rows arrives below it) doesn't count as scrolling away.
   */
  private following = false;
  /** What the view last reported, kept while following so a drag can go back to it. */
  private reportedAtBottom = true;

  constructor(private readonly changed: () => void) {}

  get snapshot(): NewestEndSnapshot {
    return this.current;
  }

  /** `count` newer items were added: they scroll into view at the bottom, and are counted anywhere else. */
  arrived(count: number): void {
    const { isAtBottom, newItemCount, scrollToBottomRequest } = this.current;
    if (isAtBottom) this.following = true;
    this.update(
      isAtBottom
        ? { scrollToBottomRequest: scrollToBottomRequest + 1 }
        : { newItemCount: newItemCount + count },
    );
  }

  bottomChanged(isAtBottom: boolean): void {
    this.reportedAtBottom = isAtBottom;
    if (isAtBottom) this.following = false;
    if (!isAtBottom && this.following) return;
    if (isAtBottom === this.current.isAtBottom && (!isAtBottom || this.current.newItemCount === 0)) return;
    this.update(isAtBottom ? { isAtBottom, newItemCount: 0 } : { isAtBottom });
  }

  /** The user started scrolling: a scroll to the newest row still on its way no longer holds the bottom. */
  userScrolled(): void {
    this.following = false;
    this.bottomChanged(this.reportedAtBottom);
  }

  scrollToBottom(): void {
    this.following = true;
    this.update({
      isAtBottom: true,
      newItemCount: 0,
      scrollToBottomRequest: this.current.scrollToBottomRequest + 1,
    });
  }

  private update(change: Partial<NewestEndSnapshot>): void {
    this.current = { ...this.current, ...change };
    this.changed();
  }
}
