# دليل إعداد GalaxyVPN — ما عليك فعله بالضبط

هذا الملف يشرح الخطوات اليدوية المطلوبة منك (إنشاء الحسابات والمفاتيح). أنا أتكفّل بكل الكود.

---

## 1) إنشاء مشروع Supabase

1. ادخل إلى <https://supabase.com> → New project.
2. اختر اسماً (مثلاً `galaxyvpn`) وكلمة مرور لقاعدة البيانات (احتفظ بها).
3. بعد الإنشاء، اذهب إلى **Project Settings → API** وانسخ لي:
   - **Project URL** (مثل `https://xxxx.supabase.co`)
   - **anon public key**
   - **service_role key** ⚠️ (سرّي جداً — يُستخدم في السيرفر والـ Worker فقط، لا يُكشف في المتصفح أبداً)

---

## 2) تشغيل مخطّط قاعدة البيانات

1. في Supabase: **SQL Editor → New query**.
2. الصق كامل محتوى الملف [`supabase/schema.sql`](supabase/schema.sql).
3. اضغط **Run**. يجب أن ينتهي دون أخطاء (ينشئ الجداول، الأدوار، RLS، والـ Views).

> ملاحظة: إيميل الأدمن مثبّت في المخطّط كـ `islamazaizia360@gmail.com`. أي حساب يسجّل بهذا الإيميل عبر Google يصبح أدمن تلقائياً.

---

## 3) تفعيل تسجيل الدخول بـ Google

### أ. في Google Cloud Console (<https://console.cloud.google.com>)
1. أنشئ مشروعاً جديداً (أو استخدم موجوداً).
2. **APIs & Services → OAuth consent screen**: اختر External، املأ اسم التطبيق والإيميل، واحفظ.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URIs**: أضف رابط callback الخاص بـ Supabase (تجده في Supabase → Authentication → Providers → Google، يكون بالشكل):
     `https://<your-project>.supabase.co/auth/v1/callback`
4. انسخ **Client ID** و **Client Secret**.

### ب. في Supabase
1. **Authentication → Providers → Google** → فعّله.
2. الصق **Client ID** و **Client Secret** → Save.
3. **Authentication → URL Configuration**:
   - **Site URL**: محلياً `http://localhost:3000`، وبعد النشر دومين Render.
   - **Redirect URLs**: أضف `http://localhost:3000/**` و دومين Render لاحقاً.

---

## 4) متغيرات البيئة (سأنشئ ملف `.env.local` — ضع فيه القيم)

سأجهّز ملف `.env.example`. القيم المطلوبة:

```
NEXT_PUBLIC_SUPABASE_URL=...        # Project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=...   # anon public key
SUPABASE_SERVICE_ROLE_KEY=...       # service_role key (سرّي)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
WORKER_TRIGGER_URL=...              # رابط /trigger-sync للـ Worker (يُضبط بعد نشره)
WORKER_TRIGGER_SECRET=...           # كلمة سر مشتركة لحماية زر الفحص
```

---

## 5) ما ستوفّره لاحقاً (غير عاجل)
- صورة **QR Code** الحقيقية للدفع + اسم/تفاصيل حساب **Sber Bank** المطلوب عرضها للمستخدم (نبدأ بوهمية).
- روابط مستودعات GitHub الإضافية (لدينا مثال `https://github.com/hiztin/VLESS-PO-GRIBI`).
- (اختياري) تفضيلات الشعار/الألوان.

---

## 6) أدوات على جهازك
- **Node.js 20+** (للموقع والـ Worker).
- **Flutter SDK** (لبناء تطبيق Hiddify المعدّل).
- **Git** (موجود).

---

## 7) النشر — Vercel (الموقع) + GitHub Actions (الـ Worker)

> ⚠️ لا تضع أي مفتاح في الكود. كل الأسرار متغيّرات بيئة.
> ملاحظة: تخلّينا عن Render لأن طبقته المجانية تحظر مشاريع VPN/الفحص الشبكي. (`render.yaml` يبقى للمرجع إن استأجرت VPS لاحقاً.)

### أ. الموقع على **Vercel**
1. [vercel.com](https://vercel.com) → Add New → Project → استورد مستودع `Galaxy-VPN-pro`.
2. Framework: **Next.js** (يُكتشف تلقائياً) · Root Directory: `.`
3. **Environment Variables**:

| المفتاح | القيمة | سرّي؟ |
|--------|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://oneezcaqqqaqsjkuaoor.supabase.co` | لا |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | مفتاح `anon` | لا (محميّ بـ RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح `service_role` | **نعم** 🔒 |

4. **Deploy** → ستحصل على دومين مثل `https://galaxy-vpn-pro.vercel.app`.

### ب. الـ Worker على **GitHub Actions** (مجاني، لا يُحظر)
1. في المستودع → **Settings → Secrets and variables → Actions → New repository secret**، أضف:
   - `SUPABASE_URL` = `https://oneezcaqqqaqsjkuaoor.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = مفتاح `service_role` 🔒
2. تبويب **Actions** → فعّل الـ workflows إن طُلب.
3. الفحص يعمل تلقائياً **كل 30 دقيقة** ([.github/workflows/sync.yml](.github/workflows/sync.yml))، أو يدوياً: Actions → "Sync VPN servers" → **Run workflow**.

### ج. بعد النشر — قوائم السماح (لتسجيل الدخول)
1. **Supabase → Authentication → URL Configuration**: Site URL = دومين Vercel، وأضف `https://<دومين-Vercel>/auth/callback` إلى Redirect URLs.
2. **Google Console → Authorized JavaScript origins**: أضف دومين Vercel.

### د. إدارة المستودعات
انتقلت إلى **لوحة الأدمن في الموقع** (تبويب «المستودعات») — الأدمن يضيف/يحذف روابط GitHub، وتقرؤها مهمة GitHub Actions في تشغيلها التالي. (شاشة Hiddify السابقة كانت تعتمد خادم Worker دائماً؛ لم تعد مستخدمة في هذا المسار.)

---

## 8) الأمان (مطبّق ومُلتزَم به)

- **لا أسرار في الكود** — كلها عبر متغيرات البيئة؛ ملفات `.env*` و`worker/.env` ضمن `.gitignore`.
- **`service_role` سيرفري فقط** — يُستخدم في الـ Worker وكود السيرفر، ولا يصل المتصفح أو تطبيق Hiddify إطلاقاً.
- **RLS مفعّل على كل الجداول** — المتصفح يستخدم `anon` فقط؛ كل مستخدم يرى بياناته فقط؛ جدول `servers` للقراءة فقط للعملاء ويُكتب حصراً من الـ Worker.
- **بوابة الأدمن** — صفحات/إجراءات الأدمن تتحقق من الإيميل في السيرفر مقابل `islamazaizia360@gmail.com` (وعمود `users.role = 'admin'`).
- **عزل Hiddify عن قاعدة البيانات** — التطبيق لا يحمل أي بيانات اعتماد؛ يتصل بالـ Worker المحميّ بـ `WORKER_TRIGGER_SECRET`.
- **اعتماديات مُصحّحة** — Next.js مثبّت على نسخة خالية من ثغرات تجاوز مصادقة الـ middleware/SSRF/تسميم الكاش المعروفة.
- **وصولات الدفع** — مخزّنة base64 مضغوطة، تُرى فقط لصاحبها وللأدمن (RLS).
- **قبل الإطلاق**: دوّر أي مفتاح ظهر في محادثة/صورة، وأضف حدّ معدّل (rate-limit) على رفع الصور والدعم.
