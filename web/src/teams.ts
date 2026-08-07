import { q, P } from "./db";

let teamMap: Map<string, string> | null = null;

export async function teamAbbr(teamId: string | null | undefined): Promise<string> {
  if (teamId == null) return "??";
  if (!teamMap) {
    const rows = await q<{ team_id: string; abbreviation: string | null; bbref_slug: string | null; current_name: string | null }>(
      `SELECT team_id, abbreviation, bbref_slug, current_name FROM '${P("data/teams.parquet")}'`,
    );
    teamMap = new Map(
      rows.map((r) => [
        String(r.team_id),
        r.abbreviation || (r.bbref_slug ?? "").toUpperCase() ||
          (r.current_name ?? "").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "??",
      ]),
    );
  }
  return teamMap.get(String(teamId)) ?? String(teamId).replace(/^t_espn_/, "T").slice(0, 3).toUpperCase();
}
