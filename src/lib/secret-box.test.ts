import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret } from "./secret-box";

describe("integration secret encryption", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", "test-only-secret-with-more-than-thirty-two-characters");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("encrypts with randomized authenticated encryption", () => {
    const first = encryptSecret("credential-value");
    const second = encryptSecret("credential-value");
    expect(first).not.toBe(second);
    expect(first).not.toContain("credential-value");
    expect(decryptSecret(first)).toBe("credential-value");
  });

  it("rejects modified ciphertext", () => {
    const encrypted = encryptSecret("credential-value");
    const parts = encrypted.split(":");
    parts[3] = `${parts[3]![0] === "A" ? "B" : "A"}${parts[3]!.slice(1)}`;
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });
});
