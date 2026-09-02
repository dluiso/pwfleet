import { getEnvironment } from "@/lib/env";

const state = { active: 0, queue: [] as Array<() => void> };

export class ReportRenderCapacityError extends Error {
  readonly status = 503;

  constructor() {
    super("Report rendering capacity is temporarily full. Try again shortly.");
    this.name = "ReportRenderCapacityError";
  }
}

async function acquire() {
  const env = getEnvironment();
  if (state.active < env.REPORT_RENDER_CONCURRENCY) {
    state.active += 1;
    return;
  }
  if (state.queue.length >= env.REPORT_RENDER_QUEUE_LIMIT) throw new ReportRenderCapacityError();
  await new Promise<void>((resolve) => state.queue.push(resolve));
}

function release() {
  const next = state.queue.shift();
  if (next) next();
  else state.active -= 1;
}

export async function withReportRenderSlot<T>(work: () => Promise<T>): Promise<T> {
  await acquire();
  try { return await work(); } finally { release(); }
}
