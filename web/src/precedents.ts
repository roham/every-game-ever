// Precedent leaderboards — the corpus judging its own history.
import { q, P } from "./db";

export interface PrecedentRow {
  game_id: string;
  precedent: string;
  rank: number;
  value: number;
  game_date: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  home_abbr?: string | null;
  away_abbr?: string | null;
}

const NAMES: Record<string, { title: string; desc: string; fmt: (v: number) => string }> = {
  comeback_15: { title: "Biggest comebacks", desc: "Trailed by the most, won anyway.", fmt: (v) => `trailed by ${Math.round(v)}` },
  lead_changes_max: { title: "Most lead changes", desc: "Games that swung hardest.", fmt: (v) => `${Math.round(v)} lead changes` },
  blowout_max: { title: "Biggest blowouts", desc: "Won by the most.", fmt: (v) => `won by ${Math.round(v)}` },
  highest_scoring: { title: "Highest-scoring games", desc: "Most combined points ever.", fmt: (v) => `${Math.round(v)} total points` },
};

export async function loadBoards(): Promise<Record<string, PrecedentRow[]>> {
  const rows = await q<PrecedentRow>(`SELECT * FROM '${P("data/precedents.parquet")}'`);
  const out: Record<string, PrecedentRow[]> = {};
  for (const r of rows) (out[r.precedent] ??= []).push(r);
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.rank - b.rank);
  return out;
}

export function renderPrecedents(
  mount: HTMLElement,
  boards: Record<string, PrecedentRow[]>,
  onGame: (gameId: string) => void,
): void {
  mount.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.id = "precedents-view";
  for (const [key, rows] of Object.entries(boards)) {
    const meta = NAMES[key];
    if (!meta) continue;
    const card = document.createElement("div");
    card.className = "precedent-card";
    card.innerHTML = `<h2>${meta.title}</h2><p>${meta.desc}</p>`;
    const table = document.createElement("table");
    table.className = "board";
    table.innerHTML = `<thead><tr><th>#</th><th>Date</th><th>Matchup</th><th>Score</th><th></th></tr></thead>`;
    const tbody = document.createElement("tbody");
    for (const r of rows.slice(0, 10)) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.rank}</td><td>${r.game_date ?? ""}</td><td>${r.home_abbr ?? r.home_team_id} vs ${r.away_abbr ?? r.away_team_id}</td>
        <td>${r.home_score}-${r.away_score}</td><td>${Number.isFinite(r.value) ? meta.fmt(r.value) : ""}</td>`;
      tr.addEventListener("click", () => onGame(r.game_id));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    card.appendChild(table);
    wrap.appendChild(card);
  }
  mount.appendChild(wrap);
}
