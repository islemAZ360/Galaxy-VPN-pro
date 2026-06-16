# دليل تشغيل أداة الفحص على الهاتف (GalaxyVPN عبر Termux)

دليل كامل من الصفر: يشغّل زرّي **Wi‑Fi** و **LTE** على الهاتف كاختصارين على
الشاشة الرئيسية. الهاتف مثالي لأنه يملك واي‑فاي حقيقياً و LTE حقيقياً، فالفحص يجري
على نفس الشبكة التي يستخدمها المستخدمون فعلاً.

> 🔑 ستحتاج **مفتاح service_role** الخاص بـ Supabase. تجده في:
> Supabase Dashboard ← Project Settings ← API ← `service_role` (سرّي).
> أو هو نفس قيمة `SUPABASE_SERVICE_ROLE_KEY` في ملف `worker/.env` على حاسوبك.

---

## ⚠️ القاعدة الذهبية
في Termux نفّذ الأوامر **أمراً واحداً في كل مرّة**: الصق الأمر ← اضغط Enter ←
انتظر حتى يعود السطر `~ $` ← ثم الأمر التالي. لا تلصق عدّة أوامر دفعة واحدة.
(الاستثناء الوحيد: كتلة `.env` في الخطوة 5، فهي أمر واحد متكامل.)

---

## 1) ثبّت تطبيقين من F‑Droid (مهم: ليس من Play Store)
1. حمّل تطبيق **F‑Droid** من https://f-droid.org
2. من داخله ثبّت: **Termux** و **Termux:Widget** (من نفس المصدر، وإلا لن يعمل الودجت).

## 2) رقّع الحزم (يمنع خطأ openssl في node)
افتح **Termux** ونفّذ:
```bash
pkg upgrade -y
```
> إن ظهر `(y/n)` اكتب `y` ثم Enter. وإن ظهرت شاشة بنفسجية عن "configuration file" اضغط **Enter** فقط.

## 3) ثبّت git
```bash
pkg install -y git
```

## 4) استنسخ المشروع
```bash
git clone https://github.com/islemAZ360/Galaxy-VPN-pro.git ~/galaxyvpn
```

## 5) أنشئ ملف الإعدادات `.env` (الصق الكتلة كاملة كأمر واحد)
استبدل `ضع_مفتاحك_هنا` بمفتاح service_role الخاص بك:
```bash
cd ~/galaxyvpn/worker
cat > .env << 'EOF'
SUPABASE_URL=https://oneezcaqqqaqsjkuaoor.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ضع_مفتاحك_هنا
XRAY_KNIFE_CORE=auto
XRAY_KNIFE_URL=https://cloudflare.com/cdn-cgi/trace
XRAY_KNIFE_MDELAY=5000
MAX_CONFIGS=0
TEST_CONCURRENCY=30
SUPA_FORCE_IPV4=1
EOF
```

## 6) شغّل التثبيت التلقائي (Node + xray‑knife + الاختصارات)
```bash
bash termux/setup.sh
```
انتظر حتى ترى **"Setup complete!"**.

## 7) اختبر الفحص
```bash
npm run sync:wifi
```
يجب أن ترى شعار GalaxyVPN، عدّاً تنازلياً يطلب إطفاء الـ VPN، ثم تقدّم الفحص، ثم رفع النتائج.

## 8) أضف الزرّين إلى الشاشة الرئيسية
1. اضغط مطوّلاً على مكان فارغ في الشاشة ← **الأدوات / Widgets**.
2. جد **Termux:Widget** وأضفه:
   - **حجم صغير 1×1** → يطلب اختيار سكربت واحد: اختر `galaxy-wifi.sh` (أيقونة الواي‑فاي).
     أضفه مرّة ثانية واختر `galaxy-lte.sh` (أيقونة الـ LTE) ← زرّان منفصلان.
   - **حجم أكبر** → يعرض قائمة فيها الاثنان معاً، تضغط أيّهما لتشغيله.

## 9) امنح Termux إذن "العرض فوق التطبيقات الأخرى" (ضروري للودجت)
بدون هذا الإذن يظهر تنبيه: «Termux requires Display over other apps permission»
ولا يفتح الفحص. الحل:
- **Xiaomi / HyperOS:** الإعدادات ← التطبيقات ← إدارة التطبيقات ← **Termux** ←
  **أذونات أخرى (Other permissions)** ← فعّل **عرض النوافذ المنبثقة** و **عرض
  النوافذ المنبثقة أثناء التشغيل في الخلفية**. ويُفضّل تفعيل **التشغيل التلقائي
  (Autostart)** لـ Termux أيضاً.
- **أندرويد عادي:** الإعدادات ← التطبيقات ← Termux ← Advanced ← **Display over
  other apps** ← فعّله.
ثم ارجع للشاشة الرئيسية واضغط الزر من جديد.

---

## الاستخدام اليومي
| الزر | كن متصلاً بـ | أثناء الفحص |
|------|------------|------------|
| **galaxy-wifi** | الواي‑فاي | أطفئ الـ VPN عند العدّ التنازلي، ثم أعِده بعد انتهاء الفحص |
| **galaxy-lte** | بيانات الجوّال (أطفئ الواي‑فاي) | نفس الشيء: أطفئ الـ VPN ثم أعِده |

اضغط الزر ← ينفتح Termux ويعرض الفحص مباشرة ← يرفع النتائج إلى Supabase. إن نسيت
إعادة الـ VPN، الأداة تعيد محاولة الرفع تلقائياً لعدّة دقائق حتى تعيده.

## العزل بين الهاتف والحاسوب (مهم)
- أداة الحاسوب (`npm start` / `start-worker.bat`) تستمع لأزرار صفحة الأدمن.
- اختصارات الهاتف تعمل بالضغط المباشر فقط ولا تستمع لتلك الأزرار.
- لذا: ضغط أزرار صفحة الأدمن من الحاسوب **لا يصل للهاتف**، والعكس صحيح. الجهازان مستقلّان،
  والهاتف يعمل حتى لو كان الحاسوب مطفأً.
- ⚠️ لا تشغّل `npm start` على الهاتف (سيجعله يستمع للأزرار ويتداخل مع الحاسوب).
- لا تفحص من الحاسوب والهاتف في **نفس اللحظة** (كلاهما يكتب على نفس قائمة السيرفرات).

## التحديث لاحقاً
```bash
cd ~/galaxyvpn && git pull && cd worker && npm install
cp -f termux/shortcuts/galaxy-*.sh ~/.shortcuts/ && chmod +x ~/.shortcuts/galaxy-*.sh
```

## حل المشاكل
- **`node` يعطي "cannot locate symbol OSSL_PROVIDER_add_conf_parameter"**:
  `pkg upgrade -y` ثم `node -v` (يجب أن يطبع نسخة) ثم `bash termux/setup.sh`.
- **"git is not installed"**: نفّذت عدّة أوامر دفعة واحدة. نفّذها أمراً أمراً.
- **`xray-knife` يفشل مع كل السيرفرات**: جرّب نسخة Linux arm64:
  `cd ~ && wget -O xk.zip https://github.com/lilendian0x00/xray-knife/releases/download/v10.0.0/Xray-knife-linux-arm64-v8a.zip && unzip -o xk.zip -d xk && cp xk/xray-knife $PREFIX/bin/xray-knife && chmod +x $PREFIX/bin/xray-knife`
- **الودجت لا يعرض السكربتات / لا يفتح** (شائع في Xiaomi): فعّل لتطبيقَي Termux و
  Termux:Widget من إعدادات الهاتف: **التشغيل التلقائي (Autostart)** و **النوافذ المنبثقة
  (pop-up windows)**، ثم أعد تشغيل الهاتف.
- **الرفع يتوقّف / "VPN seems down"**: أعِد تشغيل الـ VPN، والأداة تكمل تلقائياً.
