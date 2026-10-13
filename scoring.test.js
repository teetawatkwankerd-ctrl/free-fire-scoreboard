import { describe, it, expect } from 'vitest';
import { placementPoints, roundTotal, cumulativeScores, combinePlayerKills, groupPlayerKillsByTeam, orderRoundRows } from '../src/lib/scoring.js';

describe('คะแนนอันดับ Free Fire', () => {
  it('uses exactly the requested placement points', () => {
    expect(Array.from({length:12}, (_,i) => placementPoints(i+1))).toEqual([12,9,8,7,6,5,4,3,2,1,0,0]);
  });
  it('example: rank 1 and 10 kills equals 22, not 32', () => {
    expect(roundTotal(1,10)).toBe(22);
  });
  it('rejects invalid rank and negative/non-integer kills', () => {
    expect(() => placementPoints(0)).toThrow();
    expect(() => placementPoints(13)).toThrow();
    expect(() => roundTotal(1,-1)).toThrow();
    expect(() => roundTotal(1,1.2)).toThrow();
  });
  it('adds scores across all saved rounds for each team', () => {
    const result = cumulativeScores([{id:'a'},{id:'b'}], [
      {team_id:'a',round_total:22},{team_id:'a',round_total:5},{team_id:'b',round_total:12}
    ]);
    expect(result.get('a')).toBe(27);
    expect(result.get('b')).toBe(12);
  });
  it('combines four distinct player kill counts and rejects duplicate identities', () => {
    expect(combinePlayerKills([
      {playerId:'p1',kills:2},{playerId:'p2',kills:3},{playerId:'p3',kills:0},{playerId:'p4',kills:5}
    ])).toBe(10);
    expect(() => combinePlayerKills([{playerId:'same',kills:1},{playerId:'same',kills:2}])).toThrow();
  });
});

describe('ลำดับตารางและคิวจากผู้เล่น', () => {
  it('orders rows by competition placement, not by score total', () => {
    const teams = [{id:'a',team_number:1},{id:'b',team_number:2},{id:'c',team_number:3}];
    const scores = [{team_id:'a',placement:3,round_total:100},{team_id:'b',placement:1,round_total:1}];
    expect(orderRoundRows(teams,scores).map(t=>t.id)).toEqual(['b','a','c']);
  });
  it('groups four distinct player kills into team totals', () => {
    const result = groupPlayerKillsByTeam([
      {playerId:'p1',teamId:'a',kills:2},{playerId:'p2',teamId:'a',kills:3},
      {playerId:'p3',teamId:'a',kills:0},{playerId:'p4',teamId:'a',kills:5}
    ]);
    expect(result.get('a')).toBe(10);
  });
  it('rejects duplicate players and missing team mapping', () => {
    expect(() => groupPlayerKillsByTeam([
      {playerId:'same',teamId:'a',kills:1},{playerId:'same',teamId:'a',kills:2}
    ])).toThrow();
    expect(() => groupPlayerKillsByTeam([{playerId:'p1',teamId:'',kills:1}])).toThrow();
  });
});