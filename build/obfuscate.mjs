/* ============================================================
   Chordix — build step: obfuscate app logic into dist/
   ------------------------------------------------------------
   המקור index.html נשאר קריא (עורכים אותו). כאן מייצרים
   dist/index.html שבו בלוקי-הלוגיקה שלנו מוחלפים בקובץ חיצוני
   מעורפל app.<hash>.js. דאטה (i18n/icons/ld+json), bootstrap
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

/* קבצים/תיקיות שלא מועתקים ל-dist (לא נכסי-שירות) */
const COPY_SKIP = new Set([
  'dist', 'build', 'node_modules', '.git',
  'package.json', 'package-lock.json', 'index.html',
]);

/* בלוק-script יוחרג מהערפול אם הוא נתונים/‏bootstrap-מוקדם/vendor.
   הזיהוי לפי מארקרים בתוכן — כל שינוי מבני צריך לעדכן כאן. */
function shouldObfuscate(attrs, code) {
  if (/\bsrc\s*=/.test(attrs)) return false;                    // חיצוני (vendor)
  if (/\btype\s*=/.test(attrs) && !/text\/javascript/i.test(attrs)) return false; // ld+json וכו'
  if (/\bid\s*=\s*["']iconData["']/.test(attrs)) return false;  // נתוני אייקונים
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
    // מחרוזות: קידוד + פיצול
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    splitStrings: true,
    splitStringsChunkLength: 8,
    numbersToExpressions: true,
    simplify: true,
    unicodeEscapeSequence: false,
    // מכובה במכוון (עוצמה בינונית — לא לפגוע בטעינה/לולאות DSP)
    controlFlowFlattening: false,
    deadCodeInjection: false,
    selfDefending: false,
    debugProtection: false,
    disableConsoleOutput: false,
    // אסור eval/Function (ה-CSP מתיר wasm-unsafe-eval בלבד)
  };
}

function copyRecursive(srcDir, dstDir, rel = '') {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (rel === '' && COPY_SKIP.has(entry.name)) continue;
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

  // בדיקת-תקינות תחבירית של הפלט (אם נכשל — זורק, ה-build נעצר)
  new Function(obfCode); // parse-only; זורק על שגיאת-תחביר
  console.log('[obfuscate] בדיקת-תחביר עברה ✔');

  // שם-קובץ עם hash של התוכן
  const hash = crypto.createHash('sha256').update(obfCode).digest('hex').slice(0, 8);
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
  fs.writeFileSync(path.join(DIST, appName), obfCode, 'utf8');
  fs.writeFileSync(path.join(DIST, 'index.html'), outHtml, 'utf8');

  console.log(`\n[obfuscate] נכתב dist/  (index.html + ${appName})`);
  console.log('[obfuscate] הושלם ✔\n');
}

main();
