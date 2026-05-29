/**
 * Gedeelde ProgressBar voor de bin/-CLIs. Schrijft naar stdout met TTY-aware
 * carriage-return updates óf gewone newline-output bij elke 5% bij non-TTY
 * (cron/log capture). Throttled op 100ms render-interval om geen ruis te
 * spammen bij snelle iteraties.
 */
export class ProgressBar {
  private startTime = Date.now();
  private lastRender = 0;

  constructor(
    private readonly total: number,
    private readonly label: string,
  ) {}

  update(current: number, extra?: string): void {
    const now = Date.now();
    if (current < this.total && now - this.lastRender < 100) return;
    this.lastRender = now;

    const elapsed = (now - this.startTime) / 1000;
    const rate = elapsed > 0 ? current / elapsed : 0;
    const remaining = this.total - current;
    const eta = rate > 0 ? remaining / rate : 0;
    const pct = (current / this.total) * 100;
    const barWidth = 30;
    const filled = Math.min(barWidth, Math.floor((current / this.total) * barWidth));
    const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);

    const line =
      `${this.label} ${bar} ${current}/${this.total}` +
      ` (${pct.toFixed(1)}%) · ${rate.toFixed(2)}/s · ETA ${formatEta(eta)}` +
      (extra ? ` · ${extra}` : "");

    if (process.stdout.isTTY) {
      process.stdout.write("\r\x1b[K" + line);
    } else if (current === this.total || current % Math.max(1, Math.floor(this.total / 20)) === 0) {
      process.stdout.write(line + "\n");
    }
  }

  finish(): void {
    if (process.stdout.isTTY) process.stdout.write("\n");
  }
}

function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h${m}m${s}s`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
}
