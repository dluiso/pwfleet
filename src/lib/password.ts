import crypto from "node:crypto";

const version = "v1";
const cost = 32_768;
const blockSize = 8;
const parallelization = 1;
const keyLength = 64;
const maxMemory = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      keyLength,
      { N: cost, r: blockSize, p: parallelization, maxmem: maxMemory },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

export function validateLocalPassword(password: string): boolean {
  return password.length >= 12
    && password.length <= 128
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /[0-9]/.test(password)
    && /[^a-zA-Z0-9]/.test(password);
}

export async function hashLocalPassword(password: string): Promise<string> {
  if (!validateLocalPassword(password)) {
    throw new Error("The password does not meet the local authentication policy.");
  }
  const salt = crypto.randomBytes(24);
  const derived = await derive(password, salt);
  return ["scrypt", version, String(cost), String(blockSize), String(parallelization), salt.toString("base64url"), derived.toString("base64url")].join("$");
}

export async function verifyLocalPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 7) return false;
  const [algorithm, encodedVersion, encodedCost, encodedBlockSize, encodedParallelization, saltText, hashText] = parts;
  if (algorithm !== "scrypt" || encodedVersion !== version) return false;
  if (encodedCost !== String(cost) || encodedBlockSize !== String(blockSize) || encodedParallelization !== String(parallelization)) return false;
  try {
    const salt = Buffer.from(saltText!, "base64url");
    const expected = Buffer.from(hashText!, "base64url");
    if (salt.length !== 24 || expected.length !== keyLength) return false;
    const actual = await derive(password, salt);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
