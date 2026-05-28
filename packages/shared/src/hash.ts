const HEX = "0123456789abcdef"

const toHex = (bytes: Uint8Array): string => {
  let out = ""
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!
    out += HEX[b >>> 4]! + HEX[b & 0xf]!
  }
  return out
}

export const sha256Hex = async (text: string): Promise<string> => {
  const input = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest("SHA-256", input)
  return toHex(new Uint8Array(digest))
}

export const quoteContentHash = (text: string): Promise<string> =>
  sha256Hex(text.trim())
