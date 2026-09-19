/* ============================================================
   Chordix — דשבורד ניהול (לצפייה בלבד)
   ------------------------------------------------------------
   * ההרשאה נבדקת בשרת: כל הנתונים מגיעים מ-RPC של Supabase (admin_dashboard / admin_list)
     שמחזירים FORBIDDEN למי שאינו ברשימת המנהלים. בקובץ הזה אין שום סוד — רק המפתח הציבורי
     (publishable) שממילא נמצא באתר.
   * לצפייה בלבד: הקריאה היחידה שכותבת משהו היא admin_reset_counter, והיא שומרת רק *סמן*
     ("מאיזה רגע סופרים"). שום נתון של משתמשים לא נמחק ולא משתנה מכאן.
   * כל טקסט מהמסד נכתב ל-DOM עם textContent / createTextNode בלבד (תגובות ושמות קבצים הם קלט
     של משתמשים — innerHTML כאן היה פותח XSS על חשבון המנהל).
   * זמן אמת: מנוי Realtime על stats_daily / comments / profiles מפעיל רענון מיידי; בנוסף רענון
     כל 30 שניות כגיבוי, ורענון בחזרה ללשונית.
   ============================================================ */
(function(){
'use strict';

var root = document.documentElement;
try{ if(localStorage.getItem('cx_theme') === 'dark') root.setAttribute('data-theme', 'dark'); }catch(e){}

var SUPABASE_URL = 'https://qksqaqpgmvrpxonpzgxc.supabase.co';
var SUPABASE_KEY = 'sb_publishable_o_OZ0MF9F3eN-7727-cQkA_oihPH1pH';
var POLL_MS = 30000, PAGE = 200, TZ = 'Asia/Jerusalem';

/* ---------- עזרי DOM (בלי innerHTML לנתונים) ---------- */
function $(id){ return document.getElementById(id); }
function el(tag, props, kids){
  var n = document.createElement(tag), k;
  if(props) for(k in props){
    if(k === 'class') n.className = props[k];
    else if(k === 'text') n.textContent = props[k];
    else if(k === 'on') for(var ev in props.on) n.addEventListener(ev, props.on[ev]);
    else if(props[k] === true) n.setAttribute(k, '');
    else if(props[k] !== false && props[k] != null) n.setAttribute(k, props[k]);
  }
  (kids || []).forEach(function(c){ if(c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return n;
}
var SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs, text){ var n = document.createElementNS(SVGNS, tag); for(var k in attrs) n.setAttribute(k, attrs[k]); if(text != null) n.textContent = text; return n; }
function clear(n){ while(n.firstChild) n.removeChild(n.firstChild); }

var nf = new Intl.NumberFormat('he-IL');
function fmt(n){ return (n == null || isNaN(n)) ? '—' : nf.format(n); }
var dfFull = new Intl.DateTimeFormat('he-IL', { timeZone:TZ, day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
var dfDay  = new Intl.DateTimeFormat('he-IL', { timeZone:TZ, day:'numeric', month:'numeric' });
var dfLong = new Intl.DateTimeFormat('he-IL', { timeZone:TZ, weekday:'long', day:'numeric', month:'long' });
var dfTime = new Intl.DateTimeFormat('he-IL', { timeZone:TZ, hour:'2-digit', minute:'2-digit', second:'2-digit' });
function when(s){ if(!s) return '—'; var d = new Date(s); return isNaN(d) ? '—' : dfFull.format(d); }
function dayDate(s){ return new Date(s + 'T12:00:00Z'); }            /* 'YYYY-MM-DD' → אמצע היום, בלי גלישת אזור-זמן */
function dur(sec){ if(sec == null) return '—'; sec = Math.round(sec); return Math.floor(sec/60) + ':' + String(sec%60).padStart(2, '0'); }

var toastTimer = null;
function toast(msg){ var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function(){ t.hidden = true; }, 3200); }

/* ---------- מצב ---------- */
var sb = null, channel = null, pollTimer = null, bumpTimer = null;
var S = { data:null, range:30, tab:'comments', q:'', rate:'', rows:[], total:0, busy:false, confirmOpen:false,
          prev:{}, seen:{ comments:null }, listTotals:{}, email:'' };

/* ============================================================
   שער הכניסה
   ============================================================ */
function gate(title, text, opts){
  opts = opts || {};
  $('dash').hidden = true; $('gate').hidden = false;
  $('gateSpin').hidden = !opts.spin;
  $('gateTitle').textContent = title; $('gateText').textContent = text || '';
  $('gateAct').hidden = !!opts.spin;
  $('gateGoogle').hidden = !opts.google; $('gateSwitch').hidden = !opts.switchAcct;
  $('refreshBtn').hidden = true; $('logoutBtn').hidden = !opts.switchAcct;
  setLive('idle', opts.spin ? 'מתחבר…' : 'לא מחובר');
}
function setLive(state, text){
  var l = $('live'); l.classList.toggle('on', state === 'on'); l.classList.toggle('off', state === 'off');
  $('liveTxt').textContent = text;
}

async function boot(){
  if(!window.supabase || !window.supabase.createClient){ gate('הדשבורד לא נטען', 'ספריית Supabase לא זמינה. נסו לרענן את הדף.'); return; }
  if(/^sb_secret_/.test(SUPABASE_KEY) || /service_role/.test(SUPABASE_KEY)){ gate('שגיאת תצורה', 'מפתח סודי אסור בצד הלקוח.'); return; }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, flowType:'pkce' } });
  sb.auth.onAuthStateChange(function(ev){ if(ev === 'SIGNED_IN' || ev === 'SIGNED_OUT' || ev === 'USER_UPDATED') setTimeout(check, 0); });
  check();
}

var checking = false;
async function check(){
  if(checking) return; checking = true;
  try{
    var r = await sb.auth.getSession(), session = r && r.data && r.data.session;
    if(!session){ stopLive(); gate('צריך להתחבר', 'הדשבורד פתוח רק לחשבון המנהל של Chordix.', { google:true }); return; }
    S.email = (session.user && session.user.email) || '';
    var a = await sb.rpc('is_admin');
    if(a.error){ stopLive(); gate('אין תקשורת עם Supabase', 'לא הצלחנו לבדוק הרשאה. בדקו את החיבור ונסו שוב.', { switchAcct:true }); return; }
    if(a.data !== true){ stopLive(); gate('אין הרשאת ניהול', 'החשבון ' + S.email + ' אינו מנהל. אפשר לצאת ולהיכנס עם חשבון המנהל.', { switchAcct:true }); return; }
    $('gate').hidden = true; $('dash').hidden = false; $('refreshBtn').hidden = false; $('logoutBtn').hidden = false;
    await refresh(true);
    startLive();
  }catch(e){ gate('משהו השתבש', 'נסו לרענן את הדף.', { switchAcct:true }); }
  finally{ checking = false; }
}

/* ============================================================
   נתונים: רענון, זמן אמת, גיבוי בתשאול
   ============================================================ */
async function refresh(force){
  if(S.busy) return; S.busy = true;
  document.body.classList.add('loading'); $('charts').classList.add('stale');
  try{
    var r = await sb.rpc('admin_dashboard');
    if(r.error){
      if(String(r.error.code) === '42501' || /FORBIDDEN/.test(r.error.message || '')){ stopLive(); gate('אין הרשאת ניהול', 'ההרשאה בוטלה או שהחשבון הוחלף.', { switchAcct:true }); return; }
      setLive('off', 'אין חיבור — מנסה שוב'); return;
    }
    S.data = r.data;
    setLive(S.rt ? 'on' : 'idle', S.rt ? 'מחובר בזמן אמת' : 'מתעדכן כל 30 שניות');
    renderKpis(); renderCharts(); renderBreaks(); renderTabCounts();
    $('updated').textContent = 'עודכן ' + dfTime.format(new Date());
    var k = S.data.kpi, totals = { comments:k.comments_total, users:k.users_total, songs:k.songs_in_db, waitlist:k.waitlist_total };
    var changed = S.listTotals[S.tab] !== totals[S.tab];
    if(S.prev.comments_total != null && k.comments_total > S.prev.comments_total) toast('התקבלה תגובה חדשה');
    S.listTotals = totals; S.prev = k;
    if(force || changed) await loadList(true);
  }catch(e){ setLive('off', 'אין חיבור — מנסה שוב'); }
  finally{ S.busy = false; document.body.classList.remove('loading'); $('charts').classList.remove('stale'); }
}
function bump(){ clearTimeout(bumpTimer); bumpTimer = setTimeout(function(){ refresh(false); }, 600); }

function startLive(){
  stopLive();
  try{
    channel = sb.channel('admin-dash')
      .on('postgres_changes', { event:'*',      schema:'public', table:'stats_daily' }, bump)
      .on('postgres_changes', { event:'*',      schema:'public', table:'comments'    }, bump)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'profiles'    }, bump)
      .subscribe(function(status){
        if(status === 'SUBSCRIBED'){ S.rt = true; setLive('on', 'מחובר בזמן אמת'); }
        else if(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'){ S.rt = false; setLive('idle', 'מתעדכן כל 30 שניות'); }
      });
  }catch(e){ setLive('idle', 'מתעדכן כל 30 שניות'); }
  pollTimer = setInterval(function(){ if(!document.hidden) refresh(false); }, POLL_MS);
}
function stopLive(){
  if(pollTimer){ clearInterval(pollTimer); pollTimer = null; }
  if(channel){ try{ sb.removeChannel(channel); }catch(e){} channel = null; }
  S.rt = false;
}
document.addEventListener('visibilitychange', function(){ if(!document.hidden && sb && !$('dash').hidden) refresh(false); });

/* ============================================================
   KPI — אריחי מספרים (לא גרף של עמודה אחת)
   ============================================================ */
var KPIS = [
  { id:'users',    label:'משתמשים רשומים',        metric:'users',    value:function(k){ return k.users_since; },    total:function(k){ return k.users_total; },    sub:function(k){ return [['היום', '+' + fmt(k.users_today)]]; } },
  { id:'analyses', label:'שירים שנותחו',          metric:'analyses', value:function(k){ return k.analyses_since; }, total:function(k){ return k.analyses_total; }, sub:function(k){ return [['היום', fmt(k.analyses_today)]]; } },
  { id:'vtoday',   label:'כניסות היום',                              value:function(k){ return k.visits_today; },                                                  sub:function(k){ return [['אתמול', fmt(k.visits_yesterday)]]; } },
  { id:'visits',   label:'כניסות, מצטבר',          metric:'visits',   value:function(k){ return k.visits_since; },   total:function(k){ return k.visits_total; } },
  { id:'active',   label:'משתמשים מחוברים שהיו פעילים היום',          value:function(k){ return k.active_today; } },
  { id:'rating',   label:'דירוג ממוצע',            metric:'rating',   value:function(k){ return k.rating_avg_since; }, star:true,
    total:function(k){ return k.rating_avg; }, totalStar:true, sub:function(k){ return [['מספר דירוגים', fmt(k.rating_count_since)]]; } },
  { id:'comments', label:'תגובות',                 metric:'comments', value:function(k){ return k.comments_since; }, total:function(k){ return k.comments_total; }, sub:function(k){ return [['היום', fmt(k.comments_today)]]; } },
  { id:'stored',   label:'שירים שמורים כרגע במסד',                    value:function(k){ return k.songs_in_db; },                                                   sub:function(k){ return [['בספרייה', fmt(k.library_saved)], ['בהיסטוריה (30 יום)', fmt(k.history_rows)]]; } },
  { id:'waitlist', label:'רשימת המתנה',            metric:'waitlist', value:function(k){ return k.waitlist_since; }, total:function(k){ return k.waitlist_total; } }
];
function starVal(v){ return v == null ? '—' : Number(v).toFixed(2); }

function renderKpis(){
  if(S.confirmOpen) return;                                  /* לא דורסים חלונית אישור פתוחה */
  var k = S.data.kpi, resets = S.data.resets || {}, host = $('kpis'); clear(host);
  KPIS.forEach(function(def){
    var v = def.value(k), rs = def.metric ? resets[def.metric] : null;
    var valNode = el('div', { class:'kpi-value' }, [ def.star ? starVal(v) : fmt(v) ]);
    if(def.star) valNode.appendChild(el('small', { text:'★ מתוך 5' }));
    var tile = el('div', { class:'kpi', 'data-id':def.id }, [ el('div', { class:'kpi-label', text:def.label }), valNode ]);
    var sub = el('div', { class:'kpi-sub' });
    (def.sub ? def.sub(k) : []).forEach(function(p, i){ if(i) sub.appendChild(document.createTextNode(' · ')); sub.appendChild(document.createTextNode(p[0] + ' ')); sub.appendChild(el('b', { text:p[1] })); });
    if(rs && def.total){ if(sub.childNodes.length) sub.appendChild(document.createTextNode(' · ')); sub.appendChild(document.createTextNode('סה"כ מאז ומעולם ')); sub.appendChild(el('b', { text: def.totalStar ? starVal(def.total(k)) : fmt(def.total(k)) })); }
    tile.appendChild(sub);
    if(def.metric){
      if(rs){
        var since = el('div', { class:'kpi-since' }, [ 'נספר מאז ' + when(rs.reset_at) + ' · ' ]);
        since.appendChild(el('button', { type:'button', class:'kpi-reset', style:'position:static;min-height:24px;padding:1px 8px', text:'ביטול האיפוס', on:{ click:function(){ doReset(def.metric, true); } } }));
        tile.appendChild(since);
      }
      tile.appendChild(el('button', { type:'button', class:'kpi-reset', 'aria-label':'איפוס הספירה של ' + def.label, text:'↺ איפוס', on:{ click:function(){ askReset(tile, def); } } }));
    }
    var key = def.id, before = S.prev && S.prevVals ? S.prevVals[key] : undefined;
    if(before !== undefined && before !== v) tile.classList.add('flash');
    host.appendChild(tile);
  });
  S.prevVals = {}; KPIS.forEach(function(def){ S.prevVals[def.id] = def.value(k); });
}
function askReset(tile, def){
  S.confirmOpen = true;
  var box = el('div', { class:'confirm', role:'alertdialog', 'aria-label':'אישור איפוס' }, [
    el('p', { text:'לאפס את הספירה של “' + def.label + '”? הנתונים עצמם לא נמחקים — רק נקודת ההתחלה של הספירה משתנה, ואפשר לבטל.' }) ]);
  var row = el('div');
  var yes = el('button', { type:'button', class:'btn primary small', text:'איפוס', on:{ click:function(){ S.confirmOpen = false; doReset(def.metric, false); } } });
  var no  = el('button', { type:'button', class:'btn ghost small',   text:'ביטול', on:{ click:function(){ S.confirmOpen = false; box.remove(); renderKpis(); } } });
  row.appendChild(yes); row.appendChild(no); box.appendChild(row); tile.appendChild(box); yes.focus();
  box.addEventListener('keydown', function(e){ if(e.key === 'Escape'){ no.click(); } });
}
async function doReset(metric, clearIt){
  var r = await sb.rpc('admin_reset_counter', { p_metric:metric, p_clear:!!clearIt });
  if(r.error){ toast('האיפוס לא בוצע'); return; }
  toast(clearIt ? 'האיפוס בוטל — מוצג הכול' : 'הספירה אופסה');
  S.confirmOpen = false; refresh(false);
}

/* ============================================================
   גרפים — שלושה גרפים קטנים, ציר אחד לכל מדד (בלי ציר כפול)
   ============================================================ */
var MEASURES = [ { key:'visits', title:'כניסות ביום' }, { key:'analyses', title:'ניתוחי שירים ביום' }, { key:'signups', title:'הרשמות ביום' } ];
function niceMax(m){ if(m <= 4) return 4; var p = Math.pow(10, Math.floor(Math.log10(m))), f = m / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }

function renderCharts(){
  var days = (S.data.daily || []).slice(-S.range), host = $('charts'); clear(host);
  MEASURES.forEach(function(ms){ host.appendChild(chart(ms, days)); });
  renderDailyTable(days);
}
function chart(ms, days){
  var W = 360, H = 176, L = 30, R = 8, T = 18, B = 22, pw = W - L - R, ph = H - T - B;
  var vals = days.map(function(d){ return +d[ms.key] || 0; }), sum = vals.reduce(function(a, b){ return a + b; }, 0);
  var max = Math.max.apply(null, vals.concat([0])), top = niceMax(max), n = days.length || 1, slot = pw / n, bw = Math.max(2, Math.min(24, slot - 2));
  var maxI = vals.indexOf(max);
  var fig = el('figure', { class:'card chart' }, [ el('figcaption', null, [ el('b', { text:ms.title }), el('span', { text:'סה"כ בטווח: ' + fmt(sum) }) ]) ]);
  var svg = sv('svg', { viewBox:'0 0 ' + W + ' ' + H, role:'img', direction:'ltr',
    'aria-label': ms.title + ': סה"כ ' + fmt(sum) + ' ב-' + n + ' הימים האחרונים' + (max > 0 ? ', שיא של ' + fmt(max) + ' ב-' + dfDay.format(dayDate(days[maxI].day)) : '') + '. הטבלה המלאה זמינה בכפתור “הצגה כטבלה”.' });
  [0, 0.5, 1].forEach(function(f){ var y = T + ph - ph * f;
    svg.appendChild(sv('line', { class:'gridline', x1:L, x2:W - R, y1:y, y2:y }));
    svg.appendChild(sv('text', { class:'axis', x:L - 6, y:y + 4, 'text-anchor':'end' }, fmt(top * f))); });
  days.forEach(function(d, i){
    var v = vals[i], x = L + i * slot + (slot - bw) / 2, h = top ? ph * v / top : 0, y = T + ph - h, r = Math.min(4, bw / 2, h);
    var hit = sv('rect', { class:'slot', x:L + i * slot, y:T, width:slot, height:ph });
    var bar = sv('path', { class:'bar', d: h <= 0 ? '' : 'M' + x + ',' + (T + ph) + ' V' + (y + r) + ' Q' + x + ',' + y + ' ' + (x + r) + ',' + y + ' H' + (x + bw - r) + ' Q' + (x + bw) + ',' + y + ' ' + (x + bw) + ',' + (y + r) + ' V' + (T + ph) + ' Z' });
    hit.addEventListener('pointerenter', function(e){ bar.classList.add('hot'); showTip(e, fmt(v), ms.title + ' · ' + dfLong.format(dayDate(d.day))); });
    hit.addEventListener('pointermove', moveTip);
    hit.addEventListener('pointerleave', function(){ bar.classList.remove('hot'); hideTip(); });
    svg.appendChild(hit); svg.appendChild(bar);
    /* תיוג סלקטיבי: רק היום האחרון והשיא — לא מספר על כל עמודה */
    if(v > 0 && (i === n - 1 || i === maxI)) svg.appendChild(sv('text', { class:'val', x:x + bw / 2, y:y - 4, 'text-anchor':'middle' }, fmt(v)));
  });
  [0, Math.floor((n - 1) / 2), n - 1].filter(function(v, i, a){ return a.indexOf(v) === i; }).forEach(function(i){
    svg.appendChild(sv('text', { class:'axis', x:L + i * slot + slot / 2, y:H - 6, 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }, dfDay.format(dayDate(days[i].day)))); });
  fig.appendChild(svg);
  if(max === 0) fig.appendChild(el('p', { class:'muted', style:'margin:4px 0 0;text-align:center', text:'אין עדיין נתונים בטווח הזה' }));
  return fig;
}
function showTip(e, value, label){ var t = $('tip'); clear(t); t.appendChild(el('b', { text:value })); t.appendChild(document.createTextNode(label)); t.hidden = false; moveTip(e); }
function moveTip(e){ var t = $('tip'); if(t.hidden) return; var w = t.offsetWidth, h = t.offsetHeight; t.style.left = Math.max(8, Math.min(innerWidth - w - 8, e.clientX - w / 2)) + 'px'; t.style.top = Math.max(8, e.clientY - h - 14) + 'px'; }
function hideTip(){ $('tip').hidden = true; }

function renderDailyTable(days){
  var t = $('dailyTable'); clear(t);
  t.appendChild(el('thead', null, [ el('tr', null, ['תאריך', 'כניסות', 'ניתוחים', 'הרשמות', 'תגובות'].map(function(h, i){ return el('th', { class: i ? 'num' : '', scope:'col', text:h }); })) ]));
  var tb = el('tbody');
  days.slice().reverse().forEach(function(d){ tb.appendChild(el('tr', null, [ el('td', { text:dfLong.format(dayDate(d.day)) }),
    el('td', { class:'num', text:fmt(d.visits) }), el('td', { class:'num', text:fmt(d.analyses) }), el('td', { class:'num', text:fmt(d.signups) }), el('td', { class:'num', text:fmt(d.comments) }) ])); });
  t.appendChild(tb);
}

/* ---------- פילוחים: עמודות אופקיות בגוון אחד (קטגוריות נומינליות — לא צובעים לפי ערך) ---------- */
var PROVIDER = { google:'Google', discord:'Discord', email:'קוד במייל' };
function hbars(hostId, items){
  var host = $(hostId).querySelector('.hbars'); clear(host);
  var max = Math.max.apply(null, items.map(function(i){ return i.n; }).concat([0]));
  if(!max){ host.appendChild(el('p', { class:'none', text:'אין עדיין נתונים' })); return; }
  items.forEach(function(i){ var fill = el('span', { class:'fill' }); fill.style.width = (100 * i.n / max) + '%';
    host.appendChild(el('div', { class:'hbar' }, [ el('span', { class:'name', text:i.name, title:i.name }), el('span', { class:'track' }, [fill]), el('span', { class:'n', text:fmt(i.n) }) ])); });
}
function renderBreaks(){
  var d = S.data;
  hbars('brRatings',  (d.ratings || []).map(function(r){ return { name:r.stars + ' ★', n:r.n }; }));
  hbars('brKeys',     (d.keys || []).map(function(r){ return { name:r.key, n:r.n }; }));
  hbars('brProviders',(d.providers || []).map(function(r){ return { name:PROVIDER[r.provider] || r.provider, n:r.n }; }));
}

/* ============================================================
   רשימות: תגובות / משתמשים / שירים / רשימת המתנה
   ============================================================ */
function stars(n){ var s = el('span', { class:'stars', 'aria-label': n ? n + ' כוכבים מתוך 5' : 'בלי דירוג' }); if(!n){ s.textContent = '—'; return s; }
  for(var i = 1; i <= 5; i++) s.appendChild(el('span', { class: i <= n ? '' : 'off', 'aria-hidden':'true', text:'★' })); return s; }
function person(r){ var td = el('td'); td.appendChild(document.createTextNode(r.name || '—')); td.appendChild(el('span', { class:'sub', text:r.email || '' })); return td; }
var SOURCE = { footer:'תחתית האתר', after_analysis:'אחרי ניתוח' };

var TABLES = {
  comments: { empty:'עדיין אין תגובות.', cols:[
    ['תאריך',  function(r){ return el('td', { class:'ltr', text:when(r.created_at) }); }, function(r){ return when(r.created_at); }],
    ['דירוג',  function(r){ return el('td', null, [stars(r.rating)]); },                  function(r){ return r.rating || ''; }],
    ['תגובה',  function(r){ return el('td', { class:'msg', text:r.message || '' }); },     function(r){ return r.message || ''; }],
    ['משתמש',  person,                                                                     function(r){ return (r.name || '') + ' <' + (r.email || '') + '>'; }],
    ['מקור',   function(r){ return el('td', null, [el('span', { class:'tag', text:SOURCE[r.source] || r.source || '—' })]); }, function(r){ return SOURCE[r.source] || r.source || ''; }],
    ['שפה',    function(r){ return el('td', { text:r.lang === 'en' ? 'אנגלית' : r.lang === 'he' ? 'עברית' : (r.lang || '—') }); }, function(r){ return r.lang || ''; }] ] },
  users: { empty:'עדיין אין משתמשים.', cols:[
    ['משתמש',        person,                                                                function(r){ return r.name || ''; }],
    ['התחברות',      function(r){ return el('td', null, [el('span', { class:'tag', text:PROVIDER[r.provider] || r.provider || '—' })]); }, function(r){ return r.provider || ''; }],
    ['הצטרף',        function(r){ return el('td', { class:'ltr', text:when(r.created_at) }); },      function(r){ return when(r.created_at); }],
    ['כניסה אחרונה', function(r){ return el('td', { class:'ltr', text:when(r.last_sign_in_at) }); }, function(r){ return when(r.last_sign_in_at); }],
    ['שירים',        function(r){ return el('td', { class:'num', text:fmt(r.songs) + ' (' + fmt(r.saved) + ' בספרייה)' }); }, function(r){ return r.songs; }, 'num'],
    ['תגובות',       function(r){ return el('td', { class:'num', text:fmt(r.comments) }); },          function(r){ return r.comments; }, 'num'],
    ['קרדיטים',      function(r){ return el('td', { class:'num', text:fmt(r.credits) }); },           function(r){ return r.credits == null ? '' : r.credits; }, 'num'] ],
    csvExtra:[['מייל', function(r){ return r.email || ''; }]] },
  songs: { empty:'עדיין לא נותחו שירים.', cols:[
    ['תאריך',   function(r){ return el('td', { class:'ltr', text:when(r.created_at) }); }, function(r){ return when(r.created_at); }],
    ['שם השיר', function(r){ return el('td', { class:'msg', text:r.title || 'ללא שם' }); }, function(r){ return r.title || ''; }],
    ['סולם',    function(r){ return el('td', { class:'ltr', text:r.key_name || '—' }); },   function(r){ return r.key_name || ''; }],
    ['BPM',     function(r){ return el('td', { class:'num', text:r.bpm == null ? '—' : fmt(Math.round(r.bpm)) }); }, function(r){ return r.bpm == null ? '' : Math.round(r.bpm); }, 'num'],
    ['תיבות',   function(r){ return el('td', { class:'num', text:fmt(r.bars) }); },         function(r){ return r.bars == null ? '' : r.bars; }, 'num'],
    ['אורך',    function(r){ return el('td', { class:'num', text:dur(r.duration) }); },     function(r){ return dur(r.duration); }, 'num'],
    ['מצב',     function(r){ return el('td', null, [el('span', { class:'tag' + (r.saved ? ' on' : ''), text:r.saved ? 'בספרייה' : 'היסטוריה' })]); }, function(r){ return r.saved ? 'ספרייה' : 'היסטוריה'; }],
    ['משתמש',   function(r){ return el('td', { class:'ltr', text:r.email || '—' }); },     function(r){ return r.email || ''; }] ] },
  waitlist: { empty:'רשימת ההמתנה ריקה.', cols:[
    ['תאריך', function(r){ return el('td', { class:'ltr', text:when(r.created_at) }); }, function(r){ return when(r.created_at); }],
    ['מייל',  function(r){ return el('td', { class:'ltr', text:r.email || '' }); },      function(r){ return r.email || ''; }],
    ['חבילה', function(r){ return el('td', { text:r.plan || '—' }); },                    function(r){ return r.plan || ''; }] ] }
};

function renderTabCounts(){ var k = S.data.kpi;
  $('cnt-comments').textContent = fmt(k.comments_total); $('cnt-users').textContent = fmt(k.users_total);
  $('cnt-songs').textContent = fmt(k.songs_in_db); $('cnt-waitlist').textContent = fmt(k.waitlist_total); }

var listSeq = 0;
async function loadList(reset){
  var seq = ++listSeq, tab = S.tab, offset = reset ? 0 : S.rows.length;
  $('listTable').classList.add('stale');
  var r = await sb.rpc('admin_list', { p_kind:tab, p_q:S.q || null, p_limit:PAGE, p_offset:offset });
  if(seq !== listSeq) return;                                  /* הגיעה תשובה ישנה אחרי שהחליפו לשונית/חיפוש */
  $('listTable').classList.remove('stale');
  if(r.error){ toast('טעינת הרשימה נכשלה'); return; }
  var rows = (r.data && r.data.rows) || []; S.total = (r.data && r.data.total) || 0;
  var fresh = {};
  if(tab === 'comments'){ var seen = S.seen.comments; if(seen) rows.forEach(function(x){ if(!seen[x.id]) fresh[x.id] = true; });
    S.seen.comments = S.seen.comments || {}; rows.forEach(function(x){ S.seen.comments[x.id] = true; }); }
  S.rows = reset ? rows : S.rows.concat(rows);
  S.lastPageFull = rows.length === PAGE;
  renderList(fresh);
}
function visibleRows(){
  if(S.tab !== 'comments' || !S.rate) return S.rows;
  return S.rows.filter(function(r){ return S.rate === 'none' ? !r.rating : String(r.rating) === S.rate; });
}
function renderList(fresh){
  var def = TABLES[S.tab], t = $('listTable'), rows = visibleRows(); clear(t);
  $('rateFilter').hidden = S.tab !== 'comments';
  t.appendChild(el('thead', null, [ el('tr', null, def.cols.map(function(c){ return el('th', { scope:'col', class:c[3] || '', text:c[0] }); })) ]));
  var tb = el('tbody');
  rows.forEach(function(r){ var tr = el('tr', fresh && fresh[r.id] ? { class:'new' } : null, def.cols.map(function(c){ return c[1](r); })); tb.appendChild(tr); });
  t.appendChild(tb);
  var emp = $('listEmpty'); emp.hidden = rows.length > 0; emp.textContent = S.q || S.rate ? 'אין תוצאות שמתאימות לחיפוש.' : def.empty;
  $('listCount').textContent = rows.length ? 'מציג ' + fmt(rows.length) + (S.q ? '' : ' מתוך ' + fmt(S.total)) : '';
  $('moreBtn').hidden = !S.lastPageFull;
  $('csvBtn').disabled = !rows.length;
}
function setTab(tab, focus){
  S.tab = tab; S.rows = []; S.q = ''; S.rate = ''; $('q').value = ''; $('rateFilter').value = '';
  document.querySelectorAll('#tabs [role=tab]').forEach(function(b){ var on = b.dataset.tab === tab; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; if(on && focus) b.focus(); });
  $('panel').setAttribute('aria-labelledby', 'tab-' + tab);
  clear($('listTable')); loadList(true);
}

/* ---------- ייצוא CSV (של מה שמוצג; עם BOM לעברית ב-Excel, ועם נטרול נוסחאות) ---------- */
function csvCell(v){ v = v == null ? '' : String(v); if(/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }
function exportCsv(){
  var def = TABLES[S.tab], cols = def.cols.concat(def.csvExtra || []), rows = visibleRows();
  var lines = [cols.map(function(c){ return csvCell(c[0]); }).join(',')];
  rows.forEach(function(r){ lines.push(cols.map(function(c){ return csvCell((c[2] || c[1])(r)); }).join(',')); });
  var blob = new Blob(['﻿' + lines.join('\r\n')], { type:'text/csv;charset=utf-8' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'chordix-' + S.tab + '-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
}

/* ============================================================
   חיווט
   ============================================================ */
function wire(){
  $('refreshBtn').addEventListener('click', function(){ refresh(true); });
  $('logoutBtn').addEventListener('click', async function(){ stopLive(); try{ await sb.auth.signOut(); }catch(e){} check(); });
  $('gateSwitch').addEventListener('click', async function(){ try{ await sb.auth.signOut(); }catch(e){} check(); });
  $('gateGoogle').addEventListener('click', function(){ sb.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: location.origin + '/admin' } }); });
  var tb = $('themeBtn'), setT = function(){ var dark = root.getAttribute('data-theme') === 'dark'; tb.textContent = dark ? 'מצב בהיר' : 'מצב כהה'; tb.setAttribute('aria-pressed', dark ? 'true' : 'false'); };
  tb.addEventListener('click', function(){ var dark = root.getAttribute('data-theme') === 'dark'; if(dark) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', 'dark');
    try{ localStorage.setItem('cx_theme', dark ? 'light' : 'dark'); }catch(e){} setT(); }); setT();
  $('rangeSeg').addEventListener('click', function(e){ var b = e.target.closest('button[data-range]'); if(!b) return; S.range = +b.dataset.range;
    this.querySelectorAll('button').forEach(function(x){ x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    document.querySelector('.sec-head h2').textContent = S.range + ' הימים האחרונים'; if(S.data) renderCharts(); });
  $('tableToggle').addEventListener('click', function(){ var w = $('dailyTableWrap'), show = w.hidden; w.hidden = !show; this.setAttribute('aria-pressed', show ? 'true' : 'false'); this.textContent = show ? 'הסתרת הטבלה' : 'הצגה כטבלה'; });
  var tabs = $('tabs');
  tabs.addEventListener('click', function(e){ var b = e.target.closest('[role=tab]'); if(b && b.dataset.tab !== S.tab) setTab(b.dataset.tab, false); });
  tabs.addEventListener('keydown', function(e){ if(e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    var list = [].slice.call(tabs.querySelectorAll('[role=tab]')), i = list.findIndex(function(b){ return b.dataset.tab === S.tab; });
    var step = (e.key === 'ArrowLeft') === (root.dir === 'rtl') ? 1 : -1;
    i = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (i + step + list.length) % list.length; e.preventDefault(); setTab(list[i].dataset.tab, true); });
  var qt = null; $('q').addEventListener('input', function(){ var v = this.value.trim(); clearTimeout(qt); qt = setTimeout(function(){ S.q = v; loadList(true); }, 350); });
  $('rateFilter').addEventListener('change', function(){ S.rate = this.value; renderList(); });
  $('moreBtn').addEventListener('click', function(){ loadList(false); });
  $('csvBtn').addEventListener('click', exportCsv);
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ wire(); boot(); }); else { wire(); boot(); }
})();
