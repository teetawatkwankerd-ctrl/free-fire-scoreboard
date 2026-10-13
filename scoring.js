export const PLACEMENT_POINTS = Object.freeze({
  1: 12, 2: 9, 3: 8, 4: 7, 5: 6, 6: 5,
  7: 4, 8: 3, 9: 2, 10: 1, 11: 0, 12: 0
});

export function placementPoints(placement) {
  const n = Number(placement);
  if (!Number.isInteger(n) || n < 1 || n > 12) throw new Error('อันดับต้องอยู่ระหว่าง 1–12');
  return PLACEMENT_POINTS[n];
}

export function roundTotal(placement, kills) {
  const k = Number(kills);
  if (!Number.isInteger(k) || k < 0) throw new Error('จำนวนคิวต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
  return placementPoints(placement) + k;
}

export function cumulativeScores(teams, scores) {
  const totals = new Map(teams.map(t => [t.id, 0]));
  for (const s of scores) totals.set(s.team_id, (totals.get(s.team_id) || 0) + Number(s.round_total || 0));
  return totals;
}

export function combinePlayerKills(players) {
  const seen = new Set();
  let total = 0;
  for (const p of players) {
    const id = String(p.playerId ?? p.name ?? '').trim().toLocaleLowerCase();
    if (!id) throw new Error('ผู้เล่นแต่ละคนต้องมีชื่อหรือรหัสเพื่อป้องกันการนับซ้ำ');
    if (seen.has(id)) throw new Error(`พบผู้เล่นซ้ำ: ${p.name || p.playerId}`);
    seen.add(id);
    const kills = Number(p.kills);
    if (!Number.isInteger(kills) || kills < 0) throw new Error('คิวของผู้เล่นต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
    total += kills;
  }
  return total;
}

/** Stable display order: saved competition placement first, unscored teams last by team number. */
export function orderRoundRows(teams, scores) {
  const byTeam = new Map(scores.map(score => [score.team_id, score]));
  return [...teams].sort((a, b) => {
    const sa = byTeam.get(a.id), sb = byTeam.get(b.id);
    const pa = Number.isInteger(Number(sa?.placement)) ? Number(sa.placement) : Infinity;
    const pb = Number.isInteger(Number(sb?.placement)) ? Number(sb.placement) : Infinity;
    return pa - pb || a.team_number - b.team_number;
  });
}

/** Validate and aggregate player kills by team without counting a player identity twice. */
export function groupPlayerKillsByTeam(players) {
  const seen = new Set();
  const grouped = new Map();
  for (const p of players) {
    const identity = String(p.playerId ?? p.name ?? '').trim().toLocaleLowerCase();
    if (!identity) throw new Error('ผู้เล่นแต่ละคนต้องมีชื่อหรือรหัสเพื่อป้องกันการนับซ้ำ');
    if (seen.has(identity)) throw new Error(`พบผู้เล่นซ้ำ: ${p.name || p.playerId}`);
    seen.add(identity);
    if (!p.teamId) throw new Error('กรุณาเลือกทีมให้ผู้เล่นทุกคนก่อนบันทึก');
    const kills = Number(p.kills);
    if (!Number.isInteger(kills) || kills < 0) throw new Error('คิวของผู้เล่นต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
    grouped.set(p.teamId, (grouped.get(p.teamId) || 0) + kills);
  }
  return grouped;
}
