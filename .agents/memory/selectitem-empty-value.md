---
name: SelectItem empty-value fix
description: shadcn/ui Select forbids empty string values on SelectItem
---

shadcn/ui `<SelectItem value="">` throws a runtime error: "A SelectItem must have a value prop that is not an empty string."

**Fix pattern:**
1. Keep state as `""` (falsy) for "no selection"
2. SelectItem: `<SelectItem value="__none__">placeholder text</SelectItem>`
3. Select: `value={state || "__none__"}`
4. onValueChange: `(v) => setState(v === "__none__" ? "" : v)`

**Why:** The Select component uses empty string to clear/show placeholder, so it reserves `""` as a special signal and rejects it as an item value.

**How to apply:** Any time you add a "show all" or "none" option to a shadcn Select, use this sentinel pattern.
