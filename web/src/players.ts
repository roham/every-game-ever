// Career constellation — every game a player ever played, glowing across the Atlas.
import { q, P, PLAYER_GAME_FILES } from "./db";

export interface PublicPlayer {
  bbref_slug: string;
  full_name: string | null;
  common_name: string | null;
  debut_date: string | null;
  final_game_date: string | null;
  primary_position: string | null;
  is_hall_of_fame: boolean | null;
}

let playerIndex: PublicPlayer[] | null = null;

export async function getAllPlayers(): Promise<PublicPlayer[]> {
  if (playerIndex) return playerIndex;
  playerIndex = await q<PublicPlayer>(
    `SELECT * FROM '${P("data/players-public.parquet")}'`,
  );
  return playerIndex;
}

export async function searchPlayers(term: string, limit = 8): Promise<PublicPlayer[]> {
  const all = await getAllPlayers();
  const t = term.toLowerCase();
  return all
    .filter((p) => (p.full_name || p.common_name || p.bbref_slug).toLowerCase().includes(t))
    .slice(0, limit);
}

export async function gamesForPlayer(slug: string): Promise<Set<string>> {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(slug)) throw new Error(`unsafe slug: ${slug}`);
  const rows = await q<{ game_id: string }>(
    `SELECT game_id FROM read_parquet(${JSON.stringify(PLAYER_GAME_FILES)}) WHERE bbref_slug = '${slug}'`,
  );
  return new Set(rows.map((r) => r.game_id));
}
