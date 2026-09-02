import fs from "node:fs/promises";
import path from "node:path";
import { getEnvironment } from "./env";

export class UploadCapacityError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "UploadCapacityError";
  }
}

const state = { active: 0, queue: [] as Array<() => void> };

async function acquire(): Promise<void> {
  const env = getEnvironment();
  if (state.active < env.UPLOAD_PROCESSING_CONCURRENCY) {
    state.active += 1;
    return;
  }
  if (state.queue.length >= env.UPLOAD_PROCESSING_QUEUE_LIMIT) {
    throw new UploadCapacityError("File processing is busy. Try again shortly.", 503);
  }
  await new Promise<void>((resolve) => state.queue.push(resolve));
}

function release() {
  const next = state.queue.shift();
  if (next) next();
  else state.active -= 1;
}

export async function withUploadProcessingSlot<T>(work: () => Promise<T>): Promise<T> {
  await acquire();
  try { return await work(); } finally { release(); }
}

export async function acquireUploadProcessingLease(): Promise<() => void> {
  await acquire();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    release();
  };
}

export async function assertStorageCapacity(bytesToWrite: number): Promise<void> {
  const env = getEnvironment();
  const root = path.resolve(env.FILE_STORAGE_ROOT);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const stats = await fs.statfs(root);
  const freeBytes = Number(stats.bavail) * Number(stats.bsize);
  if (freeBytes - bytesToWrite < env.STORAGE_MIN_FREE_BYTES) {
    throw new UploadCapacityError("File storage is at its safety threshold. Contact an administrator.", 507);
  }
}
