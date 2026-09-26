/* ============================================================
   Chordix — build step: obfuscate app logic into dist/
   ------------------------------------------------------------
   המקור index.html נשאר קריא (עורכים אותו). כאן מייצרים
   dist/index.html שבו בלוקי-הלוגיקה שלנו מוחלפים בקובץ חיצוני
   מעורפל app.<hash>.js. דאטה (i18n/ld+json), bootstrap
   מוקדם, ו-vendor/ — לא נגעים. ראה תוכנית starry-tickling-teapot.
   הרצה:  npm run build     (Cloudflare Pages: build command)
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import JavaScriptObfuscator from 'javascript-obfuscator';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');          // Chordix/
const SRC_HTML = path.join(ROOT, 'index.html');
const DIST = path.join(ROOT, 'dist');

/* build ניפוי מקומי:  OBF_DEBUG=1 npm run build
   מכבה selfDefending / disableConsoleOutput / הבאנר, כדי שאפשר לפתוח console
   ולנפות באגים ב-dist. אף פעם לא לפרוס build כזה. */
const DEBUG_BUILD = process.env.OBF_DEBUG === '1';

/* נעילת-דומיין: לא משתמשים ב-domainLock של javascript-obfuscator — הוא הוכח כלא-אמין
   בתוך ה-bundle המלא (עובד בקטע מבודד, לא נכנס לפעולה עם selfDefending+renameGlobals+
   אפשרויות-המחרוזות המלאות; לא ניתן לאמת → לא בטוח לפרוס על לקוחות משלמים).
   במקומו יש שומר-דומיין קטן ומפורש בראש בלוק-הלוגיקה ב-index.html (מתערפל כאן עם השאר):
   הוא מפנה כל דומיין שאינו שלנו חזרה ל-chordix.pages.dev. הרשימה המותרת נמצאת שם. */

/* קבצים/תיקיות שלא מועתקים ל-dist (לא נכסי-שירות) */
const COPY_SKIP = new Set([
  'dist', 'build', 'node_modules', '.git',
  'package.json', 'package-lock.json', 'index.html',
  '.gitignore', '.node-version',
  /* מסמכים פנימיים — לא נכסי-שירות. עד 2026-09-19 הם פורסמו לכולם (כולל יומן תיקוני-הבאגים). */
  'README.md', 'README.txt', 'i18n-keys.json', 'bench.html',
  /* קוד-שרת (Pages Functions) והגדרות wrangler — Cloudflare מקמפל את functions/ מהשורש;
     עותק ב-dist היה מוגש כקובץ סטטי (כולל ה-system prompt של הבוט). */
  'functions', '.wrangler', 'wrangler.toml', 'wrangler.json', 'wrangler.jsonc',
]);
/* כל דבר שנראה כמו תיעוד/מקור/נתונים פנימיים נשאר בחוץ, גם אם יתווסף בעתיד */
const COPY_DENY = [
  /^CHANGELOG.*\.md$/i, /\.(sql|map|mjs|env|log)$/i, /^\.env/i,
  /^\.dev\.vars/i,   /* סודות מקומיים של wrangler pages dev */
  /* עותקי-גיבוי של ה-HTML בשורש (index.<משהו>.html) — מקור קריא ולא-מעורפל.
     index.html עצמו לא נתפס כאן (אין לו חלק-אמצעי) והוא נכתב בנפרד אחרי הערפול. */
  /^index\..+\.html$/i,
  /* כל סימון-גיבוי מוכר, בכל סיומת */
  /\.(bak|backup|orig|old|save|tmp|swp)$/i, /~$/i, /[.-](backup|bak|old|copy)\./i,
];

/* בלוק-script יוחרג מהערפול אם הוא נתונים/‏bootstrap-מוקדם/vendor.
   הזיהוי לפי מארקרים בתוכן — כל שינוי מבני צריך לעדכן כאן. */
function shouldObfuscate(attrs, code) {
  if (/\bsrc\s*=/.test(attrs)) return false;                    // חיצוני (vendor)
  if (/\btype\s*=/.test(attrs) && !/text\/javascript/i.test(attrs)) return false; // ld+json וכו'
  if (/CX_I18N_DICT\s*=/.test(code)) return false;              // מילון i18n (הבלוק הגדול)
  if (/CX_I18N_DICT\s*&&\s*window\.CX_I18N_DICT\.en/.test(code)) return false; // תוספות-תרגום
  // bootstrap ערכת-נושא/a11y (חייב לרוץ מוקדם, inline): הבלוק הזעיר שקורא
  // maftea-prefs וגם prefers-color-scheme. תנאי-גודל מונע דילוג על בלוקי-לוגיקה
  // גדולים שסתם משתמשים במפתח-ההעדפות.
  if (/maftea-prefs/.test(code) && /prefers-color-scheme/.test(code) && code.length < 2000) return false;
  return true;
}

/* חילוץ reservedNames: כל מזהה שנקרא ממטפל on* בקובץ (HTML סטטי,
   מחרוזות i18n, ו-template literals ב-JS — כולם בטקסט-המקור הגולמי),
   וכל window.X . over-reserve = בטוח (פחות ערפול לאותם שמות בלבד). */
function collectReservedNames(html) {
  const reserved = new Set();
  // מטפלי on* : תומך גם בגרשיים רגילים וגם במוברחים (\") שבתוך מחרוזות JS/JSON
  const handlerRe = /\bon[a-z]+\s*=\s*\\?["']([\s\S]*?)\\?["']/gi;
  let m;
  while ((m = handlerRe.exec(html)) !== null) {
    const body = m[1];
    const ids = body.match(/[A-Za-z_$][\w$]*/g) || [];
    for (const id of ids) reserved.add(id);
  }
  // window.X ו-window['X']
  const winDot = /\bwindow\.([A-Za-z_$][\w$]*)/g;
  while ((m = winDot.exec(html)) !== null) reserved.add(m[1]);
  const winIdx = /\bwindow\[\s*["']([A-Za-z_$][\w$]*)["']\s*\]/g;
  while ((m = winIdx.exec(html)) !== null) reserved.add(m[1]);
  // safelist ידני: מזהי-שפה/DOM נפוצים שאסור לגעת בהם (הם ממילא לא-מוצהרים,
  // אבל מוסיפים ליתר ביטחון) + נקודות-כניסה ידועות.
  ['window','document','navigator','location','localStorage','sessionStorage',
   'supabase','ort','Module','gtag','dataLayer','requestAnimationFrame',
   'CX_I18N_DICT','CX_ORT_URL','CX_ORT_BASE','CX_MODEL_URL'
  ].forEach(x => reserved.add(x));
  return reserved;
}

function medConfig(reservedNames) {
  return {
    target: 'browser',
    compact: true,
    // שמות משונים לפונקציות/משתנים גלובליים (מלבד reserved)
    identifierNamesGenerator: 'mangled-shuffled',
    renameGlobals: true,
    reservedNames,                         // regex-strings של שמות לשמר
    // ---- מחרוזות: קידוד, פיצול, ערבוב, והזזת-אינדקס + עטיפה בקריאות-פונקציה ----
    // כל מחרוזת עוברת למערך מוצפן; הגישה אליה דרך wrapper-ים ואינדקסים מוזזים.
    // מקשה מאוד לקרוא שמות-פונקציות/הודעות/מפתחות בקוד המעורפל. העלות היא בעיקר
    // באתחול ובקוד-ה-UI, לא בלולאות-ה-DSP (שהן מספריות וכמעט בלי מחרוזות).
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 1,               // כל המחרוזות (היה 0.75)
    stringArrayShuffle: true,
    stringArrayRotate: true,
    stringArrayIndexShift: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersType: 'function',   // wrapper-פונקציה (חזק) במקום משתנה
    stringArrayWrappersParametersMaxCount: 4,
    // stringArrayCallsTransform מכובה במכוון: הוא עוטף כל *גישה* למחרוזת בקריאת-פונקציה
    // → +100KB (gzip) ועלות-ריצה בכל גישה, כולל בלולאות. הערבוב/סיבוב/הזזת-אינדקס +
    // ה-wrappers כבר מקשים מאוד לפענח את מערך-המחרוזות סטטית. עלות/תועלת לא משתלמת כאן.
    stringArrayCallsTransform: false,
    splitStrings: true,
    splitStringsChunkLength: 8,
    numbersToExpressions: true,
    simplify: true,
    unicodeEscapeSequence: false,
    // ---- הגנות אנטי-חבלה (כולן CSP-safe: בלי eval/Function) ----
    // selfDefending: הקוד "מגן על עצמו" — אם ממפים/מייפים אותו מחדש (beautify) הוא נשבר.
    // disableConsoleOutput: מנטרל console.* בזמן ריצה → מסתיר עקבות-אלגוריתם מהיומן.
    // כולן מכובות ב-build ניפוי (OBF_DEBUG=1) כדי לאפשר בדיקה מקומית עם console פתוח.
    // (נעילת-דומיין נעשית ע"י שומר מפורש ב-index.html, לא כאן — ראו הערה למעלה.)
    selfDefending: !DEBUG_BUILD,
    disableConsoleOutput: !DEBUG_BUILD,
    // ---- מכובה במכוון: overhead ללולאות-ה-DSP או ניפוח גודל הקובץ ----
    // controlFlowFlattening / deadCodeInjection — כל אחד מהם עלול להאט את הניתוח
    // (עד ~1.5x) או להכפיל את גודל הקובץ. לא מפעילים בלי מדידה שמראה עלות זניחה.
    // debugProtection — פוגע ב-UX (מקפיא DevTools של משתמשים לגיטימיים). מושבת.
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    // אסור eval/Function (ה-CSP מתיר wasm-unsafe-eval בלבד)
  };
}

/* ---- זמני (2026-09-22) — ניקוי מטמון-קצה של Cloudflare ----------------------
   קובץ-הגיבוי index.before-login-redesign.user-backup.html פורסם בטעות עד היום.
   הסרתו מ-dist לא מנקה את מטמון-הקצה: Cloudflare ממשיך להגיש את העותק השמור
   (s-maxage=604800) עד שבוע, וב-pages.dev אין מחיקת-מטמון ידנית. פרסום *קובץ*
   באותה כתובת כן מאלץ רענון — ולכן נכתב כאן דף-דמה ריק עם no-store.
   ⚠ למחוק את הבלוק הזה (ואת הכלל ב-_headers) אחרי שמאומת שהכתובת נקייה. */
const PURGE_STUBS = [
  'index.before-login-redesign.user-backup.html',   /* עותק המקור הקריא (852KB) */
  'README.md', 'README.txt', 'i18n-keys.json',      /* מסמכים פנימיים (הוסרו 2026-09-19) */
  'CHANGELOG-תיקוני-ביקורת.md',                      /* יומן תיקוני-האבטחה */
  'CHANGELOG-משקל-קצב-וסולם.md',
];
/* גוף הדמה לפי סוג הקובץ — קטן, ריק מתוכן, בלי שום מידע */
function purgeStubBody(name) {
  if (/\.html?$/i.test(name))
    return '<!doctype html><html lang="he"><head><meta charset="utf-8">' +
           '<meta name="robots" content="noindex, nofollow, noarchive">' +
           '<meta http-equiv="refresh" content="0; url=/"><title>Chordix</title></head>' +
           '<body></body></html>';
  if (/\.json$/i.test(name)) return '{}';
  return 'Chordix — https://chordix.pages.dev/';
}

function copyRecursive(srcDir, dstDir, rel = '') {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (rel === '' && COPY_SKIP.has(entry.name)) continue;
    /* רק בשורש: תחת vendor/ יש קובצי .mjs שהם נכסי-שירות אמיתיים (onnxruntime) */
    if (rel === '' && COPY_DENY.some(re => re.test(entry.name))) continue;
    const s = path.join(srcDir, entry.name);
    const d = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyRecursive(s, d, path.join(rel, entry.name));
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function main() {
  const html = fs.readFileSync(SRC_HTML, 'utf8');

  // איתור בלוקי script עם המיקומים שלהם
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const blocks = [];
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    blocks.push({ full: m[0], attrs: m[1], code: m[2], index: m.index });
  }

  const included = [];
  console.log(`\n[obfuscate] נמצאו ${blocks.length} בלוקי <script>:`);
  for (const b of blocks) {
    const obf = shouldObfuscate(b.attrs, b.code);
    const label = obf ? 'ערפול ' : 'דילוג ';
    const why = obf ? '' : '  (data/bootstrap/vendor)';
    console.log(`  ${label} @${b.index}  attrs="${b.attrs.trim().slice(0,40)}"  ${b.code.length}b${why}`);
    if (obf) included.push(b);
  }
  if (included.length === 0) throw new Error('אף בלוק לא סווג לערפול — עצירה.');

  // reservedNames
  const reserved = collectReservedNames(html);
  const reservedArr = [...reserved].map(s => `^${s}$`); // ביטויים מדויקים
  console.log(`\n[obfuscate] reservedNames: ${reserved.size} שמות שמורים (דוגמה):`,
    [...reserved].slice(0, 12).join(', '));

  // שרשור בלוקי-הלוגיקה לפי סדר-מסמך
  const bundleSrc = included.map(b => b.code).join('\n;\n');
  console.log(`[obfuscate] bundle מקור: ${bundleSrc.length}b מ-${included.length} בלוקים`);

  // ערפול
  const t0 = Date.now();
  const result = JavaScriptObfuscator.obfuscate(bundleSrc, medConfig(reservedArr));
  const obfCode = result.getObfuscatedCode();
  console.log(`[obfuscate] פלט מעורפל: ${obfCode.length}b  (${((obfCode.length/bundleSrc.length)*100).toFixed(0)}% מהמקור, ${Date.now()-t0}ms)`);

  // סימן-מים/זכויות-יוצרים: באנר קריא (לא מעורפל) בראש הקובץ — הרתעה + ראיה משפטית
  // + מזהה-build ייחודי לכל פרסום. app.js נטען כ-<script src> (לא inline) ולכן אינו
  // זקוק ל-hash ב-CSP; הבאנר לא משפיע על ה-CSP.
  const buildStamp = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
  const banner =
    `/*! Chordix — © ${new Date().getFullYear()} Chordix. כל הזכויות שמורות / All rights reserved.\n` +
    `   קוד קנייני. העתקה, הפצה, הנדסה-לאחור או חילוץ אסורים (תנאי השימוש, ס׳ 4).\n` +
    `   Proprietary code. Copying, distribution, reverse-engineering or extraction is prohibited.\n` +
    `   build:${buildStamp} */\n`;
  const finalCode = DEBUG_BUILD ? obfCode : banner + obfCode;

  // בדיקת-תקינות תחבירית של הפלט (אם נכשל — זורק, ה-build נעצר)
  new Function(finalCode); // parse-only; זורק על שגיאת-תחביר
  console.log('[obfuscate] בדיקת-תחביר עברה ✔');

  // שם-קובץ עם hash של התוכן הסופי (כולל הבאנר)
  const hash = crypto.createHash('sha256').update(finalCode).digest('hex').slice(0, 8);
  const appName = `app.${hash}.js`;

  // בניית ה-HTML לפלט: הסרת בלוקי-הלוגיקה, והזרקת <script defer src>
  // defer מבטיח ריצה אחרי הפרסור ואחרי vendor/supabase.js (שאינו defer).
  let outHtml = html;
  for (const b of included) outHtml = outHtml.replace(b.full, '');
  const tag = `\n<script defer src="/${appName}"></script>\n`;
  if (outHtml.includes('</head>')) outHtml = outHtml.replace('</head>', tag + '</head>');
  else outHtml = outHtml.replace('</body>', tag + '</body>');

  // כתיבת dist/
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  copyRecursive(ROOT, DIST);
  fs.writeFileSync(path.join(DIST, appName), finalCode, 'utf8');
  fs.writeFileSync(path.join(DIST, 'index.html'), outHtml, 'utf8');

  /* שומר-פרסום: ב-dist מותרים רק דפי-HTML שהם באמת חלק מהשירות. כל HTML אחר בשורש
     (גיבוי, עותק, טיוטה) הוא מקור קריא ולא-מעורפל — ולכן עוקף את כל הגנת-הקוד.
     עדיף להפיל את ה-build מלפרסם אותו. */
  /* דפי-דמה לניקוי-מטמון (זמני — ראו PURGE_STUBS) */
  for (const name of PURGE_STUBS) fs.writeFileSync(path.join(DIST, name), purgeStubBody(name), 'utf8');

  const ALLOWED_HTML = new Set(['index.html', 'admin.html', ...PURGE_STUBS.filter(n => /\.html?$/i.test(n))]);
  const strayHtml = fs.readdirSync(DIST, { withFileTypes: true })
    .filter(e => e.isFile() && /\.html?$/i.test(e.name) && !ALLOWED_HTML.has(e.name))
    .map(e => e.name);
  if (strayHtml.length)
    throw new Error(`פרסום: קובצי-HTML שאינם נכסי-שירות הגיעו ל-dist: ${strayHtml.join(', ')} — להוסיף ל-COPY_DENY/COPY_SKIP.`);

  /* שומר-שרת: קוד ה-Functions וקובצי-סודות מקומיים (.dev.vars*) אסור שיגיעו ל-dist,
     גם אם ישתנו כללי-ההעתקה. בודקים את כל העץ, לא רק את השורש. */
  const leaked = fs.existsSync(path.join(DIST, 'functions')) ? ['functions/'] : [];
  (function scan(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (/^\.dev\.vars/i.test(e.name)) leaked.push(r);
      if (e.isDirectory()) scan(path.join(dir, e.name), r);
    }
  })(DIST, '');
  if (leaked.length)
    throw new Error(`פרסום: קוד-שרת/סודות הגיעו ל-dist: ${leaked.join(', ')} — להוסיף ל-COPY_SKIP/COPY_DENY.`);

  /* CSP: במקום 'unsafe-inline' — hash לכל סקריפט מוטמע שנשאר ב-HTML הסופי. כך סקריפט שהוזרק
     (XSS) לא ירוץ גם אם חמק מהניטרול. סקריפטי-נתונים (ld+json וכד') לא מורצים ולא צריכים hash. */
  const inlineRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const hashes = [];
  let im;
  while ((im = inlineRe.exec(outHtml)) !== null) {
    if (/\bsrc\s*=/.test(im[1])) continue;
    const type = (/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(im[1]) || [])[1] || '';
    if (type && !/^(text\/javascript|application\/javascript|module)$/i.test(type)) continue;
    hashes.push(`'sha256-${crypto.createHash('sha256').update(im[2], 'utf8').digest('base64')}'`);
  }
  /* מטפל-אירוע מוטמע בתוך תגית (לא בתוך סקריפט/סגנון) ייחסם ע"י ה-CSP — עדיף להיכשל כאן */
  const markupOnly = outHtml.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');
  if (/<[a-z][^<>]*\son[a-z]+\s*=\s*["']/i.test(markupOnly))
    throw new Error('CSP: נמצא מטפל-אירוע מוטמע (on*=) ב-HTML — הוא ייחסם. להעביר ל-addEventListener.');
  const hdrPath = path.join(DIST, '_headers');
  let hdr = fs.readFileSync(hdrPath, 'utf8');
  /* רק בשורת הכותרת עצמה (לא בהערות של _headers) */
  const cspRe = /(Content-Security-Policy:[^\r\n]*?script-src[^;\r\n]*?)\s*'unsafe-inline'/;
  if (!cspRe.test(hdr)) throw new Error("CSP: לא נמצא 'unsafe-inline' ב-script-src של _headers להחלפה");
  hdr = hdr.replace(cspRe, (m, pre) => `${pre} ${hashes.join(' ')}`);
  fs.writeFileSync(hdrPath, hdr, 'utf8');
  console.log(`[obfuscate] CSP: 'unsafe-inline' הוחלף ב-${hashes.length} hashes`);

  /* Service Worker: גרסת-המטמון נגזרת מהפרסום עצמו */
  const swPath = path.join(DIST, 'sw.js');
  if (fs.existsSync(swPath)) {
    const build = crypto.createHash('sha256').update(outHtml).update(finalCode).digest('hex').slice(0, 10);
    fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8').replaceAll('__BUILD__', build), 'utf8');
  }

  console.log(`\n[obfuscate] נכתב dist/  (index.html + ${appName})`);
  console.log('[obfuscate] הושלם ✔\n');
}

main();
