import { describe, expect, it } from "vitest";
import { discoverOidc, identityFromClaims } from "./oidc";

describe("OIDC identity claims", () => {
  it("marks only an explicitly verified email as eligible for first binding", () => {
    expect(identityFromClaims({ sub: "subject", email: "User@Example.gov", email_verified: true }).emailVerified).toBe(true);
    expect(identityFromClaims({ sub: "subject", email: "user@example.gov" }).emailVerified).toBe(false);
  });

  it("does not reinterpret username or UPN claims as verified email", () => {
    expect(identityFromClaims({ sub: "subject", preferred_username: "user@example.gov" })).toMatchObject({ email: null, emailVerified: false });
    expect(identityFromClaims({ sub: "subject", upn: "user@example.gov" })).toMatchObject({ email: null, emailVerified: false });
  });

  it("uses the immutable Entra object ID when it is present", () => {
    expect(identityFromClaims({
      sub: "application-specific-subject",
      oid: "A62D607B-033D-4B96-9D66-3015BD250F45",
    }).subject).toBe("a62d607b-033d-4b96-9d66-3015bd250f45");
  });

  it("rejects discovery outside the approved Microsoft identity host", async () => {
    await expect(discoverOidc({ mode: "oidc", issuer: "https://identity.attacker.invalid/tenant/v2.0", clientId: "client", clientSecret: "secret", clientAuthMethod: "client_secret_basic", scopes: "openid profile email", clockToleranceSeconds: 30 }, true)).rejects.toThrow(/approved Microsoft identity host/);
  });
});
