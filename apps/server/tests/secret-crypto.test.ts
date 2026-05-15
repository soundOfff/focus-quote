import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  decryptSecret,
  encryptSecret,
  isSecretsKeyConfigured,
  maskSecretHint,
} from "../src/lib/secret-crypto"

const originalKey = process.env.SECRETS_ENCRYPTION_KEY

describe("secret-crypto", () => {
  beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64")
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env.SECRETS_ENCRYPTION_KEY
    else process.env.SECRETS_ENCRYPTION_KEY = originalKey
  })

  it("reports configured when key is well-formed", () => {
    expect(isSecretsKeyConfigured()).toBe(true)
  })

  it("round-trips encrypt/decrypt and produces a hint", () => {
    const plaintext = "sk-or-supersecret-1234567890"
    const enc = encryptSecret(plaintext)
    expect(enc).not.toContain(plaintext)
    expect(decryptSecret(enc)).toBe(plaintext)
    expect(maskSecretHint(plaintext)).toContain("…")
  })

  it("rejects malformed payloads on decrypt", () => {
    expect(() => decryptSecret("not-a-valid-payload")).toThrow()
  })
})
