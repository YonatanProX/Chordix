/* ============================================================
   Chordix — עדכון מילון האנגלית (CX_I18N_DICT.en)
   ------------------------------------------------------------
   מעדכן תרגומים מיושנים ומוסיף מפתחות חדשים בבטחה: מפרסר את ה-JSON
   של המילון, ממזג overrides, ומחזיר JSON תקין. לא עריכה ידנית של
   השורה הענקית. הרצה חד-פעמית:  node build/i18n-update.mjs
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'index.html');

/* תיקוני אנגלית למחרוזות ששונו בעברית (data-i18n → en.html) */
const HTML = {
  'main.4': 'File never leaves your device',
  'main.5': 'Results in seconds',
  'main.6': 'Ready to print and export',
  'main.7': 'Completely free',
  'how.p.1': 'MP3, WAV, M4A, OGG or FLAC, up to 10 minutes.',
  'how.p.3': 'Bars with barlines, split into the full structure — ready to print or save as PDF.',
  'main.24': 'Live chord tracking',
  'main.25': 'Chords laid out on a running timeline, so you can play along with the song without a structure sheet.',
  'main.38': '<b id="instH">Install as an app</b> — install the site as an app and open it straight from your desktop.',
  'main.43': "Chord websites only cover what someone bothered to upload, and many songs — especially Israeli ones — simply aren't there: new songs, independent artists, live performances, covers and rehearsal recordings. Chordix doesn't search a database; it listens to the recording itself, so any recording you have is a song you can play. What comes out is a real chord sheet — bars between barlines, split into verses, choruses and a C-part, with key, tempo and a capo suggestion.",
  'main.45': "No. All the processing runs in your browser, on your device's processor. The audio file never leaves your computer and nobody but you ever hears it. Your device does the work.",
  'main.47': '<span class="stat-chip"><span class="stat-num">87%</span> chord recognition accuracy</span><br>That is the average measured on our test set; in practice the result depends on the recording. Clear guitar or piano with a steady tempo comes out well above the average; dense mixes, unaccompanied singing, free tempo or noisy recordings come out below it. Every bar the model is less certain about is marked with a dashed underline — worth checking by ear — and the tool is completely free. MP3, WAV, M4A, OGG and FLAC are supported, up to ten minutes per song.',
  'main.57': "Chordix produces a harmonic analysis of a recording you already have, and neither distributes nor stores that recording. Use of the chord sheet in relation to protected works — including distribution, commercial printing or uploading to the internet — is the user's responsibility alone and subject to applicable law. Use only a recording you have the rights to.",
  'authOut.p.1': 'Sign in with Google, Discord, or an email code, no password to remember.',
  'authOut.p.2': 'From the account you choose we receive <b>your name, email address and profile picture</b> only. We have no access to your password, your inbox or anything else in your account.',
  'helpWindow.div.1': "<b>🎧 Upload:</b> drag an audio file onto the dashed rectangle or click it to choose a file. The file stays on your device — the analysis runs in your browser.<br><br> <b>⏱️ Results:</b> after the analysis you'll see the key, tempo, bar count and length, and above them a colourful structure map. Click a section on the map to jump to that point in the song.<br><br> <b>🎼 Two views:</b> “Timeline” shows the chords by their timing in the recording, and “Chord sheet” shows an ordered, print-ready page of bars.<br><br> <b> Corrections:</b> click a cell on the sheet to change its chords, click a bar number to start a new section there, and “merge with previous” removes an unneeded split.<br><br> <b>🎼 Chords not quite right?</b> Open “Live chord tracking”: shift the bar start, change the tempo (or ÷2 / ×2), and if <b>every</b> chord is wrong by a semitone — the recording isn't tuned to A=440, so change the “recording tuning” and press “Re-tune”.<br><br> <b>🎚️ Transposition:</b> the − and + buttons move the whole sheet to a different key, and the menu next to them chooses sharps or flats.<br><br> <b>🖨️ Saving:</b> “Print / Save as PDF” prints just the chord sheet, with no interface. “Copy sheet as text” copies a text version to the clipboard.<br><br> <b>⌨️ Keyboard:</b> every button is reachable with Tab and activated with Enter or Space. Accessibility settings can highlight the focus outline.",
  'foot.5': '<a data-route href="/how">How it works</a>',
  'foot.6': '<a data-route href="/features">Features</a>',
  'foot.8': '<a data-route href="/">Sample output</a>',
  'foot.9': '<a data-route href="/faq">FAQ</a>',
  /* אלמנטים חדשים (Discord + אימייל) — נוסף להם data-i18n ב-HTML */
  'discordBtn.span.1': 'Sign in with Discord',
  'emailAuth.or': 'or with email',
  'emailAuth.send': 'Email me a code',
  'emailAuth.sentNote': 'We sent a code to <b id="emailSentTo"></b>. Enter it here:',
  'emailAuth.verify': 'Verify and sign in',
  'emailAuth.back': 'Use a different email',
  /* עדכון 2026-09-15: טקסט-הירו, הסרת שם/טלפון, שאלות-FAQ חדשות */
  'main.2': '<span class="hero-brand">Chordix</span> <span class="hero-claim">A chord sheet from any recording</span>',
  'main.3': "Upload an audio file and get a real chord sheet: key, tempo, time signature, full chords, structure and bars. No song database — Chordix analyses the recording itself. <b>It's an analysis tool, not a song database.</b>",
  'foot.2': 'Operated by <b>Chordix</b>',
  'foot.3': '<a href="mailto:chordix.business@gmail.com">chordix.business@gmail.com</a>',
  'foot.12': '© <span id="footYear">2026</span> <span class="fill">Chordix</span> · <a href="mailto:chordix.business@gmail.com">chordix.business@gmail.com</a>',
  'a11yWindow.p.2': "Run into an accessibility problem? Write to us and we'll deal with it:<br> <a href=\"mailto:chordix.business@gmail.com\">chordix.business@gmail.com</a>",
  'faqFree.q': 'Is the service free?',
  'faqFree.a': 'Yes — the analysis is completely free, with no subscription and no limit on how many songs. Corrections, tuning, transposition, printing and export are all included.',
  'foot.discord': "Our musicians' community on Discord",
  'foot.youtube': 'Our YouTube channel',
  'headNav.library': 'My song library',
  'historyModal.h2.1': 'My song library',
  'acctMenu.button.1': 'My song library',
  'result.button.saveLib': 'Save to library',
  'historyFoot.button.1': 'Clear the whole library',
  'historyFoot.span.1': 'Clear the whole library? This cannot be undone.',
  'library.title': 'My song library',
  'library.hint': 'Click a song to open and edit · right-click a song to delete',
  'libCtx.del': 'Delete song',
  'faqWho.q': 'Who is it useful for?',
  'faqWho.a': 'Whether you play alone at home or with a band, Chordix is for you. If you play on your own, you can pull the chords and details out of songs you love and play them yourself. If you play in a band, you can produce a chord sheet split into structure and bars for each player, so everyone stays in sync on the order and the chords.',
};

/* תרגומי placeholder / aria (data-i18n-attr → en.attr) */
const ATTR = {
  'emailAuth.emailPh': 'Email address',
  'emailAuth.otpPh': '6-digit code',
};

/* מחרוזות דינמיות דרך cxT (en.js, ממופתח לפי המחרוזת העברית) */
const JS = {
  'שלום, {0}': 'Hi, {0}',
  'מעביר ל-Discord…': 'Redirecting to Discord…',
  'שולח קוד…': 'Sending a code…',
  'מאמת…': 'Verifying…',
  'הזינו כתובת אימייל תקינה.': 'Enter a valid email address.',
  'הזינו את הקוד שקיבלתם באימייל.': 'Enter the code you received by email.',
  'שליחת הקוד נכשלה': "Couldn't send the code",
  'הקוד שגוי או שפג תוקפו': 'The code is wrong or has expired',
  'ההתחברות עם Discord נכשלה': 'Sign-in with Discord failed',
  'השיר נשמר בספרייה': 'Saved to your library',
  'השמירה נכשלה: {0}': 'Save failed: {0}',
  'קודם צריך לנתח שיר': 'Analyze a song first',
  'התחברו כדי לראות את ספריית השירים שלכם.': 'Log in to see your song library.',
  'כניסה': 'Log in',
  '<p class="hist-empty">הספרייה ריקה. נתחו שיר ולחצו שמירה בספרייה כדי לשמור אותו כאן.</p>': '<p class="hist-empty">Your library is empty. Analyze a song and tap Save to library to keep it here.</p>',
  '🎵 ניתוח לשיר עד 10 דקות': '🎵 A chord sheet for a song up to 10 minutes',
  'ניתוח לשיר עד 10 דקות': 'A chord sheet for a song up to 10 minutes',
  '🎵 ניתוח חינמי · דיוק מוגבר · עד 10 דקות לשיר': '🎵 Free analysis · higher accuracy · up to 10 minutes per song',
};

const src = fs.readFileSync(FILE, 'utf8');
const lines = src.split('\n');
const li = lines.findIndex(l => l.includes('window.CX_I18N_DICT'));
if (li < 0) { console.error('לא נמצאה שורת CX_I18N_DICT'); process.exit(1); }
const line = lines[li];
const start = line.indexOf('{');
const end = line.lastIndexOf('}');
const obj = JSON.parse(line.slice(start, end + 1));
obj.en = obj.en || {};
obj.en.html = obj.en.html || {};
obj.en.attr = obj.en.attr || {};
obj.en.js = obj.en.js || {};

let changed = 0, added = 0;
for (const [k, v] of Object.entries(HTML)) { if (obj.en.html[k] !== v) { (k in obj.en.html ? changed++ : added++); obj.en.html[k] = v; } }
for (const [k, v] of Object.entries(ATTR)) { if (obj.en.attr[k] !== v) { (k in obj.en.attr ? changed++ : added++); obj.en.attr[k] = v; } }
for (const [k, v] of Object.entries(JS)) { if (obj.en.js[k] !== v) { (k in obj.en.js ? changed++ : added++); obj.en.js[k] = v; } }

lines[li] = line.slice(0, start) + JSON.stringify(obj) + line.slice(end + 1);
fs.writeFileSync(FILE, lines.join('\n'), 'utf8');
console.log(`[i18n] עודכן: ${changed} תוקנו, ${added} נוספו. סה"כ en.html=${Object.keys(obj.en.html).length}, en.js=${Object.keys(obj.en.js).length}`);
