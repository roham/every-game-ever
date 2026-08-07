// The Time Machine — replay any game from its flow, with stakes.
import { q, P } from "./db";

export interface FlowEvent {
  game_id: string;
  period: number;
  clock_remaining_s: number | null;
  home_score: number;
  away_score: number;
  margin: number;
  event: string;
  seq: number;
}
export interface GameMeta {
  game_id: string;
  game_date: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  overtime_periods: number | null;
  season_id: string;
}

export function eraOf(seasonId: string): string {
  const y = parseInt(seasonId.match(/(19|20)\d{2}/)?.[0] ?? "2000", 10);
  if (y < 1980) return "pre80";
  if (y <= 1995) return "80-95";
  if (y <= 2013) return "96-13";
  return "14-now";
}

export function secFromStart(period: number, clock: number | null): number {
  if (clock == null) return 999_999_999;
  if (period <= 4) return (period - 1) * 720 + (720 - Math.round(clock));
  return 2880 + (period - 5) * 300 + (300 - Math.round(clock));
}

let wpCache: Map<string, { prob: number; n: number; inherited: string }> | null = null;

async function loadWp(): Promise<void> {
  if (wpCache) return;
  const rows = await q<{ era: string; period: number; sec_bucket: number; margin_bucket: number; prob_home: number; n: number; inherited: string }>(
    `SELECT era, period, sec_bucket, margin_bucket, prob_home, n, inherited FROM '${P("data/wp.parquet")}'`,
  );
  wpCache = new Map();
  for (const r of rows) {
    wpCache.set(`${r.era}|${r.period}|${r.sec_bucket}|${r.margin_bucket}`, {
      prob: r.prob_home, n: r.n, inherited: r.inherited,
    });
  }
}

export function wpAt(era: string, period: number, sec: number, margin: number): { prob: number; n: number; inherited: string } | null {
  if (!wpCache) return null;
  const bucket = Math.round(sec / 24) * 24;
  // pipeline buckets margins into 3-point windows
  const m = Math.max(-30, Math.min(30, Math.round(margin / 3) * 3));
  return wpCache.get(`${era}|${period}|${bucket}|${m}`) ?? null;
}

export interface ReplayOptions {
  speed: "45s" | "1x" | "2x" | "8x";
  showWp: boolean;
  homeAbbr: string;
  awayAbbr: string;
  seekClock?: { period: number; clock: number }; // moment permalink target
  onTick?: (e: FlowEvent | null, t: number) => void;
}

const PERIOD_NAMES: Record<number, string> = { 1: "Q1", 2: "Q2", 3: "Q3", 4: "Q4", 5: "OT1", 6: "OT2", 7: "OT3", 8: "OT4", 9: "OT5", 10: "OT6" };

export class Replay {
  events: FlowEvent[];
  meta: GameMeta;
  canvas: HTMLCanvasElement;
  frame: HTMLElement;
  opts: ReplayOptions;
  playing = false;
  private t = 0;             // playhead (game seconds)
  private raf = 0;
  private lastTs = 0;
  private scale: number;     // real ms per game second
  private wpLoaded: Promise<void> | null = null;

  constructor(events: FlowEvent[], meta: GameMeta, canvas: HTMLCanvasElement, frame: HTMLElement, opts: ReplayOptions) {
    this.events = events;
    this.meta = meta;
    this.canvas = canvas;
    this.frame = frame;
    this.opts = opts;
    const evSec = (e: FlowEvent): number =>
      e.clock_remaining_s == null ? 0 : secFromStart(e.period, e.clock_remaining_s);
    const total = Math.max(1, ...events.map(evSec));
    this.scale = opts.speed === "1x" ? 1000 : opts.speed === "2x" ? 500 : opts.speed === "8x" ? 125 : 45_000 / total;
    if (opts.seekClock) this.t = secFromStart(opts.seekClock.period, opts.seekClock.clock);
    if (opts.showWp) {
      this.wpLoaded = loadWp().then(() => this.draw());
    }
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;
    this.lastTs = performance.now();
    const loop = (ts: number) => {
      if (!this.playing) return;
      const dt = ts - this.lastTs;
      this.lastTs = ts;
      this.t += dt / this.scale;            // scale = real ms per game-second
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }

  seekTo(sec: number): void {
    this.t = Math.max(0, sec);
    this.draw();
  }

  seekToClock(period: number, clock: number): void {
    const sec = secFromStart(period, clock);
    if (Math.abs(sec - this.t) > 2) {
      this.t = Math.max(0, sec);
      this.draw();
    }
  }

  eventAt(t: number): FlowEvent | null {
    let ev: FlowEvent | null = null;
    for (let i = 0; i < this.events.length; i++) {
      if (secFromStart(this.events[i].period, this.events[i].clock_remaining_s) <= t) ev = this.events[i];
      else break;
    }
    return ev;
  }

  draw(): void {
    const w = this.canvas.clientWidth || 800;
    const h = this.canvas.clientHeight || 360;
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = w * DPR;
    this.canvas.height = h * DPR;
    const ctx = this.canvas.getContext("2d")!;
    ctx.scale(DPR, DPR);
    ctx.clearRect(0, 0, w, h);

    const ev = this.eventAt(this.t);
    const last = this.events[this.events.length - 1];
    const maxT = secFromStart(last.period, last.clock_remaining_s);

    // margin line (all events, dim) + played portion (bright)
    const range = Math.max(30, ...this.events.map((e) => Math.abs(e.margin)));
    const mid = h * 0.52;
    const n = this.events.length;
    const xAt = (t: number) => (t / maxT) * (w - 40) + 20;

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(128,136,150,0.35)";
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = xAt(secFromStart(this.events[i].period, this.events[i].clock_remaining_s));
      const y = mid - (this.events[i].margin / range) * (h / 2 - 28);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // played prefix
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = ev ? (ev.margin >= 0 ? "#ff6a3d" : "#3aa0ff") : "#444";
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const et = secFromStart(this.events[i].period, this.events[i].clock_remaining_s);
      if (et > this.t && i > 0) break;
      const x = xAt(et);
      const y = mid - (this.events[i].margin / range) * (h / 2 - 28);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // wp overlay
    if (this.opts.showWp && this.wpLoaded) {
      const era = eraOf(this.meta.season_id);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = "rgba(216,243,78,0.75)";
      ctx.beginPath();
      let started = false;
      for (let s = 0; s <= Math.min(this.t, maxT); s += 24) {
        const evS = this.eventAt(s);
        const wq = evS ? wpAt(era, evS.period, s, evS.margin) : null;
        if (!wq) continue;
        const x = xAt(s);
        const y = h - 18 - wq.prob * (h / 2 - 30);
        started ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), (started = true));
      }
      if (started) ctx.stroke();
      ctx.fillStyle = "rgba(216,243,78,0.9)";
      ctx.font = "11px system-ui";
      ctx.fillText("home win prob", w - 130, h - 8);
    }

    // zero line
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(20, mid);
    ctx.lineTo(w - 20, mid);
    ctx.stroke();

    // playhead
    const px = xAt(Math.min(this.t, maxT));
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, 8);
    ctx.lineTo(px, h - 8);
    ctx.stroke();

    // scoreboard + caption in DOM
    const period = ev ? (PERIOD_NAMES[ev.period] ?? `P${ev.period}`) : "";
    const clock = ev && ev.clock_remaining_s != null
      ? `${Math.floor(ev.clock_remaining_s / 60)}:${String(Math.round(ev.clock_remaining_s) % 60).padStart(2, "0")}`
      : "--:--";
    this.frame.innerHTML = `
      <div class="game-meta">${period} · ${clock} · ${this.meta.game_date}</div>
      <div class="scoreboard">
        <div class="h"><span class="team-name">${this.opts.homeAbbr}</span>${ev ? ev.home_score : this.meta.home_score}</div>
        <div class="clock">${this.opts.showWp && ev ? (() => { const w = wpAt(eraOf(this.meta.season_id), ev.period, secFromStart(ev.period, ev.clock_remaining_s), ev.margin); return w ? Math.round(w.prob * 100) + "% home" : "·"; })() : "·"}</div>
        <div class="a"><span class="team-name">${this.opts.awayAbbr}</span>${ev ? ev.away_score : this.meta.away_score}</div>
      </div>
      <div class="caption">${this.caption(ev)}</div>`;
    this.opts.onTick?.(ev, this.t);
  }

  private caption(ev: FlowEvent | null): string {
    if (!ev) return "…";
    const wp = this.opts.showWp
      ? wpAt(eraOf(this.meta.season_id), ev.period, secFromStart(ev.period, ev.clock_remaining_s), ev.margin)
      : null;
    if (!wp) return "";
    const trail = ev.margin < 0 ? "trailing team" : (ev.margin > 0 ? "home team" : "tied");
    const wins = Math.round(wp.prob * wp.n);
    const pct = Math.round((wins / wp.n) * 1000) / 10;
    const other = Math.round(((wp.n - wins) / wp.n) * 1000) / 10;
    return `<b>${ev.margin <= 0 ? Math.abs(ev.margin) : ev.margin} ${ev.margin === 0 ? "— tied" : ev.margin < 0 ? "down" : "up"}</b> — this exact spot has happened <b>${wp.n.toLocaleString()} times</b>; the ${trail} won <b>${wins.toLocaleString()}</b> (${pct}%), the other side ${other}% of the time.`;
  }

  destroy(): void {
    this.stop();
  }
}
