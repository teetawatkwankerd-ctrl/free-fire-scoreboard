function csvCell(value) {
  const s = String(value ?? '');
  return `"${s.replaceAll('"', '""')}"`;
}
export function downloadText(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob(['\ufeff', content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function rowsToCsv(rows) {
  const headers = ['อันดับการแข่งขัน','ชื่อทีม','ตัวแทนทีม','คะแนนอันดับ','คิวรวมทีม','คะแนนรวมรอบ','คะแนนสะสม'];
  const lines = [headers, ...rows.map(r => [
    r.placement ?? '', r.team?.name ?? '', r.team?.representative ?? '',
    r.placement_points ?? '', r.kills ?? '', r.round_total ?? '', r.cumulative ?? 0
  ])];
  return lines.map(row => row.map(csvCell).join(',')).join('\r\n');
}
export function rowsToTxt(rows, roundName) {
  return [`FREE FIRE TOURNAMENT SCOREBOARD — ${roundName}`, '',
    ...rows.map(r => `อันดับ ${r.placement} — ${r.team?.name || 'ยังไม่ตั้งชื่อทีม'}\nตัวแทนทีม: ${r.team?.representative || '-'}\nคะแนนอันดับ: ${r.placement_points} คะแนน\nคิวรวมทั้งทีม: ${r.kills} คิว\nคะแนนรวมรอบ: ${r.round_total} คะแนน\nคะแนนสะสม: ${r.cumulative || 0} คะแนน\n`)
  ].join('\n');
}