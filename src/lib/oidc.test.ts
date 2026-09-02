import { describe, expect, it } from "vitest";
import { identityFromClaims } from "./oidc";

describe("OIDC identity claims", () => {
  it("marks only an explicitly verified email as eligible for first binding", () => {
    expect(identityFromClaims({ sub: "subject", email: "User@Example.gov", email_verified: true }).emailVerified).toBe(true);
    expect(identityFromClaims({ sub: "subject", email: "user@example.gov" }).emailVerified).toBe(false);
  });

  it("does not reinterpret username or UPN claims as verified email", () => {
    expect(identityFromClaims({ sub: "subject", preferred_username: "user@example.gov" })).toMatchObject({ email: null, emailVerified: false });
    expect(identityFromClaims({ sub: "subject", upn: "user@example.gov" })).toMatchObject({ email: null, emailVerified: false });
  });
});
