import { describe, expect, it } from "vitest";
import { hashLocalPassword, validateLocalPassword, verifyLocalPassword } from "./password";

describe("local password authentication", () => {
  it("enforces the production password policy", () => {
    expect(validateLocalPassword("short")).toBe(false);
    expect(validateLocalPassword("longbutmissingclasses")).toBe(false);
    expect(validateLocalPassword("Valid-Password-42")).toBe(true);
  });

  it("stores a salted scrypt hash and verifies in constant-time form", async () => {
    const first = await hashLocalPassword("Valid-Password-42");
    const second = await hashLocalPassword("Valid-Password-42");
    expect(first).not.toBe(second);
    await expect(verifyLocalPassword("Valid-Password-42", first)).resolves.toBe(true);
    await expect(verifyLocalPassword("Wrong-Password-42", first)).resolves.toBe(false);
  });

  it("rejects malformed hashes without throwing", async () => {
    await expect(verifyLocalPassword("Valid-Password-42", "invalid")).resolves.toBe(false);
  });
});
