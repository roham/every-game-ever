// The Atlas — every game as a flow line, tiled by season.
export interface AtlasGame {
  id: string;
  d: string;        // date
  h: string;        // home team id
  a: string;        // away team id
  hs: number;
  as: number;
  m: number[];      // downsampled margins (home - away), chronological
}
export interface AtlasSeason {
  season: string;
  games: AtlasGame[];
}

let DPR = Math.min(2, window.devicePixelRatio || 1);

export async function loadIndex(): Promise<{ seasons: string[]; counts: Record<string, number> }> {
  const r = await fetch(`atlas/index.json`);
  return r.json();
}

export async function loadSeason(season: string): Promise<AtlasSeason> {
  const r = await fetch(`atlas/${season}.json`);
  return r.json();
}

export function drawGameLine(
  canvas: HTMLCanvasElement,
  game: AtlasGame,
  opts: { highlight?: boolean; glow?: boolean } = {},
): void {
  const w = canvas.clientWidth || 600;
  const h = canvas.clientHeight || 40;
  canvas.width = w * DPR;
  canvas.height = h * DPR;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(DPR, DPR);
  ctx.clearRect(0, 0, w, h);
  const m = game.m;
  if (!m.length) {
    ctx.fillStyle = "#252b36";
    ctx.fillRect(0, h / 2 - 1, w, 2);
    return;
  }
  const range = Math.max(30, ...m.map(Math.abs));
  const mid = h / 2;
  const step = w / (m.length - 1 || 1);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = opts.glow ? "rgba(216,243,78,0.9)" : (opts.highlight ? "#ff6a3d" : "#6f7684");
  ctx.beginPath();
  for (let i = 0; i < m.length; i++) {
    const x = i * step;
    const y = mid - (m[i] / range) * (h / 2 - 3);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  // zero line
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();
}

export function renderAtlas(
  mount: HTMLElement,
  seasons: AtlasSeason[],
  opts: { glowGameIds?: Set<string>; onGame?: (g: AtlasGame) => void } = {},
): void {
  mount.innerHTML = "";
  const scroll = document.createElement("div");
  scroll.id = "atlas-scroll";
  const total = seasons.reduce((n, s) => n + s.games.length, 0);
  const note = document.createElement("div");
  note.id = "constellation-note";
  note.textContent = opts.glowGameIds ? "" :
    `Every game ever — ${total.toLocaleString()} games, ${seasons.length} seasons. Click any line.`;
  mount.appendChild(note);

  for (const s of seasons) {
    const row = document.createElement("div");
    row.className = "season-row";
    const label = document.createElement("div");
    label.className = "season-label";
    label.textContent = s.season.replace(/^(NBA|BAA|ABA)_/, "");
    const cv = document.createElement("canvas");
    cv.className = "season-canvas";
    row.appendChild(label);
    row.appendChild(cv);
    scroll.appendChild(row);

    // draw all games of the season into one strip
    row.addEventListener("click", (e) => {
      if (!opts.onGame) return;
      const rect = cv.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const g = s.games[Math.min(s.games.length - 1, Math.max(0, Math.floor((x / rect.width) * s.games.length)))];
      opts.onGame(g);
    });
    row.addEventListener("mousemove", (e) => {
      const rect = cv.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const i = Math.min(s.games.length - 1, Math.max(0, Math.floor((x / rect.width) * s.games.length)));
      const g = s.games[i];
      label.textContent =
        `${s.season.replace(/^(NBA|BAA|ABA)_/, "")} · ${g.d} ${g.h}-${g.a} ${g.hs}-${g.as}`;
      label.style.color = "#fff";
    });
    row.addEventListener("mouseleave", () => {
      label.textContent = s.season.replace(/^(NBA|BAA|ABA)_/, "");
      label.style.color = "";
    });

    const w = cv.clientWidth || 700;
    const h = 40;
    cv.width = w * DPR;
    cv.height = h * DPR;
    const ctx = cv.getContext("2d")!;
    ctx.scale(DPR, DPR);
    ctx.clearRect(0, 0, w, h);
    const n = s.games.length;
    const per = w / n;
    for (let i = 0; i < n; i++) {
      const g = s.games[i];
      const m = g.m;
      if (!m.length) continue;
      const range = Math.max(30, ...m.map(Math.abs));
      const mid = h / 2;
      ctx.lineWidth = 1;
      const glow = opts.glowGameIds?.has(g.id);
      ctx.strokeStyle = glow ? "rgba(216,243,78,0.85)" : "rgba(128,136,150,0.55)";
      ctx.beginPath();
      const x0 = i * per + per / 2;
      const xstep = per / (m.length - 1 || 1);
      for (let j = 0; j < m.length; j++) {
        const x = x0 - per / 2 + j * xstep;
        const y = mid - (m[j] / range) * (h / 2 - 3);
        j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  mount.appendChild(scroll);
}
