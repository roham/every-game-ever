// Career constellation — every game a player ever played, glowing across the Atlas.
import { q } from "./db";

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
    `SELECT * FROM '${"data/players-public.parquet"}'`,
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
  const rows = await q<{ game_id: string }>(
    `SELECT game_id FROM '${"data/player_games/*.parquet"}' WHERE bbref_slug = ?`,
    slug,
  );
  return new Set(rows.map((r) => r.game_id));
}
