-- ============================================================
-- Chordix — 10 קודי קופון חדשים
-- נוצר: 2026-08-10
--
-- הפורמט תואם למה שהדף מצפה לו: CX-XXXX-NN, אותיות גדולות.
-- הקודים נבחרו בלי תווים מבלבלים (0/O, 1/I/L) כדי שאפשר יהיה
-- להכתיב אותם בטלפון בלי טעויות.
--
-- ⚠ שמות העמודות כאן הם ההשערה הסבירה לפי מה ש-redeem_coupon
--   מחזיר בקוד הלקוח (credits_added, balance, plan) ולפי קודי
--   השגיאה שלו (COUPON_USED / COUPON_EXPIRED / COUPON_INACTIVE).
--   הקובץ supabase-coupons.sql לא היה בתוך ה-ZIP, אז לפני הרצה
--   כדאי להשוות מול הטבלה האמיתית:
--     select column_name, data_type from information_schema.columns
--     where table_name = 'coupons';
-- ============================================================


-- ------------------------------------------------------------
-- קבוצה א' — 5 קודים חד-פעמיים "רגילים"
-- שנו את 100 לכמות שהקודים הקיימים שלכם נותנים
-- (החבילות באתר: Basic 100 · Pro 300 · Pro Max 500 · Ultra 1000)
-- ------------------------------------------------------------
insert into public.coupons (code, credits, plan, single_use, active)
values
  ('CX-49QL-12', 100, 'Basic', true, true),
  ('CX-L437-04', 100, 'Basic', true, true),
  ('CX-8TXE-41', 100, 'Basic', true, true),
  ('CX-RKN8-10', 100, 'Basic', true, true),
  ('CX-UC96-39', 100, 'Basic', true, true);


-- ------------------------------------------------------------
-- קבוצה ב' — 5 קודים חד-פעמיים של 5000 קרדיטים כל אחד
-- 5000 קרדיטים = 500 שירים בניתוח רגיל עד 5 דקות
-- ------------------------------------------------------------
insert into public.coupons (code, credits, plan, single_use, active)
values
  ('CX-EKUE-01', 5000, 'Mega', true, true),
  ('CX-TR77-65', 5000, 'Mega', true, true),
  ('CX-YTCW-94', 5000, 'Mega', true, true),
  ('CX-QD6R-62', 5000, 'Mega', true, true),
  ('CX-EP7H-43', 5000, 'Mega', true, true);


-- ------------------------------------------------------------
-- אופציונלי: תאריך תפוגה (הקוד בלקוח מטפל ב-COUPON_EXPIRED)
-- ------------------------------------------------------------
-- update public.coupons
--    set expires_at = now() + interval '90 days'
--  where code in ('CX-EKUE-01','CX-TR77-65','CX-YTCW-94','CX-QD6R-62','CX-EP7H-43');


-- ------------------------------------------------------------
-- בדיקה אחרי ההרצה
-- ------------------------------------------------------------
select code, credits, plan, single_use, active, used_at
  from public.coupons
 where code like 'CX-%'
 order by credits desc, code;


-- ------------------------------------------------------------
-- אם הטבלה שלכם מינימלית (רק code + credits), זו הגרסה המקוצרת:
-- ------------------------------------------------------------
-- insert into public.coupons (code, credits) values
--   ('CX-49QL-12', 100), ('CX-L437-04', 100), ('CX-8TXE-41', 100),
--   ('CX-RKN8-10', 100), ('CX-UC96-39', 100),
--   ('CX-EKUE-01', 5000), ('CX-TR77-65', 5000), ('CX-YTCW-94', 5000),
--   ('CX-QD6R-62', 5000), ('CX-EP7H-43', 5000);
