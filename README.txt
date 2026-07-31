Chordix — deployable build
==========================
Drag this entire folder onto Netlify. All files must sit together at the site root.

לפני העלייה לאוויר
------------------
1. החליפו את הדומיין בחמישה מקומות המסומנים EDIT-DOMAIN:
     index.html   (canonical, og:url, og:image, twitter:image)
     robots.txt   (Sitemap:)
     sitemap.xml  (<loc>)
2. הריצו ב-Supabase (SQL Editor ← New query ← Run):
     supabase-credits.sql    ← חשוב: מאפשר החזר קרדיטים אוטומטי
     supabase-waitlist.sql
3. ודאו ש-chordix-model.bin באמת עלה לשרת, לצד index.html, באותה תיקייה בדיוק
   (לא בתיקיית build/ נפרדת, לא ב-CDN אחר — ליד index.html, אותו path).
   אם הוא חסר, הניתוח ייכשל ב-404 (המשתמש לא יחויב, אבל גם לא יקבל דף).
   מהגרסה הזו ואילך יש גם באנר אזהרה אוטומטי בדף עצמו אם הבדיקה נכשלת,
   כך שהבעיה תתגלה מיד ולא רק כשמישהו ינסה לנתח שיר.

   בדיקה מהירה אחרי כל פרסום — שני דברים, לא רק "200":
     curl -sI https://<הדומיין>/chordix-model.bin
   ודאו: HTTP 200 (לא 404, לא redirect ל-index.html!)
         Content-Length: 2836277   ← בדיוק. אם שונה — הקובץ נחתך/הוחלף.

   ⚠ מלכודת נפוצה בפריסה דרך git (ולא drag-and-drop):
   קובץ בגודל 2.7MB נתפס לפעמים ע"י .gitignore גורף (למשל כלל *.bin),
   או נדחה בשקט אם מוגדר Git LFS בלי שהוא מותקן בסביבת ה-build של Netlify —
   ואז ה-build "מצליח" (כי שום דבר לא תלוי בקובץ בזמן build), הזיפ שיש לכם
   מקומית כן מכיל אותו, אבל האתר החי לא. ודאו במפורש ש-chordix-model.bin
   מופיע ב-git status / git ls-files ולא ברשימת ה-ignore, ושאין לכם
   Git LFS דולק על סוג הקובץ הזה בלי Netlify LFS support.

בדיקה מקומית
------------
פתיחה בלחיצה כפולה כבר לא תטען את המודל — דפדפנים חוסמים fetch() על file://
הריצו שרת מקומי:
    npx serve .
    # או
    python3 -m http.server

קבצים
-----
index.html                      הדף
chordix-model.bin               מודל הזיהוי (gzip), נטען לפי דרישה
sw.js                           service worker
site.webmanifest                מניפסט PWA
og-cover.png                    תמונת שיתוף
_headers                        כותרות מטמון ואבטחה ל-Netlify
robots.txt / sitemap.xml        SEO
supabase-credits.sql            גבייה עם החזר (credit_holds) — להריץ פעם אחת
supabase-waitlist.sql           טבלת רשימת ההמתנה — להריץ פעם אחת
i18n-keys.json                  75 מפתחות תרגום עם הטקסט העברי
Chordix_Improvement_Report.docx דוח מלא
