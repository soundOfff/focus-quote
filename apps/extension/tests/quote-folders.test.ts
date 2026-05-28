import { describe, it, expect } from "vitest"
import {
  UNFILED_LABEL,
  folderTagOf,
  groupQuotesIntoFolders,
  filterQuotesByFolder,
} from "@/shared/quote-folders"

const q = (tag: string | null) => ({ tag })

describe("folderTagOf", () => {
  it("returns the trimmed tag", () => {
    expect(folderTagOf(q("  react  "))).toBe("react")
  })

  it("returns null for a blank or absent tag", () => {
    expect(folderTagOf(q(""))).toBeNull()
    expect(folderTagOf(q("   "))).toBeNull()
    expect(folderTagOf(q(null))).toBeNull()
  })
})

describe("groupQuotesIntoFolders", () => {
  it("returns no folders for an empty list", () => {
    expect(groupQuotesIntoFolders([])).toEqual([])
  })

  it("groups blank/null tags into a single Unfiled bucket", () => {
    const folders = groupQuotesIntoFolders([q(null), q(""), q("   ")])
    expect(folders).toEqual([
      { tag: null, label: UNFILED_LABEL, count: 3 },
    ])
  })

  it("counts each folder and trims tags", () => {
    const folders = groupQuotesIntoFolders([
      q("react"),
      q(" react "),
      q("effect"),
    ])
    const react = folders.find((f) => f.tag === "react")
    const effect = folders.find((f) => f.tag === "effect")
    expect(react?.count).toBe(2)
    expect(effect?.count).toBe(1)
  })

  it("sorts real folders case-insensitively with Unfiled last", () => {
    const folders = groupQuotesIntoFolders([
      q("banana"),
      q("Apple"),
      q("cherry"),
      q(null),
    ])
    expect(folders.map((f) => f.label)).toEqual([
      "Apple",
      "banana",
      "cherry",
      UNFILED_LABEL,
    ])
  })

  it("treats tags differing only by case as distinct folders", () => {
    const folders = groupQuotesIntoFolders([q("React"), q("react")])
    expect(folders).toHaveLength(2)
  })

  it("omits the Unfiled bucket when every quote is filed", () => {
    const folders = groupQuotesIntoFolders([q("a"), q("b")])
    expect(folders.some((f) => f.tag === null)).toBe(false)
  })
})

describe("filterQuotesByFolder", () => {
  const quotes = [q("react"), q(" react "), q("effect"), q(null), q("")]

  it("returns all quotes (a copy) when selection is undefined", () => {
    const result = filterQuotesByFolder(quotes, undefined)
    expect(result).toHaveLength(quotes.length)
    expect(result).not.toBe(quotes)
  })

  it("returns only the Unfiled bucket when selection is null", () => {
    expect(filterQuotesByFolder(quotes, null)).toHaveLength(2)
  })

  it("returns only the matching folder, trim-aware", () => {
    expect(filterQuotesByFolder(quotes, "react")).toHaveLength(2)
    expect(filterQuotesByFolder(quotes, "effect")).toHaveLength(1)
  })

  it("returns nothing for an unknown folder", () => {
    expect(filterQuotesByFolder(quotes, "missing")).toHaveLength(0)
  })
})
