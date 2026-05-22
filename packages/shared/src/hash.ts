const HEX = "0123456789abcdef"

const toHex = (bytes: Uint8Array): string => {
  let out = ""
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!
    out += HEX[b >>> 4]! + HEX[b & 0xf]!
  }
  return out
}

export const quoteContentHash = async (text: string): Promise<string> => {
  const input = new TextEncoder().encode(text.trim())
  const digest = await crypto.subtle.digest("SHA-256", input)
  return toHex(new Uint8Array(digest))
}
