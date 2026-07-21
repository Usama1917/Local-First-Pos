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
  highlightFirst = true,
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
  /**
   * Whether the first item starts highlighted (`activeIndex = 0`). `true` for
   * search-dropdown pickers so typing + Enter picks the top result. Pass `false`
   * for full-page list tables so NO row is pre-selected — the strong highlight
   * appears only once the user actually navigates with the arrow keys (`-1` until
   * then). Mouse hover uses the faint `.nav-hover` tint regardless.
   */
  highlightFirst?: boolean;
}) {
  const initial = highlightFirst ? 0 : -1;
  const [activeIndex, setActiveIndex] = useState(initial);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  // A new search → reset the highlight (to the first result, or to "none").
  useEffect(() => {
    setActiveIndex(initial);
  }, [resetKey]);

  // Keep the highlight in range when the list grows/shrinks; preserve "none" (-1).
  useEffect(() => {
    setActiveIndex((i) => {
      if (items.length === 0) return initial;
      if (i < 0) return -1; // stay unselected until the user navigates
      return Math.min(Math.max(i, 0), items.length - 1);
    });
  }, [items.length]);

  // Scroll the highlighted row into view (no-op if none is highlighted / visible).
  useEffect(() => {
    if (activeIndex >= 0) itemRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (items.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % items.length); // -1 → 0 → … → wraps
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1)); // -1/0 → last
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
   * Props for each rendered result row: registers it for scroll-into-view.
   * Mouse and keyboard are kept independent — hovering does NOT force the strong
   * `nav-active` selection tint; give hovered rows the `.nav-hover` class instead
   * for a faint hover echo of the chosen highlight colour (index.css). The strong
   * `activeIndex === i` tint is reserved for the keyboard-selected row.
   */
  const getItemProps = useCallback(
    (index: number) => ({
      ref: (el: HTMLElement | null) => {
        itemRefs.current[index] = el;
      },
    }),
    [],
  );

  return { activeIndex, setActiveIndex, onKeyDown, getItemProps };
}
