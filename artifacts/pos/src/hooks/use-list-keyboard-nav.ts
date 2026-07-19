import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/**
 * Keyboard navigation for any search-results dropdown: Arrow Up/Down move a
 * highlight through `items`, Enter selects the highlighted one, and the active
 * row is scrolled into view. Wire `onKeyDown` onto the search <input>, spread
 * `getItemProps(i)` onto each rendered row, and use `activeIndex` for the
 * highlight style.
 *
 * Used across every product-picker search box (cashier, quotations, purchases,
 * returns) so the keyboard behaviour is identical everywhere.
 */
export function useListKeyboardNav<T>({
  items,
  onSelect,
  resetKey,
}: {
  /** The current results list (already filtered/fetched). */
  items: T[];
  /** Called with the chosen item when the user presses Enter (or clicks). */
  onSelect: (item: T, index: number) => void;
  /**
   * When this value changes (typically the search query), the highlight jumps
   * back to the first result. Pass the query string so a fresh search starts at
   * the top regardless of `items`' reference identity.
   */
  resetKey?: unknown;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  // A new search → highlight the first result.
  useEffect(() => {
    setActiveIndex(0);
  }, [resetKey]);

  // Keep the highlight in range when the list grows/shrinks.
  useEffect(() => {
    setActiveIndex((i) =>
      items.length === 0 ? 0 : Math.min(Math.max(i, 0), items.length - 1),
    );
  }, [items.length]);

  // Scroll the highlighted row into view (no-op if it's already visible).
  useEffect(() => {
    itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (items.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === "Enter") {
        const item = items[activeIndex];
        if (item !== undefined) {
          e.preventDefault();
          // Stop the global barcode-scanner window listener from also firing on
          // this Enter — the user is choosing a result, not scanning.
          e.stopPropagation();
          onSelect(item, activeIndex);
        }
      }
    },
    [items, activeIndex, onSelect],
  );

  /**
   * Props for each rendered result row: registers it for scroll-into-view and
   * highlights it on hover. Use `activeIndex === i` for the highlight class.
   */
  const getItemProps = useCallback(
    (index: number) => ({
      ref: (el: HTMLElement | null) => {
        itemRefs.current[index] = el;
      },
      onMouseEnter: () => setActiveIndex(index),
    }),
    [],
  );

  return { activeIndex, setActiveIndex, onKeyDown, getItemProps };
}
