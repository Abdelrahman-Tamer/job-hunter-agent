# دليل تشغيل BottaJobs على مدار 24 ساعة برابط دائم
# 24/7 Deployment Guide with Permanent URLs

يقدم هذا الدليل 3 طرق مجربة ومضمونة لتشغيل نظام **BottaJobs** (الباك إند، بوت التليجرام، مجدول الوظائف الصباحي 09:00 بتوقيت القاهرة، ولوحة تحكم أنجولار) ليعمل **24 ساعة يومياً بدون انقطاع** حتى عند إغلاق جهاز الكمبيوتر أو الهاتف، مع روابط ثابتة ومشفرة بتقنية HTTPS.

---

## 🌟 الهيكل الموحد المجهز (All-in-One Unified Container)

تم دمج تطبيق **Angular 19** مبنياً وجاهزاً داخل خادم **FastAPI** مباشرة:
- رابط واحد ثابت (Domain) يفتح لك لوحة تحكم Angular كاملة بشعار وأيقونة BottaJobs.
- الـ API يخدم تلقائياً تحت `/api/v1`.
- بوت التليجرام (`@BottaJobs_bot`) يعمل في الخلفية 24/7 دون الحاجة لأي عملية منفصلة.
- المجدول يرسل الدايجست الصباحي يومياً الساعة 09:00 صباحاً بتوقيت القاهرة (`Africa/Cairo`).

---

## 🚀 الخيار الأول: النشر المجاني عبر Render.com (الأسهل والموصى به)

خدمة **Render** توفر استضافة Docker مجانية برابط HTTPS دائم مجاني (مثل: `https://bottajobs.onrender.com`).

### خطوات التفعيل في 5 دقائق:
1. قم برفع كود المشروع إلى مستودع على GitHub (سواء كان خاصاً Private أو عاماً Public).
2. افتح [render.com](https://render.com) وسجل الدخول بحساب GitHub الخاص بك.
3. اضغط على **New +** ثم اختر **Blueprint** (أو **Web Service**).
4. اربط مستودع GitHub الخاص بـ `job-hunter-agent`.
5. سيتعرف Render تلقائياً على ملف `render.yaml` والـ `Dockerfile` المرفقين في المشروع.
6. في إعدادات البيئة (Environment Variables)، أدخل القيم السرية الخاصة بك:
   - `TELEGRAM_BOT_TOKEN`: `9193514449:AAFWKI1s-eE8dcSBVtevXZi_1Wqpc0JrYno`
   - `TELEGRAM_OWNER_ID`: `5753164422`
   - `GEMINI_API_KEY`: مفتاح الـ API الخاص بك
   - `TELEGRAM_POLLING`: `true`
   - `TIMEZONE`: `Africa/Cairo`
7. اضغط **Apply** أو **Create Web Service**.

> **النتيجة:** سيبدأ Render في بناء صورة Docker وتشغيل السيرفر، وسيعطيك رابطاً دائماً مثل:  
> `https://bottajobs.onrender.com`  
> يفتح لك واجهة أنجولار باللوجو الجديد، والبوت سيرد عليك في تليجرام في أي وقت حتى لو هاتفك مغلق!

---

## ⚡ الخيار الثاني: النشر عبر Railway.app (أسرع أداء وبدون وضع سكون)

توفر منصة **Railway** رصيداً تجريبياً وسرعة فائقة دون أن يدخل السيرفر في وضع خمول (No Cold Starts):

1. افتح [railway.app](https://railway.app) وسجل الدخول بحساب GitHub.
2. اختر **New Project** -> **Deploy from GitHub repo**.
3. اختر مستودع `job-hunter-agent`.
4. اذهب إلى **Variables** وأضف:
   ```env
   TELEGRAM_BOT_TOKEN=9193514449:AAFWKI1s-eE8dcSBVtevXZi_1Wqpc0JrYno
   TELEGRAM_OWNER_ID=5753164422
   TELEGRAM_POLLING=true
   GEMINI_API_KEY=your_key_here
   TIMEZONE=Africa/Cairo
   ```
5. اذهب إلى **Settings** -> **Networking** -> اضغط **Generate Domain** لتحصل على رابط دائم مثل:  
   `https://bottajobs.up.railway.app`

---

## 🖥️ الخيار الثالث: سيرفر خاص VPS (تحكم كامل بـ $3.5 إلى $5 شهرياً)

إذا كنت تفضل سيرفر خاص مثل Hetzner Cloud، DigitalOcean، أو Contabo:

1. ثبت Docker و Docker Compose على السيرفر:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
2. اسحب المشروع:
   ```bash
   git clone <your-repo-url>
   cd job-hunter-agent
   cp .env.example .env
   # عدل بيانات .env وضع مفاتيح التليجرام وجيميني
   ```
3. شغل التطبيق في الخلفية بحاوية تعيد تشغيل نفسها تلقائياً:
   ```bash
   docker compose up -d --build
   ```
4. النظام سيعمل 24 ساعة بلا توقف حتى لو أغلقت اللابتوب أو تمت إعادة تشغيل السيرفر (`restart: unless-stopped`).

---

## 🌐 الخيار الرابع: فصل الواجهة على Vercel والباك إند على Render/Railway

إذا أردت وضع الواجهة على شبكة CDN العالمية الخاصة بـ **Vercel**:
1. في مجلد `frontend`:
   ```bash
   npm i -g vercel
   cd frontend
   vercel
   ```
2. ستحصل على رابط ثابت مثل `https://bottajobs.vercel.app`.
3. قم بتعديل متغير عنوان الباك إند ليشير إلى رابط Render أو Railway.

---

## 🔍 كيفية التحقق من عمل النظام 24/7:
1. **فحص البوت من الهاتف:** أرسل `/start` أو `/profile` أو `/digest` للبوت `@BottaJobs_bot` على تليجرام.
2. **فحص الواجهة من أي متصفح:** افتح الرابط الثابت وتأكد من ظهور الأيقونة والشعار الجديد في المتصفح.
3. **الدايجست الصباحي:** في تمام الساعة 09:00 صباحاً بتوقيت مصر، ستستلم رسالة التلخيص اليومية تلقائياً.
