import * as React from "react"

import { cn } from "@/lib/utils"
import { toWesternDigits } from "@/lib/format"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onChange, ...props }, ref) => {
    // type="number" rejects Arabic digits before they reach onChange, so render
    // numeric fields as text + numeric keypad and normalize the digits ourselves.
    const isNumeric = type === "number"

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const normalized = toWesternDigits(e.target.value)
      if (normalized !== e.target.value) e.target.value = normalized
      onChange?.(e)
    }

    return (
      <input
        {...props}
        type={isNumeric ? "text" : type}
        inputMode={isNumeric ? "decimal" : props.inputMode}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent dark:bg-white/[0.04] px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        onChange={handleChange}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
