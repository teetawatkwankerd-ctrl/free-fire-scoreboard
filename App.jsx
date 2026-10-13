import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from './lib/supabase.js';
import { roundTotal, cumulativeScores, groupPlayerKillsByTeam, orderRoundRows } from './lib/scoring.js';
import { downloadText, rowsToCsv, rowsToTxt } from './lib/export.js';
import { readScreenshot } from './lib/ocr.js';
import { Trophy, RefreshCw, Copy, Download, LogIn, LogOut, ShieldCheck, Plus, Trash2, ImageUp } from 'lucide-react';

const errorText = (e) => {
  const message = e?.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
  if (/duplicate key|unique constraint/i.test(message)) return 'ข้อมูลซ้ำ: ตรวจสอบชื่อทีม อันดับ หรือคะแนนรอบนี้';
  if (/row-level security|permission denied|not allowed/i.test(message)) return 'ไม่มีสิทธิ์ทำรายการนี้ กรุณาเข้าสู่ระบบด้วยบัญชีกรรมการ';
  if (/fetch|network/i.test(message)) return 'เชื่อมต่อฐานข้อมูลไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง';
  return message;
};

export default function App() {
  const [session, setSession] = useState(null);
  const [teams, setTeams] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [scores, setScores] = useState([]);
  const [selectedRound, setSelectedRound] = useState('');
  const [admin, setAdmin] = useState(false);
  const [tab, setTab] = useState('scores');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [roundName, setRoundName] = useState('');
  const [teamDrafts, setTeamDrafts] = useState({});
  const [scoreDrafts, setScoreDrafts] = useState({});
  const [ocr, setOcr] = useState(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrMode, setOcrMode] = useState('team');
  const [ocrTeam, setOcrTeam] = useState('');
  const [ocrPlacement, setOcrPlacement] = useState('1');
  const [ocrKills, setOcrKills] = useState('0');
  const [ocrPlayerLines, setOcrPlayerLines] = useState([]);
  const [ocrDuplicateConfirmed, setOcrDuplicateConfirmed] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!supabase) return;
    if (!quiet) setLoading(true);
    try {
      const [t, r, s] = await Promise.all([
        supabase.from('teams').select('*').order('team_number'),
        supabase.from('rounds').select('*').order('created_at'),
        supabase.from('scores').select('*, team:teams(*)')
      ]);
      for (const result of [t, r, s]) if (result.error) throw result.error;
      setTeams(t.data || []); setRounds(r.data || []); setScores(s.data || []);
      setLastUpdated(new Date());
      if (!selectedRound && r.data?.length) setSelectedRound(r.data[0].id);
      setMessage('');
    } catch (e) { setMessage(errorText(e)); }
    finally { if (!quiet) setLoading(false); }
  }, [selectedRound]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (supabase) load(); }, [load]);
  useEffect(() => {
    let cancelled = false;
    async function checkAdmin() {
      if (!session?.user?.id) { setAdmin(false); return; }
      const { data, error } = await supabase.from('admin_users').select('user_id').eq('user_id', session.user.id).maybeSingle();
      if (!cancelled) setAdmin(!error && Boolean(data));
    }
    checkAdmin();
    return () => { cancelled = true; };
  }, [session]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel('scoreboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => load(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => load(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds' }, () => load(true))
      .subscribe();
    const timer = setInterval(() => load(true), 20000);
    return () => { supabase.removeChannel(channel); clearInterval(timer); };
  }, [load]);

  const currentRound = rounds.find(r => r.id === selectedRound);
  const currentScores = useMemo(() => scores.filter(s => s.round_id === selectedRound), [scores, selectedRound]);
  const cumulative = useMemo(() => cumulativeScores(teams, scores), [teams, scores]);
  const rows = useMemo(() => {
    const byTeam = new Map(currentScores.map(s => [s.team_id, s]));
    return orderRoundRows(teams, currentScores).map(team => {
      const score = byTeam.get(team.id);
      return score ? { ...score, team, cumulative: cumulative.get(team.id) || 0 } :
        { id: '', team_id: team.id, round_id: selectedRound, placement: '', kills: 0, placement_points: 0, round_total: 0, team, cumulative: cumulative.get(team.id) || 0 };
    });
  }, [teams, currentScores, cumulative, selectedRound]);
  const cumulativeRanking = useMemo(() => [...teams].map(team => ({ team, total: cumulative.get(team.id) || 0 }))
    .sort((a,b) => b.total-a.total || a.team.team_number-b.team.team_number), [teams, cumulative]);

  async function signIn(e) {
    e.preventDefault(); setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage('เข้าสู่ระบบไม่สำเร็จ: ' + errorText(error));
    else { setPassword(''); setMessage('เข้าสู่ระบบแล้ว ระบบกำลังตรวจสอบสิทธิ์กรรมการ'); }
  }
  async function signOut() { await supabase.auth.signOut(); setAdmin(false); setMessage('ออกจากระบบแล้ว'); }

  async function saveTeam(team) {
    const draft = teamDrafts[team.id] || { name: team.name || '', representative: team.representative || '' };
    if (!draft.name.trim()) return setMessage('กรุณากรอกชื่อทีม');
    setLoading(true);
    const { error } = await supabase.from('teams').update({ name: draft.name.trim(), representative: draft.representative.trim() || null }).eq('id', team.id);
    setLoading(false);
    if (error) setMessage(errorText(error)); else { setMessage(`บันทึกทีมหมายเลข ${team.team_number} แล้ว`); await load(true); }
  }
  async function createRound(e) {
    e.preventDefault();
    if (!roundName.trim()) return setMessage('กรุณาตั้งชื่อรอบ');
    const { data, error } = await supabase.from('rounds').insert({ name: roundName.trim(), created_by: session.user.id }).select().single();
    if (error) setMessage(errorText(error));
    else { setRoundName(''); setSelectedRound(data.id); setMessage('เพิ่มรอบการแข่งขันแล้ว'); await load(true); }
  }
  async function saveScore(row) {
    if (!selectedRound) return setMessage('กรุณาเพิ่มรอบการแข่งขันก่อน');
    const draft = scoreDrafts[row.team_id] || {};
    const placement = Number(draft.placement ?? row.placement ?? '');
    const kills = Number(draft.kills ?? row.kills ?? 0);
    if (!Number.isInteger(placement) || placement < 1 || placement > 12) return setMessage('กรุณาเลือกอันดับการแข่งขัน 1–12');
    let total;
    try { total = roundTotal(placement, kills); } catch (e) { return setMessage(e.message); }
    const duplicate = currentScores.find(s => s.placement === placement && s.team_id !== row.team_id);
    if (duplicate) return setMessage(`อันดับ ${placement} ถูกใช้โดยทีม ${duplicate.team?.name || 'อื่น'} แล้ว กรุณาแก้หรือลบคะแนนทีมนั้นก่อน`);
    setLoading(true);
    const payload = { round_id: selectedRound, team_id: row.team_id, placement, kills };
    const result = row.id
      ? await supabase.from('scores').update(payload).eq('id', row.id)
      : await supabase.from('scores').insert(payload);
    setLoading(false);
    if (result.error) setMessage('บันทึกไม่สำเร็จ: ' + errorText(result.error));
    else { setMessage(`บันทึกคะแนนทีม ${row.team.name} แล้ว (${total} คะแนน)`); await load(true); }
  }
  async function deleteScore(row) {
    if (!row.id || !confirm(`ยืนยันลบคะแนนรอบนี้ของทีม ${row.team.name} ใช่หรือไม่?`)) return;
    const { error } = await supabase.from('scores').delete().eq('id', row.id);
    if (error) setMessage(errorText(error)); else { setMessage('ลบคะแนนแล้ว'); await load(true); }
  }
  async function deleteRound() {
    if (!currentRound || !confirm(`ยืนยันลบรอบ "${currentRound.name}" และคะแนนทั้งหมดในรอบนี้หรือไม่?`)) return;
    const { error } = await supabase.from('rounds').delete().eq('id', selectedRound);
    if (error) setMessage(errorText(error)); else { setSelectedRound(''); setMessage('ลบรอบแล้ว'); await load(true); }
  }
  async function copySummary() {
    const text = rows.filter(r => r.placement).sort((a,b) => a.placement-b.placement).map(r =>
      `อันดับ ${r.placement} — ทีม ${r.team.name}\nคะแนนอันดับ: ${r.placement_points} คะแนน\nคิวรวมทั้งทีม: ${r.kills} คิว\nคะแนนรวมรอบ: ${r.round_total} คะแนน\nคะแนนสะสม: ${r.cumulative} คะแนน`
    ).join('\n\n');
    if (!text) return setMessage('ยังไม่มีคะแนนให้คัดลอก');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement('textarea');
        area.value = text; area.setAttribute('readonly', '');
        area.style.position = 'fixed'; area.style.opacity = '0';
        document.body.appendChild(area); area.select();
        const copied = document.execCommand('copy'); area.remove();
        if (!copied) throw new Error('clipboard unavailable');
      }
      setMessage('คัดลอกสรุปคะแนนแล้ว');
    } catch { setMessage('คัดลอกไม่ได้ กรุณาอนุญาตการใช้ Clipboard หรือดาวน์โหลด TXT แทน'); }
  }
  async function processOcr(file) {
    setOcr(null); setOcrProgress(0); setOcrDuplicateConfirmed(false);
    try {
      const result = await readScreenshot(file, setOcrProgress);
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const fileHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      setOcr({ ...result, fileName: file.name, size: file.size, fileHash });
      setOcrPlayerLines(result.lines.map(line => ({ line, teamId: '', player: '', kills: '' })));
      setMessage(result.warning || 'อ่านภาพเสร็จแล้ว กรุณาตรวจสอบข้อมูลก่อนบันทึก');
    } catch (e) { setMessage(errorText(e)); }
  }
  async function saveOcrTeam() {
    if (!ocr || !ocrTeam || !selectedRound) return setMessage('กรุณาเลือกทีมและรอบก่อน');
    const fileKey = ocr.fileHash;
    const existing = scores.some(s => s.round_id === selectedRound && s.ocr_source === fileKey);
    if (existing && !ocrDuplicateConfirmed) return setMessage('อาจเป็นภาพเดิมที่เคยบันทึกแล้ว กรุณายืนยันว่าไม่ได้บันทึกซ้ำ');
    const placement = Number(ocrPlacement), kills = Number(ocrKills);
    try { roundTotal(placement, kills); } catch (e) { return setMessage(e.message); }
    const { error } = await supabase.from('scores').upsert({
      round_id: selectedRound, team_id: ocrTeam, placement, kills, ocr_source: fileKey
    }, { onConflict: 'round_id,team_id' });
    if (error) setMessage('บันทึกข้อมูลจากภาพไม่สำเร็จ: ' + errorText(error));
    else { setMessage('บันทึกข้อมูลที่ตรวจสอบแล้วจากภาพเรียบร้อย'); setOcr(null); await load(true); }
  }
  async function savePlayerKills() {
    if (!ocr || !selectedRound) return setMessage('กรุณาอัปโหลดภาพก่อน');
    let grouped;
    try {
      grouped = groupPlayerKillsByTeam(ocrPlayerLines.map(p => ({
        playerId: p.player.trim().toLocaleLowerCase(),
        name: p.player.trim(),
        teamId: p.teamId,
        kills: p.kills
      })));
    } catch (e) { return setMessage(e.message); }
    const missing = [...grouped.keys()].filter(teamId => !currentScores.some(s => s.team_id === teamId));
    if (missing.length) return setMessage('กรุณาบันทึกอันดับของแต่ละทีมด้วยตนเองก่อน จึงจะบันทึกคิวจากผู้เล่นได้');
    const total = [...grouped.values()].reduce((sum, kills) => sum + kills, 0);
    if (!confirm(`ตรวจสอบแล้ว: รวม ${total} คิว จาก ${ocrPlayerLines.length} รายการ จะบันทึกยอดรวมแยกตามทีมใช่หรือไม่?`)) return;
    setLoading(true);
    const { error } = await supabase.rpc('set_round_team_kills', {
      p_round_id: selectedRound,
      p_team_kills: [...grouped.entries()].map(([team_id, kills]) => ({ team_id, kills }))
    });
    setLoading(false);
    if (error) setMessage('บันทึกคิวไม่สำเร็จ: ' + errorText(error));
    else { setMessage('รวมคิวจากรายการผู้เล่นและบันทึกแล้ว'); setOcr(null); await load(true); }
  }

  if (!isSupabaseConfigured) return <main className="setup"><div className="brand-mark"><Trophy size={30}/></div><h1>FREE FIRE <span>TOURNAMENT</span> SCOREBOARD</h1><p>ยังไม่ได้เชื่อมต่อ Supabase</p><ol><li>คัดลอกไฟล์ <code>.env.example</code> เป็น <code>.env</code></li><li>ใส่ Project URL และ publishable/anon key จาก Supabase</li><li>รัน <code>npm install</code> แล้ว <code>npm run dev</code></li></ol><p className="muted">อย่าใส่ service_role key ในเว็บไซต์</p></main>;

  return <div className="app-shell">
    <header className="topbar"><div className="brand-mark"><Trophy size={24}/></div><div><h1>FREE FIRE <span>TOURNAMENT</span></h1><p>SCOREBOARD • LIVE RESULTS</p></div><div className="top-actions"><span className="live-dot">LIVE</span><button className="icon-btn" onClick={() => load()} title="รีเฟรช"><RefreshCw size={18}/></button>{session ? <button className="secondary" onClick={signOut}><LogOut size={16}/> ออกจากระบบ</button> : <button className="secondary" onClick={() => setTab(tab === 'login' ? 'scores' : 'login')}><LogIn size={16}/> กรรมการ</button>}</div></header>
    <main className="main-content">
      <section className="hero"><div><div className="eyebrow">OFFICIAL MATCH CENTER</div><h2>ตารางคะแนนการแข่งขัน</h2><p>ดูคะแนนจากฐานข้อมูลกลาง อัปเดตให้ผู้ชมทุกคนตรงกัน</p></div><div className="hero-stats"><div><strong>{teams.length}<small>/12</small></strong><span>ทีม</span></div><div><strong>{rounds.length}</strong><span>รอบแข่งขัน</span></div><div><strong>{currentScores.length}</strong><span>ทีมที่มีคะแนนในรอบนี้</span></div></div></section>
      {message && <div className="notice" role="status">{message}<button onClick={() => setMessage('')}>×</button></div>}
      <nav className="tabs"><button className={tab==='scores'?'active':''} onClick={() => setTab('scores')}>คะแนนรายรอบ</button><button className={tab==='cumulative'?'active':''} onClick={() => setTab('cumulative')}>คะแนนสะสม</button>{admin && <><button className={tab==='manage'?'active':''} onClick={() => setTab('manage')}>จัดการทีม/รอบ</button><button className={tab==='ocr'?'active':''} onClick={() => setTab('ocr')}>อ่านภาพ OCR</button></>}{tab==='login' && <button className="active">เข้าสู่ระบบกรรมการ</button>}</nav>
      {tab==='login' && <section className="panel login-panel"><h3><ShieldCheck/> เข้าสู่ระบบกรรมการ</h3><p className="muted">ต้องมีบัญชีที่ได้รับสิทธิ์กรรมการจากผู้ดูแลระบบแล้วเท่านั้น</p><form onSubmit={signIn} className="login-form"><label>อีเมล<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/></label><label>รหัสผ่าน<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></label><button className="primary" type="submit">เข้าสู่ระบบ</button></form>{session && !admin && <p className="warning">บัญชีนี้เข้าสู่ระบบแล้ว แต่ยังไม่มีสิทธิ์กรรมการ</p>}</section>}
      {tab==='scores' && <><section className="toolbar"><label>เลือกรอบการแข่งขัน<select value={selectedRound} onChange={e=>setSelectedRound(e.target.value)}><option value="">— ยังไม่มีรอบ —</option>{rounds.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><div className="toolbar-buttons"><button className="secondary" onClick={copySummary}><Copy size={16}/> คัดลอกสรุป</button><button className="secondary" onClick={()=>downloadText('scoreboard.csv', rowsToCsv(rows), 'text/csv;charset=utf-8')}><Download size={16}/> CSV</button><button className="secondary" onClick={()=>downloadText('scoreboard.txt', rowsToTxt(rows,currentRound?.name || 'ยังไม่เลือกรอบ'))}><Download size={16}/> TXT</button></div></section>
      <section className="table-panel"><div className="panel-heading"><div><h3>{currentRound?.name || 'ยังไม่ได้เลือกรอบ'}</h3><p>เรียงตามอันดับการแข่งขันที่กำหนด ไม่ได้เรียงตามคะแนน</p></div><span className="update-time">อัปเดตล่าสุด: {lastUpdated ? lastUpdated.toLocaleTimeString('th-TH') : '—'}</span></div><div className="table-scroll"><table><thead><tr><th>อันดับ</th><th>ชื่อทีม / ตัวแทน</th><th>คะแนนอันดับ</th><th>คิวรวมทีม</th><th>คะแนนรวมรอบ</th><th>คะแนนสะสม</th>{admin && <th>จัดการ</th>}</tr></thead><tbody>{rows.map(row=><tr key={row.team.id}><td><span className={`rank rank-${row.placement || row.team.team_number}`}>{row.placement || '—'}</span></td><td><strong>{row.team.name || `ทีมหมายเลข ${row.team.team_number}`}</strong><small>{row.team.representative || 'ยังไม่ระบุตัวแทน'}</small></td><td>{row.placement_points ?? 0}</td><td>{row.kills ?? 0}</td><td className="total">{row.round_total ?? 0}</td><td className="cumulative">{row.cumulative ?? 0}</td>{admin && <td className="score-editor"><select aria-label={`อันดับทีม ${row.team.team_number}`} value={scoreDrafts[row.team_id]?.placement ?? row.placement ?? ''} onChange={e=>setScoreDrafts(d=>({...d,[row.team_id]:{...d[row.team_id],placement:e.target.value}}))}><option value="">อันดับ</option>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select><input aria-label={`คิวทีม ${row.team.team_number}`} type="number" min="0" step="1" value={scoreDrafts[row.team_id]?.kills ?? row.kills ?? 0} onChange={e=>setScoreDrafts(d=>({...d,[row.team_id]:{...d[row.team_id],kills:e.target.value}}))}/><button className="small-primary" disabled={!selectedRound||loading} onClick={()=>saveScore(row)}>บันทึก</button>{row.id && <button className="icon-btn danger" title="ลบคะแนน" onClick={()=>deleteScore(row)}><Trash2 size={15}/></button>}</td>}</tr>)}</tbody></table></div>{teams.length===0 && <p className="empty">ยังไม่มีทีม กรุณาเข้าสู่ระบบกรรมการเพื่อกำหนดทีม</p>}{!currentRound && <p className="empty">ยังไม่มีรอบการแข่งขัน กรุณาเพิ่มรอบในเมนูจัดการทีม/รอบ</p>}</section></>}
      {tab==='cumulative' && <section className="table-panel"><div className="panel-heading"><div><h3>อันดับคะแนนสะสม</h3><p>แยกจากอันดับการแข่งขันรายรอบ • คำนวณจากคะแนนทุกแมตช์ที่บันทึก</p></div></div><div className="table-scroll"><table><thead><tr><th>อันดับคะแนนสะสม</th><th>ทีม</th><th>ตัวแทนทีม</th><th>คะแนนสะสม</th></tr></thead><tbody>{cumulativeRanking.map((item,i)=><tr key={item.team.id}><td><span className={`rank rank-${i+1}`}>{i+1}</span></td><td><strong>{item.team.name || `ทีมหมายเลข ${item.team.team_number}`}</strong></td><td>{item.team.representative || '-'}</td><td className="total">{item.total}</td></tr>)}</tbody></table></div></section>}
      {tab==='manage' && admin && <div className="manage-grid"><section className="panel"><h3>จัดการทีม 12 ทีม</h3><p className="muted">แก้ไขชื่อทีมและตัวแทนได้ ไม่ต้องกรอกผู้เล่นอีก 3 คน</p><div className="team-list">{teams.map(team=><div className="team-edit" key={team.id}><span className="team-number">{String(team.team_number).padStart(2,'0')}</span><div className="team-fields"><input aria-label="ชื่อทีม" placeholder={`ชื่อทีม ${team.team_number}`} value={teamDrafts[team.id]?.name ?? team.name ?? ''} onChange={e=>setTeamDrafts(d=>({...d,[team.id]:{...d[team.id],name:e.target.value,representative:d[team.id]?.representative ?? team.representative ?? ''}}))}/><input aria-label="ชื่อตัวแทนทีม" placeholder="ชื่อตัวแทนทีม (ไม่บังคับ)" value={teamDrafts[team.id]?.representative ?? team.representative ?? ''} onChange={e=>setTeamDrafts(d=>({...d,[team.id]:{...d[team.id],name:d[team.id]?.name ?? team.name ?? '',representative:e.target.value}}))}/></div><button className="small-primary" onClick={()=>saveTeam(team)}>บันทึก</button></div>)}</div></section><section className="panel"><h3>จัดการรอบการแข่งขัน</h3><form onSubmit={createRound} className="round-form"><label>ชื่อรอบใหม่<input value={roundName} onChange={e=>setRoundName(e.target.value)} placeholder="เช่น รอบที่ 1" required/></label><button className="primary" type="submit"><Plus size={16}/> เพิ่มรอบ</button></form><div className="round-list">{rounds.map(r=><button key={r.id} className={`round-item ${r.id===selectedRound?'selected':''}`} onClick={()=>setSelectedRound(r.id)}>{r.name}<span>{r.id===selectedRound?'กำลังเลือก':'เลือกดู'}</span></button>)}</div><button className="danger-button" disabled={!currentRound} onClick={deleteRound}><Trash2 size={16}/> ลบรอบที่เลือกและคะแนนทั้งหมด</button></section></div>}
      {tab==='ocr' && admin && <section className="panel ocr-panel"><h3><ImageUp/> ช่วยอ่านผลการแข่งขันจากภาพ (OCR)</h3><p className="muted">OCR เป็นเพียงตัวช่วย ไม่บันทึกผลให้อัตโนมัติ ต้องตรวจสอบและยืนยันทุกครั้ง</p><label className="upload-box"><ImageUp size={28}/><strong>เลือกภาพ JPG / JPEG / PNG</strong><span>ประมวลผลในเบราว์เซอร์ อาจใช้เวลาสักครู่</span><input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={e=>e.target.files?.[0]&&processOcr(e.target.files[0])}/></label>{ocrProgress>0 && !ocr && <p>กำลังอ่านข้อความจากภาพ {ocrProgress}%</p>}{ocr && <div className="ocr-results"><div className="ocr-meta"><strong>ไฟล์: {ocr.fileName}</strong><span>ความมั่นใจโดยรวม: {Math.round(ocr.confidence)}%</span></div>{ocr.warning && <p className="warning">{ocr.warning}</p>}<label>ข้อความที่อ่านได้<textarea value={ocr.text} onChange={e=>setOcr(o=>({...o,text:e.target.value,lines:e.target.value.split(/\r?\n/).filter(Boolean)}))} rows={7}/></label><div className="ocr-save-grid"><label>ทีมที่ต้องการบันทึก<select value={ocrTeam} onChange={e=>setOcrTeam(e.target.value)}><option value="">เลือกทีมเอง</option>{teams.map(t=><option key={t.id} value={t.id}>{t.team_number}. {t.name}</option>)}</select></label><label>อันดับ<select value={ocrPlacement} onChange={e=>setOcrPlacement(e.target.value)}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label><label>คิวรวมทีม<input type="number" min="0" step="1" value={ocrKills} onChange={e=>setOcrKills(e.target.value)}/></label></div><label className="check-row"><input type="checkbox" checked={ocrDuplicateConfirmed} onChange={e=>setOcrDuplicateConfirmed(e.target.checked)}/> ฉันตรวจสอบแล้วว่าไม่ใช่การบันทึกภาพเดิมซ้ำ</label><button className="primary" onClick={saveOcrTeam}>ตรวจสอบแล้วและบันทึกคะแนนทีมนี้</button><div className="divider"/><h4>หรือรวมคิวจากรายชื่อผู้เล่นที่อ่านได้</h4><p className="muted">ตรวจชื่อและคิวทีละคน เลือกทีมเองทุกแถว ระบบจะป้องกันชื่อซ้ำก่อนรวมยอด</p><div className="player-lines">{ocrPlayerLines.map((p,i)=><div className="player-line" key={i}><input placeholder="ชื่อผู้เล่น (ตรวจ/แก้ไข)" value={p.player} onChange={e=>setOcrPlayerLines(a=>a.map((x,j)=>j===i?{...x,player:e.target.value}:x))}/><select value={p.teamId} onChange={e=>setOcrPlayerLines(a=>a.map((x,j)=>j===i?{...x,teamId:e.target.value}:x))}><option value="">เลือกทีม</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name || `ทีม ${t.team_number}`}</option>)}</select><input type="number" min="0" step="1" placeholder="คิว" value={p.kills} onChange={e=>setOcrPlayerLines(a=>a.map((x,j)=>j===i?{...x,kills:e.target.value}:x))}/><button className="icon-btn danger" onClick={()=>setOcrPlayerLines(a=>a.filter((_,j)=>j!==i))}><Trash2 size={15}/></button></div>)}</div><button className="secondary" onClick={()=>setOcrPlayerLines(a=>[...a,{line:'',teamId:'',player:'',kills:''}])}><Plus size={15}/> เพิ่มแถวผู้เล่น</button><button className="primary" onClick={savePlayerKills}>รวมคิวและบันทึก</button></div>}</section>}
      <footer><span>FREE FIRE TOURNAMENT SCOREBOARD</span><span>{admin ? 'สิทธิ์กรรมการ' : 'โหมดผู้ชม'} • อัปเดตอัตโนมัติ</span></footer>
    </main>
  </div>;
}