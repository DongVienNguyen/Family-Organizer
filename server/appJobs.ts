export type JobHandler = (signal: AbortSignal) => void | Promise<void>;
interface ScheduledJob {
  handler: JobHandler;
  everyMs: number;
  initialMs?: number;
  timer?: ReturnType<typeof setTimeout>;
  active?: Promise<void>;
  controller?: AbortController;
  hasStarted?: boolean;
}

/** Process scheduling only. I01 adds persistent leases/retry using this registry. */
export class AppJobs {
  private jobs = new Map<string, ScheduledJob>();
  private running = false;
  private stopped = false;
  constructor(private onError: (error: unknown, key: string) => void = (error, key) => console.error(`Job ${key} failed`, error)) {}

  registerAppJob(namespace: string, type: string, handler: JobHandler, schedule: { everyMs: number; initialMs?: number }): void {
    const key = `${namespace}:${type}`;
    if (!namespace || !type || namespace.includes(':') || type.includes(':')) throw new Error('Invalid job namespace/type');
    if (this.running || this.stopped) throw new Error('Register jobs before starting');
    if (this.jobs.has(key)) throw new Error(`Job already registered: ${key}`);
    if (!(schedule.everyMs > 0) || !Number.isFinite(schedule.everyMs) || (schedule.initialMs !== undefined && !(schedule.initialMs >= 0))) throw new Error('Invalid job interval');
    this.jobs.set(key, { handler, ...schedule });
  }

  private schedule(key: string, job: ScheduledJob, ms: number): void {
    if (!this.running) return;
    job.timer = setTimeout(() => {
      job.timer = undefined;
      if (!this.running) return;
      job.hasStarted = true;
      job.controller = new AbortController();
      job.active = Promise.resolve().then(() => job.handler(job.controller!.signal))
        .catch(error => this.onError(error, key))
        .finally(() => {
          job.active = undefined;
          job.controller = undefined;
          this.schedule(key, job, job.everyMs);
        });
    }, ms);
  }

  start(): void { this.resume(); }
  resume(): void {
    if (this.stopped) throw new Error('Job registry stopped');
    if (this.running) return;
    if ([...this.jobs.values()].some(job => job.active)) throw new Error('Active jobs have not drained');
    this.running = true;
    for (const [key, job] of this.jobs) this.schedule(key, job, job.hasStarted ? job.everyMs : job.initialMs ?? job.everyMs);
  }
  async pause(): Promise<void> {
    this.running = false;
    for (const job of this.jobs.values()) {
      clearTimeout(job.timer);
      job.timer = undefined;
      job.controller?.abort();
    }
    await Promise.all([...this.jobs.values()].map(job => job.active));
  }
  async stop(): Promise<void> { this.stopped = true; await this.pause(); }
}
