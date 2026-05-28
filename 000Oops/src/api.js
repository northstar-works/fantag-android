const BASE = "/api";

async function req(method, path, body = null) {
  const opts = { method, headers: body instanceof FormData ? {} : { "Content-Type":"application/json" } };
  if (body) opts.body = body instanceof FormData ? body : JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

export const getRoster        = ()           => req("GET",  "/roster/");
export const getRosterForDate = (date)       => req("GET",  `/roster/date/${date}`);
export const getRosterStats   = ()           => req("GET",  "/roster/stats");
export const getRosterSchedule= ()           => req("GET",  "/roster/schedule");
export const addToRoster      = (player_id, status="roster") => req("POST", "/roster/", { player_id, status });
export const removeEntry      = (entry_id)   => req("DELETE",`/roster/${entry_id}`);
export const bulkRemoveEntries = (entry_ids) => req("POST", "/roster/bulk-delete", { entry_ids });
export const updateEntry      = (entry_id, data) => req("PATCH", `/roster/${entry_id}`, data);
export const getResearch      = (mlb_id)         => req("GET",   `/research/${mlb_id}`);
export const triggerResearch  = (mlb_id)         => req("POST",  `/research/${mlb_id}`);
export const getResearchMap   = ()               => req("GET",   "/research/roster-map");
export const getPlayerDetail  = (entry_id)   => req("GET",  `/roster/${entry_id}/detail`);
export const searchPlayers    = (q)          => req("GET",  `/players/search?q=${encodeURIComponent(q)}`);
export const getLineupStatus  = ()           => req("GET",  "/roster/lineup-status");
export const getPositionEvents = (player_id=null, days=45) => req("GET", `/roster/position-events?days=${days}${player_id ? `&player_id=${player_id}` : ""}`);
export const getRpWorkload    = ()           => req("GET",  "/roster/rp-workload");
export const createImport     = (file, mode) => { const f=new FormData(); f.append("file",file); f.append("mode",mode); return req("POST","/imports/",f); };
export const updateImportItem = (iid, itid, data) => req("PATCH",`/imports/${iid}/items/${itid}`, data);
export const commitImport     = (iid)        => req("POST", `/imports/${iid}/commit`);
export const getSettings      = ()           => req("GET",  "/settings/");
export const patchSettings    = (data)       => req("PATCH","/settings/", data);
export const triggerJob       = (job_id)     => req("POST", `/settings/trigger/${job_id}`);
export const repollDate       = (date_str)   => req("POST", `/roster/repoll/${encodeURIComponent(date_str)}`);
export const getEspnConfig   = ()           => req("GET",  "/espn/config");
export const patchEspnConfig = (data)       => req("PATCH","/espn/config", data);
export const previewEspnLeague = ()         => req("GET",  "/espn/league");
export const syncEspnRoster  = (reconcile=true) => req("POST", "/espn/sync", { reconcile });
export const previewEspnWatchlist = ()     => req("GET",  "/espn/watchlist");
export const syncEspnWatchlist = (reconcile=true) => req("POST", "/espn/watchlist/sync", { reconcile });
export const diffEspnWatchlist = ()        => req("GET",  "/espn/watchlist-diff");
export const repairEspnSync  = () => req("POST", "/espn/repair");
export const getBackupStatus = () => req("GET", "/backup/status");
export const listBackups     = () => req("GET", "/backup/list");
export const createBackup    = (reason="manual") => req("POST", `/backup/create?reason=${encodeURIComponent(reason)}`);
export const restoreBackup   = (filename) => req("POST", "/backup/restore", { filename, confirm:true });
export const deleteBackup    = (filename) => req("DELETE", `/backup/${encodeURIComponent(filename)}`);

const REAL_POSITION_BADGES = new Set(["C","1B","2B","3B","SS","OF","DH","SP","RP"]);
function cleanDisplayPositions(pos) {
  const out = [];
  (pos || []).forEach(p => {
    if (REAL_POSITION_BADGES.has(p) && !out.includes(p)) out.push(p);
  });
  return out;
}

const STATUS_MAP = { starting:"Starting", bench:"Bench", il:"IL", dtd:"DTD", minors:"Minors", suspended:"Suspended", unknown:"Unknown" };
const PATTERN_COLORS = { "Everyday Starter":"#10b981","Strong-Side Platoon":"#3b82f6","Weak-Side Platoon":"#f59e0b","Utility Regular":"#8b5cf6","Short-Side Bench Bat":"#ec4899","Catcher Rest Pattern":"#06b6d4","Leadoff Trend":"#f97316","Bottom-Third Lineup":"#64748b","Irregular":"#94a3b8" };
function ordinal(n) { const s=["th","st","nd","rd"],v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }

function adaptTodayStatus(ts) {
  if (!ts) return { in:false, bat:null, opp:null, sp:null, spHand:null, pos:"—",
                    gameTime:null, gameStatus:null, venueName:null, isDome:false,
                    teamHasGame:false, isProbableStarter:false, lineupConfirmed:false };
  return {
    in:              ts.in_lineup,
    bat:             ts.batting_order,
    opp:             ts.opponent,
    sp:              ts.sp_name,
    spHand:          ts.sp_hand,
    pos:             ts.fielding_pos || "—",
    gameTime:        ts.game_time,
    gameStatus:      ts.game_status,
    venueName:       ts.venue_name,
    isDome:          ts.is_dome,
    teamHasGame:     ts.team_has_game,
    isProbableStarter: ts.is_probable_starter || false,
    lineupConfirmed: ts.lineup_confirmed || false,
  };
}

export function adaptEntry(entry) {
  const p  = entry.player;
  const ts = entry.today_status;
  const ls = entry.live_stats || {};

  // Status: fully resolved — never show Unknown when we have meaningful daily data
  let statusStr;
  if (!ts) {
    statusStr = entry.status === "il" ? "IL" : "Unknown";
  } else if (ts.status === "il" || entry.status === "il") {
    statusStr = "IL";
  } else if (ts.status === "dtd") {
    statusStr = "DTD";
  } else if (ts.in_lineup) {
    statusStr = "Starting";
  } else if (ts.team_has_game) {
    statusStr = "Bench";  // display logic will refine to Pending/Out
  } else if (ts.game_status === "Off Day") {
    statusStr = "Day Off";
  } else {
    statusStr = STATUS_MAP[ts.status] || "Unknown";
  }

  // Build today status, then patch in boxscore position/batting_order if daily status missing them
  const todayUI = adaptTodayStatus(ts);
  if (ls.position && (!todayUI.pos || todayUI.pos === "—")) todayUI.pos = ls.position;
  if (ls.batting_order && !todayUI.bat) todayUI.bat = ls.batting_order;

  // Usage starts from backend (for smart slot assignment tiebreaking)
  const us = ls.usage_starts || {};

  // ESPN positions override: use espn_positions if set, else computed Player.positions
  // (Player.positions is already the effective value from the backend when espn_positions is set)
  return {
    _entryId: entry.id, _status: entry.status, _fantasyPos: entry.fantasy_pos || null,
    _espnPositions: entry.espn_positions || null,  // raw override for editor
    id: p.id, mlbId: p.mlb_id || null, name: p.name, team: p.team||"—", pos: cleanDisplayPositions(p.positions), elig: cleanDisplayPositions(p.positions), bats: p.bats||"—",
    status: statusStr,
    liveStats: ls,
    stats: {},
    today: todayUI,
    usage: { byPos:[],vsRHP:0,vsLHP:0,gap:null,label:"—",labelColor:"#94a3b8",slots:[],
             l7: us.l7||0, l14: us.l14||0, l30: us.l30||0 },
    log: [],
  };
}

export function adaptDetail(detail) {
  const { player, roster_entry, today_status, usage_stats, recent_game_log, live_stats } = detail;
  // For detail modal: compute a meaningful status label
  // If today_status.in_lineup=true → "Starting"
  // If today_status.status is "il" → "IL"
  // If today_status.status is "dtd" → "DTD"
  // Otherwise fall back to generic status map
  let statusStr;
  if (!today_status) {
    // No daily status row yet (poll hasn't run) — fall back to roster entry slot
    statusStr = (roster_entry?.status === "il") ? "IL" : "Lineup Pending";
  } else if (today_status.status === "il" || roster_entry?.status === "il") {
    statusStr = "IL";
  } else if (today_status.status === "dtd") {
    statusStr = "DTD";
  } else if (today_status.in_lineup) {
    // Confirmed in lineup — always show Starting regardless of pattern engine status
    statusStr = "Starting";
  } else if (today_status.team_has_game) {
    // Team plays, but lineup not confirmed yet
    statusStr = "Bench";  // Will be overridden by display logic to Pending/Out
  } else if (today_status.game_status === "Off Day") {
    statusStr = "Bench";  // Day off — not Unknown
  } else {
    statusStr = STATUS_MAP[today_status.status] || "Unknown";
  }
  // computed_starts always present in live_stats (computed from game_log in backend)
  const cs = (live_stats || {}).computed_starts || {};
  const usageUI = usage_stats ? {
    byPos: Object.entries(usage_stats.position_breakdown||{}).map(([n,v])=>({name:n,v})).sort((a,b)=>b.v-a.v),
    vsRHP: usage_stats.starts_vs_rhp, vsLHP: usage_stats.starts_vs_lhp,
    gap: usage_stats.avg_rest_days, label: usage_stats.pattern_label||"Irregular",
    labelColor: PATTERN_COLORS[usage_stats.pattern_label]||"#94a3b8",
    slots: Object.entries(usage_stats.batting_order_dist||{}).map(([n,v])=>({name:ordinal(parseInt(n)),v})).sort((a,b)=>b.v-a.v),
    l7: usage_stats.l7_starts, l14: usage_stats.l14_starts, l30: usage_stats.l30_starts,
  } : { byPos:[],vsRHP:0,vsLHP:0,gap:null,label:"—",labelColor:"#94a3b8",slots:[],
        l7: cs.l7||0, l14: cs.l14||0, l30: cs.l30||0 };
  const logUI = (recent_game_log||[]).map(g=>({ date:g.date,pos:g.fielding_pos||"—",bat:g.batting_order,hand:g.sp_hand,started:g.in_lineup,result:g.opponent||"—" }));
  const ls = live_stats || {};
  // Build adapted today status, falling back to boxscore data for missing fields
  const todayUI = adaptTodayStatus(today_status);
  if (ls.position && (!todayUI.pos || todayUI.pos === "—")) todayUI.pos = ls.position;
  if (ls.batting_order && !todayUI.bat) todayUI.bat = ls.batting_order;
  // Live stats panel
  const liveUI = {
    statLine:      ls.stat_line    || "",
    gameScore:     ls.game_score   || "",
    gameResult:    ls.game_result  || "",
    isFinal:       ls.is_final     || false,
    gameStatus:    ls.game_status  || "",
    hasBatting:    Object.keys(ls.batting  || {}).length > 0,
    hasPitching:   Object.keys(ls.pitching || {}).length > 0,
    batting:       ls.batting      || {},
    pitching:      ls.pitching     || {},
    isPitcher:     ls.is_pitcher   || false,
    position:      ls.position     || "",
  };
  return {
    _entryId: roster_entry?.id, _status: roster_entry?.status,
    id: player.id, name: player.name, team: player.team||"—", pos: cleanDisplayPositions(player.positions), elig: cleanDisplayPositions(player.positions), bats: player.bats||"—", throws: player.throws||"—",
    status: statusStr, stats: {}, today: todayUI, live: liveUI, usage: usageUI, log: logUI,
  };
}

export function adaptSearchResult(p) {
  return { id:p.id, name:p.name, team:p.team||"—", pos:cleanDisplayPositions(p.positions), elig:cleanDisplayPositions(p.positions), bats:p.bats||"—" };
}


/* ── Fantasy score calculation (client-side) ─────────────────── */
export function calcFantasyScore(liveStats, scoringRules) {
  if (!liveStats || !scoringRules) return null;
  const { batting={}, pitching={}, is_pitcher } = liveStats;
  const br = scoringRules?.batting  || {};
  const pr = scoringRules?.pitching || {};
  let score = 0;

  if (Object.keys(batting).length > 0) {
    const h  = batting.hits        || 0;
    const d  = batting.doubles     || 0;
    const t  = batting.triples     || 0;
    const hr = batting.homeRuns    || 0;
    const s  = Math.max(0, h - d - t - hr);
    score += s  * (br["1B"]  || 0);
    score += d  * (br["2B"]  || 0);
    score += t  * (br["3B"]  || 0);
    score += hr * (br["HR"]  || 0);
    score += h  * (br["H"]   || 0);
    score += (batting.runs          || 0) * (br["R"]    || 0);
    score += (batting.rbi           || 0) * (br["RBI"]  || 0);
    score += (batting.baseOnBalls   || 0) * (br["BB"]   || 0);
    score += (batting.intentionalWalks||0)*(br["IBB"]  || 0);
    score += (batting.strikeOuts    || 0) * (br["K"]    || 0);
    score += (batting.stolenBases   || 0) * (br["SB"]   || 0);
    score += (batting.caughtStealing|| 0) * (br["CS"]   || 0);
    score += (batting.hitByPitch    || 0) * (br["HBP"]  || 0);
    score += (batting.sacBunts      || 0) * (br["SAC"]  || 0);
    score += (batting.groundIntoDoublePlay||0)*(br["GIDP"]||0);
    score += (d+t+hr) * (br["XBH"] || 0);
  }

  if (Object.keys(pitching).length > 0) {
    const ipStr = String(pitching.inningsPitched || "0");
    let ip = 0;
    if (ipStr.includes(".")) { const [f,r]=ipStr.split("."); ip=parseInt(f)+parseInt(r)/3; }
    else ip = parseFloat(ipStr) || 0;
    score += ip                                     * (pr["IP"]  || 0);
    score += (pitching.earnedRuns    || 0)          * (pr["ER"]  || 0);
    score += (pitching.homeRuns      || 0)          * (pr["HR"]  || 0);
    score += (pitching.baseOnBalls   || 0)          * (pr["BB"]  || 0);
    score += (pitching.strikeOuts    || 0)          * (pr["K"]   || 0);
    score += (pitching.wins          || 0)          * (pr["W"]   || 0);
    score += (pitching.losses        || 0)          * (pr["L"]   || 0);
    score += (pitching.saves         || 0)          * (pr["SV"]  || 0);
    score += (pitching.saveOpportunities||0)        * (pr["SOP"] || 0);
    score += (pitching.blownSaves    || 0)          * (pr["BS"]  || 0);
    score += (pitching.holds         || 0)          * (pr["HD"]  || 0);
    score += (pitching.shutouts      || 0)          * (pr["SO"]  || 0);
    score += ((pitching.completeGames||0)>0?1:0)    * (pr["CG"]  || 0);
  }
  return Math.round(score * 10) / 10;
}
