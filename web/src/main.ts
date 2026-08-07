import { loadIndex, loadSeason, renderAtlas, type AtlasGame, type AtlasSeason } from "./atlas";
import { Replay, type FlowEvent, type GameMeta, secFromStart } from "./replay";
import { searchPlayers, gamesForPlayer } from "./players";
import { loadBoards, renderPrecedents } from "./precedents";
import { q } from "./db";

const app = document.getElementById("app")!;
const status = document.getElementById("status")!;
const search = document.getElementById("player-search") as HTMLInputElement;

function setStatus(s: string): void {
  status.textContent = s;
}

function escapeId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "");
}

// ── views ──────────────────────────────────────────────────────────────

async function viewAtlas(glow?: Set<string>): Promise<() => void> {
  setStatus("loading atlas…");
  app.innerHTML = `<div id="atlas-wrap"></div>`;
  const idx = await loadIndex();
  const seasons: AtlasSeason[] = [];
  for (const s of idx.seasons) {
    const data = await loadSeason(s);
    seasons.push(data);
    setStatus(`atlas ${seasons.length}/${idx.seasons.length} seasons…`);
  }
  const wrap = app.firstElementChild as HTMLElement;
  renderAtlas(wrap, seasons, {
    glowGameIds: glow,
    onGame: (g: AtlasGame) => {
      location.hash = `#/game/${escapeId(g.id)}`;
    },
  });
  setStatus(`${idx.seasons.length} seasons · ready`);
  return () => { app.innerHTML = ""; };
}

function parsePermalink(hash: string): { gameId?: string; seek?: { period: number; clock: number } } {
  // #/game/<id>[/Q<period>/<clock>]
  const m = hash.match(/^#\/game\/([^/]+)(?:\/(Q\d+|OT\d+)\/(\d+))?$/);
  if (!m) return {};
  const seek = m[2] && m[3] != null
    ? { period: m[2].startsWith("OT") ? 4 + parseInt(m[2].slice(2), 10) : parseInt(m[2].slice(1), 10),
        clock: parseInt(m[3], 10) }
    : undefined;
  return { gameId: decodeURIComponent(m[1]), seek };
}

async function gameFromDateTeams(route: string): Promise<{ gameId: string; seek?: { period: number; clock: number } } | null> {
  // #/YYYY-MM-DD/HOME-AWAY[/Q4/37]
  const m = route.match(/^#\/(\d{4}-\d{2}-\d{2})\/([A-Za-z0-9_-]+)-([A-Za-z0-9_-]+)(?:\/(Q\d+|OT\d+)\/(\d+))?$/);
  if (!m) return null;
  const rows = await q<{ game_id: string }>(
    `SELECT game_id FROM '${"data/games.parquet"}' WHERE game_date = ? AND home_team_id = ? AND away_team_id = ? LIMIT 1`,
    m[1], m[2], m[3],
  );
  if (!rows.length) return null;
  const seek = m[4] && m[5] != null
    ? { period: m[4].startsWith("OT") ? 4 + parseInt(m[4].slice(2), 10) : parseInt(m[4].slice(1), 10),
        clock: parseInt(m[5], 10) }
    : undefined;
  return { gameId: rows[0].game_id, seek };
}

async function viewGame(gameId: string, seek?: { period: number; clock: number }): Promise<() => void> {
  setStatus("loading game…");
  const [metaRows, flow] = await Promise.all([
    q<GameMeta>(`SELECT * FROM '${"data/games.parquet"}' WHERE game_id = ? LIMIT 1`, gameId),
    q<FlowEvent>(`SELECT * FROM '${"data/flow/*.parquet"}' WHERE game_id = ? ORDER BY seq`, gameId),
  ]);
  if (!metaRows.length) {
    app.innerHTML = `<div id="precedents-view"><h2>Game not found</h2><p><a href="#/">back to the Atlas</a></p></div>`;
    return () => { app.innerHTML = ""; };
  }
  const meta = metaRows[0]!;
  app.innerHTML = `
    <div id="game-view">
      <canvas id="replay-canvas"></canvas>
      <div id="game-frame"></div>
      <div class="controls">
        <button id="btn-play">▶ Play</button>
        <button id="btn-45">45s</button>
        <button id="btn-1x">1x</button>
        <button id="btn-8x">8x</button>
        <button id="btn-wp">⚡ Stakes</button>
        <input id="scrub" class="scrub" type="range" min="0" max="1000" value="0" />
        <button id="btn-copy">🔗 Copy moment link</button>
      </div>
      <div class="era-badge">${meta.season_id}${meta.overtime_periods ? " · OT" : ""}</div>
    </div>`;
  const canvas = document.getElementById("replay-canvas") as HTMLCanvasElement;
  const frame = document.getElementById("game-frame") as HTMLElement;
  const scrub = document.getElementById("scrub") as HTMLInputElement;
  const btnPlay = document.getElementById("btn-play") as HTMLButtonElement;
  const btn45 = document.getElementById("btn-45") as HTMLButtonElement;
  const btn1x = document.getElementById("btn-1x") as HTMLButtonElement;
  const btn8x = document.getElementById("btn-8x") as HTMLButtonElement;
  const btnWp = document.getElementById("btn-wp") as HTMLButtonElement;
  const btnCopy = document.getElementById("btn-copy") as HTMLButtonElement;

  let speed: "45s" | "1x" | "2x" | "8x" = "45s";
  let showWp = false;
  let replay: Replay | null = null;
  const isPlaying = () => replay !== null && replay.playing;
  const build = () => {
    const last = flow[flow.length - 1];
    const maxT = last ? secFromStart(last.period, last.clock_remaining_s) : 0;
    replay?.stop();
    replay = new Replay(flow, meta, canvas, frame, {
      speed, showWp, seekClock: seek,
      onTick: (_e, t) => {
        scrub.value = String(Math.round((t / Math.max(1, maxT)) * 1000));
        if (flow.length) {
          const ev = replay!.eventAt(t);
          const clock = ev?.clock_remaining_s != null ? Math.round(ev.clock_remaining_s) : 0;
          const period = ev?.period ?? 1;
          location.hash = `#/game/${escapeId(gameId)}/Q${period}/${clock}`;
        }
      },
    });
    replay.draw();
  };
  build();

  btnPlay.addEventListener("click", () => {
    if (!isPlaying()) { replay?.start(); btnPlay.textContent = "⏸ Pause"; }
    else { replay?.stop(); btnPlay.textContent = "▶ Play"; }
  });
  const setSpeed = (s: typeof speed) => { speed = s; build(); };
  btn45.addEventListener("click", () => setSpeed("45s"));
  btn1x.addEventListener("click", () => setSpeed("1x"));
  btn8x.addEventListener("click", () => setSpeed("8x"));
  btnWp.addEventListener("click", () => { showWp = !showWp; btnWp.style.borderColor = showWp ? "#d8f34e" : ""; build(); });
  scrub.addEventListener("input", () => {
    const last = flow[flow.length - 1];
    const maxT = last ? secFromStart(last.period, last.clock_remaining_s) : 0;
    replay?.stop();
    btnPlay.textContent = "▶ Play";
    replay?.seekTo((parseInt(scrub.value, 10) / 1000) * maxT);
  });
  btnCopy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(location.href);
    btnCopy.textContent = "✓ copied";
    setTimeout(() => (btnCopy.textContent = "🔗 Copy moment link"), 1200);
  });
  setStatus("replay ready");
  return () => { replay?.destroy(); app.innerHTML = ""; };
}

async function viewPrecedents(): Promise<() => void> {
  setStatus("loading precedents…");
  const boards = await loadBoards();
  if (!app) return () => {};
  renderPrecedents(app, boards, (gameId) => {
    location.hash = `#/game/${escapeId(gameId)}`;
  });
  setStatus("precedents ready");
  return () => { app.innerHTML = ""; };
}

// ── router ─────────────────────────────────────────────────────────────

let cleanup: (() => void) | null = null;

async function route(): Promise<void> {
  cleanup?.();
  cleanup = null;
  const hash = location.hash || "#/";
  try {
    if (hash.startsWith("#/precedents")) {
      cleanup = await viewPrecedents();
      return;
    }
    const dateRoute = await gameFromDateTeams(hash);
    if (dateRoute) {
      cleanup = await viewGame(dateRoute.gameId, dateRoute.seek);
      return;
    }
    const perm = parsePermalink(hash);
    if (perm.gameId) {
      cleanup = await viewGame(perm.gameId, perm.seek);
      return;
    }
    cleanup = await viewAtlas();
  } catch (e) {
    setStatus(`error: ${String(e).slice(0, 200)}`);
    app.innerHTML = `<div id="precedents-view"><p>Something went wrong. <a href="#/">Reload the atlas.</a></p></div>`;
  }
}

window.addEventListener("hashchange", () => void route());
route();

// player constellation — search overlay on the atlas
let glowTimer: number | null = null;
search.addEventListener("input", async () => {
  if (glowTimer) window.clearTimeout(glowTimer);
  const term = search.value.trim();
  if (term.length < 2) { await route(); return; }
  glowTimer = window.setTimeout(async () => {
    const hits = await searchPlayers(term);
    if (!hits.length) { await route(); return; }
    const slug = hits[0]!.bbref_slug;
    const games = await gamesForPlayer(slug);
    setStatus(`career glow: ${hits[0]!.full_name || hits[0]!.common_name || slug} — ${games.size} games`);
    cleanup?.();
    cleanup = await viewAtlas(games);
  }, 350);
});
