import React, { useState, useEffect, useCallback, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Plus, Search, Upload, X, Trash2, AlertCircle, CheckCircle, Check,
         RefreshCw, Users, Zap, Settings, Play, Clock, Brain, Cloud, AlertTriangle, Database, ChevronDown, ChevronRight, Home, MoreVertical } from "lucide-react";
import * as API from "./api";
import { calcFantasyScore } from "./api";


/* ── ERROR BOUNDARY ─────────────────────────────────────────────── */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(err) { return { error: err.message || String(err) }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding:"40px 24px", textAlign:"center", fontFamily:"'DM Sans',sans-serif", color:"#e2e8f0" }}>
          <div style={{ color:"#ef4444", fontSize:16, fontWeight:600, marginBottom:12 }}>Render Error</div>
          <pre style={{ background:"#0b1120", border:"1px solid #1e2d42", borderRadius:8, padding:16, fontSize:12, color:"#94a3b8", textAlign:"left", overflowX:"auto", maxWidth:700, margin:"0 auto" }}>
            {this.state.error}
          </pre>
          <button onClick={()=>this.setState({error:null})}
            style={{ marginTop:16, background:"#10b981", color:"#fff", border:"none", borderRadius:6, padding:"8px 16px", cursor:"pointer", fontFamily:"'DM Sans'", fontWeight:600 }}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── STYLES ─────────────────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=DM+Sans:wght@300;400;500;600&family=Fira+Code:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{background:#060a12;font-family:'DM Sans',sans-serif;color:#e2e8f0;}
::-webkit-scrollbar{width:3px;height:3px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#1e2d42;border-radius:2px;}
.barlow{font-family:'Barlow Condensed',sans-serif;}
.fira{font-family:'Fira Code',monospace;}
.tab-pill{padding:7px 18px;border-radius:6px;font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;transition:all 0.15s;border:none;display:inline-flex;align-items:center;gap:6px;}
.modal-bg{position:fixed;inset:0;background:rgba(3,5,10,0.88);backdrop-filter:blur(6px);z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;}
.modal-box{background:#0b1120;border:1px solid #1e2d42;border-radius:12px;width:100%;max-height:90vh;overflow-y:auto;animation:slideUp 0.22s ease-out;}
@keyframes slideUp{from{transform:translateY(16px);opacity:0;}to{transform:translateY(0);opacity:1;}}
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;font-family:'Barlow Condensed',sans-serif;}
.btn-green{background:#10b981;color:#fff;border:none;border-radius:6px;padding:8px 16px;font-family:'DM Sans';font-weight:600;font-size:13px;cursor:pointer;transition:background 0.15s;display:inline-flex;align-items:center;gap:6px;}
.btn-green:hover{background:#0d9e6e;}.btn-green:disabled{opacity:0.5;cursor:not-allowed;}
.btn-outline{background:transparent;color:#64748b;border:1px solid #1e2d42;border-radius:6px;padding:7px 14px;font-family:'DM Sans';font-weight:500;font-size:13px;cursor:pointer;transition:all 0.15s;display:inline-flex;align-items:center;gap:6px;}
.btn-outline:hover{border-color:#2d4060;color:#94a3b8;}.btn-outline:disabled{opacity:0.4;cursor:not-allowed;}
.btn-red{background:#450a0a;color:#ef4444;border:1px solid #7f1d1d;border-radius:6px;padding:8px 16px;font-family:'DM Sans';font-weight:600;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;}
.btn-red:hover{background:#5a0f0f;}
.search-box{background:#0f1a2a;border:1px solid #1e2d42;border-radius:6px;color:#e2e8f0;padding:8px 12px 8px 36px;font-family:'DM Sans';font-size:13px;width:100%;outline:none;}
.search-box:focus{border-color:#10b981;}.search-box::placeholder{color:#334155;}
.search-result{padding:10px 14px;cursor:pointer;transition:background 0.1s;border-bottom:1px solid #0d1421;}
.search-result:hover{background:#0e1e33;}
.detail-tab{padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.15s;border-bottom:2px solid transparent;background:none;border-left:none;border-right:none;border-top:none;font-family:'Barlow Condensed';letter-spacing:0.06em;text-transform:uppercase;}
.detail-tab.active{border-bottom-color:#10b981;color:#10b981;}
.stat-bar-bg{background:#162030;border-radius:2px;overflow:hidden;height:4px;}
.stat-bar{background:#10b981;border-radius:2px;height:4px;transition:width 0.5s ease;}
@keyframes spin{to{transform:rotate(360deg);}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}
.spin{animation:spin 0.8s linear infinite;}
.pulse{animation:pulse 2s ease-in-out infinite;}
.slot-row{border-bottom:1px solid #0d1421;transition:background 0.1s;}
.slot-row:hover{background:#0b1825 !important;}
.section-hdr{background:#040810;padding:7px 16px;border-bottom:1px solid #1a2535;border-top:1px solid #1a2535;display:flex;justify-content:space-between;align-items:center;}
.date-btn{padding:6px 12px;border-radius:6px;border:1px solid transparent;cursor:pointer;font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;letter-spacing:0.05em;transition:all 0.15s;}
.settings-row{display:flex;align-items:center;justify-content:space-between;padding:14px 0;border-bottom:1px solid #111c2d;}
.settings-label{font-size:14px;font-weight:500;color:#e2e8f0;}
.settings-sub{font-size:12px;color:#64748b;margin-top:3px;}
select.sel{background:#0f1a2a;border:1px solid #1e2d42;border-radius:6px;color:#e2e8f0;padding:6px 10px;font-family:'DM Sans';font-size:13px;outline:none;cursor:pointer;}
select.sel:focus{border-color:#10b981;}
input.inp{background:#0f1a2a;border:1px solid #1e2d42;border-radius:6px;color:#e2e8f0;padding:6px 10px;font-family:'DM Sans';font-size:13px;outline:none;}
input.inp:focus{border-color:#10b981;}
input.inp-sm{background:#0f1a2a;border:1px solid #1e2d42;border-radius:6px;color:#e2e8f0;padding:5px 8px;font-family:'Fira Code';font-size:13px;width:64px;text-align:center;outline:none;}
input.inp-sm:focus{border-color:#10b981;}



/* Responsive layout repair b69: use the full browser width on desktop, phone portrait, and phone landscape. */
.fantag-top-inner,
.fantag-content{
  width:100%!important;
  max-width:none!important;
}
.fantag-top-inner{
  padding-left:clamp(12px,2vw,28px)!important;
  padding-right:clamp(12px,2vw,28px)!important;
}
.fantag-content{
  padding-left:clamp(10px,2vw,28px)!important;
  padding-right:clamp(10px,2vw,28px)!important;
}
.fantag-summary-grid{
  display:grid!important;
  grid-template-columns:repeat(auto-fit,minmax(150px,1fr))!important;
  gap:10px!important;
  margin-bottom:14px!important;
  align-items:stretch!important;
  width:100%!important;
}
.fantag-summary-tile{
  min-width:0!important;
  width:100%!important;
  justify-content:flex-start!important;
  min-height:58px!important;
}
.fantag-main-actions{
  display:flex!important;
  flex-wrap:wrap!important;
  gap:6px!important;
  justify-content:flex-end!important;
  align-items:center!important;
  min-width:0!important;
}
.date-strip{
  width:100%!important;
  max-width:100%!important;
  scrollbar-width:thin;
}
.roster-table-wrap{
  width:100%!important;
  max-width:100%!important;
}
@media (min-width: 1100px){
  .fantag-summary-grid{grid-template-columns:repeat(5,minmax(150px,1fr))!important;}
  .fantag-summary-tile{padding:12px 18px!important;}
  .slot-table-header{padding-left:18px!important;padding-right:18px!important;}
  .slot-row{padding-left:18px!important;padding-right:18px!important;}
}
@media (orientation: landscape) and (max-height: 560px){
  .fantag-top-inner{height:auto!important;min-height:48px!important;padding-top:6px!important;padding-bottom:6px!important;gap:8px!important;}
  .fantag-content{padding-top:10px!important;}
  .fantag-summary-grid{grid-template-columns:repeat(5,minmax(110px,1fr))!important;gap:8px!important;}
  .fantag-summary-tile{min-height:50px!important;padding:8px 12px!important;}
  .fantag-summary-tile .barlow{font-size:22px!important;}
  .date-btn{min-width:58px!important;padding:5px 9px!important;}
}
@media (max-width: 760px){
  .fantag-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;}
  .fantag-summary-tile{padding:10px 12px!important;min-height:56px!important;}
  .fantag-summary-tile .barlow{font-size:24px!important;}
  .fantag-summary-tile span:last-child{font-size:12px!important;}
  .fantag-main-actions{width:100%!important;justify-content:flex-start!important;}
}
@media (max-width: 420px){
  .fantag-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;}
  .fantag-content{padding-left:8px!important;padding-right:8px!important;}
}

/* Mobile browser repair: stop desktop-width shrink and render roster rows as readable cards */
html,body,#root{width:100%;max-width:100%;overflow-x:hidden;}
@media (max-width: 760px){
  body{overflow-x:hidden;}
  .fantag-app-shell{width:100vw!important;max-width:100vw!important;overflow-x:hidden!important;}
  .fantag-top-inner{height:auto!important;min-height:54px!important;max-width:100vw!important;padding:8px 10px!important;align-items:flex-start!important;gap:8px!important;flex-wrap:wrap!important;justify-content:flex-start!important;}
  .fantag-brand-row{gap:8px!important;flex-wrap:wrap!important;width:100%!important;}
  .fantag-brand-row .barlow{font-size:16px!important;}
  .fantag-brand-row img{height:28px!important;max-width:160px!important;}
  .fantag-nav-tabs{order:3;width:100%!important;display:flex!important;flex-wrap:wrap!important;gap:4px!important;}
  .fantag-actions{width:100%!important;display:flex!important;flex-wrap:wrap!important;gap:5px!important;justify-content:flex-start!important;}
  .fantag-content{width:100vw!important;max-width:100vw!important;margin:0!important;padding:10px 8px 18px!important;overflow-x:hidden!important;}
  .date-strip{overflow-x:auto!important;max-width:100%!important;}
  .date-btn{padding:5px 8px!important;font-size:11px!important;}
  .tab-pill{padding:5px 8px!important;font-size:10px!important;}
  .btn-outline,.btn-green,.btn-red{padding:5px 8px!important;font-size:11px!important;}
  .search-box{font-size:12px!important;padding-top:7px!important;padding-bottom:7px!important;}
  .slot-table-header{display:none!important;}
  .slot-row{display:grid!important;grid-template-columns:34px minmax(0,1fr) 76px!important;align-items:start!important;gap:4px!important;padding:9px 8px!important;border-bottom:1px solid #122033!important;}
  .slot-row > div:nth-child(1){width:34px!important;margin-right:0!important;}
  .slot-row > div:nth-child(2){grid-column:2 / 4!important;padding-left:4px!important;min-width:0!important;}
  .slot-row > div:nth-child(3){grid-column:2!important;grid-row:2!important;width:auto!important;margin-top:4px!important;}
  .slot-row > div:nth-child(4){grid-column:2 / 4!important;grid-row:3!important;width:auto!important;margin-top:4px!important;font-size:11px!important;}
  .slot-row > div:nth-child(5){grid-column:2 / 4!important;grid-row:4!important;width:auto!important;margin-top:3px!important;}
  .slot-row > div:nth-child(6){display:none!important;}
  .slot-row > div:nth-child(7){grid-column:3!important;grid-row:1!important;width:auto!important;text-align:right!important;}
  .section-hdr{padding:6px 8px!important;}
  .settings-row{display:block!important;}
  .settings-row input,.settings-row select{width:100%!important;max-width:100%!important;margin-top:8px!important;}
}

/* b70 organized browser layout repair
   Goal: one clean layout across phone portrait, phone landscape, and desktop browser. */
.fantag-content{max-width:1280px!important;margin-left:auto!important;margin-right:auto!important;}
.fantag-brand-row{min-width:0!important;}
.fantag-nav-tabs{min-width:0!important;}
.fantag-clock{white-space:nowrap!important;display:inline-flex!important;align-items:center!important;}
.fantag-filter-input{width:100%!important;}

/* Keep the status cards compact and visually grouped. */
.roster-table-wrap{box-shadow:0 0 0 1px rgba(30,45,66,.18),0 12px 32px rgba(0,0,0,.18);}
.section-hdr{min-height:28px!important;}
.slot-row{min-height:74px!important;}
.slot-row-no-slot > span:first-child{display:none!important;}
.slot-row-no-slot > div:nth-child(2){padding-left:0!important;}
.slot-row-no-slot{padding-left:14px!important;}

/* Summary cards: desktop/tablet should stay in one organized row when possible. */
@media (min-width: 900px){
  .fantag-summary-grid{grid-template-columns:repeat(5,minmax(0,1fr))!important;}
  .fantag-summary-tile{min-height:64px!important;border-radius:10px!important;padding:14px 18px!important;}
  .fantag-summary-tile .barlow{font-size:28px!important;}
}

/* Phone portrait: clean two-column summary cards and stacked controls. */
@media (max-width: 640px) and (orientation: portrait){
  .fantag-top-inner{display:grid!important;grid-template-columns:1fr!important;height:auto!important;padding:10px 12px!important;gap:10px!important;}
  .fantag-brand-row{display:grid!important;grid-template-columns:auto auto 1fr!important;align-items:center!important;gap:8px!important;width:100%!important;}
  .fantag-nav-tabs{grid-column:1 / -1!important;width:100%!important;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important;}
  .fantag-nav-tabs .tab-pill{justify-content:center!important;padding:7px 6px!important;font-size:11px!important;}
  .fantag-main-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;width:100%!important;gap:8px!important;}
  .fantag-main-actions > *{width:100%!important;justify-content:center!important;min-height:34px!important;}
  .fantag-clock{grid-column:1 / -1!important;justify-content:flex-start!important;width:100%!important;white-space:normal!important;line-height:1.25!important;}
  .fantag-content{padding:12px 10px!important;}
  .fantag-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important;}
  .fantag-summary-tile{min-height:58px!important;border-radius:9px!important;padding:10px 12px!important;}
  .fantag-summary-tile .barlow{font-size:25px!important;}
  .fantag-summary-tile span:last-child{font-size:12px!important;line-height:1.15!important;}
  .fantag-filter-input{max-width:none!important;}
}

/* Phone landscape / narrow browser: use the width like a dashboard, not oversized stacked blocks. */
@media (max-width: 920px) and (orientation: landscape){
  .fantag-top-inner{display:grid!important;grid-template-columns:1fr auto!important;height:auto!important;min-height:0!important;padding:8px 12px!important;gap:8px 12px!important;align-items:center!important;}
  .fantag-brand-row{gap:10px!important;flex-wrap:wrap!important;}
  .fantag-brand-row .barlow{font-size:18px!important;}
  .fantag-brand-row img{height:30px!important;max-width:170px!important;}
  .fantag-nav-tabs{width:100%!important;display:flex!important;gap:6px!important;flex-wrap:wrap!important;}
  .fantag-main-actions{grid-column:1 / -1!important;display:flex!important;flex-wrap:wrap!important;justify-content:flex-start!important;gap:6px!important;width:100%!important;}
  .fantag-main-actions > *{min-height:30px!important;}
  .fantag-clock{min-width:180px!important;}
  .fantag-content{padding:10px 12px!important;max-width:100%!important;}
  .date-strip{margin-bottom:10px!important;}
  .date-btn{min-width:64px!important;padding:5px 10px!important;}
  .fantag-summary-grid{grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:8px!important;}
  .fantag-summary-tile{min-height:46px!important;padding:7px 10px!important;border-radius:8px!important;gap:6px!important;}
  .fantag-summary-tile .barlow{font-size:22px!important;}
  .fantag-summary-tile span:last-child{font-size:11px!important;white-space:nowrap!important;}
  .fantag-filter-input{max-width:420px!important;}
  .slot-table-header{display:flex!important;padding:7px 12px!important;}
  .slot-row{display:flex!important;align-items:center!important;min-height:68px!important;padding:8px 12px!important;}
  .slot-row-no-slot{padding-left:12px!important;}
  .slot-row > div:nth-child(2){flex:1 1 auto!important;grid-column:auto!important;grid-row:auto!important;min-width:180px!important;padding-left:0!important;}
  .slot-row > div:nth-child(3){display:block!important;width:76px!important;grid-column:auto!important;grid-row:auto!important;margin-top:0!important;}
  .slot-row > div:nth-child(4){display:block!important;width:150px!important;grid-column:auto!important;grid-row:auto!important;margin-top:0!important;font-size:12px!important;}
  .slot-row > div:nth-child(5){display:block!important;width:150px!important;grid-column:auto!important;grid-row:auto!important;margin-top:0!important;}
  .slot-row > div:nth-child(6){display:block!important;width:52px!important;}
  .slot-row > div:nth-child(7){display:block!important;width:24px!important;grid-column:auto!important;grid-row:auto!important;}
}

/* Narrow phone cards: remove the empty left gutter in Status Sort and make each row read top-to-bottom. */
@media (max-width: 640px) and (orientation: portrait){
  .slot-table-header{display:none!important;}
  .roster-table-wrap{border-radius:10px!important;overflow:hidden!important;}
  .section-hdr{padding:7px 10px!important;position:sticky!important;top:0;z-index:2;}
  .slot-row{display:grid!important;grid-template-columns:minmax(0,1fr) 28px!important;gap:6px 8px!important;align-items:start!important;min-height:0!important;padding:12px 10px!important;}
  .slot-row-no-slot{padding-left:10px!important;}
  .slot-row-no-slot > span:first-child{display:none!important;}
  .slot-row > div:nth-child(2){grid-column:1 / 2!important;grid-row:1!important;padding-left:0!important;min-width:0!important;width:auto!important;}
  .slot-row > div:nth-child(3){grid-column:1 / 2!important;grid-row:2!important;width:auto!important;margin-top:0!important;}
  .slot-row > div:nth-child(4){grid-column:1 / -1!important;grid-row:3!important;width:auto!important;margin-top:0!important;font-size:12px!important;}
  .slot-row > div:nth-child(5){grid-column:1 / -1!important;grid-row:4!important;width:auto!important;margin-top:0!important;}
  .slot-row > div:nth-child(6){display:none!important;}
  .slot-row > div:nth-child(7){grid-column:2!important;grid-row:1!important;width:28px!important;text-align:right!important;}
  .slot-row .badge{font-size:10px!important;padding:2px 7px!important;}
}

/* Very small phones: keep summary usable while preventing sideways scroll. */
@media (max-width: 380px){
  .fantag-main-actions{grid-template-columns:1fr 1fr!important;}
  .fantag-summary-grid{grid-template-columns:1fr 1fr!important;}
  .fantag-summary-tile{padding:9px 10px!important;}
}

/* b70/b69 polish: clickable summary tiles and section colors. */
.fantag-summary-tile.clickable{cursor:pointer;transition:transform .12s ease,border-color .12s ease,background .12s ease;}
.fantag-summary-tile.clickable:hover{transform:translateY(-1px);border-color:#2d4060!important;background:#0f1a2a!important;}
.section-hdr.section-green .barlow{color:#10b981!important;}
.section-hdr.section-orange .barlow{color:#f59e0b!important;}
.section-hdr.section-red .barlow{color:#ef4444!important;}
.weather-forecast-pop{position:fixed;right:12px;left:12px;bottom:72px;z-index:250;background:#0b1120;border:1px solid #1e2d42;border-radius:12px;padding:12px 14px;box-shadow:0 8px 28px rgba(0,0,0,.6);max-height:min(56vh,420px);overflow:auto;}
@media (min-width:700px){.weather-forecast-pop{left:auto;right:24px;bottom:24px;width:360px;}}


/* b73: web-owned sticky app controls in the same row as logo/version. */
.fantag-sticky-header{position:sticky!important;top:0!important;z-index:80!important;background:#0b1120!important;border-bottom:1px solid #1e2d42!important;box-shadow:0 8px 24px rgba(0,0,0,.18)!important;}
.fantag-web-toolbar{display:flex!important;align-items:center!important;gap:8px!important;margin-left:auto!important;flex-shrink:0!important;}
.fantag-icon-btn{width:44px!important;height:38px!important;min-width:44px!important;border-radius:9px!important;border:1px solid #1e2d42!important;background:#0f1a2a!important;color:#e2e8f0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.03)!important;}
.fantag-icon-btn:active,.fantag-icon-btn:hover{border-color:#2d4060!important;background:#132035!important;color:#10b981!important;}
@media (max-width:640px) and (orientation:portrait){
  .fantag-sticky-header{top:0!important;}
  .fantag-brand-row{grid-template-columns:auto auto 1fr!important;}
  .fantag-web-toolbar{grid-column:3!important;justify-self:end!important;gap:6px!important;}
  .fantag-icon-btn{width:40px!important;min-width:40px!important;height:36px!important;}
  .fantag-main-actions{display:grid!important;}
}
@media (max-width:380px){
  .fantag-icon-btn{width:36px!important;min-width:36px!important;height:34px!important;}
  .fantag-brand-row img{max-width:135px!important;}
}

`;

const C = {
  bg:"#060a12", card:"#0b1120", elevated:"#0f1a2a",
  green:"#10b981", greenDim:"#064e36", amber:"#f59e0b", red:"#ef4444",
  blue:"#3b82f6", purple:"#8b5cf6", text:"#e2e8f0", textDim:"#64748b", border:"#1e2d42"
};

// ── Version / Build ────────────────────────────────────────────────
const APP_VERSION = "3.4.5";
const APP_BUILD   = 73;
const HEADER_BANNER_SRC = "/logos/banner-320x122.png";

// ── Position color system ──────────────────────────────────────────
const POS_COLORS = {
  C:    { bg:"#064035", color:"#10b981", border:"#065f46" },   // emerald
  "1B": { bg:"#0c2a5c", color:"#3b82f6", border:"#1e3a6e" },   // blue
  "2B": { bg:"#0c2a5c", color:"#3b82f6", border:"#1e3a6e" },
  "3B": { bg:"#0c2a5c", color:"#3b82f6", border:"#1e3a6e" },
  SS:   { bg:"#0c2a5c", color:"#3b82f6", border:"#1e3a6e" },
  IF:   { bg:"#0c2a5c", color:"#60a5fa", border:"#1e3a6e" },   // lighter blue for flex
  OF:   { bg:"#0a3014", color:"#4ade80", border:"#14532d" },   // green
  UTIL: { bg:"#2a1060", color:"#a78bfa", border:"#4c1d95" },   // violet
  P:    { bg:"#2a1060", color:"#a78bfa", border:"#4c1d95" },   // violet flex pitcher
  SP:   { bg:"#0c2a5c", color:"#3b82f6", border:"#1e3a6e" },   // blue
  RP:   { bg:"#3d0a5e", color:"#e879f9", border:"#6b21a8" },   // fuchsia
  CP:   { bg:"#3d0a5e", color:"#e879f9", border:"#6b21a8" },
  IL:   { bg:"#450a0a", color:"#ef4444", border:"#7f1d1d" },   // red
  BN:   { bg:"transparent", color:"#64748b", border:"transparent" }, // bench — no color
};

const STATUS_CFG = {
  // Today-aware computed states
  "Starting":      { bg:"#064e36", color:"#10b981", dot:true  },  // green: confirmed starter
  "IF Start":      { bg:"#064e36", color:"#10b981", dot:true  },  // green: dual IF/OF player starting IF/C
  "DH/OF Alert":   { bg:"#450a0a", color:"#ef4444", dot:true  },  // red: active player starting DH/OF
  "DH Alert":      { bg:"#450a0a", color:"#ef4444", dot:true  },  // red: active player starting DH
  "OF Alert":      { bg:"#450a0a", color:"#ef4444", dot:true  },  // red: IF/OF player starting OF
  "Not Starting":  { bg:"#450a0a", color:"#ef4444", dot:false }, // red: confirmed lineup posted, player out
  "Active Alert":  { bg:"#450a0a", color:"#ef4444", dot:true  },
  "Active DTD":    { bg:"#451a03", color:"#f59e0b", dot:true  },
  "Lineup Pending":{ bg:"#0b2045", color:"#60a5fa", dot:true  },  // team plays, lineup not yet posted
  "Confirmed Out": { bg:"#450a0a", color:"#ef4444", dot:false },  // lineup posted, player not in it
  "No Game":       { bg:"#111827", color:"#4b5563", dot:false },  // team not playing today
  "Starting Pitcher": { bg:"#064e36", color:"#10b981", dot:true  },  // confirmed today's SP
  "Probable Starting Pitcher": { bg:"#064e36", color:"#10b981", dot:true  },  // probable SP, not confirmed yet
  "SP Available":     { bg:"#0b1830", color:"#6b7280", dot:false },  // SP, not today's starter
  "RP Available":     { bg:"#1a0b30", color:"#8b5cf6", dot:true  },  // RP available to pitch
  "Started":       { bg:"#064e36", color:"#10b981", dot:false },  // historical: started
  "DNP":           { bg:"#1e293b", color:"#475569", dot:false },  // historical: did not play
  // Daily status badges (non-today)
  "IL":        { bg:"#450a0a", color:"#ef4444", dot:false },
  "DTD":       { bg:"#451a03", color:"#f59e0b", dot:false },
  "Minors":    { bg:"#1e1b4b", color:"#818cf8", dot:false },
  "Suspended": { bg:"#3b0764", color:"#c084fc", dot:false },
  "Bench":     { bg:"#1a2510", color:"#84cc16", dot:false },
  "Unknown":   { bg:"#1e293b", color:"#64748b", dot:false },
};

// ── Stadium info for weather ───────────────────────────────────────
const STADIUMS = {
  ARI:{ name:"Chase Field",         lat:33.4453, lon:-112.0669, dome:true  },
  ATL:{ name:"Truist Park",         lat:33.8908, lon:-84.4678,  dome:false },
  ATH:{ name:"Sutter Health Park",  lat:38.5802, lon:-121.5001, dome:false },
  BAL:{ name:"Camden Yards",        lat:39.2839, lon:-76.6216,  dome:false },
  BOS:{ name:"Fenway Park",         lat:42.3467, lon:-71.0972,  dome:false },
  CHC:{ name:"Wrigley Field",       lat:41.9484, lon:-87.6553,  dome:false },
  CWS:{ name:"Guaranteed Rate",     lat:41.8300, lon:-87.6338,  dome:false },
  CIN:{ name:"GABP",                lat:39.0979, lon:-84.5082,  dome:false },
  CLE:{ name:"Progressive Field",   lat:41.4962, lon:-81.6852,  dome:false },
  COL:{ name:"Coors Field",         lat:39.7560, lon:-104.9942, dome:false },
  DET:{ name:"Comerica Park",       lat:42.3390, lon:-83.0485,  dome:false },
  HOU:{ name:"Minute Maid Park",    lat:29.7573, lon:-95.3555,  dome:true  },
  KC: { name:"Kauffman Stadium",    lat:39.0517, lon:-94.4803,  dome:false },
  LAA:{ name:"Angel Stadium",       lat:33.8003, lon:-117.8827, dome:false },
  LAD:{ name:"Dodger Stadium",      lat:34.0739, lon:-118.2400, dome:false },
  MIA:{ name:"LoanDepot Park",      lat:25.7781, lon:-80.2197,  dome:true  },
  MIL:{ name:"Am. Family Field",    lat:43.0280, lon:-87.9712,  dome:true  },
  MIN:{ name:"Target Field",        lat:44.9817, lon:-93.2781,  dome:false },
  NYM:{ name:"Citi Field",          lat:40.7571, lon:-73.8458,  dome:false },
  NYY:{ name:"Yankee Stadium",      lat:40.8296, lon:-73.9262,  dome:false },
  PHI:{ name:"Citizens Bank Park",  lat:39.9061, lon:-75.1665,  dome:false },
  PIT:{ name:"PNC Park",            lat:40.4469, lon:-80.0057,  dome:false },
  SD: { name:"Petco Park",          lat:32.7076, lon:-117.1570, dome:false },
  SEA:{ name:"T-Mobile Park",       lat:47.5914, lon:-122.3325, dome:true  },
  SF: { name:"Oracle Park",         lat:37.7786, lon:-122.3893, dome:false },
  STL:{ name:"Busch Stadium",       lat:38.6226, lon:-90.1928,  dome:false },
  TB: { name:"Tropicana Field",     lat:27.7683, lon:-82.6534,  dome:true  },
  TEX:{ name:"Globe Life Field",    lat:32.7513, lon:-97.0820,  dome:true  },
  TOR:{ name:"Rogers Centre",       lat:43.6414, lon:-79.3892,  dome:true  },
  WSH:{ name:"Nationals Park",      lat:38.8730, lon:-77.0074,  dome:false },
};

const WEATHER_CACHE = new Map();

function wxIcon(code) {
  if (code === 0)  return "☀️";
  if (code <= 3)   return "⛅";
  if (code <= 48)  return "🌫️";
  if (code <= 67)  return "🌧️";
  if (code <= 77)  return "❄️";
  if (code <= 82)  return "🌦️";
  if (code <= 86)  return "🌨️";
  return "⛈️";
}

async function fetchWeather(lat, lon, viewDate, gameTime) {
  try {
    const params = new URLSearchParams({
      latitude: String(lat), longitude: String(lon),
      current: "temperature_2m,weathercode,windspeed_10m,precipitation",
      hourly: "temperature_2m,weathercode,precipitation_probability,precipitation,windspeed_10m",
      temperature_unit: "fahrenheit", windspeed_unit: "mph", timezone: "auto",
      forecast_days: "3"
    });
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
    const d = await r.json();
    const current = d.current || {};
    const hourly = d.hourly || {};
    const windowRows = pickGameWeatherWindow(hourly, viewDate, gameTime);
    const maxRain = windowRows.reduce((m,row)=>Math.max(m, Number(row.rainChance || 0)), 0);
    const startRow = windowRows.find(row => row.kind === "start") || windowRows[0] || null;
    return {
      temp: Math.round(current.temperature_2m ?? startRow?.temp ?? 0),
      wind: Math.round(current.windspeed_10m ?? startRow?.wind ?? 0),
      code: current.weathercode ?? startRow?.code ?? 0,
      rainChance: Math.round(maxRain || 0),
      hourly: windowRows
    };
  } catch { return null; }
}

function parseGameDateTimeLocal(viewDate, gameTime) {
  if (!viewDate || !gameTime) return null;
  const raw = String(gameTime).trim();
  const m12 = raw.match(/(\d{1,2})\s*:\s*(\d{2})\s*(AM|PM)/i);
  const m24 = raw.match(/\b(\d{1,2})\s*:\s*(\d{2})\b/);
  let h, min;
  if (m12) {
    h = parseInt(m12[1],10); min = parseInt(m12[2],10);
    const ap = m12[3].toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
  } else if (m24) {
    h = parseInt(m24[1],10); min = parseInt(m24[2],10);
  } else return null;
  return new Date(`${viewDate}T${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}:00`);
}

function pickGameWeatherWindow(hourly, viewDate, gameTime) {
  const times = hourly?.time || [];
  if (!times.length) return [];
  const start = parseGameDateTimeLocal(viewDate, gameTime);
  if (!start) return times.slice(0,6).map((time,i)=>weatherHourFromHourly(hourly,i,time,i===0?"start":""));
  const from = new Date(start.getTime() - 60*60*1000);
  const to = new Date(start.getTime() + 5*60*60*1000);
  return times.map((time,i)=>({ time, date:new Date(time), i }))
    .filter(x => x.date >= from && x.date <= to)
    .map(x => weatherHourFromHourly(hourly, x.i, x.time, Math.abs(x.date-start)<30*60*1000 ? "start" : ""));
}

function weatherHourFromHourly(hourly, i, time, kind="") {
  return {
    time, kind,
    label: new Date(time).toLocaleTimeString([], { hour:"numeric", minute:"2-digit" }),
    temp: Math.round(hourly.temperature_2m?.[i] ?? 0),
    code: hourly.weathercode?.[i] ?? 0,
    rainChance: Math.round(hourly.precipitation_probability?.[i] ?? 0),
    precip: hourly.precipitation?.[i] ?? 0,
    wind: Math.round(hourly.windspeed_10m?.[i] ?? 0),
  };
}

// ── Roster slot definitions ────────────────────────────────────────
const ROSTER_CAP = 28;
const HITTER_STARTER_SLOTS  = ["SS","2B","1B","3B","C","IF","OF","OF","UTIL","UTIL"];
const PITCHER_STARTER_SLOTS = ["P","P","SP","SP","SP","SP","RP","RP"];

function isPitcher(player) { return isPitcherPlayer(player); }

function canFillSlot(slot, player) {
  const pos = player.pos || [];
  if (slot==="C")    return pos.includes("C");
  if (slot==="1B")   return pos.includes("1B");
  if (slot==="2B")   return pos.includes("2B");
  if (slot==="3B")   return pos.includes("3B");
  if (slot==="SS")   return pos.includes("SS");
  if (slot==="IF")   return pos.some(p=>["1B","2B","3B","SS"].includes(p));
  if (slot==="OF")   return pos.some(p=>["OF","CF","LF","RF"].includes(p));
  if (slot==="UTIL") return !isPitcher(player) && player.status!=="IL";
  if (slot==="P")    return pos.some(p=>["SP","RP","P","CP"].includes(p));
  if (slot==="SP")   return pos.includes("SP") || pos.includes("P");
  if (slot==="RP")   return pos.some(p=>["RP","CP","P"].includes(p));
  if (slot==="IL")   return player.status==="IL";
  return false;
}

/**
 * Compute a smart lineup display status for a player.
 * teamsWithLineup = Set of team abbreviations that have at least one confirmed starter today.
 */
function isPitcherPlayer(player) {
  return (player.pos||[]).some(p => ["SP","RP","P","CP"].includes(p));
}
function normNameForProbableMatch(value) {
  if (value == null) return "";
  let s = "";
  if (typeof value === "object") {
    s = value.fullName || value.name || value.playerName || value.displayName || value.shortName || value.text || value.label || "";
  } else {
    s = String(value);
  }
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function probableNameMatchesPlayer(player, candidate) {
  const cand = normNameForProbableMatch(candidate);
  if (!cand) return false;
  const names = [
    player?.name,
    player?.fullName,
    player?.playerName,
    player?.displayName,
    player?.espnName,
    player?.mlbName,
    player?.rotowireName,
    player?.today?.name,
    player?.today?.playerName,
  ].map(normNameForProbableMatch).filter(Boolean);

  return names.some(n => {
    if (!n) return false;
    if (n === cand) return true;
    // Handles API values like "Michael Wacha (KC)" or abbreviated first names.
    if (cand.includes(n) || n.includes(cand)) return true;
    const np = n.split(" ");
    const cp = cand.split(" ");
    if (np.length >= 2 && cp.length >= 2) {
      return np[np.length - 1] === cp[cp.length - 1] && np[0][0] === cp[0][0];
    }
    return false;
  });
}


const TEAM_ABBR_ALIASES = {
  ARI:["AZ"], AZ:["ARI"],
  ATH:["OAK"], OAK:["ATH"],
  CHW:["CWS"], CWS:["CHW"],
  WSH:["WAS"], WAS:["WSH"],
  SFG:["SF"], SF:["SFG"],
  KCR:["KC"], KC:["KCR"],
  SDP:["SD"], SD:["SDP"],
  TBR:["TB"], TB:["TBR"],
  LAD:["LA"], LA:["LAD"],
};

function normalizeTeamAbbr(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

function teamAbbrVariants(value) {
  const base = normalizeTeamAbbr(value);
  if (!base) return [];
  const out = new Set([base]);
  (TEAM_ABBR_ALIASES[base] || []).forEach(v => out.add(normalizeTeamAbbr(v)));
  return [...out].filter(Boolean);
}

function teamAbbrMatches(a, b) {
  const av = teamAbbrVariants(a);
  const bv = new Set(teamAbbrVariants(b));
  return av.some(v => bv.has(v));
}

function expandedTeamSet(values) {
  const out = new Set();
  (values || []).forEach(v => teamAbbrVariants(v).forEach(x => out.add(x)));
  return out;
}

function setHasTeamAbbr(setLike, team) {
  if (!setLike || !team) return false;
  return teamAbbrVariants(team).some(v => setLike.has(v));
}

function teamMatchesValue(player, value) {
  if (!player || value == null) return false;
  const playerTeam = player.team || player.mlbTeam || player.teamAbbr || player.today?.team || "";
  return teamAbbrMatches(playerTeam, value);
}

function valueLooksTrue(value) {
  if (value === true) return true;
  if (value === 1) return true;
  const s = String(value ?? "").trim().toLowerCase();
  return ["true", "yes", "y", "1", "probable", "probable starter", "scheduled starter", "projected starter"].includes(s);
}

function valueLooksFalse(value) {
  if (value === false) return true;
  if (value === 0) return true;
  const s = String(value ?? "").trim().toLowerCase();
  return ["false", "no", "n", "0", "not probable", "not scheduled", "not starter", "not today's starter"].includes(s);
}

function isExplicitlyNotProbableStarter(player) {
  const t = player?.today || {};
  const falseFields = [
    "isProbableStarter", "probableStarter", "is_probable_starter", "isProbableSP", "probableSP",
    "isScheduledStarter", "scheduledStarter", "isProjectedStarter", "projectedStarter"
  ];
  return falseFields.some(k => valueLooksFalse(t[k]));
}

function isEspnActiveSpSlotProbableFallback(player) {
  // Deliberately disabled for SP probable classification.
  // ESPN active SP/P slot is only a fantasy roster slot; it does NOT mean that pitcher
  // is today's real MLB scheduled starter. The previous broad fallback pulled every
  // active SP-only pitcher with a game into "Today's Probable / Confirmed Starting Pitchers".
  // Use only provider-confirmed probable starter data: backend DailyPlayerStatus,
  // MLB schedule probablePitcher, RotoWire/MLB/ESPN probable fields, or confirmed game evidence.
  return false;
}


function findScheduleForPlayer(player, schedule, viewDate) {
  if (!player || !Array.isArray(schedule)) return null;
  const playerTeams = [player.team, player.mlbTeam, player.teamAbbr, player.today?.team].filter(Boolean);
  return schedule.find(s => s && s.date === viewDate && playerTeams.some(t => teamAbbrMatches(s.home_abbr, t) || teamAbbrMatches(s.away_abbr, t))) || null;
}

function scheduleSideForPlayer(player, sched) {
  if (!player || !sched) return null;
  const playerTeams = [player.team, player.mlbTeam, player.teamAbbr, player.today?.team].filter(Boolean);
  if (playerTeams.some(t => teamAbbrMatches(sched.home_abbr, t))) return "home";
  if (playerTeams.some(t => teamAbbrMatches(sched.away_abbr, t))) return "away";
  return null;
}

function scheduleOppForPlayer(player, sched) {
  if (!player || !sched) return null;
  const side = scheduleSideForPlayer(player, sched);
  if (side === "home") return `vs ${sched.away_abbr || ""}`.trim();
  if (side === "away") return `@ ${sched.home_abbr || ""}`.trim();
  return null;
}

function scheduleProbableMatchesPlayer(player, sched) {
  if (!player || !sched) return false;
  const side = scheduleSideForPlayer(player, sched);
  if (!side) return false;

  const probId = side === "home" ? sched.home_prob_sp_id : sched.away_prob_sp_id;
  const probName = side === "home" ? sched.home_prob_sp : sched.away_prob_sp;

  const playerMlbIds = [player.mlbId, player.mlb_id, player.player?.mlb_id, player.today?.mlbId, player.today?.mlb_id]
    .filter(v => v !== null && v !== undefined && String(v).trim() !== "")
    .map(v => String(v));
  if (probId && playerMlbIds.includes(String(probId))) return true;

  return probableNameMatchesPlayer(player, probName);
}

function applyScheduleOverlay(player, schedule, viewDate) {
  if (!player) return player;
  const sched = findScheduleForPlayer(player, schedule, viewDate);
  if (!sched) return player;

  const probableMatch = scheduleProbableMatchesPlayer(player, sched);
  const opp = scheduleOppForPlayer(player, sched);
  const nextToday = {
    ...(player.today || {}),
    teamHasGame: true,
    opp: player.today?.opp || opp,
    gameTime: player.today?.gameTime || sched.game_time || null,
    gameStatus: player.today?.gameStatus || sched.game_status || null,
    venueName: player.today?.venueName || sched.venue_name || null,
  };

  if (probableMatch) {
    const side = scheduleSideForPlayer(player, sched);
    nextToday.isProbableStarter = true;
    nextToday.probableSource = "MLB schedule probablePitcher";
    nextToday.probablePitcherName = side === "home" ? sched.home_prob_sp : sched.away_prob_sp;
  }

  return { ...player, today: nextToday };
}

function applyScheduleOverlayToEntries(entries, schedule, viewDate) {
  return (entries || []).map(p => applyScheduleOverlay(p, schedule, viewDate));
}

function isProbableStarter(player) {
  const t = player?.today || {};

  // Schedule overlay wins. It is produced from /roster/schedule MLB probablePitcher data
  // and prevents stale DailyPlayerStatus false rows from hiding a real probable starter.
  if (t.probableSource === "MLB schedule probablePitcher" && (t.probablePitcherName || t.isProbableStarter)) return true;

  // Backend-normalized flag, if present.
  const boolFields = [
    "isProbableStarter", "probableStarter", "is_probable_starter", "isProbableSP", "probableSP",
    "isScheduledStarter", "scheduledStarter", "isProjectedStarter", "projectedStarter"
  ];
  for (const k of boolFields) {
    if (valueLooksTrue(t[k])) return true;
  }

  // Provider/name-based probable starter fields. This fixes cases where ESPN/MLB/RotoWire
  // write a probable pitcher name but the normalized isProbableStarter boolean was missing.
  const directNameFields = [
    "ownProbablePitcher", "ownProbablePitcherName", "teamProbablePitcher", "teamProbablePitcherName",
    "probablePitcher", "probablePitcherName", "probableStarter", "probableStarterName",
    "scheduledStarter", "scheduledStarterName", "projectedStarter", "projectedStarterName",
    "startingPitcher", "startingPitcherName", "starter", "starterName", "teamStarter", "teamStarterName",
    "espnProbablePitcher", "espnProbablePitcherName", "mlbProbablePitcher", "mlbProbablePitcherName",
    "rotowireProbablePitcher", "rotowireProbablePitcherName", "probable_sp", "probableSp", "probable_sp_name", "probableSpName"
  ];
  for (const k of directNameFields) {
    if (probableNameMatchesPlayer(player, t[k])) return true;
  }

  // Home/away probable starter fields. Only trust these when the row team matches that side.
  const homeTeam = t.homeTeam || t.home || t.home_abbr || t.homeAbbr || t.home_team;
  const awayTeam = t.awayTeam || t.away || t.away_abbr || t.awayAbbr || t.away_team;
  const homeNames = [t.homeProbablePitcher, t.homeProbablePitcherName, t.homeStarter, t.homeStarterName, t.home_sp, t.homeSp, t.home_sp_name, t.homeSpName];
  const awayNames = [t.awayProbablePitcher, t.awayProbablePitcherName, t.awayStarter, t.awayStarterName, t.away_sp, t.awaySp, t.away_sp_name, t.awaySpName];
  if (teamMatchesValue(player, homeTeam) && homeNames.some(v => probableNameMatchesPlayer(player, v))) return true;
  if (teamMatchesValue(player, awayTeam) && awayNames.some(v => probableNameMatchesPlayer(player, v))) return true;

  // Array/object provider payloads such as probablePitchers: [{team,name,source}]
  const arrays = [t.probablePitchers, t.probableStarters, t.scheduledStarters, t.projectedStarters, t.starters];
  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const itemTeam = item?.team || item?.teamAbbr || item?.abbr || item?.mlbTeam;
      if (itemTeam && !teamMatchesValue(player, itemTeam)) continue;
      if (probableNameMatchesPlayer(player, item)) return true;
      if (probableNameMatchesPlayer(player, item?.name || item?.fullName || item?.playerName || item?.probablePitcherName || item?.starterName)) return true;
    }
  }

  if (isEspnActiveSpSlotProbableFallback(player)) return true;

  return false;
}
function isConfirmedStartingPitcher(player) {
  // Confirmed/bulk-starter evidence only. Probable-only SPs intentionally do NOT get
  // the confirmed starter check mark.
  return !!(isPitcherPlayer(player) && hasStartingLineupEvidence(player));
}
function probableStarterSourceLabel(player) {
  const t = player?.today || {};
  if (isEspnActiveSpSlotProbableFallback(player)) return "ESPN active SP/P slot";
  const raw = t.probableSource || t.lineupSource || t.source || t.provider || null;
  if (!raw && (t.probablePitcherName || t.probable_sp_name || t.probableSpName)) return "MLB/RotoWire/ESPN probable pitcher";
  if (!raw) return "probable source";
  const x = String(raw).toLowerCase();
  if (x.includes("rotowire")) return "RotoWire";
  if (x.includes("mlb")) return "MLB";
  if (x.includes("espn")) return "ESPN";
  return String(raw);
}
function isSpEligible(player) {
  // SP-eligible: has explicit "SP" tag, OR is today's probable starter
  // Generic "P" pitchers are classified RP for display unless confirmed/probable as today's SP
  const pos = player.pos || [];
  if (pos.includes("SP")) return true;
  if (isProbableStarter(player)) return true;
  return false;
}
function isRpOnly(player) {
  // Pure RP for display: pitcher who is NOT SP-eligible
  // This includes generic "P" pitchers who aren't today's probable starter
  const pos = player.pos || [];
  const isPitcherAtAll = pos.some(p => ["SP","RP","P","CP"].includes(p));
  return isPitcherAtAll && !isSpEligible(player);
}
function primaryPitcherRole(player) {
  // Returns "SP", "RP", or null for hitters
  if (!isPitcherPlayer(player)) return null;
  const pos = player.pos || [];
  if (isRpOnly(player)) return "RP";
  if (isSpEligible(player)) return "SP";
  return "RP"; // fallback
}

/**
 * Predict the actual field position a hitter is most likely to play today.
 *
 * Uses current MLB news/research for known platoon/role situations,
 * opposing pitcher handedness (spHand), and ESPN position eligibility order.
 *
 * UTIL and IF are never returned as display values — they are fantasy slots.
 */

// Documented current-season role overrides based on news research (March 2026).
// Format: mlb_id → { vsR: position, vsL: position, note: string }
// Updated from: lancasteronline.com, si.com/mlb, athlonsports.com, cbssports.com
const PLAYER_ROLE_RESEARCH = {
  656811: { vsR: "RF",  vsL: "1B", note: "PIT: RF vs RHP, 1B vs LHP (O'Hearn)" },  // Ryan O'Hearn
  595879: { vsR: "CF",  vsL: "SS", note: "DET: Util/bench — CF/3B vs RHP, SS vs LHP when McGonigle sits (Báez)" },  // Javier Báez
};

function getExpectedPosition(player, slot, todayStatus, dbResearch) {
  const pos    = player?.pos  || [];
  const mlbId  = player?.id   || null;   // player.id is mlb_id in this app
  const spHand = todayStatus?.spHand || null;   // "L" or "R"
  const usage  = player?.usage || {};
  const vsRHP  = usage.vsRHP || 0;
  const vsLHP  = usage.vsLHP || 0;

  // Pitcher slots — handled elsewhere
  if (["SP","RP","P","CP"].some(p => pos.includes(p))) return null;

  const PURE_FANTASY = new Set(["UTIL","IF"]);
  const realPos = pos.filter(p => !PURE_FANTASY.has(p));

  let platoonNote = null;

  // ── 1. DB research (highest priority — live web-searched data) ───────────
  if (dbResearch?.role_note && (dbResearch.position_vsR || dbResearch.position_vsL)) {
    const candidate = spHand === "R"
      ? (dbResearch.position_vsR || dbResearch.position_vsL)
      : (dbResearch.position_vsL || dbResearch.position_vsR);
    platoonNote = dbResearch.platoon ? `platoon (researched ${new Date(dbResearch.researched_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})})` : null;
    return { pos: candidate, platoonNote, source: "role research" };
  }

  // ── 2. Static research dict (fallback for known platoon players) ──────────
  const research = PLAYER_ROLE_RESEARCH[mlbId];
  if (research && spHand) {
    const candidate = spHand === "R" ? research.vsR : research.vsL;
    platoonNote = research.note;
    return { pos: candidate, platoonNote, source: "role research" };
  }

  // ── 2. Slot-driven candidate ────────────────────────────────────────────
  let candidate = null;
  if (slot === "C")       candidate = "C";
  else if (slot === "1B") candidate = "1B";
  else if (slot === "2B") candidate = "2B";
  else if (slot === "3B") candidate = "3B";
  else if (slot === "SS") candidate = "SS";
  else if (slot === "OF") {
    candidate = pos.find(p => ["LF","CF","RF"].includes(p)) || "OF";
  } else if (slot === "IF") {
    candidate = pos.find(p => ["SS","2B","3B","1B"].includes(p)) || null;
  } else {
    // UTIL or BN — pick primary real position (first in list, DH excluded)
    candidate = realPos.find(p => p !== "DH") || realPos[0] || pos[0] || null;
  }

  if (candidate === "OF") {
    candidate = pos.find(p => ["LF","CF","RF"].includes(p)) || "OF";
  }

  // ── 3. Split-based platoon detection (when enough career data) ──────────
  const totalStarts = vsRHP + vsLHP;
  if (spHand && totalStarts >= 20) {
    const ratio = spHand === "R" ? vsRHP / totalStarts : vsLHP / totalStarts;
    if (ratio < 0.30) {
      platoonNote = `platoon vs ${spHand}HP`;
    }
  }

  const source = player?._espnPositions ? "ESPN eligibility" : "MLB 2025 fielding stats";
  return { pos: candidate, platoonNote, source };
}

const IF_C_POS = new Set(["C","1B","2B","3B","SS"]);
const OF_POS = new Set(["OF","LF","CF","RF"]);
const DH_OF_POS = new Set(["DH","OF","LF","CF","RF"]);

function normPosValue(pos) { return String(pos || "").trim().toUpperCase(); }

function hasStartingLineupEvidence(player) {
  const t = player?.today || {};
  const ls = player?.liveStats || {};
  const batRaw = t.bat ?? t.batting_order ?? ls.bat ?? ls.batting_order;
  const batNum = Number(batRaw);
  const hasBattingOrder = !!batRaw && !Number.isNaN(batNum) && batNum > 0;
  const rawPos = normPosValue(ls.position || t.pos || t.fielding_pos);
  const hasActualLineupPos = !!rawPos && !["—", "-", "NA", "N/A", "BN", "BENCH", "OUT", "IL"].includes(rawPos);

  // Confirmed fix: a batter with a batting order and/or real fielding position
  // is starting. Do not allow a later partial/stale parse to show OUT while
  // keeping #batting-order, which caused rows like "Not in lineup - #8".
  return !!(t.in || t.in_lineup || hasBattingOrder || hasActualLineupPos);
}

function getLineupTone(player, displayStatus, isToday_) {
  if (!player || !isToday_) return null;

  const elig = new Set((player.pos || []).map(normPosValue));
  const actualPos = normPosValue(player?.liveStats?.position || player?.today?.pos);
  const hasIF = [...elig].some(p => IF_C_POS.has(p));
  const hasOF = [...elig].some(p => OF_POS.has(p));
  const isIFOF = hasIF && hasOF;
  const isActualOF = OF_POS.has(actualPos);
  const isPitcher = isPitcherPlayer(player);

  // Awaiting lineup/status confirmation.
  if (displayStatus === "Lineup Pending" || displayStatus === "Awaiting Lineup") {
    return { status:"Lineup Pending", color:"blue", label:"", detail:"Awaiting lineup" };
  }

  // Confirmed lineup and player is not in the starting lineup.
  if (displayStatus === "Confirmed Out" || displayStatus === "Not Starting" || displayStatus === "Not in Lineup") {
    return { status:"Not Starting", color:"red", label:"", detail:"Not in starting lineup" };
  }

  if (displayStatus === "Starting" || displayStatus === "Starting Pitcher" || displayStatus === "Probable Starting Pitcher") {
    // Pitchers: confirmed SPs get the check mark; probable-only SPs stay green but do not.
    if (isPitcher) {
      const confirmedSp = isConfirmedStartingPitcher(player) || displayStatus === "Starting Pitcher";
      if (confirmedSp) {
        return { status:"Starting Pitcher", color:"green", label:"", detail:"Confirmed starter", icon:"✅", confirmed:true };
      }
      return { status:"Probable Starting Pitcher", color:"green", label:"", detail:`Probable starter · ${probableStarterSourceLabel(player)}`, icon:"⚾", confirmed:false };
    }

    // Alert: any hitter starting at DH.
    if (actualPos === "DH") {
      return { status:"DH Alert", color:"red", label:"", detail:"Starting at DH" };
    }

    // Alert: IF/OF eligible hitter is starting in OF instead of IF/C.
    if (isIFOF && isActualOF) {
      return { status:"OF Alert", color:"red", label:"", detail:`IF/OF eligible · starting at ${actualPos}` };
    }

    // Confirmed starter, including OF-only players starting in OF.
    return {
      status:"Starting",
      color:"green",
      label:"",
      detail: actualPos ? `Starting at ${actualPos}` : "Confirmed starting"
    };
  }

  return null;
}


function isLineupConfirmedForPlayer(player, teamsWithLineup) {
  if (!player) return false;
  const t = player.today || {};
  const sourceText = String(
    t.lineupSource || t.lineup_source || t.source || t.provider ||
    t.statusSource || t.status_source || t.sourceStatus || t.source_status || ""
  ).toLowerCase();

  const statusText = String(
    t.lineupStatus || t.lineup_status || t.statusText || t.status_text ||
    t.sourceStatus || t.source_status || t.status || ""
  ).toLowerCase();

  // Never call someone "out" if the row itself has actual starter evidence.
  if (hasStartingLineupEvidence(player)) return true;

  // b85: do NOT trust a bare row-level lineup_confirmed/teamLineupConfirmed flag.
  // Those flags can be copied from schedule/probable-SP hydration and can mark an
  // entire team confirmed too early. That was the b82-b84 regression that moved
  // active hitters into red before ESPN/MLB/RotoWire posted the real lineup.
  const pendingWords = ["projected", "pending", "expected", "probable", "preview", "scheduled", "not posted", "unconfirmed"];
  if (pendingWords.some(w => statusText.includes(w) || sourceText.includes(w))) return false;

  const confirmedWords = ["confirmed lineup", "lineup confirmed", "official lineup", "posted lineup", "confirmed", "official", "posted"];
  const sourceLooksLineup = ["rotowire", "mlb lineup", "starting-lineups", "daily-lineups", "espn lineup", "lineup"].some(w => sourceText.includes(w));
  if (confirmedWords.some(w => statusText.includes(w)) && sourceLooksLineup) return true;

  // Use the backend team list only after b85 backend filtering. That endpoint now
  // requires actual non-pitcher batting-lineup evidence for a team, not just a
  // stale/broad lineup_confirmed boolean.
  if (teamsWithLineup && setHasTeamAbbr(teamsWithLineup, player.team)) return true;

  return false;
}

function getDisplayStatus(player, teamsWithLineup, isToday_, teamPlays, viewDate) {
  if (!player) return null;
  if (player.status === "IL")  return "IL";
  if (player.status === "DTD") return "DTD";

  const confirmedStartingEvidence = hasStartingLineupEvidence(player);

  // Future date view — use DB-backed probable starter data
  if (isFuture(viewDate || "")) {
    if (!teamPlays) return "No Game";
    if (isConfirmedStartingPitcher(player)) return "Starting Pitcher";
    if (isPitcherPlayer(player) && isProbableStarter(player)) return "Probable Starting Pitcher";
    if (confirmedStartingEvidence && !isPitcherPlayer(player)) return "Starting";
    if (isSpEligible(player) && !isProbableStarter(player)) return "SP Available";
    if (isRpOnly(player)) return "RP Available";
    return "Lineup Pending";   // hitter with game scheduled, lineup not yet known
  }

  // Historical view
  if (!isToday_) {
    if (confirmedStartingEvidence || isProbableStarter(player)) return "Started";
    if (!teamPlays) return "No Game";
    return "DNP";
  }

  // No game today for this player's team
  if (!teamPlays) return "No Game";

  // Confirmed anti-downgrade rule: if the row has batting-order or actual
  // lineup-position evidence, it is starting. This must run before Confirmed Out.
  if (isConfirmedStartingPitcher(player)) return "Starting Pitcher";
  if (confirmedStartingEvidence && !isPitcherPlayer(player)) return "Starting";

  // SP logic: scheduled probable starter → Starting Pitcher
  if (isSpEligible(player)) {
    if (isProbableStarter(player)) return "Probable Starting Pitcher";
    return "SP Available";  // SP on team, not today's scheduled starter
  }

  // RP logic: team plays = available to pitch
  if (isRpOnly(player)) {
    return "RP Available";
  }

  // Hitter logic: only mark out when team lineup is confirmed AND no starter evidence exists.
  if (isLineupConfirmedForPlayer(player, teamsWithLineup)) return "Confirmed Out";
  return "Lineup Pending";
}

/**
 * Smart priority score for slot assignment.
 * Higher = better candidate for the slot.
 * Considers: confirmed starting, batting order, start frequency (l30).
 */
function playerSlotScore(player, teamsWithLineup, isToday_, teamsPlayingToday, rpWorkload) {
  if (player.status === "IL") return -99999;
  const twl          = teamsWithLineup || new Set();
  const tpt          = teamsPlayingToday || new Set();
  const teamPlays    = player.today?.teamHasGame || setHasTeamAbbr(tpt, player.team);
  const starting     = hasStartingLineupEvidence(player);
  const bat          = player.today?.bat;
  const isProb       = player.today?.isProbableStarter;
  const lineupPosted = isLineupConfirmedForPlayer(player, twl);

  let score = 0;

  if (!teamPlays) {
    // No game — only use if nothing better available
    score = -5000;
  } else if (isSpEligible(player)) {
    // SP: must be probable starter to score positively
    if (isProb || starting)    score = 10000;   // confirmed scheduled starter
    else                       score = -2000;   // SP but not starting today
  } else if (isRpOnly(player)) {
    // RP: always potentially pitching; rank by availability score when available
    const wl = rpWorkload && rpWorkload[player.id];
    const availScore = wl ? wl.availability_score : 75;  // default 75 if no data
    if (starting)              score = 9000 + availScore;    // confirmed pitched today
    else if (teamPlays)        score = 6000 + availScore;    // available — weighted by rest
    else                       score = -5000;                 // no game
  } else {
    // Hitter
    if (starting)              score = 10000 + (bat ? (10 - bat) * 10 : 0);
    else if (teamPlays && !lineupPosted) score = 5000;
    else if (teamPlays && lineupPosted)  score = 1000;
  }

  // Tiebreaker: l30 start frequency
  score += (player.usage?.l30 || 0) * 3;
  return score;
}

/**
 * Count how many hitter starter slots this player could fill.
 * Lower = more constrained = should be assigned first to their slot.
 */
function playerFlexibility(player) {
  return HITTER_STARTER_SLOTS.filter(s => canFillSlot(s, player)).length;
}

/**
 * Smart auto-assign:
 * 1. IL players → IL list (never in active slots)
 * 2. Process hitter slots most-constrained-first so a pure C doesn't
 *    get "stolen" by a C/1B who could have gone to 1B instead.
 * 3. Within eligible players for a slot, sort by:
 *    a. lineup score (starting > pending > out > day off)
 *    b. flexibility (less flexible first — save versatile players for harder slots)
 * 4. Same for pitcher slots.
 */
function autoAssignSlots(players, teamsWithLineup, teamsPlayingToday, rpWorkload) {
  const used   = {};
  const result = {
    hitterStarters:{}, pitcherStarters:{},
    hitterBench:[], pitcherBench:[], hitterIL:[], pitcherIL:[], il:[],
    rosterSize: players.length,
    teamsWithLineup:   teamsWithLineup   || new Set(),
    teamsPlayingToday: teamsPlayingToday || new Set(),
    rpWorkload:        rpWorkload        || {},
  };

  // Step 1: IL players → end of their own hitter/pitcher section.
  // They are never eligible for active slots, but keeping them in their
  // positional section makes it obvious which part of the roster is affected.
  players.filter(p => p.status === "IL").forEach(p => {
    used[p._entryId] = 1;
    result.il.push(p);
    if (isPitcher(p)) result.pitcherIL.push(p);
    else result.hitterIL.push(p);
  });

  const available = (slot) =>
    players.filter(p => !used[p._entryId] && canFillSlot(slot, p));

  // Step 2: Hitter starter slots — most constrained first
  const hSlotsIndexed = HITTER_STARTER_SLOTS.map((slot, i) => ({ slot, i }));
  // Sort by how many available players can fill each slot (ascending = most constrained first)
  hSlotsIndexed.sort((a, b) => {
    const aC = available(a.slot).length;
    const bC = available(b.slot).length;
    if (aC !== bC) return aC - bC;
    // tie-break: user priority order: SS → 2B → 1B → 3B, then C/flex.
    const pri = smartSlotPriority(a.slot) - smartSlotPriority(b.slot);
    if (pri !== 0) return pri;
    const flex = ["UTIL","IF","OF"];
    const aFlex = flex.includes(a.slot) ? 1 : 0;
    const bFlex = flex.includes(b.slot) ? 1 : 0;
    return aFlex - bFlex;
  });

  for (const { slot, i } of hSlotsIndexed) {
    const elig = available(slot);
    if (!elig.length) {
      result.hitterStarters[i] = { slot, player: null };
      continue;
    }
    elig.sort((a, b) => {
      const scoreDiff = playerSlotScore(b, teamsWithLineup, true, teamsPlayingToday, rpWorkload) - playerSlotScore(a, teamsWithLineup, true, teamsPlayingToday, rpWorkload);
      if (scoreDiff !== 0) return scoreDiff;
      // tie: prefer less flexible (save versatile players for harder-to-fill slots)
      return playerFlexibility(a) - playerFlexibility(b);
    });
    const best = elig[0];
    result.hitterStarters[i] = { slot, player: best };
    used[best._entryId] = 1;
  }

  // Step 3: Pitcher starter slots
  PITCHER_STARTER_SLOTS.forEach((slot, i) => {
    const elig = available(slot);
    if (!elig.length) {
      result.pitcherStarters[i] = { slot, player: null };
      return;
    }
    elig.sort((a, b) =>
      playerSlotScore(b, teamsWithLineup, true, teamsPlayingToday, rpWorkload) - playerSlotScore(a, teamsWithLineup, true, teamsPlayingToday, rpWorkload)
    );
    const best = elig[0];
    result.pitcherStarters[i] = { slot, player: best };
    used[best._entryId] = 1;
  });

  // Step 4: Remaining → bench
  players.filter(p => !used[p._entryId]).forEach(p => {
    isPitcher(p) ? result.pitcherBench.push(p) : result.hitterBench.push(p);
  });

  return result;
}

// ── Date utilities ─────────────────────────────────────────────────
function getLocalDateStr(d) {
  // Always use local date, never UTC
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function getTodayStr() { return getLocalDateStr(new Date()); }

function getViewDate(switchHour=2) {
  const now = new Date();
  if (now.getHours() < switchHour) {
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate()-1);
    return getLocalDateStr(yesterday);
  }
  return getLocalDateStr(now);
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr+"T12:00:00");
  return { day: d.toLocaleDateString("en-US",{weekday:"short"}), date: d.getDate() };
}

function isToday(dateStr) { return dateStr === getTodayStr(); }
function isFuture(dateStr) { return dateStr > getTodayStr(); }

/* ── SHARED COMPONENTS ────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG["Unknown"];
  // Shorten long labels to fit the 80px column
  const label = status === "Lineup Pending" ? "Pending"
              : status === "Confirmed Out"  ? "Out"
              : status === "Not Starting"   ? "Out"
              : status === "DH/OF Alert"    ? "DH/OF"
              : status === "DH Alert"       ? "DH"
              : status === "OF Alert"       ? "OF"
              : status === "IF Start"       ? "IF Start"
              : status === "No Game"        ? "No Game"
              : status === "Starting Pitcher" ? "Starting"
              : status === "SP Available"   ? "Not Starting"
              : status === "RP Available"   ? "Available"
              : status;
  return <span className="badge" style={{ background:cfg.bg, color:cfg.color }}>
    {cfg.dot && <span className="pulse" style={{ width:6,height:6,borderRadius:"50%",background:cfg.color,display:"inline-block" }}/>}
    {label}
  </span>;
}

function PosTag({ pos }) {
  const cfg = POS_COLORS[pos] || { bg:"#1e293b", color:"#94a3b8", border:"#334155" };
  return <span style={{ display:"inline-flex",alignItems:"center",background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.border}`,padding:"1px 6px",borderRadius:4,fontSize:11,fontWeight:700,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:"0.05em" }}>{pos}</span>;
}

function PosLabel({ slot }) {
  const cfg = POS_COLORS[slot] || POS_COLORS.BN;
  return <span style={{ fontFamily:"'Barlow Condensed',sans-serif",fontSize:13,fontWeight:700,letterSpacing:"0.08em",color:cfg.color,width:44,flexShrink:0,textAlign:"center" }}>{slot}</span>;
}

function Spinner({ size=16 }) {
  return <div className="spin" style={{ width:size,height:size,border:`2px solid #1e2d42`,borderTopColor:C.green,borderRadius:"50%" }}/>;
}

function GameStatusFlag({ status }) {
  if (!status || ["Scheduled","In Progress","Final",""].includes(status)) return null;
  const color = status==="Postponed"?C.red:status.includes("Delay")||status.includes("Suspend")?C.amber:C.textDim;
  return <span title={status} style={{ fontSize:10,fontWeight:700,color,background:`${color}22`,border:`1px solid ${color}44`,borderRadius:3,padding:"1px 4px",fontFamily:"'Barlow Condensed'" }}>
    {status==="Postponed"?"PPD":status.includes("Delay")?"DLY":status.includes("Suspend")?"SUS":status.slice(0,3).toUpperCase()}
  </span>;
}

function WeatherCell({ team, isDome, venueName, viewDate, gameTime }) {
  const [wx, setWx] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const stadium = STADIUMS[team];
  const dome = isDome || stadium?.dome;

  async function ensureWx(show=false) {
    if (!stadium || dome) return null;
    const cacheKey = `${team}|${viewDate||""}|${gameTime||""}`;
    if (WEATHER_CACHE.has(cacheKey)) {
      const cached = WEATHER_CACHE.get(cacheKey);
      setWx(cached);
      return cached;
    }
    if (show) setLoading(true);
    const data = await fetchWeather(stadium.lat, stadium.lon, viewDate, gameTime);
    WEATHER_CACHE.set(cacheKey, data);
    setWx(data);
    if (show) setLoading(false);
    return data;
  }

  async function loadWx(e) {
    e?.stopPropagation?.();
    if (!stadium || dome) { setOpen(o=>!o); return; }
    setOpen(true);
    if (!wx) await ensureWx(true);
  }

  useEffect(()=>{
    if (stadium && !dome && gameTime) ensureWx(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, dome, viewDate, gameTime]);

  if (!team) return null;
  const rainChance = wx?.rainChance ?? null;
  const icon = dome ? "🏟️" : (rainChance != null && rainChance >= 25 ? "🌧️" : wx ? wxIcon(wx.code) : "☁️");
  return (
    <div style={{ position:"relative", display:"inline-block" }} onClick={e=>e.stopPropagation()}>
      <button onClick={loadWx} style={{ background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:12,display:"flex",alignItems:"center",gap:3,padding:"2px 4px",borderRadius:3,transition:"color 0.1s" }}
        title={dome?"Domed stadium":`Rain chance / forecast at ${venueName||stadium?.name||team}`}>
        <span>{icon}</span>
        {!dome && rainChance != null && <span className="fira" style={{ fontSize:10,color:rainChance>=40?C.amber:C.textDim }}>{rainChance}%</span>}
      </button>
      {open && (
        <div className="weather-forecast-pop">
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:8 }}>
            <div>
              <div className="barlow" style={{ fontSize:15,fontWeight:800,color:C.text,letterSpacing:"0.06em" }}>{venueName||stadium?.name||team}</div>
              <div style={{ fontSize:11,color:C.textDim }}>Forecast: 1 hour before first pitch through 5 hours after</div>
            </div>
            <button onClick={()=>setOpen(false)} style={{ background:"none",border:"none",color:C.textDim,cursor:"pointer",fontSize:18 }}>×</button>
          </div>
          {dome ? <div style={{ fontSize:13,color:C.text }}>🏟️ Domed / retractable roof</div>
          : loading ? <Spinner size={14}/>
          : wx ? (
            <div>
              <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:8 }}>
                <div style={{ fontSize:24 }}>{icon}</div>
                <div>
                  <div style={{ fontSize:14,fontWeight:800,color:rainChance>=40?C.amber:C.text }}>Rain chance near game: {rainChance ?? 0}%</div>
                  <div style={{ fontSize:12,color:C.textDim }}>Current {wx.temp}°F · Wind {wx.wind} mph</div>
                </div>
              </div>
              <div style={{ display:"grid",gap:5 }}>
                {(wx.hourly||[]).map((h,i)=>(
                  <div key={`${h.time}-${i}`} style={{ display:"grid",gridTemplateColumns:"64px 34px 1fr 54px",gap:8,alignItems:"center",background:h.kind==="start"?"rgba(16,185,129,.10)":"#0f1a2a",border:`1px solid ${h.kind==="start"?"#065f46":C.border}`,borderRadius:7,padding:"6px 8px" }}>
                    <span className="fira" style={{ fontSize:11,color:C.text }}>{h.label}</span>
                    <span style={{ fontSize:16 }}>{h.rainChance>=25?"🌧️":wxIcon(h.code)}</span>
                    <span style={{ fontSize:12,color:C.textDim }}>{h.temp}°F · wind {h.wind} mph</span>
                    <span className="fira" style={{ fontSize:12,fontWeight:800,color:h.rainChance>=40?C.amber:C.text }}>{h.rainChance}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <div style={{ fontSize:12,color:C.textDim }}>No forecast data</div>}
        </div>
      )}
    </div>
  );
}

function ConfirmModal({ playerName, onConfirm, onCancel }) {
  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal-box" style={{ maxWidth:360 }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:"24px 28px",textAlign:"center" }}>
          <AlertTriangle size={32} color={C.amber} style={{ marginBottom:12 }}/>
          <div style={{ fontSize:16,fontWeight:600,marginBottom:8 }}>Remove Player?</div>
          <div style={{ fontSize:14,color:C.textDim,marginBottom:24 }}>
            Remove <strong style={{ color:C.text }}>{playerName}</strong> from your roster?
          </div>
          <div style={{ display:"flex",gap:10,justifyContent:"center" }}>
            <button className="btn-outline" onClick={onCancel}>Cancel</button>
            <button className="btn-red" onClick={onConfirm}><Trash2 size={13}/> Remove</button>
          </div>
        </div>
      </div>
    </div>
  );
}


function BulkRemoveModal({ title, entries, onClose, onConfirm }) {
  const [selected, setSelected] = React.useState(new Set(entries.map(e => e._entryId)));
  const [filter, setFilter] = React.useState("");
  const visible = entries.filter(e => !filter || e.name.toLowerCase().includes(filter.toLowerCase()) || e.team.toLowerCase().includes(filter.toLowerCase()));
  const selectedCount = selected.size;
  function toggle(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function setVisible(checked) {
    setSelected(prev => { const n = new Set(prev); visible.forEach(e => checked ? n.add(e._entryId) : n.delete(e._entryId)); return n; });
  }
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth:620 }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:"20px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div>
            <div className="barlow" style={{ fontSize:18,fontWeight:800,letterSpacing:"0.05em" }}>{title}</div>
            <div style={{ fontSize:12,color:C.textDim,marginTop:3 }}>This removes players from FANTAG only. It does not drop players from ESPN.</div>
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",color:C.textDim,cursor:"pointer" }}><X size={20}/></button>
        </div>
        <div style={{ padding:"16px 24px" }}>
          <div style={{ display:"flex",gap:8,alignItems:"center",marginBottom:12 }}>
            <input className="search-box" style={{ maxWidth:260 }} placeholder="Filter players…" value={filter} onChange={e=>setFilter(e.target.value)}/>
            <button className="btn-outline" onClick={()=>setVisible(true)}>Select Visible</button>
            <button className="btn-outline" onClick={()=>setVisible(false)}>Clear Visible</button>
          </div>
          <div style={{ maxHeight:360,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:8 }}>
            {visible.map(e => (
              <label key={e._entryId} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderBottom:`1px solid ${C.border}`,cursor:"pointer",background:selected.has(e._entryId)?"#102033":"transparent" }}>
                <input type="checkbox" checked={selected.has(e._entryId)} onChange={()=>toggle(e._entryId)}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13,fontWeight:700,color:C.text }}>{e.name}</div>
                  <div style={{ fontSize:11,color:C.textDim }}>{e.team} · {(e.pos||[]).join(", ") || "—"} · {e._status}</div>
                </div>
              </label>
            ))}
            {visible.length===0 && <div style={{ padding:24,textAlign:"center",color:C.textDim,fontSize:13 }}>No matching players.</div>}
          </div>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16 }}>
            <div style={{ fontSize:12,color:selectedCount?C.amber:C.textDim }}>{selectedCount} selected</div>
            <div style={{ display:"flex",gap:10 }}>
              <button className="btn-outline" onClick={onClose}>Cancel</button>
              <button className="btn-red" disabled={!selectedCount} onClick={()=>onConfirm(Array.from(selected))}><Trash2 size={13}/> Remove Selected</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
/* ── DATE STRIP ───────────────────────────────────────────────────── */
function DateStrip({ viewDate, onDateChange, switchHour }) {
  const today = getTodayStr();
  const dates = [];
  for (let i=-3; i<=4; i++) {
    const d = new Date();
    d.setDate(d.getDate()+i);
    dates.push(getLocalDateStr(d));
  }
  return (
    <div className="date-strip" style={{ display:"flex",gap:4,alignItems:"center",marginBottom:14,overflowX:"auto",paddingBottom:2 }}>
      {dates.map(d=>{
        const { day, date: num } = formatDateLabel(d);
        const isSelected = d===viewDate;
        const todayFlag  = isToday(d);
        const future     = isFuture(d);
        return (
          <button key={d} onClick={()=>onDateChange(d)} className="date-btn" style={{
            background: isSelected?"#0c2a5c":"transparent",
            color:      isSelected?"#3b82f6":todayFlag?"#10b981":future?C.textDim:C.textDim,
            border:     `1px solid ${isSelected?"#1e3a6e":todayFlag?"#065f46":"transparent"}`,
            opacity:    future?0.6:1,
            minWidth:   50,
            textAlign:  "center",
            flexShrink: 0,
          }}>
            <div style={{ fontSize:10,letterSpacing:"0.06em" }}>{day.toUpperCase()}</div>
            <div style={{ fontSize:16,fontWeight:800 }}>{num}</div>
            {todayFlag && <div style={{ fontSize:9,color:"#10b981",marginTop:1 }}>TODAY</div>}
            {future    && <div style={{ fontSize:9,color:C.textDim,marginTop:1 }}>PROJ</div>}
          </button>
        );
      })}
    </div>
  );
}


function getGameOpponentLabel(player, t, sched) {
  if (!player) return "";
  const team = player.team || "";
  const rawOpp = (t && t.opp) || "";
  if (rawOpp) return `${team} ${rawOpp}`;
  if (sched) {
    if (teamAbbrMatches(sched.home_abbr, team)) return `${team} vs ${sched.away_abbr}`;
    if (teamAbbrMatches(sched.away_abbr, team)) return `${team} @ ${sched.home_abbr}`;
  }
  return team;
}

/* ── GAME CELL — extracted to avoid IIFE-in-JSX crashes ────────── */
function GameCell({ player, t, sched, gameScore, isFut, viewDate }) {
  if (!player) return <div style={{ width:155, flexShrink:0 }}/>;
  const gameTime = (t && t.gameTime) || sched?.game_time || "";
  const opp = getGameOpponentLabel(player, t, sched);
  const gStatus = (t && t.gameStatus) || sched?.game_status || "";
  const showScore = !!(gameScore && !isFut);
  if (!gameTime && !opp) return <div style={{ width:155, flexShrink:0 }}/>;
  return (
    <div style={{ width:155, flexShrink:0, fontSize:12 }}>
      <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
        {showScore
          ? <span style={{ fontSize:11, color:"#64748b" }}>{gameScore}</span>
          : (gameTime ? <span style={{ fontFamily:"'Fira Code'", color:"#e2e8f0", fontSize:11 }}>{gameTime}</span> : null)}
        {opp && (
          <div style={{ display:"flex", alignItems:"center", gap:4, flexWrap:"wrap" }}>
            <span style={{ color:"#64748b", fontSize:11 }}>{opp}</span>
            {t && t.spHand && !showScore && (
              <span style={{ color: t.spHand==="L" ? "#f59e0b" : "#3b82f6", fontSize:10, fontWeight:700 }}>
                {t.spHand}HP
              </span>
            )}
            <GameStatusFlag status={gStatus}/>
            <WeatherCell team={player.team} isDome={!!(t && t.isDome)} venueName={(t && t.venueName) || ""} viewDate={viewDate} gameTime={gameTime}/>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── PLAYER SLOT ROW ──────────────────────────────────────────────── */
function PlayerSlotRow({ slot, player, onSelect, onRemove, schedule, viewDate, scoringRules, teamsWithLineup, teamsPlayingToday, rpWorkload, researchMap, hideSlotLabel=false }) {
  const isToday_ = isToday(viewDate);
  const isFut    = isFuture(viewDate);
  const displayPlayer = applyScheduleOverlay(player, schedule, viewDate);

  // Find schedule entry for this player's team on the view date
  const sched = findScheduleForPlayer(displayPlayer, schedule, viewDate);

  const t = displayPlayer?.today || {};
  const tpt = teamsPlayingToday || new Set();
  // teamPlays: only true when we have explicit evidence team plays today.
  // t.teamHasGame===false means poll confirmed no game → never show Pending.
  // t is empty (no row): use schedule entry or teamsPlayingToday as fallback.
  const hasExplicitNoGame = t.teamHasGame === false;
  const teamPlays = !hasExplicitNoGame && (
    t.teamHasGame === true || !!sched || (displayPlayer && tpt.has(displayPlayer.team))
  );
  const ls = displayPlayer?.liveStats || {};
  const fantasyScore = scoringRules && ls && (ls.batting || ls.pitching) ? calcFantasyScore(ls, scoringRules) : null;
  const statLine = ls?.stat_line || "";
  const gameScore = ls?.game_score || "";
  const gameResult = ls?.game_result || "";
  const starting  = displayPlayer ? hasStartingLineupEvidence(displayPlayer) : false;
  const isIL      = isTeamIL(displayPlayer);
  const needsIlMove = isRosterIlButActivated(displayPlayer);
  const actualPos = ls?.position || (t.pos && t.pos !== "—" ? t.pos : null);

  // Compute the display status using lineup-awareness
  const twl = teamsWithLineup || new Set();
  const displayStatus = displayPlayer ? getDisplayStatus(displayPlayer, twl, isToday_, teamPlays, viewDate) : null;
  const lineTone = displayPlayer ? getLineupTone(displayPlayer, displayStatus, isToday_) : null;
  const statusForBadge = lineTone?.status || displayStatus;
  const isPending      = displayStatus === "Lineup Pending";
  const isConfirmedOut = displayStatus === "Confirmed Out";
  const isNoGame       = displayStatus === "No Game";
  const isSpAvailable  = displayStatus === "SP Available";
  const isRpAvailable  = displayStatus === "RP Available";
  const isStartingPitcher = displayStatus === "Starting Pitcher";
  const isProbableStartingPitcher = displayStatus === "Probable Starting Pitcher";
  const needsIlMoveColor = (lineTone?.color === "red" || isConfirmedOut) ? "#f472b6" : "#a78bfa";
  const needsIlMoveBg = (lineTone?.color === "red" || isConfirmedOut) ? "rgba(244,114,182,0.12)" : "rgba(167,139,250,0.12)";
  const needsIlMoveBorder = (lineTone?.color === "red" || isConfirmedOut) ? "rgba(244,114,182,0.38)" : "rgba(167,139,250,0.38)";
  const activeRosterAlerts = buildActiveRosterAlerts(displayPlayer, displayStatus, lineTone);
  const primaryActiveAlert = activeRosterAlerts[0] || null;
  const activeAlertColor = primaryActiveAlert?.severity === "orange" ? C.amber : C.red;
  const activeAlertBg = primaryActiveAlert?.severity === "orange" ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.12)";
  const activeAlertBorder = primaryActiveAlert?.severity === "orange" ? "rgba(245,158,11,0.38)" : "rgba(239,68,68,0.38)";

  // Row background
  const bgColor = primaryActiveAlert
    ? activeAlertBg
    : needsIlMove
    ? needsIlMoveBg
    : lineTone?.color === "red"
    ? "rgba(239,68,68,0.05)"
    : lineTone?.color === "green"
      ? "rgba(16,185,129,0.04)"
      : lineTone?.color === "blue"
        ? "rgba(96,165,250,0.035)"
        : isIL && isToday_
    ? "rgba(239,68,68,0.035)"
    : (isStartingPitcher || isProbableStartingPitcher) && isToday_
      ? "rgba(16,185,129,0.03)"
      : isConfirmedOut && isToday_
        ? "rgba(245,158,11,0.025)"
        : (isNoGame || isSpAvailable) && isToday_
          ? "rgba(75,85,99,0.04)"
          : "transparent";

  return (
    <div className={`slot-row ${hideSlotLabel ? "slot-row-no-slot" : ""}`}
      style={{ display:"flex",alignItems:"center",padding:"9px 16px",cursor:displayPlayer?"pointer":"default",background:bgColor }}
      onClick={()=>displayPlayer&&onSelect(displayPlayer)}>

      {hideSlotLabel ? <span style={{ width:44,marginRight:10,flexShrink:0 }}/> : <PosLabel slot={slot}/>}

      <div style={{ flex:1,minWidth:0,paddingLeft:10,display:"flex",alignItems:"center",gap:8 }}>
        {/* Active roster alert / IL left-border stripe */}
        {displayPlayer && primaryActiveAlert && <div style={{ width:3,height:36,borderRadius:2,background:activeAlertColor,flexShrink:0 }}/>}
        {displayPlayer && !primaryActiveAlert && isIL && <div style={{ width:3,height:36,borderRadius:2,background:C.red,flexShrink:0 }}/>}
        {displayPlayer && !primaryActiveAlert && needsIlMove && <div style={{ width:3,height:36,borderRadius:2,background:needsIlMoveColor,flexShrink:0 }}/>}
        {displayPlayer ? (
          <div style={{ minWidth:0 }}>
            <div style={{ fontWeight:600,fontSize:14,color:isIL?C.red:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{displayPlayer.name}</div>
            <div style={{ display:"flex",gap:4,alignItems:"center",marginTop:2,flexWrap:"wrap" }}>
              <span style={{ fontSize:11,color:C.textDim }}>{getGameOpponentLabel(displayPlayer, t, sched) || displayPlayer.team}</span>
              {/* All position eligibilities */}
              {displayPlayer.pos.map(p=><PosTag key={p} pos={p}/>)}
              {/* Actual position played today from boxscore */}
              {actualPos && isToday_ && starting && actualPos !== displayPlayer.pos[0] && (
                <span style={{ fontSize:10,color:C.textDim,fontFamily:"'Barlow Condensed'",fontWeight:600 }}>
                  played&nbsp;<span style={{ color:C.text }}>{actualPos}</span>
                </span>
              )}
              {lineTone?.label && (
                <span style={{ fontSize:10,color:lineTone.color==="red"?C.red:lineTone.color==="green"?C.green:"#60a5fa",fontWeight:800,fontFamily:"'Barlow Condensed'" }}>
                  {lineTone.label}
                </span>
              )}
              {activeRosterAlerts.map(a => (
                <span key={a.key} style={{ fontSize:10,color:a.severity==="orange"?C.amber:C.red,background:a.severity==="orange"?"rgba(245,158,11,0.12)":"rgba(239,68,68,0.12)",border:`1px solid ${a.severity==="orange"?"rgba(245,158,11,0.38)":"rgba(239,68,68,0.38)"}`,borderRadius:3,padding:"1px 5px",fontWeight:900,fontFamily:"'Barlow Condensed'",letterSpacing:"0.04em" }}>
                  {a.label}
                </span>
              ))}
              {needsIlMove && (
                <span style={{ fontSize:10,color:needsIlMoveColor,background:needsIlMoveBg,border:`1px solid ${needsIlMoveBorder}`,borderRadius:3,padding:"1px 5px",fontWeight:800,fontFamily:"'Barlow Condensed'",letterSpacing:"0.04em" }}>
                  ESPN IL — ACTIVATE
                </span>
              )}
              {isPending          && isToday_ && <span style={{ fontSize:10,color:"#60a5fa",fontWeight:700,fontFamily:"'Barlow Condensed'" }}>PENDING</span>}
              {isConfirmedOut     && isToday_ && <span style={{ fontSize:10,color:C.amber,fontWeight:700,fontFamily:"'Barlow Condensed'" }}>OUT</span>}
              {isNoGame           && isToday_ && <span style={{ fontSize:10,color:"#4b5563",fontWeight:700,fontFamily:"'Barlow Condensed'" }}>NO GAME</span>}
              {isStartingPitcher  && isToday_ && <span style={{ fontSize:10,color:C.green,fontWeight:700,fontFamily:"'Barlow Condensed'" }}>CONFIRMED SP</span>}
              {isProbableStartingPitcher && (isToday_ || isFut) && (
                <span style={{ fontSize:10,fontWeight:700,fontFamily:"'Barlow Condensed'",color:C.green,background:"rgba(16,185,129,0.10)",borderRadius:3,padding:"1px 4px",border:"1px solid rgba(16,185,129,0.25)" }}>
                  PROB SP
                </span>
              )}
              {(displayStatus === "SP Available" || displayStatus === "RP Available") && (isToday_ || isFut) && (() => {
                const wl = rpWorkload && displayPlayer ? rpWorkload[displayPlayer.id] : null;
                const score = wl?.availability_score;
                const role  = wl?.role || null;
                const sc = score != null ? (score >= 75 ? C.green : score >= 60 ? "#a3e635" : score >= 45 ? C.amber : C.red) : "#8b5cf6";
                const roleColor = role === "Closer" ? C.amber : role === "Setup" ? "#a78bfa" : C.textDim;
                return <>
                  {role && displayStatus === "RP Available" && (
                    <span style={{ fontSize:10,fontWeight:700,fontFamily:"'Barlow Condensed'",color:roleColor }}>
                      {role.toUpperCase()}
                    </span>
                  )}
                  <span style={{ fontSize:10,fontWeight:700,fontFamily:"'Barlow Condensed'",color:sc }}>
                    {score != null ? `AVAIL ${score}%` : "AVAILABLE"}
                  </span>
                </>;
              })()}
            </div>
          </div>
        ) : (
          <span style={{ color:"#334155",fontSize:13,fontStyle:"italic" }}>— Empty —</span>
        )}
      </div>

      {/* Status — today-aware, 3-state for active games */}
      <div style={{ width:80,flexShrink:0 }}>
        {displayPlayer && <StatusBadge status={primaryActiveAlert ? (primaryActiveAlert.severity === "orange" ? "Active DTD" : "Active Alert") : ((isToday_ || isFut) && !isIL && displayPlayer.status !== "DTD" ? statusForBadge : displayPlayer.status)}/>}
      </div>

      {/* Today / Lineup + Stat Line */}
      <div style={{ width:160,flexShrink:0,fontSize:12 }}>
        {displayPlayer && (isToday_ ? (
          <div style={{ display:"flex",flexDirection:"column",gap:2 }}>
            {primaryActiveAlert
              ? <span style={{ color:activeAlertColor,fontWeight:800 }}>⚠ {primaryActiveAlert.detail}</span>
              : needsIlMove
              ? <span style={{ color:needsIlMoveColor,fontWeight:700 }}>⚠ Off team IL — move out of ESPN IL</span>
              : isIL
              ? <span style={{ color:C.red,fontWeight:600 }}>🚑 On IL</span>
              : displayStatus === "No Game"
                ? <span style={{ color:C.textDim,fontSize:11 }}>No game today</span>
                : lineTone
                  ? <span style={{ color:lineTone.color==="red"?C.red:lineTone.color==="green"?C.green:"#60a5fa",fontWeight:700 }}>
                      {lineTone.icon || (lineTone.color==="red"?"🚨":lineTone.color==="green"?"✅":"🔵")} {lineTone.detail}{t.bat ? ` · #${t.bat}` : ""}
                    </span>
                : isStartingPitcher
                  ? <span style={{ color:C.green,fontWeight:600 }}>
                      ⚾ Starting Pitcher{actualPos && actualPos!=="P" ? ` · ${actualPos}` : ""}
                    </span>
                : (displayStatus === "SP Available" || displayStatus === "RP Available")
                  ? (() => {
                      const wl = rpWorkload && displayPlayer ? rpWorkload[displayPlayer.id] : null;
                      const score = wl?.availability_score;
                      const role  = wl?.role || null;  // Closer / Setup / Middle
                      const sc = score != null
                        ? (score >= 75 ? C.green : score >= 60 ? "#a3e635" : score >= 45 ? C.amber : C.red)
                        : "#8b5cf6";
                      const restLabel = wl?.days_rest != null ? ` · ${wl.days_rest}d rest` : "";
                      const ipLabel   = wl?.total_ip_3d > 0   ? ` · ${wl.total_ip_3d}IP/3d` : "";
                      const roleColor = role === "Closer" ? C.amber : role === "Setup" ? "#a78bfa" : C.textDim;
                      if (isSpAvailable) return <span style={{ color:"#6b7280", fontSize:11 }}>Not today&apos;s starter</span>;
                      return (
                        <div style={{ display:"flex",flexDirection:"column",gap:1 }}>
                          <div style={{ display:"flex",alignItems:"center",gap:5 }}>
                            <span style={{ color:"#8b5cf6",fontSize:11 }}>⚾ Available</span>
                            {role && <span style={{ fontSize:10,color:roleColor,fontWeight:700,fontFamily:"'Barlow Condensed'" }}>{role}</span>}
                            {score != null && <span style={{ color:sc,fontWeight:700,fontSize:11 }}> {score}%</span>}
                          </div>
                          {(restLabel || ipLabel) && <span style={{ color:C.textDim,fontSize:10 }}>{restLabel.replace(" · ","")}{ipLabel}</span>}
                        </div>
                      );
                    })()
                  : starting
                    ? (
                      <div style={{ display:"flex",flexDirection:"column",gap:2 }}>
                        <span style={{ color:actualPos==="DH"?C.amber:C.green,fontWeight:600 }}>
                          {actualPos==="DH"?"⚠":"✓"}{actualPos ? ` ${actualPos}` : ""}{t.bat ? ` · #${t.bat}` : ""}
                        </span>
                        {actualPos==="DH"&&(
                          <span style={{ fontSize:10,color:C.amber,fontStyle:"italic" }}>
                            Playing DH — consider swapping to bench
                          </span>
                        )}
                      </div>
                    )
                    : isPending
                      ? (() => {
                          const dbResearch = researchMap && displayPlayer?.id ? researchMap[displayPlayer.id] : null;
                          const exp = !isPitcherPlayer(displayPlayer) ? getExpectedPosition(displayPlayer, slot, t, dbResearch) : null;
                          const expPos = exp?.pos;
                          const platoon = exp?.platoonNote;
                          // Never show fantasy slot names as expected position
                          // Only hide pure fantasy slot names — OF is a valid display position
                          const showPos = expPos && !["UTIL","IF","BN"].includes(expPos);
                          return (
                            <div style={{ display:"flex",flexDirection:"column",gap:1 }}>
                              <span style={{ color:"#60a5fa",fontSize:11 }}>
                                ⏳ {showPos ? `Exp. ${expPos} · ` : ""}Awaiting lineup
                              </span>
                              {showPos && exp?.source && (
                                <span style={{ fontSize:9,color:exp.source==="role research"?C.amber:C.textDim,fontStyle:"italic" }}>
                                  {exp.source}
                                </span>
                              )}
                              {platoon && (
                                <span style={{ fontSize:10,color:C.amber,fontStyle:"italic" }}>
                                  ⚠ {platoon}
                                </span>
                              )}
                            </div>
                          );
                        })()
                      : isConfirmedOut
                        ? <span style={{ color:C.amber,fontSize:11 }}>✗ Not in lineup</span>
                        : <span style={{ color:C.textDim,fontSize:11 }}>Day off</span>}
            {statLine && <span className="fira" style={{ fontSize:10,color:C.textDim }}>{statLine}</span>}
          </div>
        ) : isFut ? (() => {
          // Use DB-backed today row when available (written by poll_future_lineups)
          // Fall back to raw schedule entry for game time
          const hasGame = t.teamHasGame === true || !!sched;
          const noGame  = t.teamHasGame === false || (!sched && !t.teamHasGame);
          const gameTime = t.gameTime || sched?.game_time || "";
          const oppName  = t.opp || (sched ? (sched.home_abbr === displayPlayer.team ? `vs ${sched.away_abbr}` : `@ ${sched.home_abbr}`) : "");
          const isProbSP = isProbableStarter(displayPlayer) && isSpEligible(displayPlayer);
          const oppProb  = t.sp;  // opposing probable pitcher name from sp_name field

          if (noGame) return <span style={{ color:C.textDim,fontSize:11 }}>Day off</span>;
          if (!hasGame) return <span style={{ color:C.textDim,fontSize:11 }}>—</span>;

          // Expected lineup label + position
          const isBench     = slot === "BN";
          const posDisplay  = isBench
            ? (displayPlayer.pos?.[0] || "—")                // bench → player's primary position
            : slot;                                    // active slot → the slot name (C, OF, UTIL…)

          let expLabel, expColor;
          if (isProbSP) {
            expLabel = "⚾ Probable SP";
            expColor = "#60a5fa";
          } else if (isRpOnly(displayPlayer) && !isBench) {
            expLabel = "Exp. Playing";
            expColor = "#a78bfa";                      // purple for RP
          } else if (isBench || (isSpEligible(displayPlayer) && !isProbSP)) {
            expLabel = "Exp. Bench";
            expColor = C.textDim;
          } else {
            expLabel = "Exp. Playing";
            expColor = C.green;
          }

          return (
            <div style={{ display:"flex",flexDirection:"column",gap:1 }}>
              <div style={{ display:"flex",alignItems:"center",gap:5 }}>
                <span style={{ color:expColor,fontSize:11,fontWeight:600 }}>{expLabel}</span>
                {!isProbSP && posDisplay && posDisplay !== "—" && (
                  <span style={{ fontSize:10,color:C.textDim,fontFamily:"'Barlow Condensed'",fontWeight:700 }}>
                    · {posDisplay}
                  </span>
                )}
              </div>
              {oppName && <span style={{ color:C.textDim,fontSize:10 }}>{oppName}</span>}
              {oppProb  && <span style={{ color:C.textDim,fontSize:10,fontStyle:"italic" }}>vs {oppProb}</span>}
            </div>
          );
        })() : (
          <div style={{ display:"flex",flexDirection:"column",gap:2 }}>
            {needsIlMove
              ? <span style={{ color:needsIlMoveColor,fontWeight:700 }}>Off team IL — activate</span>
              : isIL
              ? <span style={{ color:C.red }}>On IL</span>
              : (displayStatus === "Started" || displayStatus === "Starting Pitcher")
                ? <span style={{ color:C.green }}>
                    {isPitcherPlayer(displayPlayer) ? "Started (SP)" : `Started${actualPos ? ` · ${actualPos}` : ""}${t.bat ? ` #${t.bat}` : ""}`}
                  </span>
                : displayStatus === "No Game"
                  ? <span style={{ color:C.textDim }}>No game</span>
                  : <span style={{ color:C.textDim }}>DNP</span>}
            {statLine && <span className="fira" style={{ fontSize:10,color:C.textDim }}>{statLine}</span>}
          </div>
        ))}
      </div>

      {/* Game / Opp / Weather */}
      <GameCell player={displayPlayer} t={t} sched={sched} gameScore={gameScore} isFut={isFut} viewDate={viewDate}/>

      {/* Fantasy Score */}
      <div style={{ width:58,flexShrink:0,textAlign:"right" }}>
        {displayPlayer && fantasyScore !== null && (
          <div>
            <span className="barlow" style={{ fontSize:18,fontWeight:800,color:fantasyScore>=20?C.green:fantasyScore>=10?C.amber:fantasyScore<0?C.red:C.text }}>
              {fantasyScore}
            </span>
            {gameResult && <span style={{ fontSize:9,color:gameResult==="W"?C.green:C.red,display:"block",fontWeight:700,fontFamily:"'Barlow Condensed'" }}>{gameResult}</span>}
          </div>
        )}
      </div>

      {/* Delete controls intentionally hidden in roster/watch rows. */}
      <div style={{ width:28,flexShrink:0,textAlign:"right" }} />
    </div>
  );
}

function SectionHeader({ title, count, cap }) {
  const toneClass = title === "Starting — Position Players" ? " section-green"
    : title.includes("DTD") ? " section-orange"
    : title.includes("Alert") || title === "Alerts" ? " section-red"
    : "";
  const titleColor = title === "Starting — Position Players" ? C.green : C.textDim;
  return (
    <div className={`section-hdr${toneClass}`} data-section-title={title}>
      <span className="barlow" style={{ fontSize:11,fontWeight:700,color:titleColor,letterSpacing:"0.1em",textTransform:"uppercase" }}>{title}</span>
      {cap!=null ? <span style={{ fontSize:11,color:count>=cap?C.green:C.textDim }}>{count}/{cap}</span>
                 : count>0 ? <span style={{ fontSize:11,color:C.textDim }}>{count}</span> : null}
    </div>
  );
}

/* ── ESPN ROSTER TABLE ────────────────────────────────────────────── */
const IL_SLOT_COUNT = 3; // always show 3 IL slots (like ESPN)

const SMART_HITTER_SLOT_PRIORITY = { SS:0, "2B":1, "1B":2, "3B":3, C:4, IF:5, MI:6, CI:7, OF:8, UTIL:9 };

function smartSlotPriority(slot) {
  return SMART_HITTER_SLOT_PRIORITY[String(slot || "").toUpperCase()] ?? 50;
}

function rawFantasySlot(player) {
  if (!player) return "";
  // Current/older backend builds have used different names for the ESPN roster slot.
  // Use every known slot field before deciding the player is bench/unknown.
  const candidates = [
    player._fantasyPos,
    player.fantasy_pos,
    player.fantasyPos,
    player.roster_slot,
    player.rosterSlot,
    player.lineup_slot,
    player.lineupSlot,
    player.espn_slot,
    player.espnSlot,
    player.slot,
    player.current_slot,
    player.currentSlot,
    player.position_slot,
    player.positionSlot,
  ];
  for (const v of candidates) {
    const raw = String(v ?? "").trim().toUpperCase();
    if (raw && raw !== "NULL" && raw !== "NONE" && raw !== "UNDEFINED") return raw;
  }
  return "";
}

function isTeamIL(player) {
  return player?.status === "IL";
}

function isEspnILSlot(player) {
  const raw = rawFantasySlot(player);
  return player?._status === "il" || raw === "IL" || raw === "INJURED_LIST" || raw === "INJURED RESERVE";
}

function isRosterIlButActivated(player) {
  // ESPN still has the player parked in the fantasy IL slot, but the player's real
  // team status is no longer IL. Keep them in their normal hitter/pitcher +
  // red/green/blue group, but flag them at the bottom of that group.
  return !!player && isEspnILSlot(player) && !isTeamIL(player);
}

function isBenchFantasySlot(slot) {
  const raw = String(slot || "").toUpperCase();
  return !raw || raw === "BN" || raw === "BE" || raw === "BENCH" || raw === "IL" || raw === "INJURED_LIST" || raw === "INJURED RESERVE";
}

function isActiveFantasySlot(player) {
  return !!player && !isBenchFantasySlot(rawFantasySlot(player)) && !isEspnILSlot(player);
}

function getActualLineupPos(player) {
  const t = player?.today || {};
  const ls = player?.liveStats || {};
  const raw = normPosValue(ls.position || t.pos || t.fielding_pos);
  return raw && !["—", "-", "NA", "N/A", "BN", "BENCH", "OUT", "IL"].includes(raw) ? raw : null;
}

function isFantasyInfieldSlot(slot) {
  const raw = String(slot || "").toUpperCase();
  return ["C","1B","2B","3B","SS","IF","MI","CI"].includes(raw);
}

function buildActiveRosterAlerts(player, displayStatus, lineTone) {
  if (!player || !isActiveFantasySlot(player)) return [];
  const slot = rawFantasySlot(player);
  const actualPos = getActualLineupPos(player);
  const alerts = [];

  if (isTeamIL(player)) {
    alerts.push({
      key:"active_team_il", severity:"red", sort:0,
      label:`ACTIVE ${slot} — ON IL`,
      detail:`On MLB team IL while occupying your ESPN ${slot} slot`
    });
  }

  if (player.status === "DTD") {
    alerts.push({
      key:"active_dtd", severity:"orange", sort:5,
      label:`ACTIVE ${slot} — DTD`,
      detail:`Day-to-day while occupying your ESPN ${slot} slot`
    });
  }

  if (displayStatus === "Confirmed Out" || displayStatus === "Not Starting" || displayStatus === "Not in Lineup") {
    alerts.push({
      key:"active_not_starting", severity:"red", sort:10,
      label:`ACTIVE ${slot} — NOT STARTING`,
      detail:`Not in the confirmed lineup while occupying your ESPN ${slot} slot`
    });
  }

  if (actualPos === "DH") {
    alerts.push({
      key:"active_dh", severity:"red", sort:20,
      label:`ACTIVE ${slot} — DH`,
      detail:`Occupying your ESPN ${slot} slot but actually starting at DH`
    });
  }

  if (isFantasyInfieldSlot(slot) && OF_POS.has(actualPos)) {
    alerts.push({
      key:"active_of", severity:"red", sort:25,
      label:`ACTIVE ${slot} — ${actualPos}`,
      detail:`Occupying an infield slot but actually starting in the outfield`
    });
  }

  return alerts.sort((a,b)=>a.sort-b.sort);
}

function getPrimaryActiveRosterAlert(player, displayStatus, lineTone) {
  const alerts = buildActiveRosterAlerts(player, displayStatus, lineTone);
  return alerts[0] || null;
}

function fantasySlotForPlayer(player) {
  if (!player) return "BN";
  if (isTeamIL(player) || isEspnILSlot(player)) return "IL";
  const raw = rawFantasySlot(player);
  if (!raw || raw === "NULL" || raw === "NONE") return "BN";
  if (["BE", "BENCH"].includes(raw)) return "BN";
  return raw;
}

function rosterStatusBucket(player, context={}) {
  if (!player) return { key:"other", label:"Other", rank:90 };
  const { teamsWithLineup=new Set(), isToday_=true, teamPlays=true, viewDate } = context;

  const displayStatus = getDisplayStatus(player, teamsWithLineup, isToday_, teamPlays, viewDate);
  const tone = getLineupTone(player, displayStatus, isToday_);
  const activeAlert = getPrimaryActiveRosterAlert(player, displayStatus, tone);
  const actualPos = getActualLineupPos(player);

  // Highest priority: anything bad sitting in an active ESPN slot must be seen first.
  // This includes active-slot IL, DTD, confirmed-out, DH, and IF-slot players actually in OF.
  if (activeAlert?.severity === "red") return { key:"active_red", label:"Active Roster Alerts", rank:0 };
  if (activeAlert?.severity === "orange") return { key:"active_orange", label:"Active DTD Warnings", rank:5 };

  // Actual MLB team IL is not part of the normal live red/green/blue sort.
  // It gets pinned to its own Injured List group at the very bottom unless it is in an active ESPN slot above.
  if (isTeamIL(player)) return { key:"team_il", label:"Injured List", rank:1000 };

  if (tone?.color === "red" || displayStatus === "Confirmed Out" || displayStatus === "Not in Lineup") {
    return { key:"red", label:"Alerts", rank:10 };
  }
  if (tone?.color === "green" || displayStatus === "Starting" || displayStatus === "Starting Pitcher" || displayStatus === "Probable Starting Pitcher" || hasStartingLineupEvidence(player)) {
    return { key:"starting", label:"Starting", rank:20 };
  }
  if (tone?.color === "blue" || displayStatus === "Lineup Pending" || displayStatus === "Awaiting Lineup") {
    return { key:"blue", label:"Awaiting Lineup", rank:30 };
  }
  if (actualPos === "DH") return { key:"red", label:"Alerts", rank:10 };
  return { key:"other", label:"Other", rank:40 };
}

function parseGameTimeSortMinutes(player) {
  const t = player?.today || {};
  const raw = String(t.gameTime || t.game_time || "").trim();
  if (!raw) return 999999;

  // Accept values like "6:05 PM CDT", "18:05", or already-normalized strings.
  const m12 = raw.match(/(\d{1,2})\s*:\s*(\d{2})\s*(AM|PM)/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const min = parseInt(m12[2], 10);
    const ap = m12[3].toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return h * 60 + min;
  }

  const m24 = raw.match(/\b(\d{1,2})\s*:\s*(\d{2})\b/);
  if (m24) return parseInt(m24[1], 10) * 60 + parseInt(m24[2], 10);

  return 999999;
}

function statusGroupSortRank(player, context) {
  // Recently activated players still sitting in ESPN's IL slot stay in their
  // normal status group, but always at the bottom of that hitter/pitcher group.
  const displayStatus = getDisplayStatus(player, context?.teamsWithLineup || new Set(), context?.isToday_ ?? true, true, context?.viewDate);
  const tone = getLineupTone(player, displayStatus, context?.isToday_ ?? true);
  const activeAlert = getPrimaryActiveRosterAlert(player, displayStatus, tone);
  const bucket = rosterStatusBucket(player, context);
  const activeAlertRank = activeAlert?.sort ?? 999;
  const ilFixRank = isRosterIlButActivated(player) ? 1 : 0;
  const slotRank = { SS:0, "2B":1, "1B":2, "3B":3, C:4, IF:5, MI:6, CI:7, OF:8, UTIL:9, P:10, SP:11, RP:12 };
  const slot = rawFantasySlot(player);
  const name = String(player?.name || "");

  // In Status Sort, Awaiting Lineup rows should be ordered by real game start.
  // This puts early games first while keeping stable slot/name tie-breakers.
  const gameTimeRank = bucket.key === "blue" ? parseGameTimeSortMinutes(player) : 999999;

  return { activeAlertRank, ilFixRank, gameTimeRank, slotRank: slotRank[slot] ?? 50, name };
}

function sortPlayersByRosterStatus(players, context) {
  return [...players].sort((a,b) => {
    const ba = rosterStatusBucket(a, context), bb = rosterStatusBucket(b, context);
    if (ba.rank !== bb.rank) return ba.rank - bb.rank;

    // Do not mix pitchers and position players inside status sort.
    const pa = isPitcherPlayer(a) ? 1 : 0;
    const pb = isPitcherPlayer(b) ? 1 : 0;
    if (pa !== pb) return pa - pb;

    const ra = statusGroupSortRank(a, context);
    const rb = statusGroupSortRank(b, context);
    if (ra.activeAlertRank !== rb.activeAlertRank) return ra.activeAlertRank - rb.activeAlertRank;
    if (ra.ilFixRank !== rb.ilFixRank) return ra.ilFixRank - rb.ilFixRank;
    if (ra.gameTimeRank !== rb.gameTimeRank) return ra.gameTimeRank - rb.gameTimeRank;
    if (ra.slotRank !== rb.slotRank) return ra.slotRank - rb.slotRank;
    return ra.name.localeCompare(rb.name);
  });
}

function teamHasGameForStatusSort(player, context) {
  if (!player) return false;
  const t = player.today || {};
  if (t.teamHasGame === false) return false;
  return t.teamHasGame === true || !!(context?.teamsPlayingToday && setHasTeamAbbr(context.teamsPlayingToday, player.team));
}

function isProbableOrConfirmedStartingPitcher(player, context) {
  if (!player || !isPitcherPlayer(player)) return false;
  const displayStatus = getDisplayStatus(
    player,
    context?.teamsWithLineup || new Set(),
    context?.isToday_ ?? true,
    teamHasGameForStatusSort(player, context),
    context?.viewDate
  );
  return displayStatus === "Starting Pitcher"
    || displayStatus === "Probable Starting Pitcher"
    || isProbableStarter(player)
    || (isSpEligible(player) && hasStartingLineupEvidence(player));
}

function isActiveRelieverForStatusSort(player, context) {
  if (!player || !isPitcherPlayer(player)) return false;
  if (!isRpOnly(player)) return false;
  if (isTeamIL(player) || isEspnILSlot(player)) return false;
  if (!teamHasGameForStatusSort(player, context)) return false;

  const displayStatus = getDisplayStatus(
    player,
    context?.teamsWithLineup || new Set(),
    context?.isToday_ ?? true,
    true,
    context?.viewDate
  );
  const tone = getLineupTone(player, displayStatus, context?.isToday_ ?? true);
  const activeAlert = getPrimaryActiveRosterAlert(player, displayStatus, tone);

  // Bad active-slot alerts still stay at the top with the red/orange alert groups.
  if (activeAlert?.severity === "red" || activeAlert?.severity === "orange") return false;
  if (tone?.color === "red" || displayStatus === "Confirmed Out" || displayStatus === "Not in Lineup") return false;

  return true;
}

function buildStatusSortGroups(sorted, context) {
  const groups = [];
  const activeRelievers = sorted.filter(p => isActiveRelieverForStatusSort(p, context));
  const activeRelieverIds = new Set(activeRelievers.map(p => p._entryId || p.id));

  const statusDefs = [
    ["active_red", "🚨 Active Roster Alerts"],
    ["active_orange", "⚠ Active DTD Warnings"],
    ["red", "Alerts"],
    ["starting", "Starting"],
    ["blue", "Awaiting Lineup"],
    ["other", "Other"],
  ];

  statusDefs.forEach(([key, label]) => {
    const rows = sorted.filter(p => rosterStatusBucket(p, context).key === key && !activeRelieverIds.has(p._entryId || p.id));
    const hitters = rows.filter(p => !isPitcherPlayer(p));
    const pitchers = rows.filter(p => isPitcherPlayer(p));

    if (key === "starting") {
      const startingPitchers = pitchers.filter(p => isProbableOrConfirmedStartingPitcher(p, context));
      const otherStartingPitchers = pitchers.filter(p => !isProbableOrConfirmedStartingPitcher(p, context));

      if (hitters.length) groups.push([`${key}_hitters`, "Starting — Position Players", hitters]);
      if (startingPitchers.length) groups.push(["starting_pitchers_today", "Today's Probable / Confirmed Starting Pitchers", startingPitchers]);
      if (activeRelievers.length) groups.push(["active_relievers", "Active Relievers", activeRelievers]);
      if (otherStartingPitchers.length) groups.push(["starting_other_pitchers", "Starting — Other Pitchers", otherStartingPitchers]);
      return;
    }

    if (hitters.length) groups.push([`${key}_hitters`, `${label} — Position Players`, hitters]);

    if (pitchers.length) {
      const title = key === "other" ? "Other Pitchers" : `${label} — Pitchers`;
      groups.push([`${key}_pitchers`, title, pitchers]);
    }
  });

  // If there are no SP starters today, still keep Active Relievers above Other Pitchers.
  if (!groups.some(g => g[0] === "active_relievers") && activeRelievers.length) {
    const otherPitcherIndex = groups.findIndex(g => g[0] === "other_pitchers");
    const insertAt = otherPitcherIndex >= 0 ? otherPitcherIndex : groups.length;
    groups.splice(insertAt, 0, ["active_relievers", "Active Relievers", activeRelievers]);
  }

  const teamIl = sorted.filter(p => rosterStatusBucket(p, context).key === "team_il");
  const hitterIl = teamIl.filter(p => !isPitcherPlayer(p));
  const pitcherIl = teamIl.filter(p => isPitcherPlayer(p));
  if (hitterIl.length) groups.push(["team_il_hitters", "Injured List — Position Players", hitterIl]);
  if (pitcherIl.length) groups.push(["team_il_pitchers", "Injured List — Pitchers", pitcherIl]);

  return groups;
}

function EspnRosterTable({ entries, onSelect, onRemove, schedule, viewDate, scoringRules, lineupStatus, rpWorkload, researchMap, rosterDisplayMode="espn_slot" }) {
  const isToday_ = isToday(viewDate);
  const viewEntries = applyScheduleOverlayToEntries(entries, schedule, viewDate);

  // Build teamsWithLineup only from backend confirmed-team data.
  // Do NOT infer that a whole team lineup is confirmed just because one own-roster
  // row has starting evidence; that caused awaiting hitters to turn red too early.
  const confirmedTeams = lineupStatus?.lineup_confirmed_teams || [];
  // Only provider-level confirmed teams should flip non-starters red.
  // Do not infer a whole team is confirmed from one roster row; that caused
  // too many players to show inactive after fast refresh.
  const teamsWithLineup = isToday_ ? expandedTeamSet([...confirmedTeams]) : new Set();

  const scheduleTeams = (schedule || [])
    .filter(s => s.date === viewDate)
    .flatMap(s => [s.home_abbr, s.away_abbr])
    .filter(Boolean);

  // Also know which teams play today at all (even if no lineup yet)
  const teamsPlayingToday = expandedTeamSet([
    ...(lineupStatus?.teams_playing_today || []),
    ...scheduleTeams,
    ...viewEntries.filter(e => e.today?.teamHasGame).map(e => e.team),
  ]);

  const rowProps = { onSelect, onRemove, schedule, viewDate, scoringRules, teamsWithLineup, teamsPlayingToday, rpWorkload, researchMap };

  const Header = ({ hideSlot=false }) => (
    <div className="slot-table-header" style={{ display:"flex",alignItems:"center",padding:"8px 16px",background:"#040810",borderBottom:`1px solid ${C.border}` }}>
      <span style={{ width:44,marginRight:10 }}/>
      <span className="barlow" style={{ flex:1,fontSize:11,color:C.textDim,letterSpacing:"0.08em",textTransform:"uppercase" }}>Player</span>
      <span className="barlow" style={{ width:80,fontSize:11,color:C.textDim,letterSpacing:"0.08em",textTransform:"uppercase" }}>Status</span>
      <span className="barlow" style={{ width:160,fontSize:11,color:C.textDim,letterSpacing:"0.08em",textTransform:"uppercase" }}>Lineup / Stats</span>
      <span className="barlow" style={{ width:155,fontSize:11,color:C.textDim,letterSpacing:"0.08em",textTransform:"uppercase" }}>Game / Opp</span>
      <span className="barlow" style={{ width:58,fontSize:11,color:C.textDim,letterSpacing:"0.08em",textTransform:"uppercase",textAlign:"right" }}>Score</span>
      <span style={{ width:28 }}/>
    </div>
  );

  if (rosterDisplayMode === "status_sort") {
    const context = { teamsWithLineup, teamsPlayingToday, isToday_, viewDate };
    const sorted = sortPlayersByRosterStatus(viewEntries, context);
    const groups = buildStatusSortGroups(sorted, context);

    return (
      <div className="roster-table-wrap" style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
        <Header hideSlot />
        {groups.map(([key,title,rows]) => (
          <React.Fragment key={key}>
            <SectionHeader title={title} count={rows.length}/>
            {rows.map(p => <PlayerSlotRow key={p._entryId} slot="" player={p} hideSlotLabel {...rowProps}/>)}
          </React.Fragment>
        ))}
      </div>
    );
  }

  if (rosterDisplayMode === "espn_slot") {
    const slotOrder = ["C","1B","2B","3B","SS","IF","MI","CI","OF","LF","CF","RF","DH","UTIL","P","SP","RP","BN","IL"];
    const rowsBySlot = new Map();
    viewEntries.forEach(p => {
      const slot = fantasySlotForPlayer(p);
      if (!rowsBySlot.has(slot)) rowsBySlot.set(slot, []);
      rowsBySlot.get(slot).push(p);
    });
    rowsBySlot.forEach(rows => rows.sort((a,b) => String(a.name||"").localeCompare(String(b.name||""))));

    const knownSlots = slotOrder.filter(slot => rowsBySlot.has(slot));
    const extraSlots = [...rowsBySlot.keys()].filter(slot => !slotOrder.includes(slot)).sort();
    const orderedSlots = [...knownSlots, ...extraSlots];

    return (
      <div className="roster-table-wrap" style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
        <Header />
        {orderedSlots.map(slot => {
          const rows = rowsBySlot.get(slot) || [];

          if (slot === "BN") {
            const benchHitters = rows.filter(p => !isPitcherPlayer(p));
            const benchSP = rows.filter(p => isPitcherPlayer(p) && isSpEligible(p));
            const benchRP = rows.filter(p => isPitcherPlayer(p) && !isSpEligible(p));

            return (
              <React.Fragment key={slot}>
                {benchHitters.length > 0 && <>
                  <SectionHeader title="Bench — Position Players" count={benchHitters.length}/>
                  {benchHitters.map(p => <PlayerSlotRow key={p._entryId} slot={slot} player={p} {...rowProps}/>)}
                </>}
                {benchSP.length > 0 && <>
                  <SectionHeader title="Bench — SP" count={benchSP.length}/>
                  {benchSP.map(p => <PlayerSlotRow key={p._entryId} slot={slot} player={p} {...rowProps}/>)}
                </>}
                {benchRP.length > 0 && <>
                  <SectionHeader title="Bench — RP" count={benchRP.length}/>
                  {benchRP.map(p => <PlayerSlotRow key={p._entryId} slot={slot} player={p} {...rowProps}/>)}
                </>}
              </React.Fragment>
            );
          }

          const title = slot === "IL" ? "Injured List" : `ESPN Slot ${slot}`;
          return (
            <React.Fragment key={slot}>
              <SectionHeader title={title} count={rows.length}/>
              {rows.map(p => <PlayerSlotRow key={p._entryId} slot={slot} player={p} {...rowProps}/>)}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  const a = autoAssignSlots(viewEntries, teamsWithLineup, teamsPlayingToday, rpWorkload);
  const { hitterStarters:hs, pitcherStarters:ps, hitterBench:hb, pitcherBench:pb, hitterIL:hil, pitcherIL:pil, il } = a;
  const shortfall = Math.max(0, ROSTER_CAP - a.rosterSize);
  const hsFull = Object.values(hs).filter(s=>s.player).length >= HITTER_STARTER_SLOTS.length;
  const psFull = Object.values(ps).filter(s=>s.player).length >= PITCHER_STARTER_SLOTS.length;
  const hEmpty = psFull && !hsFull ? shortfall : Math.ceil(shortfall/2);
  const pEmpty = shortfall - hEmpty;
  const hbRows = [...hb, ...Array(hEmpty).fill(null)];
  const pbRows = [...pb, ...Array(pEmpty).fill(null)];
  const hitterIlRows  = [...hil];
  const pitcherIlRows = [...pil];

  return (
    <div className="roster-table-wrap" style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
      <Header />

      <SectionHeader title="Batters" count={Object.values(hs).filter(s=>s.player).length} cap={HITTER_STARTER_SLOTS.length}/>
      {Object.values(hs).map((s,i)=><PlayerSlotRow key={`hs${i}`} slot={s.slot} player={s.player} {...rowProps}/>) }

      <SectionHeader title="Bench" count={hb.length}/>
      {hbRows.map((p,i)=><PlayerSlotRow key={`hb${i}`} slot="BN" player={p} {...rowProps}/>) }

      {hitterIlRows.length > 0 && <>
        <SectionHeader title="Position Player IL" count={hitterIlRows.length}/>
        {hitterIlRows.map((p,i)=><PlayerSlotRow key={`hil${i}`} slot="IL" player={p} {...rowProps}/>) }
      </>}

      <SectionHeader title="Pitchers" count={Object.values(ps).filter(s=>s.player).length} cap={PITCHER_STARTER_SLOTS.length}/>
      {Object.values(ps).filter(s=>s.slot==="P").map((s,i)=><PlayerSlotRow key={`pp${i}`} slot="P" player={s.player} {...rowProps}/>) }
      {Object.values(ps).filter(s=>s.slot==="SP").length>0 && (
        <div style={{ borderLeft:`2px solid ${POS_COLORS.SP.border}`,marginLeft:0 }}>
          {Object.values(ps).filter(s=>s.slot==="SP").map((s,i)=><PlayerSlotRow key={`sp${i}`} slot="SP" player={s.player} {...rowProps}/>) }
        </div>
      )}
      {Object.values(ps).filter(s=>s.slot==="RP").length>0 && (
        <div style={{ borderLeft:`2px solid ${POS_COLORS.RP.border}`,marginLeft:0 }}>
          {Object.values(ps).filter(s=>s.slot==="RP").map((s,i)=><PlayerSlotRow key={`rp${i}`} slot="RP" player={s.player} {...rowProps}/>) }
        </div>
      )}

      <SectionHeader title="P Bench" count={pb.length}/>
      {pbRows.map((p,i)=><PlayerSlotRow key={`pb${i}`} slot="BN" player={p} {...rowProps}/>) }

      {pitcherIlRows.length > 0 && <>
        <SectionHeader title="Pitcher IL" count={pitcherIlRows.length}/>
        {pitcherIlRows.map((p,i)=><PlayerSlotRow key={`pil${i}`} slot="IL" player={p} {...rowProps}/>) }
      </>}
    </div>
  );
}

/* ── WATCH TABLE ──────────────────────────────────────────────────── */
function WatchTable({ entries, onSelect, onRemove, schedule, viewDate, scoringRules, lineupStatus, rpWorkload, researchMap }) {
  const viewEntries = applyScheduleOverlayToEntries(entries, schedule, viewDate);
  const isToday_ = isToday(viewDate);

  const confirmedTeams = lineupStatus?.lineup_confirmed_teams || [];
  const teamsWithLineup = isToday_ ? expandedTeamSet([...confirmedTeams]) : new Set();

  const scheduleTeams = (schedule || [])
    .filter(s => s.date === viewDate)
    .flatMap(s => [s.home_abbr, s.away_abbr])
    .filter(Boolean);

  const teamsPlayingToday = expandedTeamSet([
    ...(lineupStatus?.teams_playing_today || []),
    ...scheduleTeams,
    ...viewEntries.filter(e => e.today?.teamHasGame).map(e => e.team),
  ]);

  const rowProps = { onSelect, onRemove, schedule, viewDate, scoringRules, teamsWithLineup, teamsPlayingToday, rpWorkload, researchMap };

  const Header = () => (
    <div className="slot-table-header" style={{ display:"flex",alignItems:"center",padding:"8px 16px",background:"#040810",borderBottom:`1px solid ${C.border}` }}>
      <span style={{ width:44,marginRight:10 }}/>
      <span className="barlow" style={{ flex:1,fontSize:11,color:C.textDim,letterSpacing:"0.08em",textTransform:"uppercase" }}>Player</span>
      <span className="barlow" style={{ width:80,fontSize:11,color:C.textDim,letterSpacing:"0.08em",textTransform:"uppercase" }}>Status</span>
      <span className="barlow" style={{ width:160,fontSize:11,color:C.textDim,letterSpacing:"0.08em",textTransform:"uppercase" }}>Lineup / Stats</span>
      <span className="barlow" style={{ width:155,fontSize:11,color:C.textDim,letterSpacing:"0.08em",textTransform:"uppercase" }}>Game / Opp</span>
      <span className="barlow" style={{ width:58,fontSize:11,color:C.textDim,letterSpacing:"0.08em",textTransform:"uppercase",textAlign:"right" }}>Score</span>
      <span style={{ width:28 }}/>
    </div>
  );

  if (viewEntries.length===0) return (
    <div style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"52px 24px",textAlign:"center" }}>
      <Users size={28} color={C.textDim} style={{ marginBottom:10 }}/>
      <div style={{ color:C.text,fontWeight:600,marginBottom:4 }}>Watch list is empty</div>
    </div>
  );

  const context = { teamsWithLineup, teamsPlayingToday, isToday_, viewDate };
  const sorted = sortPlayersByRosterStatus(viewEntries, context);
  const groups = buildStatusSortGroups(sorted, context);

  return (
    <div className="roster-table-wrap" style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden" }}>
      <Header />
      {groups.map(([key,title,rows]) => (
        <React.Fragment key={key}>
          <SectionHeader title={title} count={rows.length}/>
          {rows.map(p => <PlayerSlotRow key={p._entryId} slot="WL" player={p} {...rowProps}/>)}
        </React.Fragment>
      ))}
    </div>
  );
}

/* ── PLAYER DETAIL TABS ───────────────────────────────────────────── */
function TodayTab({ player }) {
  const t=player.today, u=player.usage, lv=player.live||{};
  const hasStats = lv.statLine || lv.hasBatting || lv.hasPitching;
  const b=lv.batting||{}, p=lv.pitching||{};

  const battingCells = lv.hasBatting ? [
    ["AB",b.atBats??null],["H",b.hits??null],["HR",b.homeRuns??null],
    ["RBI",b.rbi??null],["R",b.runs??null],["BB",b.baseOnBalls??null],
    ["K",b.strikeOuts??null],["SB",b.stolenBases??null],
    ["2B",b.doubles??null],["3B",b.triples??null],
    ["HBP",b.hitByPitch??null],["SAC",b.sacBunts??null],
  ].filter(([,v])=>v!==null&&v!==undefined) : [];

  const pitchingCells = lv.hasPitching ? [
    ["IP",p.inningsPitched??null],["ER",p.earnedRuns??null],
    ["K",p.strikeOuts??null],["BB",p.baseOnBalls??null],
    ["H",p.hits??null],["HR",p.homeRuns??null],
    ["W",p.wins??null],["L",p.losses??null],
    ["SV",p.saves??null],["BS",p.blownSaves??null],["HD",p.holds??null],
  ].filter(([,v])=>v!==null&&v!==undefined) : [];

  const statCells = lv.isPitcher ? pitchingCells : battingCells;

  return (
    <div style={{ padding:"20px 24px",display:"flex",flexDirection:"column",gap:20 }}>
      {/* Use live boxscore data if available as ground truth, fall back to daily status */}
      {(() => {
        const hasLiveData = lv.hasBatting || lv.hasPitching || lv.statLine;
        const inLineup   = hasLiveData ? true : t.in;  // if they have stats, they played
        const bat        = lv.position ? (t.bat || lv.batting_order) : t.bat;
        const pos        = lv.position || t.pos || "—";
        const spElig = isSpEligible(player);
        const rpOnly = isRpOnly(player);
        const lineupColor = player.status === "IL" ? C.red
                          : inLineup ? C.green
                          : t.teamHasGame === false ? C.textDim
                          : spElig && !isProbableStarter(player) ? "#6b7280"
                          : rpOnly ? "#8b5cf6"
                          : "#60a5fa";
        const lineupLabel = player.status === "IL"     ? "On IL"
                          : !t.teamHasGame              ? "No Game Today"
                          : inLineup && isPitcherPlayer(player) ? "Starting Pitcher"
                          : isProbableStarter(player)          ? "Probable Starting Pitcher"
                          : inLineup                     ? "In Lineup"
                          : spElig && !isProbableStarter(player) ? "Not Today's Starter"
                          : rpOnly                       ? "Available to Pitch"
                          : t.in === false && t.teamHasGame ? "Not in Lineup"
                          : "Awaiting Lineup";
        return (
          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12 }}>
            {[["Lineup Status", lineupLabel, lineupColor],
              ["Batting Order", bat ? `#${bat}` : "—", C.text],
              ["Position", pos, C.text]
            ].map(([lbl,val,color])=>(
              <div key={lbl} style={{ background:C.elevated,borderRadius:8,padding:"14px 16px" }}>
                <div style={{ color:C.textDim,fontSize:12,marginBottom:6 }}>{lbl}</div>
                <div className="barlow" style={{ fontSize:22,fontWeight:700,color }}>{val}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {hasStats&&(
        <div style={{ background:C.elevated,borderRadius:8,padding:"14px 16px" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 }}>
            <div style={{ color:C.textDim,fontSize:12,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase" }}>
              {lv.isPitcher?"Pitching":"Batting"}&nbsp;·&nbsp;Today
            </div>
            {lv.gameResult&&<span className="barlow" style={{ fontSize:13,fontWeight:700,color:lv.gameResult==="W"?C.green:C.red }}>{lv.gameResult}</span>}
          </div>
          {lv.statLine&&<div className="fira" style={{ fontSize:16,fontWeight:700,color:C.text,marginBottom:10 }}>{lv.statLine}</div>}
          {statCells.length>0&&(
            <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6 }}>
              {statCells.map(([lbl,val])=>(
                <div key={lbl} style={{ background:C.bg,borderRadius:6,padding:"8px 10px",textAlign:"center" }}>
                  <div style={{ color:C.textDim,fontSize:10,marginBottom:3,letterSpacing:"0.05em" }}>{lbl}</div>
                  <div className="barlow" style={{ fontSize:18,fontWeight:700,color:C.text }}>{val}</div>
                </div>
              ))}
            </div>
          )}
          {lv.gameScore&&<div className="fira" style={{ fontSize:12,color:C.textDim,marginTop:8 }}>{lv.gameScore}</div>}
        </div>
      )}


      {t.opp&&<div style={{ background:C.elevated,borderRadius:8,padding:"14px 16px" }}><div style={{ color:C.textDim,fontSize:12,marginBottom:6 }}>Opponent / SP</div><div style={{ fontSize:15,fontWeight:600 }}>{t.opp}</div>{t.sp&&<div style={{ fontSize:13,color:C.textDim,marginTop:3 }}>{t.sp} — <span style={{ color:t.spHand==="L"?C.amber:C.blue }}>{t.spHand}HP</span></div>}<div style={{ fontSize:12,color:C.textDim,marginTop:4,fontFamily:"'Fira Code'" }}>{t.gameTime}{t.gameStatus&&t.gameStatus!=="Scheduled"?` · ${t.gameStatus}`:""}</div></div>}
      <div>
        <div style={{ color:C.textDim,fontSize:12,marginBottom:10,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase" }}>Start Frequency</div>
        {[["L7",u.l7,7],["L14",u.l14,14],["L30",u.l30,30]].map(([lbl,v,max])=>(
          <div key={lbl} style={{ display:"flex",alignItems:"center",gap:12,marginBottom:10 }}>
            <span className="barlow" style={{ width:28,color:C.textDim,fontSize:13 }}>{lbl}</span>
            <div className="stat-bar-bg" style={{ flex:1 }}><div className="stat-bar" style={{ width:`${(v/max)*100}%`}}/></div>
            <span className="fira" style={{ width:40,color:C.text,fontSize:12,textAlign:"right" }}>{v}/{max}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


function summarizePositionEvents(events=[]) {
  const rows = Array.isArray(events) ? events : [];
  const posCounts = {};
  let starts=0, dhStarts=0, confirmed=0, noGame=0, notStarted=0;
  const lastStarted = {};
  rows.forEach(r => {
    const pos = r.fielding_pos || (r.in_lineup ? "Started" : "");
    if (r.lineup_confirmed) confirmed++;
    if (!r.team_has_game) noGame++;
    if (r.in_lineup) {
      starts++;
      const key = (pos || "Started").toUpperCase();
      posCounts[key] = (posCounts[key] || 0) + 1;
      if (!lastStarted[key]) lastStarted[key] = r.date;
      if (key === "DH") dhStarts++;
    } else if (r.team_has_game && r.lineup_confirmed) {
      notStarted++;
    }
  });
  return {
    rows,
    starts,
    dhStarts,
    confirmed,
    noGame,
    notStarted,
    byPos: Object.entries(posCounts).map(([name,v])=>({name,v,last:lastStarted[name]})).sort((a,b)=>b.v-a.v || a.name.localeCompare(b.name)),
  };
}

function PositionEventsTab({ events=[] }) {
  const sum = summarizePositionEvents(events);
  return (
    <div style={{ padding:"20px 24px",display:"flex",flexDirection:"column",gap:18 }}>
      <div>
        <div style={{ color:C.textDim,fontSize:12,marginBottom:10,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase" }}>Positions Played — Stored Daily Log</div>
        {sum.byPos.length ? (
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10 }}>
            {sum.byPos.map(r=>(
              <div key={r.name} style={{ background:C.elevated,borderRadius:8,padding:"12px 14px" }}>
                <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:6 }}><PosTag pos={r.name}/><span style={{ color:C.textDim,fontSize:11 }}>played</span></div>
                <div className="barlow" style={{ fontSize:24,fontWeight:800,color:C.text }}>{r.v}</div>
                <div style={{ color:C.textDim,fontSize:11 }}>last: {r.last || "—"}</div>
              </div>
            ))}
          </div>
        ) : <div style={{ color:C.textDim,fontSize:13 }}>No position-event rows yet — run Status refresh / Lineup Watch poll.</div>}
      </div>

      <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10 }}>
        {[["Starts",sum.starts],["DH Starts",sum.dhStarts],["Confirmed lineups",sum.confirmed],["Confirmed sits",sum.notStarted]].map(([lbl,v])=>(
          <div key={lbl} style={{ background:C.elevated,borderRadius:8,padding:"12px 14px" }}>
            <div style={{ color:C.textDim,fontSize:11,marginBottom:4 }}>{lbl}</div>
            <div className="barlow" style={{ fontSize:24,fontWeight:800,color:lbl==="DH Starts"?C.purple:C.text }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ overflowX:"auto",border:`1px solid ${C.border}`,borderRadius:8 }}>
        <table style={{ width:"100%",borderCollapse:"collapse",minWidth:680 }}>
          <thead><tr style={{ borderBottom:`1px solid ${C.border}` }}>{["Date","Status","Pos","Bat","Opponent","SP Hand","Source","Confirmed"].map(h=><th key={h} className="barlow" style={{ color:C.textDim,fontSize:11,letterSpacing:"0.08em",padding:"8px 10px",textAlign:"left",fontWeight:600,textTransform:"uppercase" }}>{h}</th>)}</tr></thead>
          <tbody>{sum.rows.slice(0,90).map((r,i)=>(
            <tr key={`${r.date}-${i}`} style={{ borderBottom:`1px solid ${C.border}`,background:i%2===0?"transparent":"#0d1421" }}>
              <td className="fira" style={{ padding:"9px 10px",fontSize:12,color:C.textDim }}>{r.date}</td>
              <td style={{ padding:"9px 10px",fontSize:12,color:r.in_lineup?C.green:(r.lineup_confirmed?C.amber:C.textDim) }}>{r.in_lineup?"Started":(r.team_has_game?(r.lineup_confirmed?"Not starting":"Pending"):"No game")}</td>
              <td style={{ padding:"9px 10px" }}>{r.fielding_pos?<PosTag pos={r.fielding_pos}/>:<span style={{ color:C.textDim }}>—</span>}</td>
              <td className="fira" style={{ padding:"9px 10px",fontSize:12,color:C.text }}>{r.batting_order?`#${r.batting_order}`:"—"}</td>
              <td style={{ padding:"9px 10px",fontSize:12,color:C.text }}>{r.opponent || "—"}</td>
              <td style={{ padding:"9px 10px",fontSize:12,color:r.sp_hand==="L"?C.amber:C.blue }}>{r.sp_hand?`${r.sp_hand}HP`:"—"}</td>
              <td style={{ padding:"9px 10px",fontSize:12,color:C.textDim }}>{r.source || "fantag"}</td>
              <td style={{ padding:"9px 10px" }}>{r.lineup_confirmed?<Check size={14} color={C.green}/>:<X size={14} color={C.textDim}/>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function SeasonTab({ player, events=[] }) {
  const u=player.usage;
  const evSummary = summarizePositionEvents(events);
  const byPos = evSummary.byPos.length ? evSummary.byPos : u.byPos;
  return (
    <div style={{ padding:"20px 24px",display:"flex",flexDirection:"column",gap:20 }}>
      <div><div style={{ color:C.textDim,fontSize:12,marginBottom:10,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase" }}>Position Usage</div>
        {byPos.length>0?<ResponsiveContainer width="100%" height={110}><BarChart data={byPos.slice(0,6)} margin={{top:0,right:0,bottom:0,left:-20}}><XAxis dataKey="name" tick={{fill:C.textDim,fontSize:11}} axisLine={false} tickLine={false}/><YAxis tick={{fill:C.textDim,fontSize:11}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,fontSize:12}} cursor={{fill:"rgba(16,185,129,0.08)"}}/><Bar dataKey="v" radius={[3,3,0,0]}>{byPos.slice(0,6).map((_,i)=><Cell key={i} fill={i===0?C.green:"#1e3a5f"}/>)}</Bar></BarChart></ResponsiveContainer>:<div style={{ color:C.textDim,fontSize:13 }}>No data — trigger lineup poll</div>}
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10 }}>
        {[["Started",evSummary.starts||u.l30||0,events.length?"stored events":"last 30"],["DH Starts",evSummary.dhStarts||0,"stored events"],["vs RHP",u.vsRHP||0,"starts"],["vs LHP",u.vsLHP||0,"starts"]].map(([lbl,v,sub])=>(
          <div key={lbl} style={{ background:C.elevated,borderRadius:8,padding:"14px" }}><div style={{ color:C.textDim,fontSize:11,marginBottom:4 }}>{lbl}</div><div className="barlow" style={{ fontSize:24,fontWeight:800,color:lbl==="DH Starts"?C.purple:C.text }}>{v}</div><div style={{ color:C.textDim,fontSize:11 }}>{sub}</div></div>
        ))}
      </div>
    </div>
  );
}

function PatternTab({ player }) {
  const u=player.usage, total=u.vsRHP+u.vsLHP||1;
  return (
    <div style={{ padding:"20px 24px",display:"flex",flexDirection:"column",gap:20 }}>
      <div style={{ background:C.elevated,borderRadius:8,padding:"16px",display:"flex",alignItems:"center",gap:12 }}><Zap size={18} color={u.labelColor}/><div><div style={{ fontSize:11,color:C.textDim,marginBottom:3 }}>Pattern</div><div className="barlow" style={{ fontSize:20,fontWeight:700,color:u.labelColor }}>{u.label}</div></div></div>
      <div>
        <div style={{ color:C.textDim,fontSize:12,marginBottom:10,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase" }}>Pitcher Hand Splits</div>
        {[["vs RHP",u.vsRHP,C.blue],["vs LHP",u.vsLHP,C.amber]].map(([lbl,v,color])=>(
          <div key={lbl} style={{ display:"flex",alignItems:"center",gap:12,marginBottom:10 }}>
            <span className="barlow" style={{ width:56,color:C.textDim,fontSize:13 }}>{lbl}</span>
            <div className="stat-bar-bg" style={{ flex:1 }}><div className="stat-bar" style={{ width:`${(v/total)*100}%`,background:color }}/></div>
            <span className="fira" style={{ width:28,color:C.text,fontSize:12,textAlign:"right" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogTab({ player, events=[] }) {
  const rows = events.length ? events.map(r=>({ date:r.date,pos:r.fielding_pos||"—",bat:r.batting_order,hand:r.sp_hand,started:r.in_lineup,result:r.opponent||r.game_status||"—" })) : player.log;
  if(!rows.length) return <div style={{ padding:"32px 24px",textAlign:"center",color:C.textDim }}>No game log — trigger lineup poll first</div>;
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%",borderCollapse:"collapse",minWidth:460 }}>
        <thead><tr style={{ borderBottom:`1px solid ${C.border}` }}>{["Date","Pos","Bat","vs","Started","Opp"].map(h=><th key={h} className="barlow" style={{ color:C.textDim,fontSize:11,letterSpacing:"0.08em",padding:"6px 10px",textAlign:"left",fontWeight:600,textTransform:"uppercase" }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((row,i)=>(
          <tr key={i} style={{ borderBottom:`1px solid ${C.border}`,background:i%2===0?"transparent":"#0d1421" }}>
            <td className="fira" style={{ padding:"10px",fontSize:12,color:C.textDim }}>{row.date}</td>
            <td style={{ padding:"10px" }}>{row.pos&&row.pos!=="—"?<PosTag pos={row.pos}/>:<span style={{ color:C.textDim }}>—</span>}</td>
            <td className="fira" style={{ padding:"10px",fontSize:12,color:C.text }}>{row.bat?`#${row.bat}`:"—"}</td>
            <td style={{ padding:"10px" }}>{row.hand&&<span style={{ fontSize:12,color:row.hand==="L"?C.amber:C.blue }}>{row.hand}HP</span>}</td>
            <td style={{ padding:"10px" }}>{row.started?<Check size={14} color="#10b981"/>:<X size={14} color="#ef4444"/>}</td>
            <td style={{ padding:"10px",fontSize:13,color:C.text }}>{row.result}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/* ── PLAYER DETAIL MODAL ──────────────────────────────────────────── */
function PlayerDetailModal({ entryId, onClose, isOnRoster, isOnWatch, onRemove, onMoveToRoster, onEspnUpdate }) {
  const [tab,setTab]=useState("today"), [player,setPlayer]=useState(null), [loading,setLoading]=useState(true), [error,setError]=useState(null);
  const [espnEdit,setEspnEdit]=useState(false), [espnInput,setEspnInput]=useState(""), [espnSaving,setEspnSaving]=useState(false);
  const [research,setResearch]=useState(null), [researchLoading,setResearchLoading]=useState(false);
  const [positionEvents,setPositionEvents]=useState([]), [positionEventsLoading,setPositionEventsLoading]=useState(false);

  useEffect(()=>{ 
    if(!entryId)return; 
    setLoading(true); 
    setPositionEvents([]);
    API.getPlayerDetail(entryId)
      .then(d=>{
        const adapted = API.adaptDetail(d);
        setPlayer(adapted);
        setLoading(false);
        if (adapted?.id) {
          setPositionEventsLoading(true);
          API.getPositionEvents(adapted.id, 365)
            .then(ev=>setPositionEvents(ev.rows || []))
            .catch(()=>setPositionEvents([]))
            .finally(()=>setPositionEventsLoading(false));
        }
      })
      .catch(e=>{setError(e.message);setLoading(false);}); 
  },[entryId]);

  // Auto-fetch research when player loads; refresh if stale
  useEffect(()=>{
    if(!player?.id) return;
    API.getResearch(player.id).then(r=>{
      setResearch(r);
      // If stale or missing, trigger a fresh search in background
      if(!r || r.stale || !r.role_note){
        setResearchLoading(true);
        API.triggerResearch(player.id)
          .then(fresh=>{ setResearch(fresh); })
          .catch(()=>{})
          .finally(()=>setResearchLoading(false));
      }
    }).catch(()=>{});
  },[player?.id]);

  function refreshResearch() {
    if(!player?.id) return;
    setResearchLoading(true);
    API.triggerResearch(player.id)
      .then(r=>setResearch(r))
      .catch(()=>{})
      .finally(()=>setResearchLoading(false));
  }

  async function saveEspnPositions() {
    setEspnSaving(true);
    const raw = espnInput.trim().toUpperCase();
    // Parse comma or space-separated positions, filter valid ones
    const VALID = new Set(["C","1B","2B","3B","SS","OF","SP","RP","DH"]);
    const parsed = raw.split(/[\s,]+/).map(s=>s.trim()).filter(s=>VALID.has(s));
    // null = clear override (use computed)
    const value = parsed.length > 0 ? parsed : null;
    try {
      await API.updateEntry(player._entryId, { espn_positions: value });
      if (onEspnUpdate) onEspnUpdate(player._entryId, value);
      setEspnEdit(false);
      // Update local player pos
      setPlayer(prev=>({...prev, pos: value || prev.pos, elig: value || prev.elig, _espnPositions: value}));
    } catch(e) { alert("Save failed: "+e.message); }
    setEspnSaving(false);
  }
  return (
    <div className="modal-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal-box" style={{ maxWidth:700 }}>
        {loading&&<div style={{ padding:"60px 24px",textAlign:"center" }}><Spinner size={28}/></div>}
        {error&&<div style={{ padding:"40px 24px",textAlign:"center",color:C.red }}><AlertCircle size={24} style={{ marginBottom:8 }}/><br/>{error}</div>}
        {player&&!loading&&(
          <>
            <div style={{ padding:"20px 24px 0",borderBottom:`1px solid ${C.border}` }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12 }}>
                <div>
                  <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:6 }}>
                    <h2 className="barlow" style={{ fontSize:28,fontWeight:800 }}>{player.name}</h2>
                    <StatusBadge status={player.status}/>
                  </div>
                  <div className="fantag-actions" style={{ display:"flex",gap:6,alignItems:"center" }}>
                    <span style={{ fontSize:13,color:C.textDim,fontWeight:600 }}>{player.team}</span>
                    <span style={{ color:C.border }}>·</span>
                    {player.elig.map(p=><PosTag key={p} pos={p}/>)}
                  </div>
                  {/* Bats / Throws */}
                  <div style={{ display:"flex",gap:10,marginTop:6,alignItems:"center" }}>
                    {player.bats && player.bats !== "—" && (
                      <span style={{ fontSize:11,color:C.textDim }}>
                        Bats&nbsp;<span style={{ color: player.bats==="L"?C.amber:player.bats==="S"?"#a78bfa":C.blue, fontWeight:700 }}>{player.bats==="L"?"Left":player.bats==="R"?"Right":"Switch"}</span>
                      </span>
                    )}
                    {player.bats && player.bats !== "—" && player.throws && player.throws !== "—" && (
                      <span style={{ color:C.border,fontSize:11 }}>·</span>
                    )}
                    {player.throws && player.throws !== "—" && (
                      <span style={{ fontSize:11,color:C.textDim }}>
                        Throws&nbsp;<span style={{ color: player.throws==="L"?C.amber:C.blue, fontWeight:700 }}>{player.throws==="L"?"Left":"Right"}</span>
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                  {isOnWatch&&<button className="btn-green" onClick={onMoveToRoster}>→ Roster</button>}
                  <button onClick={onClose} style={{ background:"none",border:"none",cursor:"pointer",color:C.textDim,padding:4 }}><X size={18}/></button>
                </div>
              </div>
      {/* Current Role Research Card */}
      {(research?.role_note || researchLoading) && (
        <div style={{ background:C.elevated,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
            <span style={{ color:C.textDim,fontSize:12,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase" }}>
              Current Role
            </span>
            <div style={{ display:"flex",alignItems:"center",gap:8 }}>
              {research?.researched_at && (
                <span style={{ fontSize:10,color:C.textDim,fontFamily:"'Fira Code'" }}>
                  {new Date(research.researched_at).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
                </span>
              )}
              <button onClick={refreshResearch} disabled={researchLoading}
                style={{ fontSize:10,color:C.blue,background:"none",border:`1px solid ${C.border}`,borderRadius:4,padding:"2px 7px",cursor:"pointer" }}>
                {researchLoading ? "…" : "↻"}
              </button>
            </div>
          </div>
          {researchLoading && !research?.role_note
            ? <div style={{ color:C.textDim,fontSize:12 }}>Researching current role…</div>
            : <>
                {research?.role_note && (
                  <div style={{ fontSize:13,color:C.text,lineHeight:1.5,marginBottom:8 }}>
                    {research.role_note}
                  </div>
                )}
                {(research?.position_vsR || research?.position_vsL) && (
                  <div style={{ display:"flex",gap:16,marginBottom:6 }}>
                    {research.position_vsR && (
                      <div>
                        <div style={{ fontSize:10,color:C.textDim,marginBottom:2 }}>vs RHP</div>
                        <span style={{ fontSize:14,fontWeight:700,color:C.blue }}>{research.position_vsR}</span>
                      </div>
                    )}
                    {research.position_vsL && (
                      <div>
                        <div style={{ fontSize:10,color:C.textDim,marginBottom:2 }}>vs LHP</div>
                        <span style={{ fontSize:14,fontWeight:700,color:C.amber }}>{research.position_vsL}</span>
                      </div>
                    )}
                    {research.platoon && (
                      <div style={{ alignSelf:"center" }}>
                        <span style={{ fontSize:10,background:"#2d1b4e",color:"#a78bfa",padding:"2px 7px",borderRadius:4,fontWeight:700 }}>PLATOON</span>
                      </div>
                    )}
                    {research.is_dh_risk && (
                      <div style={{ alignSelf:"center" }}>
                        <span style={{ fontSize:10,background:"#2d1f00",color:C.amber,padding:"2px 7px",borderRadius:4,fontWeight:700 }}>DH RISK</span>
                      </div>
                    )}
                  </div>
                )}
                {research?.source && (
                  <div style={{ fontSize:10,color:C.textDim,fontStyle:"italic",marginTop:4 }}>
                    Source: {research.source}
                  </div>
                )}
              </>
          }
        </div>
      )}


              {/* ESPN Eligibility row */}
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap" }}>
                <span style={{ fontSize:11,color:C.textDim,fontWeight:600,letterSpacing:"0.05em" }}>ESPN ELIG</span>
                {!espnEdit ? (
                  <>
                    {player.elig.map(p=><PosTag key={p} pos={p}/>)}
                    {player._espnPositions && (
                      <span style={{ fontSize:9,color:"#f59e0b",fontFamily:"'Fira Code'",marginLeft:2 }}>✓ ESPN set</span>
                    )}
                    {!player._espnPositions && (
                      <span style={{ fontSize:9,color:C.textDim,fontFamily:"'Fira Code'",marginLeft:2 }}>computed</span>
                    )}
                    <button onClick={()=>{setEspnEdit(true);setEspnInput((player._espnPositions||player.elig).join(", "));}}
                      style={{ fontSize:10,color:C.blue,background:"none",border:`1px solid ${C.border}`,borderRadius:4,padding:"1px 6px",cursor:"pointer",marginLeft:4 }}>
                      Edit
                    </button>
                  </>
                ) : (
                  <div style={{ display:"flex",alignItems:"center",gap:6,flex:1 }}>
                    <input
                      value={espnInput}
                      onChange={e=>setEspnInput(e.target.value)}
                      placeholder="e.g. C, 1B, DH"
                      style={{ flex:1,background:C.elevated,border:`1px solid ${C.blue}`,borderRadius:5,padding:"4px 8px",color:C.text,fontSize:12,fontFamily:"'Fira Code'" }}
                      autoFocus
                    />
                    <button onClick={saveEspnPositions} disabled={espnSaving}
                      style={{ fontSize:11,background:"#064e36",color:C.green,border:"none",borderRadius:4,padding:"4px 10px",cursor:"pointer" }}>
                      {espnSaving?"…":"Save"}
                    </button>
                    <button onClick={()=>{setEspnEdit(false);}}
                      style={{ fontSize:11,background:"none",color:C.textDim,border:`1px solid ${C.border}`,borderRadius:4,padding:"4px 8px",cursor:"pointer" }}>
                      Cancel
                    </button>
                    {player._espnPositions && (
                      <button onClick={()=>{setEspnInput("");}}
                        style={{ fontSize:10,color:C.red,background:"none",border:"none",cursor:"pointer",padding:"4px" }}>
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display:"flex" }}>
                {["today","season","positions","pattern","log"].map(t=>(
                  <button key={t} className={`detail-tab${tab===t?" active":""}`} style={{ color:tab===t?C.green:C.textDim }} onClick={()=>setTab(t)}>
                    {t==="today"?"Today":t==="season"?"Season":t==="positions"?"Positions":t==="pattern"?"Pattern":"Game Log"}
                  </button>
                ))}
              </div>
            </div>
            {tab==="today"&&<TodayTab player={player}/>}
            {tab==="season"&&<SeasonTab player={player} events={positionEvents}/>}
            {tab==="positions"&&<PositionEventsTab events={positionEvents}/>}
            {tab==="pattern"&&<PatternTab player={player}/>}
            {tab==="log"&&<LogTab player={player} events={positionEvents}/>}
          </>
        )}
      </div>
    </div>
  );
}

/* ── ADD PLAYER MODAL ─────────────────────────────────────────────── */
function AddPlayerModal({ onClose, onAdd, onDrop, existingEntries }) {
  const existingIds = (existingEntries||[]).map(e=>e.id);
  const rosterPlayers = (existingEntries||[]).filter(e=>e._status==="roster");

  const [q,setQ]           = useState("");
  const [results,setResults]= useState([]);
  const [loading,setLoading]= useState(false);
  const [target,setTarget]  = useState("roster");
  const [adding,setAdding]  = useState(null);
  const [error,setError]    = useState(null);

  // Drop flow state
  const [pendingPlayer, setPendingPlayer] = useState(null);   // player we're about to add
  const [dropPhase, setDropPhase]         = useState(null);   // null | "confirm" | "select"
  const [dropId, setDropId]               = useState("");     // entryId to drop

  useEffect(()=>{
    if(q.length<2){setResults([]);return;}
    const t=setTimeout(()=>{
      setLoading(true);
      API.searchPlayers(q)
        .then(d=>{ setResults(d.map(API.adaptSearchResult)); setLoading(false); })
        .catch(()=>setLoading(false));
    },300);
    return()=>clearTimeout(t);
  },[q]);

  async function handleAdd(player) {
    setAdding(player.id); setError(null);
    if (target === "roster" && rosterPlayers.length > 0) {
      // Ask if they want to drop someone
      setPendingPlayer(player);
      setDropPhase("confirm");
      setAdding(null);
      return;
    }
    await commitAdd(player, null);
  }

  async function commitAdd(player, dropEntryId) {
    setAdding(player.id); setError(null);
    try {
      if (dropEntryId) await onDrop(dropEntryId);
      await onAdd(player.id, target);
      onClose();
    } catch(e) {
      setError(e.message);
      setAdding(null);
      setDropPhase(null);
    }
  }

  // Confirm phase — "do you want to drop someone?"
  if (dropPhase === "confirm" && pendingPlayer) {
    return (
      <div className="modal-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
        <div className="modal-box" style={{ maxWidth:420 }}>
          <div style={{ padding:"20px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <h3 className="barlow" style={{ fontSize:18,fontWeight:700 }}>Adding {pendingPlayer.name}</h3>
            <button onClick={onClose} style={{ background:"none",border:"none",cursor:"pointer",color:C.textDim }}><X size={18}/></button>
          </div>
          <div style={{ padding:"20px 24px" }}>
            <p style={{ fontSize:14,color:C.text,marginBottom:20,lineHeight:1.6 }}>
              Do you want to drop a player to make room?
            </p>
            {error && <div style={{ color:C.red,fontSize:13,marginBottom:12 }}>{error}</div>}
            <div style={{ display:"flex",gap:10 }}>
              <button className="btn-green" style={{ flex:1 }}
                onClick={()=>setDropPhase("select")}>
                Yes — choose who to drop
              </button>
              <button style={{ flex:1,background:C.elevated,border:`1px solid ${C.border}`,borderRadius:7,padding:"9px 16px",cursor:"pointer",color:C.text,fontSize:13 }}
                disabled={adding===pendingPlayer.id}
                onClick={()=>commitAdd(pendingPlayer, null)}>
                {adding===pendingPlayer.id ? <Spinner size={12}/> : "No — add without dropping"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Select drop phase — choose who to drop
  if (dropPhase === "select" && pendingPlayer) {
    return (
      <div className="modal-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
        <div className="modal-box" style={{ maxWidth:440 }}>
          <div style={{ padding:"20px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <h3 className="barlow" style={{ fontSize:18,fontWeight:700 }}>
              Drop to add {pendingPlayer.name}
            </h3>
            <button onClick={onClose} style={{ background:"none",border:"none",cursor:"pointer",color:C.textDim }}><X size={18}/></button>
          </div>
          <div style={{ padding:"16px 24px" }}>
            <p style={{ fontSize:13,color:C.textDim,marginBottom:14 }}>
              Select a player to drop from your roster:
            </p>
            <div style={{ border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",maxHeight:300,overflowY:"auto",marginBottom:16 }}>
              {rosterPlayers.map(p=>(
                <div key={p._entryId}
                  onClick={()=>setDropId(p._entryId)}
                  style={{ display:"flex",justifyContent:"space-between",alignItems:"center",
                           padding:"11px 14px",cursor:"pointer",
                           background:dropId===p._entryId?"#1a2f1a":C.card,
                           borderBottom:`1px solid ${C.border}`,
                           transition:"background 0.1s" }}>
                  <div>
                    <div style={{ fontWeight:600,fontSize:14,color:C.text }}>{p.name}</div>
                    <div style={{ display:"flex",gap:5,marginTop:2 }}>
                      <span style={{ fontSize:12,color:C.textDim }}>{p.team}</span>
                      {(p.pos||[]).slice(0,3).map(pos=><PosTag key={pos} pos={pos}/>)}
                    </div>
                  </div>
                  <div style={{ width:18,height:18,borderRadius:"50%",border:`2px solid ${dropId===p._entryId?C.green:C.border}`,background:dropId===p._entryId?C.green:"transparent",flexShrink:0 }}/>
                </div>
              ))}
            </div>
            {error && <div style={{ color:C.red,fontSize:13,marginBottom:12 }}>{error}</div>}
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={()=>setDropPhase("confirm")}
                style={{ background:C.elevated,border:`1px solid ${C.border}`,borderRadius:7,padding:"9px 16px",cursor:"pointer",color:C.textDim,fontSize:13 }}>
                ← Back
              </button>
              <button className="btn-green" style={{ flex:1 }}
                disabled={!dropId || adding===pendingPlayer.id}
                onClick={()=>commitAdd(pendingPlayer, dropId)}>
                {adding===pendingPlayer.id
                  ? <Spinner size={12}/>
                  : dropId
                    ? `Drop & Add ${pendingPlayer.name}`
                    : "Select a player to drop"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default — search phase
  return (
    <div className="modal-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal-box" style={{ maxWidth:480 }}>
        <div style={{ padding:"20px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <h3 className="barlow" style={{ fontSize:20,fontWeight:700 }}>Add Player</h3>
          <button onClick={onClose} style={{ background:"none",border:"none",cursor:"pointer",color:C.textDim }}><X size={18}/></button>
        </div>
        <div style={{ padding:"16px 24px" }}>
          <div style={{ display:"flex",gap:6,marginBottom:14 }}>
            {["roster","watch"].map(t=>(
              <button key={t} onClick={()=>setTarget(t)} className="tab-pill"
                style={{ background:target===t?"#064e36":"transparent",color:target===t?C.green:C.textDim,border:`1px solid ${target===t?"#065f46":"transparent"}`,fontSize:12 }}>
                {t==="roster"?"My Roster":"Watch List"}
              </button>
            ))}
          </div>
          <div style={{ position:"relative",marginBottom:12 }}>
            <Search size={13} style={{ position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:C.textDim }}/>
            <input className="search-box" placeholder="Search player name…" value={q} onChange={e=>setQ(e.target.value)} autoFocus/>
          </div>
          {error&&<div style={{ color:C.red,fontSize:13,marginBottom:10 }}>{error}</div>}
          {loading&&<div style={{ textAlign:"center",padding:"20px 0" }}><Spinner/></div>}
          {!loading&&results.length>0&&(
            <div style={{ border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden",maxHeight:320,overflowY:"auto" }}>
              {results.map(p=>{
                const already=existingIds.includes(p.id);
                return (
                  <div key={p.id} className="search-result" style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                    <div>
                      <div style={{ fontWeight:600,fontSize:14 }}>{p.name}</div>
                      <div style={{ display:"flex",gap:5,marginTop:3 }}>
                        <span style={{ fontSize:12,color:C.textDim }}>{p.team}</span>
                        {p.pos.map(pos=><PosTag key={pos} pos={pos}/>)}
                      </div>
                    </div>
                    {already
                      ? <span style={{ fontSize:12,color:C.textDim }}>Already added</span>
                      : <button className="btn-green" style={{ fontSize:12,padding:"5px 12px" }}
                          disabled={adding===p.id} onClick={()=>handleAdd(p)}>
                          {adding===p.id?<Spinner size={12}/>:<><Plus size={12}/> Add</>}
                        </button>
                    }
                  </div>
                );
              })}
            </div>
          )}
          {!loading&&q.length>=2&&results.length===0&&<div style={{ textAlign:"center",padding:"20px 0",color:C.textDim,fontSize:13 }}>No players found</div>}
          {q.length<2&&<div style={{ color:C.textDim,fontSize:13,textAlign:"center",padding:"12px 0" }}>Type at least 2 characters</div>}
        </div>
      </div>
    </div>
  );
}

/* ── IMPORT MODAL ─────────────────────────────────────────────────── */
function ImportModal({ onClose, onImportDone }) {
  const [mode,setMode]=useState("additive"), [step,setStep]=useState("upload"), [importData,setImportData]=useState(null), [error,setError]=useState(""), [committing,setCommitting]=useState(false);
  const fileRef=useRef();
  const handleFile=async(file)=>{ if(!file)return; setStep("processing");setError(""); try{const d=await API.createImport(file,mode);setImportData(d);setStep("review");}catch(e){setError(e.message);setStep("upload");} };
  const toggleItem=async(item)=>{ try{const u=await API.updateImportItem(importData.id,item.id,{confirmed:!item.confirmed});setImportData(u);}catch(e){setError(e.message);} };
  const handleCommit=async()=>{ setCommitting(true); try{await API.commitImport(importData.id);setStep("done");onImportDone();}catch(e){setError(e.message);}finally{setCommitting(false);} };
  const toggleable=importData?.items?.filter(i=>i.match_type!=="duplicate"&&i.match_type!=="unresolved")||[];
  const confirmed=importData?.items?.filter(i=>i.confirmed&&i.match_type!=="duplicate").length||0;
  const allSel=toggleable.length>0&&toggleable.every(i=>i.confirmed);
  const selectAll=async()=>{ for(const item of toggleable){if(!item.confirmed)try{const u=await API.updateImportItem(importData.id,item.id,{confirmed:true});setImportData(u);}catch(e){}} };
  const deselectAll=async()=>{ for(const item of toggleable){if(item.confirmed)try{const u=await API.updateImportItem(importData.id,item.id,{confirmed:false});setImportData(u);}catch(e){}} };
  const mc={ exact:"#10b981",likely:"#f59e0b",duplicate:"#475569",unresolved:"#ef4444" };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth:560 }} onClick={e=>e.stopPropagation()}>
        <div style={{ padding:"20px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div className="barlow" style={{ fontSize:20,fontWeight:700 }}><Upload size={16} style={{ marginRight:8,verticalAlign:"middle" }}/>Screenshot Import</div>
          <button className="btn-outline" style={{ padding:"6px 10px" }} onClick={onClose}><X size={14}/></button>
        </div>
        <div style={{ padding:"20px 24px" }}>
          {step==="upload"&&(
            <><div style={{ display:"flex",gap:6,marginBottom:16 }}>{[["additive","Additive"],["reconcile","Full Reconcile"]].map(([v,l])=><button key={v} className="tab-pill" style={{ background:mode===v?C.green:C.elevated,color:mode===v?"#fff":C.textDim }} onClick={()=>setMode(v)}>{l}</button>)}</div>
            {error&&<div style={{ color:C.red,fontSize:12,marginBottom:12 }}>{error}</div>}
            <div style={{ border:`2px dashed ${C.border}`,borderRadius:10,padding:"40px 24px",textAlign:"center",cursor:"pointer" }} onClick={()=>fileRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleFile(e.dataTransfer.files[0]);}}>
              <Upload size={28} color={C.textDim} style={{ marginBottom:12 }}/><div style={{ color:C.text,fontWeight:600,marginBottom:4 }}>Drop screenshot here</div><div style={{ fontSize:12,color:C.textDim }}>PNG, JPG, WebP — browse from C:\Downloads etc.</div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])}/>
            </div></>
          )}
          {step==="processing"&&<div style={{ textAlign:"center",padding:"52px 0" }}><RefreshCw size={32} color={C.green} className="spin" style={{ marginBottom:16 }}/><div style={{ fontWeight:600 }}>AI Vision extracting players…</div></div>}
          {step==="review"&&importData&&(
            <><div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}><span style={{ fontSize:13,color:C.textDim }}>{importData.items.length} players found</span><span style={{ fontSize:12,color:C.green }}>{confirmed} confirmed</span></div>
            <div style={{ display:"flex",gap:8,marginBottom:12 }}>
              <button className="btn-outline" style={{ fontSize:12,padding:"5px 12px" }} onClick={selectAll} disabled={allSel}>Select All</button>
              <button className="btn-outline" style={{ fontSize:12,padding:"5px 12px" }} onClick={deselectAll} disabled={confirmed===0}>Deselect All</button>
              <span style={{ fontSize:11,color:C.textDim,marginLeft:"auto",alignSelf:"center" }}>Dupes auto-skipped</span>
            </div>
            {error&&<div style={{ color:C.red,fontSize:12,marginBottom:8 }}>{error}</div>}
            <div style={{ display:"flex",flexDirection:"column",gap:6,maxHeight:320,overflowY:"auto" }}>
              {importData.items.map(item=>(
                <div key={item.id} style={{ background:C.elevated,borderRadius:8,padding:"10px 14px",display:"flex",alignItems:"center",gap:12 }}>
                  <input type="checkbox" checked={item.confirmed} onChange={()=>toggleItem(item)} disabled={item.match_type==="duplicate"||item.match_type==="unresolved"} style={{ accentColor:C.green,width:14,height:14,opacity:(item.match_type==="duplicate"||item.match_type==="unresolved")?0.4:1 }}/>
                  <div style={{ flex:1 }}><div style={{ display:"flex",gap:8,alignItems:"center" }}><span style={{ fontWeight:600,fontSize:13 }}>{item.matched_player?.name||item.raw_name}</span><span className="badge" style={{ background:`${mc[item.match_type]}22`,color:mc[item.match_type] }}>{item.match_type}</span></div>{item.raw_name!==item.matched_player?.name&&<div style={{ fontSize:11,color:C.textDim }}>OCR: "{item.raw_name}"</div>}</div>
                  <span className="fira" style={{ fontSize:11,color:C.textDim }}>{Math.round(item.confidence*100)}%</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop:16,display:"flex",justifyContent:"flex-end",gap:8 }}>
              <button className="btn-outline" onClick={onClose}>Cancel</button>
              <button className="btn-green" onClick={handleCommit} disabled={committing||confirmed===0}>{committing?<RefreshCw size={13} className="spin"/>:<Check size={13}/>} Import {confirmed}</button>
            </div></>
          )}
          {step==="done"&&<div style={{ textAlign:"center",padding:"48px 0" }}><CheckCircle size={36} color={C.green} style={{ marginBottom:14 }}/><div style={{ fontWeight:600,fontSize:16 }}>Import Complete</div><button className="btn-green" style={{ marginTop:16 }} onClick={onClose}>Done</button></div>}
        </div>
      </div>
    </div>
  );
}

/* ── TEXT SETTING ROW — local state avoids re-render focus loss ────── */
function TextSettingRow({ label, value, onSave }) {
  const [local, setLocal] = useState(value);
  // Sync if parent value changes externally
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <div className="settings-row">
      <div className="settings-label">{label}</div>
      <input className="inp" style={{ width:240 }}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onSave(local); }}
        onKeyDown={e => { if (e.key==="Enter") { onSave(local); e.target.blur(); } }}
      />
    </div>
  );
}

/* ── SETTINGS SECTION — collapsible accordion ─────────────────────── */
function SettingsSection({ icon, title, sub, children, defaultOpen=true }) {
  const [open,setOpen]=useState(defaultOpen);
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:10, padding:open?"18px 24px 20px":"14px 24px", marginBottom:14 }}>
      <button type="button" onClick={()=>setOpen(!open)} style={{ width:"100%",display:"flex",alignItems:"center",gap:8,background:"transparent",border:"none",padding:0,cursor:"pointer",textAlign:"left" }}>
        {open?<ChevronDown size={16} color={C.textDim}/>:<ChevronRight size={16} color={C.textDim}/>}
        {icon}
        <span className="barlow" style={{ fontSize:16, fontWeight:700, letterSpacing:"0.04em",color:C.text }}>{title}</span>
        {sub && <span style={{ fontSize:12, color:C.textDim, marginLeft:4 }}>{sub}</span>}
      </button>
      {open && <div style={{ marginTop:18 }}>{children}</div>}
    </div>
  );
}

/* ── SETTINGS PAGE ────────────────────────────────────────────────── */
const JOB_LABELS = {
  lineups_morning:   { label:"Poll lineups (morning)",    desc:"Fetch confirmed lineups — runs at 6am CDT" },
  lineups_midday:    { label:"Poll lineups (midday)",     desc:"Re-fetch lineups — runs at 11am CDT" },
  lineups_afternoon: { label:"Poll lineups (afternoon)",  desc:"Pre-game update — runs at 5pm CDT" },
  lineups_evening:   { label:"Poll lineups (evening)",    desc:"Game-time update — runs at 8pm CDT" },
  lineups_late:      { label:"Poll lineups (late night)", desc:"Final scores update — runs at 10pm CDT" },
  lineups_watch:     { label:"Lineup Watch poll",       desc:"Fast Rotowire/primary-source confirmation poll during game windows" },
  espn_sync:         { label:"Sync ESPN roster + eligibility", desc:"Read ESPN roster slots, IL state, and true eligible positions" },
  transactions:      { label:"Poll IL transactions",      desc:"Detect IL placements (30-day scan)" },
  pitcher_ip:        { label:"Update pitcher workload",   desc:"Write innings pitched for RP tracking" },
  fantasy_scores:    { label:"Write fantasy scores",      desc:"Persist today's fantasy scores to DB (runs at 8:30pm CDT)" },
  future_lineups:    { label:"Poll future probable SPs",  desc:"Write next 4 days' probable starters + schedules to DB (runs at 7:30am CDT)" },
  patterns:          { label:"Run pattern engine",        desc:"Recompute usage patterns" },
  research_roster:   { label:"Research player roles",     desc:"Refresh current 2026 role/position for all rostered players via web search" },
  rosters:           { label:"Sync team rosters",         desc:"Pull full 40-man rosters from MLB API" },
};
const HOURS = Array.from({length:24},(_,i)=>i);
const DAYS  = [["mon","Mon"],["tue","Tue"],["wed","Wed"],["thu","Thu"],["fri","Fri"],["sat","Sat"],["sun","Sun"]];



/* ── DATA SOURCES ACCORDION ──────────────────────────────────────── */
const DATA_SOURCES = [
  {
    name: "MLB Stats API",
    url:  "https://statsapi.mlb.com/api/v1",
    color: "#3b82f6",
    uses: [
      { label: "Daily lineups + batting order",   detail: "GET /schedule?hydrate=lineups,probablePitcher — runs at 6am, 11am, 5pm, 8pm, 10pm CDT" },
      { label: "Live boxscore stats",              detail: "GET /game/{pk}/feed/live (GUMBO) — starting pitcher from pitchers[0], IP, K, ER per player" },
      { label: "IL / transaction detection",       detail: "GET /sports/1/players + GET /transactions — 30-day lookback for IL placements and returns" },
      { label: "Team 40-man rosters",              detail: "GET /teams/{id}/roster?hydrate=person(allPositions) — weekly Sunday 4am, rebuilds Player table" },
      { label: "Position eligibility (pitchers)",  detail: "GET /stats?group=pitching&season=2025+2026 — gamesStarted + relief apps, ESPN thresholds 5 SP / 8 RP" },
      { label: "Position eligibility (batters)",   detail: "GET /stats?group=fielding&season=2025+2026 — games per position, ESPN thresholds 20 prev / 10 curr" },
      { label: "Schedule + probable pitchers",     detail: "GET /schedule?hydrate=probablePitcher — next 4 days for future view and pre-game context" },
      { label: "RP workload tracking",             detail: "IP pitched written from GUMBO boxscore to DailyPlayerStatus.ip_pitched for rest/fatigue scoring" },
    ],
  },
  {
    name: "Open-Meteo Weather API",
    url:  "https://api.open-meteo.com",
    color: "#06b6d4",
    uses: [
      { label: "Game-time weather",  detail: "Fetched on-click for outdoor stadiums — temperature, wind speed/direction, precipitation. Domed stadiums (ARI, HOU, MIA, MIL, SEA, TB, TEX, TOR) show 🏟️ instead." },
    ],
  },
  {
    name: "Claude Vision API (Anthropic)",
    url:  "https://api.anthropic.com",
    color: "#10b981",
    uses: [
      { label: "Roster screenshot OCR", detail: "claude-sonnet-4-20250514 vision model reads ESPN/Yahoo screenshots and extracts player names with fuzzy matching against the MLB player DB. Switchable to GPT-4o in Settings." },
    ],
  },
  {
    name: "OpenAI API (GPT-4o)",
    url:  "https://api.openai.com",
    color: "#a78bfa",
    uses: [
      { label: "Roster screenshot OCR (alt)", detail: "Alternative to Claude Vision — gpt-4o, gpt-4o-mini, or gpt-4-turbo. Selected in Settings → AI Provider." },
    ],
  },
  {
    name: "RotoWire Daily Lineups",
    url:  "https://www.rotowire.com/baseball/daily-lineups.php",
    color: "#f97316",
    uses: [
      { label: "Primary confirmed lineup source", detail: "Used by Lineup Watch poll to flip Awaiting Lineup into Starting or Confirmed Out as soon as public lineups post." },
      { label: "Projected vs confirmed player status", detail: "Best for day-of roster decisions, late scratches, batting order, and actual position such as C/1B/OF/DH." },
    ],
  },
  {
    name: "MLB.com Starting Lineups",
    url:  "https://www.mlb.com/starting-lineups",
    color: "#ef4444",
    uses: [
      { label: "Fallback confirmed lineup source", detail: "Used as a second public source when RotoWire parsing fails or MLB Stats API lags." },
      { label: "Probable pitcher cross-check", detail: "Good source for game-level lineup and probable starter validation." },
    ],
  },
  {
    name: "DraftBuddy / TeamRankings / FanGraphs / Baseball Savant",
    url:  "https://www.draftbuddy.com/baseball/games_played_by_position.php",
    color: "#22c55e",
    uses: [
      { label: "Future research targets", detail: "Candidate sources for games played by position, waiver comparisons, platoon strength, lineup trends, team context, and advanced player quality metrics." },
      { label: "Position pattern enrichment", detail: "Useful for backfilling season-to-date position usage, DH frequency, catcher rest patterns, and platoon-only start patterns." },
    ],
  },
  {
    name: "ESPN Fantasy (rules reference only)",
    url:  "https://www.espn.com/fantasy/baseball",
    color: "#f59e0b",
    uses: [
      { label: "Position eligibility thresholds", detail: "SP: 5+ starts in previous season. RP: 8+ relief appearances. Hitter: 20+ games at position in 2025 OR 10+ in 2026. No ESPN API — rules applied manually against MLB Stats data." },
      { label: "Scoring format",                  detail: "H2H Points with full custom rule set (26 batting + 17 pitching categories). Configured in Settings → Scoring Rules." },
    ],
  },
];

function DataSourcesSection() {
  const [open, setOpen] = React.useState(null);
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
      {DATA_SOURCES.map((src, i) => (
        <div key={i} style={{ background:C.elevated,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden" }}>
          <button
            onClick={()=>setOpen(open===i?null:i)}
            style={{ width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",
                     padding:"12px 16px",background:"none",border:"none",cursor:"pointer",textAlign:"left" }}>
            <div style={{ display:"flex",alignItems:"center",gap:10 }}>
              <div style={{ width:8,height:8,borderRadius:"50%",background:src.color,flexShrink:0 }}/>
              <span style={{ fontWeight:600,fontSize:13,color:C.text }}>{src.name}</span>
              <span style={{ fontSize:11,color:C.textDim }}>{src.uses.length} use{src.uses.length!==1?"s":""}</span>
            </div>
            {open===i ? <ChevronDown size={14} color={C.textDim}/> : <ChevronRight size={14} color={C.textDim}/>}
          </button>
          {open===i && (
            <div style={{ borderTop:`1px solid ${C.border}`,padding:"4px 0 8px" }}>
              {src.uses.map((u,j)=>(
                <div key={j} style={{ padding:"8px 16px 6px" }}>
                  <div style={{ fontSize:12,fontWeight:600,color:src.color,marginBottom:2 }}>{u.label}</div>
                  <div style={{ fontSize:11,color:C.textDim,lineHeight:1.5 }}>{u.detail}</div>
                </div>
              ))}
              <div style={{ padding:"6px 16px 0" }}>
                <a href={src.url} target="_blank" rel="noopener noreferrer"
                   style={{ fontSize:10,color:C.textDim,fontFamily:"'Fira Code',monospace" }}>
                  {src.url}
                </a>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


function EspnSyncSection({ showToast }) {
  const [cfg, setCfg] = useState(null);
  const [local, setLocal] = useState({
    enabled: false,
    sport: "baseball",
    season: new Date().getFullYear(),
    league_id: "",
    team_id: "",
    swid: "",
    espn_s2: "",
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [preview, setPreview] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [watchPreview, setWatchPreview] = useState(null);
  const [watchResult, setWatchResult] = useState(null);
  const [watchDiff, setWatchDiff] = useState(null);

  useEffect(() => {
    API.getEspnConfig()
      .then(d => {
        setCfg(d);
        setLocal(x => ({
          ...x,
          enabled: d.enabled,
          sport: d.sport || "baseball",
          season: d.season || new Date().getFullYear(),
          league_id: d.league_id || "",
          team_id: d.team_id || "",
          swid: "",
          espn_s2: "",
        }));
      })
      .catch(e => showToast("ESPN config failed: " + e.message, false))
      .finally(() => setLoading(false));
  }, []);

  async function saveEspn(extra = {}) {
    setBusy("save");
    try {
      const payload = {
        enabled: local.enabled,
        sport: local.sport,
        season: parseInt(local.season) || new Date().getFullYear(),
        league_id: local.league_id,
        team_id: local.team_id,
        ...extra,
      };
      if (local.swid.trim()) payload.swid = local.swid.trim();
      if (local.espn_s2.trim()) payload.espn_s2 = local.espn_s2.trim();
      const updated = await API.patchEspnConfig(payload);
      setCfg(updated);
      setLocal(x => ({ ...x, swid: "", espn_s2: "" }));
      showToast("ESPN settings saved");
    } catch(e) {
      showToast(e.message, false);
    } finally {
      setBusy(null);
    }
  }

  async function previewLeague() {
    setBusy("preview");
    setPreview(null);
    try {
      const d = await API.previewEspnLeague();
      setPreview(d);
      showToast(`Connected to ${d.league_name}`);
    } catch(e) {
      showToast(e.message, false);
    } finally {
      setBusy(null);
    }
  }

  async function syncRoster() {
    setBusy("sync");
    setSyncResult(null);
    try {
      const d = await API.syncEspnRoster(true);
      setSyncResult(d);
      showToast(`ESPN mirror sync done: ${d.summary.added} added, ${d.summary.updated} updated, ${d.summary.removed} stale removed, ${d.summary.unmatched} unmatched`);
    } catch(e) {
      showToast(e.message, false);
    } finally {
      setBusy(null);
    }
  }

  async function previewWatchlist() {
    setBusy("watch-preview");
    setWatchPreview(null);
    try {
      const d = await API.previewEspnWatchlist();
      setWatchPreview(d);
      showToast(`ESPN Watch List preview: ${d.count} player${d.count===1?"":"s"}`);
    } catch(e) {
      showToast(e.message, false);
    } finally {
      setBusy(null);
    }
  }

  async function syncWatchlist() {
    setBusy("watch-sync");
    setWatchResult(null);
    try {
      const d = await API.syncEspnWatchlist(true);
      setWatchResult(d);
      showToast(`ESPN Watch List sync done: ${d.summary.added} added, ${d.summary.updated} updated, ${d.summary.removed} removed, ${d.summary.unmatched} unmatched`);
    } catch(e) {
      showToast(e.message, false);
    } finally {
      setBusy(null);
    }
  }

  async function diffWatchlist() {
    setBusy("watch-diff");
    setWatchDiff(null);
    try {
      const d = await API.diffEspnWatchlist();
      setWatchDiff(d);
      showToast(`Watch List diff: ${d.espn_only.length} ESPN-only, ${d.fantag_only.length} FANTAG-only`);
    } catch(e) {
      showToast(e.message, false);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div style={{ padding:16 }}><Spinner size={16}/> Loading ESPN settings…</div>;

  return (
    <div>
      <div className="settings-row">
        <div>
          <div className="settings-label">Enable ESPN Fantasy Sync</div>
          <div className="settings-sub">Uses your local SWID + espn_s2 ESPN session cookies. Cookies are stored backend-side only and are never returned to the browser.</div>
        </div>
        <button className="tab-pill"
          style={{ background:local.enabled?"#064e36":"transparent",color:local.enabled?C.green:C.textDim,border:`1px solid ${local.enabled?"#065f46":C.border}`,fontSize:12 }}
          onClick={()=>setLocal(x=>({...x,enabled:!x.enabled}))}>
          {local.enabled ? "Enabled" : "Disabled"}
        </button>
      </div>

      <div className="settings-row">
        <div><div className="settings-label">Sport</div><div className="settings-sub">For this app, keep Baseball / FLB selected.</div></div>
        <select className="sel" value={local.sport} onChange={e=>setLocal(x=>({...x,sport:e.target.value}))}>
          <option value="baseball">Baseball / FLB</option>
          <option value="football">Football / FFL</option>
          <option value="basketball">Basketball / FBA</option>
          <option value="hockey">Hockey / FHL</option>
        </select>
      </div>

      <div className="settings-row">
        <div><div className="settings-label">Season</div><div className="settings-sub">Example: 2026</div></div>
        <input className="inp-sm" type="number" value={local.season} onChange={e=>setLocal(x=>({...x,season:e.target.value}))}/>
      </div>

      <div className="settings-row">
        <div><div className="settings-label">League ID</div><div className="settings-sub">From the ESPN URL: leagueId=123456</div></div>
        <input className="inp" style={{ width:240 }} value={local.league_id} onChange={e=>setLocal(x=>({...x,league_id:e.target.value}))}/>
      </div>

      <div className="settings-row">
        <div><div className="settings-label">Team ID</div><div className="settings-sub">Optional, but recommended. From ESPN URL: teamId=1. If blank, the first league team is previewed/synced.</div></div>
        <input className="inp" style={{ width:240 }} value={local.team_id} onChange={e=>setLocal(x=>({...x,team_id:e.target.value}))}/>
      </div>

      <div className="settings-row">
        <div><div className="settings-label">SWID Cookie</div><div className="settings-sub">{cfg?.has_swid ? "Saved — paste a new value only if it expires." : "Not saved yet."}</div></div>
        <input className="inp" style={{ width:300 }} placeholder={cfg?.has_swid ? "Saved / hidden" : "{YOUR-SWID}"} value={local.swid} onChange={e=>setLocal(x=>({...x,swid:e.target.value}))}/>
      </div>

      <div className="settings-row">
        <div><div className="settings-label">espn_s2 Cookie</div><div className="settings-sub">{cfg?.has_espn_s2 ? "Saved — paste a new value only if it expires." : "Not saved yet."}</div></div>
        <input className="inp" style={{ width:300 }} type="password" placeholder={cfg?.has_espn_s2 ? "Saved / hidden" : "Long ESPN session token"} value={local.espn_s2} onChange={e=>setLocal(x=>({...x,espn_s2:e.target.value}))}/>
      </div>

      <div style={{ display:"flex",gap:8,padding:"14px 0",flexWrap:"wrap" }}>
        <button className="btn-green" disabled={!!busy} onClick={()=>saveEspn()}>
          {busy==="save"?<><Spinner size={12}/> Saving…</>:<><Check size={12}/> Save ESPN Settings</>}
        </button>
        <button className="btn-outline" disabled={!!busy} onClick={previewLeague}>
          {busy==="preview"?<><Spinner size={12}/> Testing…</>:<><Cloud size={12}/> Test / Preview League</>}
        </button>
        <button className="btn-outline" disabled={!!busy} onClick={syncRoster} style={{ color:C.amber,borderColor:C.amber }}>
          {busy==="sync"?<><Spinner size={12}/> Syncing…</>:<><RefreshCw size={12}/> Sync ESPN Roster / Repair</>}
        </button>
        <button className="btn-outline" disabled={!!busy} onClick={previewWatchlist}>
          {busy==="watch-preview"?<><Spinner size={12}/> Checking…</>:<><Cloud size={12}/> Preview ESPN Watch List</>}
        </button>
        <button className="btn-outline" disabled={!!busy} onClick={syncWatchlist} style={{ color:C.purple,borderColor:C.purple }}>
          {busy==="watch-sync"?<><Spinner size={12}/> Syncing…</>:<><RefreshCw size={12}/> Sync ESPN Watch List</>}
        </button>
        <button className="btn-outline" disabled={!!busy} onClick={diffWatchlist}>
          {busy==="watch-diff"?<><Spinner size={12}/> Comparing…</>:<>Two-Way Diff</>}
        </button>
        <button className="btn-outline" disabled={!!busy} onClick={()=>saveEspn({clear_cookies:true})} style={{ color:C.red,borderColor:C.red }}>
          Clear Cookies
        </button>
      </div>

      {preview && (
        <div style={{ background:C.elevated,border:`1px solid ${C.border}`,borderRadius:8,padding:12,marginBottom:10 }}>
          <div style={{ fontWeight:700,fontSize:13,marginBottom:5 }}>{preview.league_name}</div>
          <div style={{ fontSize:12,color:C.textDim }}>Selected team: {preview.selected_team?.name || "—"} · ESPN roster players: {preview.roster_count}</div>
          <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginTop:8 }}>
            {(preview.roster_preview || []).slice(0,10).map(p=>(
              <span key={`${p.name}-${p.espn_id}`} style={{ fontSize:11,border:`1px solid ${C.border}`,borderRadius:999,padding:"3px 7px",color:C.textDim }}>{p.name} {p.lineup_slot?`· ${p.lineup_slot}`:""}</span>
            ))}
          </div>
        </div>
      )}

      {watchPreview && (
        <div style={{ background:C.elevated,border:`1px solid ${C.border}`,borderRadius:8,padding:12,marginBottom:10 }}>
          <div style={{ fontWeight:700,fontSize:13,marginBottom:5 }}>ESPN Watch List Preview</div>
          <div style={{ fontSize:12,color:C.textDim }}>Found {watchPreview.count} ESPN watch-list player{watchPreview.count===1?"":"s"}.</div>
          <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginTop:8 }}>
            {(watchPreview.players || []).slice(0,16).map(p=>(
              <span key={`${p.name}-${p.espn_id}`} style={{ fontSize:11,border:`1px solid ${C.border}`,borderRadius:999,padding:"3px 7px",color:C.textDim }}>{p.name}</span>
            ))}
          </div>
        </div>
      )}

      {watchResult && (
        <div style={{ background:C.elevated,border:`1px solid ${C.border}`,borderRadius:8,padding:12,marginBottom:10 }}>
          <div style={{ fontWeight:700,fontSize:13,marginBottom:5 }}>ESPN Watch List Sync Result</div>
          <div style={{ fontSize:12,color:C.textDim }}>
            Added {watchResult.summary.added} · Updated {watchResult.summary.updated} · Removed {watchResult.summary.removed} · Unmatched {watchResult.summary.unmatched}
          </div>
          {watchResult.unmatched?.length > 0 && (
            <div style={{ marginTop:8,fontSize:12,color:C.amber }}>
              Unmatched ESPN watch players: {watchResult.unmatched.slice(0,8).map(p=>p.espn_name).join(", ")}{watchResult.unmatched.length>8?"…":""}
            </div>
          )}
        </div>
      )}

      {watchDiff && (
        <div style={{ background:C.elevated,border:`1px solid ${C.border}`,borderRadius:8,padding:12,marginBottom:10 }}>
          <div style={{ fontWeight:700,fontSize:13,marginBottom:5 }}>Watch List Two-Way Diff</div>
          <div style={{ fontSize:12,color:C.textDim }}>
            ESPN-only {watchDiff.espn_only?.length || 0} · FANTAG-only {watchDiff.fantag_only?.length || 0} · Matched {watchDiff.matched?.length || 0}
          </div>
          {watchDiff.fantag_only?.length > 0 && (
            <div style={{ marginTop:8,fontSize:12,color:C.amber }}>FANTAG-only: {watchDiff.fantag_only.slice(0,8).map(p=>p.name).join(", ")}{watchDiff.fantag_only.length>8?"…":""}</div>
          )}
          {watchDiff.espn_only?.length > 0 && (
            <div style={{ marginTop:8,fontSize:12,color:C.blue }}>ESPN-only: {watchDiff.espn_only.slice(0,8).map(p=>p.matched_name || p.espn_name).join(", ")}{watchDiff.espn_only.length>8?"…":""}</div>
          )}
          <div style={{ marginTop:8,fontSize:11,color:C.textDim }}>{watchDiff.write_back_note}</div>
        </div>
      )}

      {syncResult && (
        <div style={{ background:C.elevated,border:`1px solid ${C.border}`,borderRadius:8,padding:12 }}>
          <div style={{ fontWeight:700,fontSize:13,marginBottom:5 }}>Last Sync Result</div>
          <div style={{ fontSize:12,color:C.textDim }}>
            Added {syncResult.summary.added} · Updated {syncResult.summary.updated} · Skipped {syncResult.summary.skipped} · Unmatched {syncResult.summary.unmatched}
          </div>
          {syncResult.unmatched?.length > 0 && (
            <div style={{ marginTop:8,fontSize:12,color:C.amber }}>
              Unmatched: {syncResult.unmatched.slice(0,8).map(p=>p.espn_name).join(", ")}{syncResult.unmatched.length>8?"…":""}
            </div>
          )}
          <div style={{ marginTop:8,fontSize:11,color:C.textDim }}>After syncing, run “Sync team rosters” and the lineup poll if player positions or daily status look stale.</div>
        </div>
      )}
    </div>
  );
}


function BackupRestoreSection({ showToast }) {
  const [status, setStatus] = React.useState(null);
  const [items, setItems] = React.useState([]);
  const [busy, setBusy] = React.useState(null);
  const [confirmRestore, setConfirmRestore] = React.useState(null);
  async function load() {
    try {
      const [st, list] = await Promise.all([API.getBackupStatus(), API.listBackups()]);
      setStatus(st); setItems(list.backups || []);
    } catch(e) { showToast("Backup status failed: " + e.message, false); }
  }
  React.useEffect(()=>{ load(); }, []);
  async function makeBackup() {
    setBusy("create");
    try { const r = await API.createBackup("manual_settings_button"); showToast(r.message || "Backup created"); await load(); }
    catch(e) { showToast(e.message, false); }
    finally { setBusy(null); }
  }
  async function restore(filename) {
    setBusy("restore");
    try { const r = await API.restoreBackup(filename); showToast(r.message || "Restore complete"); setConfirmRestore(null); await load(); }
    catch(e) { showToast(e.message, false); }
    finally { setBusy(null); }
  }
  async function removeBackup(filename) {
    if (!window.confirm(`Delete backup ${filename}?`)) return;
    setBusy("delete");
    try { await API.deleteBackup(filename); showToast("Backup deleted"); await load(); }
    catch(e) { showToast(e.message, false); }
    finally { setBusy(null); }
  }
  return (
    <div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12 }}>
        <div style={{ background:C.elevated,border:`1px solid ${C.border}`,borderRadius:8,padding:12 }}>
          <div style={{ fontSize:11,color:C.textDim,marginBottom:4 }}>Database</div>
          <div className="fira" style={{ fontSize:11,color:C.text,wordBreak:"break-all" }}>{status?.database_path || "—"}</div>
          <div style={{ fontSize:11,color:C.textDim,marginTop:6 }}>{status?.database_size_bytes ? `${Math.round(status.database_size_bytes/1024)} KB` : ""}</div>
        </div>
        <div style={{ background:C.elevated,border:`1px solid ${C.border}`,borderRadius:8,padding:12 }}>
          <div style={{ fontSize:11,color:C.textDim,marginBottom:4 }}>Backup Folder</div>
          <div className="fira" style={{ fontSize:11,color:C.text,wordBreak:"break-all" }}>{status?.backup_dir || "—"}</div>
          <div style={{ fontSize:11,color:C.textDim,marginTop:6 }}>{items.length} saved backup{items.length===1?"":"s"}</div>
        </div>
      </div>
      <div style={{ display:"flex",gap:8,marginBottom:12,flexWrap:"wrap" }}>
        <button className="btn-green" disabled={!!busy} onClick={makeBackup}>{busy==="create"?<><Spinner size={12}/> Saving…</>:<><Database size={12}/> Save Backup Now</>}</button>
        <button className="btn-outline" disabled={!!busy} onClick={load}><RefreshCw size={12}/> Refresh List</button>
      </div>
      <div style={{ border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden" }}>
        {items.length===0 ? <div style={{ padding:16,color:C.textDim,fontSize:13 }}>No backups yet.</div> : items.map(b => (
          <div key={b.filename} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 12px",borderBottom:`1px solid ${C.border}` }}>
            <div style={{ minWidth:0 }}>
              <div className="fira" style={{ fontSize:11,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{b.filename}</div>
              <div style={{ fontSize:11,color:C.textDim,marginTop:3 }}>{b.created_at} · v{b.version || "?"} b{b.build || "?"} · {Math.round((b.size_bytes||0)/1024)} KB</div>
            </div>
            <div style={{ display:"flex",gap:6,flexShrink:0 }}>
              <a className="btn-outline" style={{ fontSize:11,padding:"5px 9px",textDecoration:"none" }} href={`/api/backup/download/${encodeURIComponent(b.filename)}`}>Download</a>
              <button className="btn-outline" style={{ fontSize:11,padding:"5px 9px",color:C.amber,borderColor:C.amber }} disabled={!!busy} onClick={()=>setConfirmRestore(b.filename)}>Restore</button>
            </div>
          </div>
        ))}
      </div>
      {confirmRestore && (
        <div style={{ marginTop:12,background:"#2d1a00",border:`1px solid ${C.amber}`,borderRadius:8,padding:12 }}>
          <div style={{ fontWeight:700,color:C.amber,marginBottom:6 }}>Confirm Restore</div>
          <div style={{ fontSize:12,color:C.textDim,marginBottom:10 }}>Restore <span className="fira">{confirmRestore}</span>? A pre-restore safety backup will be created automatically. Restart fantag-api after restore.</div>
          <div style={{ display:"flex",gap:8 }}>
            <button className="btn-outline" onClick={()=>setConfirmRestore(null)}>Cancel</button>
            <button className="btn-red" disabled={!!busy} onClick={()=>restore(confirmRestore)}>{busy==="restore"?<><Spinner size={12}/> Restoring…</>:"Restore Database"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
function SettingsPage() {
  const [cfg,setCfg]=useState(null), [loading,setLoading]=useState(true), [triggering,setTriggering]=useState(null), [toast,setToast]=useState(null), [saving,setSaving]=useState(false);
  function showToast(msg,ok=true){setToast({msg,ok});setTimeout(()=>setToast(null),3000);}
  useEffect(()=>{API.getSettings().then(d=>{setCfg(d);setLoading(false);}).catch(()=>setLoading(false));}, []);
  async function save(patch){setSaving(true);try{const u=await API.patchSettings(patch);setCfg(u);showToast("Saved");}catch(e){showToast(e.message,false);}finally{setSaving(false);}};
  async function trigger(id){setTriggering(id);try{const r=await API.triggerJob(id);showToast(r.message);}catch(e){showToast(e.message,false);}finally{setTriggering(null);}};

  if(loading)return<div style={{ textAlign:"center",padding:"60px 0" }}><Spinner size={28}/></div>;
  if(!cfg)return<div style={{ textAlign:"center",padding:"40px 0",color:C.red }}>Failed to load settings</div>;

  // Section defined outside component — see SettingsSection below

  return (
    <div style={{ maxWidth:800,margin:"0 auto",padding:"24px 20px" }}>
      {toast&&<div style={{ position:"fixed",bottom:24,right:24,zIndex:200,background:toast.ok?C.greenDim:"#450a0a",border:`1px solid ${toast.ok?"#065f46":"#7f1d1d"}`,borderRadius:8,padding:"10px 16px",fontSize:13,display:"flex",alignItems:"center",gap:8,color:toast.ok?C.green:C.red }}>{toast.ok?<CheckCircle size={14}/>:<AlertCircle size={14}/>} {toast.msg}</div>}

      {/* League */}
      <SettingsSection icon={<Users size={16} color={C.purple}/>} title="League">
        <TextSettingRow label="League Name" value={cfg.league_name} onSave={v=>save({league_name:v})}/>
        <TextSettingRow label="Team Name"   value={cfg.team_name}   onSave={v=>save({team_name:v})}/>
        <div className="settings-row">
          <div><div className="settings-label">Teams in League</div></div>
          <select className="sel" value={cfg.team_count} onChange={e=>save({team_count:parseInt(e.target.value)})}>
            {[8,10,12,14,16].map(n=><option key={n} value={n}>{n} teams</option>)}
          </select>
        </div>
        <div className="settings-row" style={{ borderBottom:"none" }}>
          <div><div className="settings-label">Waiver Priority</div><div className="settings-sub">Your current waiver position</div></div>
          <input className="inp-sm" type="number" min="1" max={cfg.team_count} value={cfg.waiver_priority}
            onChange={e=>save({waiver_priority:parseInt(e.target.value)||1})}/>
        </div>
      </SettingsSection>

      {/* Roster display */}
      <SettingsSection icon={<Users size={16} color={C.green}/>} title="Roster Display" sub="Choose how My Roster is organized">
        <div className="settings-row" style={{ borderBottom:"none" }}>
          <div>
            <div className="settings-label">My Roster sort mode</div>
            <div className="settings-sub">ESPN Slot mirrors your current ESPN fantasy roster slot. Status Sort removes the slot column and groups Alerts → Starting → Awaiting Lineup.</div>
          </div>
          <div style={{ display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end" }}>
            {[
              ["espn_slot","ESPN Slot"],
              ["status_sort","Status Sort"],
              ["smart_assign","FANTAG Smart"]
            ].map(([v,l])=>(
              <button key={v} className="tab-pill" style={{ background:cfg.roster_display_mode===v?"#064e36":"transparent",color:cfg.roster_display_mode===v?C.green:C.textDim,border:`1px solid ${cfg.roster_display_mode===v?"#065f46":"transparent"}`,fontSize:12 }} onClick={()=>save({roster_display_mode:v})}>{l}</button>
            ))}
          </div>
        </div>
      </SettingsSection>

      {/* Scoring */}
      <SettingsSection icon={<Zap size={16} color={C.amber}/>} title="Scoring Rules">
        <div className="settings-row">
          <div className="settings-label">Format</div>
          <div style={{ display:"flex",gap:6 }}>
            {[["roto_5x5","Roto 5×5"],["roto_6x6","Roto 6×6"],["h2h_points","H2H Points"]].map(([v,l])=>(
              <button key={v} className="tab-pill" style={{ background:cfg.scoring_format===v?"#1a2040":"transparent",color:cfg.scoring_format===v?C.blue:C.textDim,border:`1px solid ${cfg.scoring_format===v?"#1e3a6e":"transparent"}`,fontSize:11 }} onClick={()=>save({scoring_format:v})}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginTop:16 }}>
          {[
            ["BATTING", "batting", [
              ["H","Hits"],["R","Runs Scored"],["1B","Singles"],["2B","Doubles"],["3B","Triples"],
              ["HR","Home Runs"],["XBH","Extra Base Hits"],["RBI","Runs Batted In"],["GWRBI","Game Winning RBI"],
              ["BB","Walks"],["IBB","Intentional Walks"],["K","Strikeouts"],["HBP","Hit By Pitch"],
              ["SAC","Sacrifices"],["SB","Stolen Bases"],["CS","Caught Stealing"],["GIDP","Grnd into DP"],
              ["CYC","Hitting for the Cycle"],["GSHR","Grand Slam HR"],
              ["FC","Fielding Chances"],["PO","Put Outs"],["AST","Assists"],["OFAST","Outfield Assists"],["E","Errors"],["DPT","Double Plays Turned"],
            ]],
            ["PITCHING", "pitching", [
              ["IP","Innings Pitched"],["ER","Earned Runs"],["HR","HR Allowed"],["BB","Walks Issued"],
              ["K","Strikeouts"],["B","Balks"],["PKO","Pick Offs"],["CG","Complete Games"],
              ["SO","Shutouts"],["NH","No Hitters"],["PG","Perfect Games"],
              ["W","Wins"],["L","Losses"],["SOP","Save Opportunities"],["SV","Saves"],["BS","Blown Saves"],["HD","Holds"],
            ]],
          ].map(([title, group, cats])=>(
            <div key={group}>
              <div className="barlow" style={{ fontSize:12,color:C.textDim,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:12,paddingBottom:6,borderBottom:`1px solid ${C.border}` }}>{title}</div>
              {cats.map(([cat, label])=>{
                const val=cfg.scoring_rules?.[group]?.[cat]??0;
                return (
                  <div key={cat} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7 }}>
                    <div>
                      <span style={{ fontSize:13,color:val!==0?C.text:C.textDim,fontWeight:500 }}>{cat}</span>
                      <span style={{ fontSize:11,color:C.textDim,marginLeft:6 }}>{label}</span>
                    </div>
                    <input className="inp-sm" type="number" step="0.5" value={val}
                      onChange={e=>{
                        const v=parseFloat(e.target.value)||0;
                        const rules={...cfg.scoring_rules,[group]:{...cfg.scoring_rules?.[group],[cat]:v}};
                        setCfg(prev=>({...prev,scoring_rules:rules}));
                      }}
                      onBlur={()=>save({scoring_rules:cfg.scoring_rules})}
                      style={{ width:60,color:val<0?C.red:val>0?C.green:C.textDim }}/>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </SettingsSection>

      {/* AI */}
      <SettingsSection icon={<Brain size={16} color={C.green}/>} title="AI Provider">
        <div className="settings-row">
          <div className="settings-label">OCR Provider</div>
          <div style={{ display:"flex",gap:6 }}>
            {[["claude","Claude Vision"],["openai","GPT-4o"]].map(([v,l])=>(
              <button key={v} className="tab-pill" style={{ background:cfg.ocr_provider===v?"#064e36":"transparent",color:cfg.ocr_provider===v?C.green:C.textDim,border:`1px solid ${cfg.ocr_provider===v?"#065f46":"transparent"}`,fontSize:12 }} onClick={()=>save({ocr_provider:v})}>{l}</button>
            ))}
          </div>
        </div>
        {cfg.ocr_provider==="openai"&&(
          <div className="settings-row" style={{ borderBottom:"none" }}>
            <div className="settings-label">OpenAI Model</div>
            <select className="sel" value={cfg.openai_model} onChange={e=>save({openai_model:e.target.value})}>
              {["gpt-4o","gpt-4o-mini","gpt-4-turbo"].map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        )}
      </SettingsSection>

      {/* Schedule */}
      <SettingsSection icon={<Clock size={16} color={C.blue}/>} title="Schedule" sub="All times CST">
        {[["Morning lineup poll","daily_poll_hour","daily_poll_minute","Fetches lineups each morning"],["Midday poll","midday_poll_hour",null,"Catches late scratches"],["Pattern engine","pattern_engine_hour",null,"Nightly (3am default)"],["Notifications","notifications_hour",null,"Fires alert rules"]].map(([lbl,hk,mk,desc])=>(
          <div key={hk} className="settings-row">
            <div><div className="settings-label">{lbl}</div><div className="settings-sub">{desc}</div></div>
            <div style={{ display:"flex",gap:6,alignItems:"center" }}>
              <select className="sel" value={cfg[hk]} onChange={e=>save({[hk]:parseInt(e.target.value)})}>
                {HOURS.map(h=><option key={h} value={h}>{String(h).padStart(2,"0")}:00</option>)}
              </select>
              {mk&&<select className="sel" value={cfg[mk]} onChange={e=>save({[mk]:parseInt(e.target.value)})}>{[0,15,30,45].map(m=><option key={m} value={m}>:{String(m).padStart(2,"0")}</option>)}</select>}
            </div>
          </div>
        ))}
        <div className="settings-row">
          <div><div className="settings-label">Day switches at</div><div className="settings-sub">Before this hour = yesterday's date shown</div></div>
          <select className="sel" value={cfg.day_switch_hour} onChange={e=>save({day_switch_hour:parseInt(e.target.value)})}>
            {HOURS.map(h=><option key={h} value={h}>{String(h).padStart(2,"0")}:00</option>)}
          </select>
        </div>
        <div className="settings-row" style={{ borderBottom:"none" }}>
          <div><div className="settings-label">Roster sync day</div><div className="settings-sub">Weekly 40-man pull at 4am</div></div>
          <div style={{ display:"flex",gap:5 }}>
            {DAYS.map(([v,l])=>(
              <button key={v} onClick={()=>save({roster_sync_day:v})} style={{ padding:"5px 8px",borderRadius:4,border:`1px solid ${cfg.roster_sync_day===v?C.green:C.border}`,background:cfg.roster_sync_day===v?"#064e36":"transparent",color:cfg.roster_sync_day===v?C.green:C.textDim,fontSize:12,cursor:"pointer",fontFamily:"'DM Sans'" }}>{l}</button>
            ))}
          </div>
        </div>
      </SettingsSection>

      {/* Triggers */}
      <SettingsSection icon={<Clock size={16} color={C.purple}/>} title="Pre-Game Auto-Poll">
        <div className="settings-row">
          <div><div className="settings-label">Auto-poll before game starts</div><div className="settings-sub">Fires lineup poll before each group of games to catch IL moves</div></div>
          <button className="tab-pill" style={{ background:cfg.pre_game_poll_enabled?"#064e36":"transparent",color:cfg.pre_game_poll_enabled?C.green:C.textDim,border:`1px solid ${cfg.pre_game_poll_enabled?"#065f46":"transparent"}`,fontSize:12 }}
            onClick={()=>save({pre_game_poll_enabled:!cfg.pre_game_poll_enabled})}>
            {cfg.pre_game_poll_enabled?"Enabled":"Disabled"}
          </button>
        </div>
        {cfg.pre_game_poll_enabled && (
          <div className="settings-row" style={{ borderBottom:"none" }}>
            <div><div className="settings-label">Minutes before first pitch</div><div className="settings-sub">Poll fires this early before each game group — check IL before locks</div></div>
            <div style={{ display:"flex",gap:6 }}>
              {[15,30,45,60].map(m=>(
                <button key={m} onClick={()=>save({pre_game_poll_minutes:m})} style={{ padding:"5px 10px",borderRadius:4,border:`1px solid ${cfg.pre_game_poll_minutes===m?C.green:C.border}`,background:cfg.pre_game_poll_minutes===m?"#064e36":"transparent",color:cfg.pre_game_poll_minutes===m?C.green:C.textDim,fontSize:13,cursor:"pointer",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700 }}>{m} min</button>
              ))}
            </div>
          </div>
        )}
      </SettingsSection>

      <SettingsSection icon={<AlertCircle size={16} color={C.amber}/>} title="Lineup Status Source" sub="Primary source for confirmed MLB lineups">
        <div className="settings-row">
          <div><div className="settings-label">Primary confirmed-lineup source</div><div className="settings-sub">RotoWire first flips Confirmed Out/Starting when MLB Stats API lags.</div></div>
          <div style={{ display:"flex",gap:6 }}>
            {[["rotowire","RotoWire first"],["mlbcom","MLB.com first"]].map(([v,l])=>(
              <button key={v} className="tab-pill" style={{ background:cfg.lineup_source_primary===v?"#2d1a00":"transparent",color:cfg.lineup_source_primary===v?C.amber:C.textDim,border:`1px solid ${cfg.lineup_source_primary===v?"#92400e":"transparent"}`,fontSize:12 }} onClick={()=>save({lineup_source_primary:v})}>{l}</button>
            ))}
          </div>
        </div>
        <div className="settings-row" style={{ borderBottom:"none" }}>
          <div><div className="settings-label">External lineup overlay</div><div className="settings-sub">Use public confirmed lineup pages as an overlay before MLB API updates.</div></div>
          <button className="tab-pill" style={{ background:cfg.lineup_external_enabled?"#064e36":"transparent",color:cfg.lineup_external_enabled?C.green:C.textDim,border:`1px solid ${cfg.lineup_external_enabled?"#065f46":"transparent"}`,fontSize:12 }} onClick={()=>save({lineup_external_enabled:!cfg.lineup_external_enabled})}>{cfg.lineup_external_enabled?"Enabled":"Disabled"}</button>
        </div>
      </SettingsSection>

      <SettingsSection icon={<Cloud size={16} color={C.blue}/>} title="ESPN Fantasy Sync" sub="Private-league roster import via ESPN cookies">
        <EspnSyncSection showToast={showToast}/>
      </SettingsSection>

      <SettingsSection icon={<Database size={16} color={C.green}/>} title="Backup & Restore" sub="Save or restore the FANTAG SQLite database">
        <BackupRestoreSection showToast={showToast}/>
      </SettingsSection>

      <SettingsSection icon={<Play size={16} color={C.amber}/>} title="Manual Triggers" sub="Run any job immediately">
        <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
          {Object.entries(JOB_LABELS).map(([id,{label,desc}])=>(
            <div key={id} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 14px",background:C.elevated,borderRadius:8 }}>
              <div><div style={{ fontWeight:600,fontSize:13 }}>{label}</div><div style={{ fontSize:12,color:C.textDim,marginTop:2 }}>{desc}</div></div>
              <button className="btn-outline" style={{ fontSize:12,padding:"6px 14px",flexShrink:0 }} disabled={triggering===id} onClick={()=>trigger(id)}>
                {triggering===id?<><Spinner size={12}/> Running…</>:<><Play size={12}/> Run Now</>}
              </button>
            </div>
          ))}
        </div>
      </SettingsSection>
      <SettingsSection icon={<Database size={16} color={C.textDim}/>} title="Data Sources" sub="APIs and services used by FANTAG">
        <DataSourcesSection/>
      </SettingsSection>
    </div>
  );
}

/* ── CDT CLOCK ───────────────────────────────────────────────────── */
function CdtClock({ viewLabel, viewDate }) {
  const [time, setTime] = React.useState(() => {
    return new Date().toLocaleTimeString("en-US", {
      timeZone: "America/Chicago", hour: "numeric", minute: "2-digit",
      hour12: true
    }) + " CDT";
  });
  React.useEffect(() => {
    const tick = () => setTime(
      new Date().toLocaleTimeString("en-US", {
        timeZone: "America/Chicago", hour: "numeric", minute: "2-digit",
        hour12: true
      }) + " CDT"
    );
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="fantag-clock" style={{ fontSize:11,color:C.textDim,fontFamily:"'Barlow Condensed'",fontWeight:700,letterSpacing:"0.06em" }}>
      {viewLabel.toUpperCase()} · {viewDate} · <span style={{ color:C.green }}>{time}</span>
    </span>
  );
}

/* ── ROOT APP ─────────────────────────────────────────────────────── */
export default function App() {
  const [activeTab,     setActiveTab]     = useState("roster");
  const [entries,       setEntries]       = useState([]);
  const [stats,         setStats]         = useState(null);
  const [schedule,      setSchedule]      = useState([]);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [showAdd,       setShowAdd]       = useState(false);
  const [showBulkRemove,setShowBulkRemove]= useState(false);
  const [showImport,    setShowImport]    = useState(false);
  const [search,        setSearch]        = useState("");
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [toast,         setToast]         = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [switchHour,    setSwitchHour]    = useState(2);
  const [rosterDisplayMode,setRosterDisplayMode]=useState("espn_slot");
  const [viewDate,      setViewDate]      = useState(()=>getViewDate(2));
  const [scoringRules,  setScoringRules]  = useState(null);
  const [lineupStatus,  setLineupStatus]  = useState({ lineup_confirmed_teams:[], teams_playing_today:[] });
  const [rpWorkload,    setRpWorkload]    = useState({});  // {player_id: workload_data}
  const [researchMap,   setResearchMap]   = useState({});  // {mlb_id: research_data}

  function showToast(msg,ok=true){setToast({msg,ok});setTimeout(()=>setToast(null),3500);}

  async function handleRosterDisplayModeChange(mode) {
    if (!mode || mode === rosterDisplayMode) return;
    setRosterDisplayMode(mode);
    try {
      await API.patchSettings({ roster_display_mode: mode });
      showToast(`Roster sort mode: ${mode === "status_sort" ? "Status Sort" : mode === "smart_assign" ? "FANTAG Smart" : "ESPN Slot"}`);
    } catch (e) {
      showToast("Sort mode saved locally, but server setting failed: " + e.message, false);
    } finally {
      loadAll(undefined, { syncEspn:true });
    }
  }

  function scrollToRosterSection(kind) {
    if (activeTab !== "roster") setActiveTab("roster");
    if (kind !== "il" && rosterDisplayMode !== "status_sort") setRosterDisplayMode("status_sort");
    const textMap = {
      starting: "Starting — Position Players",
      dtd: "Active DTD Warnings",
      il: "Injured List",
    };
    const needle = textMap[kind];
    window.setTimeout(() => {
      const headers = Array.from(document.querySelectorAll(".section-hdr"));
      const target = headers.find(h => (h.textContent || "").includes(needle));
      if (target) target.scrollIntoView({ behavior:"smooth", block:"start" });
    }, 160);
  }

  const loadAll = useCallback(async (dateOverride, options = {})=>{
    setLoading(true); setError(null);
    const dateToFetch = dateOverride || viewDate;
    const isToday_    = isToday(dateToFetch);
    try {
      // ESPN is the source of truth for My Roster + IL. On app load and manual
      // refresh, mirror ESPN first so stale/ghost roster rows cannot reappear.
      if (isToday_ && options.syncEspn === true) {
        try {
          await API.repairEspnSync();
        } catch (syncErr) {
          console.warn("ESPN auto-sync skipped/failed", syncErr);
        }
      }
      // Fire all requests — each protected so one failure doesn't kill all
      const [all, s, sched, cfg, ls, rp, rm] = await Promise.all([
        (isToday_ ? API.getRoster() : API.getRosterForDate(dateToFetch)).catch(e=>{ throw e; }),
        API.getRosterStats().catch(()=>null),
        API.getRosterSchedule().catch(()=>[]),
        API.getSettings().catch(()=>null),
        (isToday_ ? API.getLineupStatus().catch(()=>null) : Promise.resolve(null)),
        (isToday_ ? API.getRpWorkload().catch(()=>null)    : Promise.resolve(null)),
        API.getResearchMap().catch(()=>null),
      ]);
      setEntries((all||[]).map(API.adaptEntry));
      if(s)  setStats(s);
      setSchedule(Array.isArray(sched)?sched:[]);
      if(cfg?.scoring_rules) setScoringRules(cfg.scoring_rules);
      if(cfg?.roster_display_mode) setRosterDisplayMode(cfg.roster_display_mode);
      if(ls) setLineupStatus(ls);
      if(rp) { const m={}; rp.forEach(r=>{ m[r.player_id]=r; }); setRpWorkload(m); }
      if(rm && typeof rm === "object") setResearchMap(rm);
    } catch(e) {
      setError(e.message);
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);

  // On first load: fetch settings for day_switch_hour, then load data
  useEffect(()=>{
    API.getSettings()
      .then(d=>{
        if(d?.day_switch_hour != null){
          setSwitchHour(d.day_switch_hour);
          const correctDate = getViewDate(d.day_switch_hour);
          setViewDate(correctDate);
          // Load with the correct date immediately, don't wait for viewDate state
          loadAll(correctDate, { syncEspn:true });
        } else {
          loadAll(undefined, { syncEspn:true });
        }
        if(d?.scoring_rules) setScoringRules(d.scoring_rules);
        if(d?.roster_display_mode) setRosterDisplayMode(d.roster_display_mode);
      })
      .catch(()=>loadAll(undefined, { syncEspn:true }));
  // Only on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Fast auto-refresh: 15 seconds on today view so lineup changes surface quickly
  useEffect(()=>{
    if (!isToday(viewDate)) return;

    function hasLiveGame() {
      // Check if any rostered player has a game currently in progress
      return entries.some(p => {
        const gs = p.today?.gameStatus || "";
        return gs.includes("Progress") || gs.includes("Warmup") || gs.includes("Manager");
      });
    }

    let intervalId = null;

    function scheduleNext() {
      const live    = hasLiveGame();
      const delay   = 15 * 1000;
      intervalId = setTimeout(()=>{
        loadAll(undefined, { syncEspn:false });
        scheduleNext();
      }, delay);
    }

    scheduleNext();
    return ()=>{ if(intervalId) clearTimeout(intervalId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate, entries]);

  // Reload when user navigates dates (skip initial load — handled above)
  const isFirstRender = useRef(true);
  useEffect(()=>{
    if(isFirstRender.current){ isFirstRender.current=false; return; }
    loadAll();
  },[viewDate]);

  function handleDateChange(d) { setViewDate(d); }

  const rosterEntries = entries.filter(e=>e._status==="roster" || e._status==="il");
  const watchEntries  = entries.filter(e=>e._status==="watch");
  const existingIds   = entries.map(e=>e.id);
  const filtered      = (list)=>search?list.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())||p.team.toLowerCase().includes(search.toLowerCase())):list;

  async function handleAdd(player_id,status){await API.addToRoster(player_id,status);await loadAll();showToast(`Added to ${status}`);}
  async function handleDrop(entry_id){await API.removeEntry(entry_id);showToast("Player dropped");}

  function initiateRemove(entry_id, player_name){setConfirmRemove({entry_id,player_name});}

  async function handleRemove(){
    if(!confirmRemove)return;
    await API.removeEntry(confirmRemove.entry_id);
    if(selectedEntry?._entryId===confirmRemove.entry_id)setSelectedEntry(null);
    setConfirmRemove(null);
    await loadAll();
    showToast("Removed");
  }


  async function handleBulkRemove(entryIds){
    const r = await API.bulkRemoveEntries(entryIds);
    setShowBulkRemove(false);
    if(selectedEntry && entryIds.includes(selectedEntry._entryId)) setSelectedEntry(null);
    await loadAll();
    showToast(r.message || `Removed ${entryIds.length} players`);
  }
  async function handleMoveToRoster(entry_id){await API.updateEntry(entry_id,{status:"roster"});await loadAll();showToast("Moved to roster");}

  const todayStr = getTodayStr();
  const viewLabel = viewDate===todayStr ? "Today" : isFuture(viewDate) ? "Projected" : "History";

  // Pre-compute roster total so it never throws in render
  const rosterTotal = (() => {
    if (!scoringRules) return 0;
    try {
      const t = rosterEntries.reduce((sum, p) => {
        const sc = calcFantasyScore(p.liveStats || {}, scoringRules);
        return sum + (sc || 0);
      }, 0);
      return Math.round(t * 10) / 10;
    } catch { return 0; }
  })();

  return (
    <ErrorBoundary>
    <div className="fantag-app-shell" style={{ minHeight:"100vh",background:C.bg,fontFamily:"'DM Sans',sans-serif",color:C.text }}>
      <style>{CSS}</style>

      {/* Toast */}
      {toast&&<div style={{ position:"fixed",bottom:24,right:24,zIndex:200,background:toast.ok?C.greenDim:"#450a0a",border:`1px solid ${toast.ok?"#065f46":"#7f1d1d"}`,borderRadius:8,padding:"10px 16px",fontSize:13,display:"flex",alignItems:"center",gap:8,color:toast.ok?C.green:C.red }}>{toast.ok?<CheckCircle size={14}/>:<AlertCircle size={14}/>} {toast.msg}</div>}


      {/* Top Nav */}
      <div className="fantag-sticky-header">
        <div className="fantag-top-inner" style={{ maxWidth:1200,margin:"0 auto",padding:"0 20px",display:"flex",justifyContent:"space-between",alignItems:"center",height:54 }}>
          <div className="fantag-brand-row" style={{ display:"flex",alignItems:"center",gap:14,minWidth:0 }}>
            <div style={{ display:"flex",alignItems:"center",minWidth:0 }}>
              <img
                src={HEADER_BANNER_SRC}
                srcSet="/logos/banner-320x122.png 320w, /logos/banner-512x196.png 512w, /logos/banner-1024x392.png 1024w"
                sizes="(max-width: 640px) 150px, 230px"
                alt="FANTAG Fantasy Roster Tracker"
                style={{ display:"block",height:36,width:"auto",maxWidth:"min(52vw,230px)",objectFit:"contain" }}
              />
            </div>
            {/* Version / Build badge */}
            <span style={{ fontSize:10,color:C.textDim,fontFamily:"'Fira Code',monospace",letterSpacing:"0.04em",background:C.elevated,border:`1px solid ${C.border}`,borderRadius:5,padding:"2px 7px",userSelect:"none" }}>
              v{APP_VERSION} · b{APP_BUILD}
            </span>
            <div className="fantag-web-toolbar" aria-label="FANTAG quick controls">
              <button className="fantag-icon-btn" title="Home" aria-label="Home" onClick={()=>{ setActiveTab("roster"); window.scrollTo({top:0,behavior:"smooth"}); }}><Home size={18}/></button>
              <button className="fantag-icon-btn" title="Refresh" aria-label="Refresh" onClick={()=>loadAll(undefined, { syncEspn:true })}><RefreshCw size={18}/></button>
              <button className="fantag-icon-btn" title="Settings" aria-label="Settings" onClick={()=>setActiveTab("settings")}><MoreVertical size={19}/></button>
            </div>
            <div className="fantag-nav-tabs" style={{ display:"flex",gap:3 }}>
              {[["roster","My Roster",rosterEntries.length],["watch","Watch List",watchEntries.length]].map(([id,lbl,cnt])=>(
                <button key={id} onClick={()=>setActiveTab(id)} className="tab-pill" style={{ background:activeTab===id?"#064e36":"transparent",color:activeTab===id?C.green:C.textDim,border:`1px solid ${activeTab===id?"#065f46":"transparent"}`,fontSize:12,padding:"6px 14px" }}>
                  {lbl} <span style={{ background:C.elevated,borderRadius:10,padding:"1px 6px",fontSize:10,color:C.textDim }}>{cnt}</span>
                </button>
              ))}
              <button onClick={()=>setActiveTab("settings")} className="tab-pill" style={{ background:activeTab==="settings"?"#0d2040":"transparent",color:activeTab==="settings"?C.blue:C.textDim,border:`1px solid ${activeTab==="settings"?"#1e3a6e":"transparent"}`,fontSize:12,padding:"6px 14px" }}>
                <Settings size={12}/> Settings
              </button>
            </div>
          </div>
          {activeTab!=="settings"&&(
            <div className="fantag-main-actions" style={{ display:"flex",gap:6,alignItems:"center" }}>
              <CdtClock viewLabel={viewLabel} viewDate={viewDate}/>
              <button className="btn-outline" title="Refresh display" style={{ padding:"5px 10px" }} onClick={()=>loadAll(undefined, { syncEspn:true })}><RefreshCw size={12}/></button>
              {/* Past-date re-poll: re-runs GUMBO lineup fetch for that specific date */}
              {!isToday(viewDate) && !isFuture(viewDate) && (
                <button className="btn-outline"
                  title={`Re-fetch lineup data from MLB for ${viewDate} — fixes missing SP / DNP records`}
                  style={{ padding:"5px 10px", color:"#818cf8", borderColor:"#818cf8", fontSize:11 }}
                  onClick={async()=>{
                    try {
                      await API.repollDate(viewDate);
                      showToast(`Re-polled ${viewDate} — reloading…`);
                      setTimeout(()=>loadAll(), 800);
                    } catch(e) { showToast("Re-poll failed: " + e.message, false); }
                  }}>
                  <RefreshCw size={11}/> Re-poll {viewDate}
                </button>
              )}
              <button className="btn-outline" title="Manual Status Refresh — uses selected primary source (RotoWire/MLB.com/MLB API)"
                style={{ padding:"5px 10px", color:C.amber, borderColor:C.amber }}
                onClick={async()=>{
                  try {
                    showToast("Refreshing ESPN + fastest lineup sources…");
                    await API.triggerJob("espn_sync").catch(()=>API.repairEspnSync());
                    await API.triggerJob("lineups_watch");
                    await API.triggerJob("lineups_morning").catch(()=>{});
                    await API.triggerJob("transactions");
                  } catch(e) {
                    showToast("Status refresh had a source error: " + e.message, false);
                  }
                  await loadAll(undefined, { syncEspn:true });
                }}>
                <Play size={12}/><span style={{fontSize:10,marginLeft:4}}>Status</span>
              </button>
              <button className="btn-outline" style={{ padding:"5px 10px" }} onClick={()=>setShowImport(true)}><Upload size={12}/> Import</button>
              <button className="btn-green"   style={{ padding:"5px 12px" }} onClick={()=>setShowAdd(true)}><Plus size={12}/> Add Player</button>
            </div>
          )}
        </div>
      </div>

      {activeTab==="settings"&&<SettingsPage/>}

      {activeTab!=="settings"&&(
        <div className="fantag-content" style={{ maxWidth:1200,margin:"0 auto",padding:"16px 20px" }}>

          {/* Date strip */}
          <DateStrip viewDate={viewDate} onDateChange={handleDateChange} switchHour={switchHour}/>

          {/* Summary strip */}
          {stats&&(
            <div className="fantag-summary-grid" style={{ display:"grid",gap:10,marginBottom:14,alignItems:"stretch" }}>
              {[["Starting Today",stats.starting_today,C.green,"starting"],["On IL",stats.on_il,C.red,"il"],["DTD",stats.dtd_count,C.amber,"dtd"],["Rostered",stats.roster_count,C.blue,null],["Watching",stats.watch_count,C.purple,null]].map(([lbl,val,color,jump])=>(
                <div key={lbl} className={`fantag-summary-tile${jump?" clickable":""}`} onClick={()=>jump&&scrollToRosterSection(jump)} title={jump?`Jump to ${lbl} players`:undefined} style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 16px",display:"flex",gap:8,alignItems:"center" }}>
                  <span className="barlow" style={{ fontSize:22,fontWeight:800,color }}>{val}</span>
                  <span style={{ fontSize:11,color:C.textDim }}>{lbl}</span>
                </div>
              ))}
              {rosterTotal !== 0 && (
                <div className="fantag-summary-tile" style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 16px",display:"flex",gap:8,alignItems:"center" }}>
                  <span className="barlow" style={{ fontSize:11,color:C.textDim }}>Today's Total</span>
                  <span className="barlow" style={{ fontSize:26,fontWeight:800,color:rosterTotal>=0?C.green:C.red }}>{rosterTotal}</span>
                </div>
              )}
            </div>
          )}

          {/* Search + quick roster sort selector */}
          <div style={{ display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:10 }}>
            <div style={{ position:"relative",flex:"1 1 280px",maxWidth:520 }}>
              <Search size={13} style={{ position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:C.textDim }}/>
              <input className="search-box fantag-filter-input" style={{ maxWidth:"100%" }} placeholder={`Filter ${activeTab==="roster"?"roster":"watch list"}…`} value={search} onChange={e=>setSearch(e.target.value)}/>
            </div>
            {activeTab==="roster" && (
              <label style={{ display:"flex",alignItems:"center",gap:6,fontSize:11,color:C.textDim,fontFamily:"'Barlow Condensed'",fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase" }}>
                Sort
                <select className="sel" value={rosterDisplayMode} onChange={e=>handleRosterDisplayModeChange(e.target.value)} title="Change My Roster sort mode and refresh">
                  <option value="espn_slot">ESPN Slot</option>
                  <option value="status_sort">Status Sort</option>
                  <option value="smart_assign">FANTAG Smart</option>
                </select>
              </label>
            )}
          </div>

          {loading?(
            <div style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"52px 24px",textAlign:"center" }}><Spinner size={28}/></div>
          ):error?(
            <div style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"40px 24px",textAlign:"center" }}>
              <AlertCircle size={24} color={C.red} style={{ marginBottom:10 }}/><div style={{ color:C.red,marginBottom:8 }}>{error}</div>
              <div style={{ color:C.textDim,fontSize:13 }}>Is fantag-api running? <code style={{ color:C.green }}>docker ps | grep fantag</code></div>
            </div>
          ):activeTab==="roster"?(
            filtered(rosterEntries).length===0&&!search?(
              <div style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"52px 24px",textAlign:"center" }}>
                <Users size={28} color={C.textDim} style={{ marginBottom:10 }}/><div style={{ color:C.text,fontWeight:600,marginBottom:4 }}>No players yet</div>
                <div style={{ color:C.textDim,fontSize:13,marginBottom:16 }}>Add players or import a screenshot</div>
                <div style={{ display:"flex",gap:8,justifyContent:"center" }}>
                  <button className="btn-outline" onClick={()=>setShowImport(true)}><Upload size={13}/> Import</button>
                  <button className="btn-green" onClick={()=>setShowAdd(true)}><Plus size={13}/> Add Player</button>
                </div>
              </div>
            ):(
              <EspnRosterTable entries={filtered(rosterEntries)} onSelect={p=>setSelectedEntry({_entryId:p._entryId,_status:p._status})} onRemove={initiateRemove} schedule={schedule} viewDate={viewDate} scoringRules={scoringRules} lineupStatus={lineupStatus} rpWorkload={rpWorkload} researchMap={researchMap} rosterDisplayMode={rosterDisplayMode}/>
            )
          ):(
            <WatchTable entries={filtered(watchEntries)} onSelect={p=>setSelectedEntry({_entryId:p._entryId,_status:p._status})} onRemove={initiateRemove} schedule={schedule} viewDate={viewDate} scoringRules={scoringRules} lineupStatus={lineupStatus} rpWorkload={rpWorkload} researchMap={researchMap}/>
          )}

          <div style={{ marginTop:12,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <span style={{ fontSize:11,color:C.textDim }}>
              {isFuture(viewDate)?"Projected lineup based on schedule":isToday(viewDate)?"Lineups from daily poll":"Historical lineup data"} · <a href="/api/docs" style={{ color:C.green,textDecoration:"none" }}>API docs</a>
            </span>
            <button className="btn-outline" style={{ fontSize:11,padding:"4px 10px" }} onClick={()=>loadAll()}><RefreshCw size={11}/> Refresh</button>
          </div>
        </div>
      )}

      {selectedEntry&&(
        <PlayerDetailModal entryId={selectedEntry._entryId} onClose={()=>setSelectedEntry(null)}
          isOnRoster={selectedEntry._status==="roster"} isOnWatch={selectedEntry._status==="watch"}
          onRemove={()=>{ const e=entries.find(x=>x._entryId===selectedEntry._entryId); if(e)initiateRemove(e._entryId,e.name); setSelectedEntry(null); }}
          onMoveToRoster={()=>handleMoveToRoster(selectedEntry._entryId).then(()=>setSelectedEntry(null))}/>
      )}
      {showAdd&&<AddPlayerModal onClose={()=>setShowAdd(false)} onAdd={handleAdd} onDrop={handleDrop} existingEntries={entries}/>}
      {showImport&&<ImportModal onClose={()=>setShowImport(false)} onImportDone={()=>{showToast("Import complete");setShowImport(false);loadAll();}}/>}
    </div>
    </ErrorBoundary>
  );
}
