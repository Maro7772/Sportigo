# Scouting Super Admin API

Backend للـ **Super Admin** بتاع منصة Scouting متعددة الـ Tenants (كل نادي = Tenant).
Stack: **Node.js + Express 5 + MongoDB (Mongoose) + TypeScript + Zod**.

المشروع فيه جزئين:

1. **Super Admin API** (`/api/...`) — إدارة الألعاب، الأكشنز، الباكدجات، النوادي، الأوردرات، الإعدادات.
2. **Tenant API** (`/api/tenant/...`) — كل نادي ليه **database منفصلة**، بتتحدد من الـ subdomain
   (wildcard): `ahly.example.com` → database اسمها `ahly`.

> **مهم:** الـ Tenant API محمي بـ **JWT خاص بكل نادي** (`admin` / `coach` / `viewer`)،
> والنادي بيسجل دخول على الـ subdomain بتاعه. تفاصيل كاملة في [القسم 5](#5-الـ-tenant-api-wildcard-subdomain).

---

## 1. التشغيل السريع

### المتطلبات
- Node.js **20+**
- MongoDB (Local أو Atlas)

### الخطوات

```bash
# 1) تثبيت الحزم
npm install

# 2) ملف البيئة
#    على Windows PowerShell:
Copy-Item .env.example .env
#    أو على Bash:
cp .env.example .env

# 3) عدّل .env (MONGODB_URI و JWT_SECRET وبيانات أول سوبر أدمن)

# 4) بيانات تجريبية (اختياري بس مفيد)
npm run seed:demo

# 5) التشغيل
npm run dev
```

- الـ API: `http://localhost:4000/api`
- الـ Health: `http://localhost:4000/health`

> لو `MONGODB_URI` بتاعك (مثلاً Atlas) مش فيه اسم database في الآخر، المشروع بيستخدم
> `MONGODB_DB_NAME` (الافتراضي `scouting_super_admin`) بدل ما يروح على database اسمه `test`.

> **الصور المرفوعة** بتتخزن محليًا في `uploads/` (تقدر تغيّرها بـ `UPLOAD_DIR`)،
> والحد الأقصى للصورة `UPLOAD_MAX_MB` (الافتراضي 5 ميجا).
> المجلد بيتعمل تلقائيًا عند التشغيل، ومضاف لـ `.gitignore`.

> ⚠️ **مهم:** `SUPER_ADMIN_PASSWORD` لازم **6 أحرف على الأقل** (في التطوير والـ production).
> لو أقل من كده السيرفر هيتجاهل إنشاء الحساب ويطبع تحذير في الـ console.
> ويُفضّل دائمًا استخدام باسورد قوي (12+ حرف) للسوبر أدمن.
> لو `.env` عندك موجود بالفعل وفيه بياناتك، متعملش overwrite ليه.

### Scripts

| Command | وظيفته |
|---|---|
| `npm run dev` | تشغيل مع hot reload |
| `npm run build` | Compile لـ `dist/` |
| `npm start` | تشغيل النسخة المبنية |
| `npm run typecheck` | TypeScript بدون emit |
| `npm run seed` | إنشاء أول Super Admin + Settings |
| `npm run seed:demo` | نفس السابق + بيانات تجريبية بسيطة |
| `npm run seed:real` | بيانات واقعية: 4 ألعاب + أكشنز + باكدجات + نوادي + أوردرات |
| `npm run seed:tenant` | تعبئة databases النوادي (فرق/لاعبين/ماتشات/progress) — `npm run seed:tenant -- ahly` لنادي واحد |
| `npm run db:check` | فحص اتصال الداتابيز وعدد المستندات |
| `npm run test:smoke` | 300 اختبار E2E على MongoDB in-memory |
| `npm run test:live` | فحص API على الداتابيز الحقيقية + رفع صورة + فحص tenant databases |

---

## 2. شكل الـ Response

كل الـ endpoints بترجع نفس الشكل:

```json
// نجاح
{
  "success": true,
  "message": "Game created successfully",
  "data": { "game": { "...": "..." } }
}

// خطأ
{
  "success": false,
  "error": {
    "code": 409,
    "message": "A record with the same name already exists",
    "details": { "name": "Football" }
  }
}
```

### Pagination

أي قائمة بترجع:

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": {
      "total": 0,
      "page": 1,
      "limit": 10,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

### Query params المشتركة

`?page=1&limit=10&search=foot&sort_by=createdAt&order=desc&status=true`

- `page` / `limit` (max 100)
- `search` حسب الـ resource (اسم اللعبة/الأكشن/الباكدج/النادي...)
- `sort_by` + `order=asc|desc`
- `status=true|false`
- فلاتر إضافية: `game_id`, `package_id`, `club_id`, `payment_method_id`, `subscription_status`

---

## 3. الـ Data Model

### `games`
| Field | Type | Notes |
|---|---|---|
| `name` | string | unique |
| `status` | boolean | default `true` |

### `actions`
| Field | Type | Notes |
|---|---|---|
| `game_id` | ObjectId → Game | required |
| `name` | string | unique **داخل نفس اللعبة** |
| `status` | boolean | default `true` |

### `packages`
| Field | Type | Notes |
|---|---|---|
| `name` | string | unique داخل نفس اللعبة |
| `status` | boolean | default `true` |
| `game_id` | ObjectId → Game | required |
| `teams` | number | أقصى عدد فرق مسموح |
| `players` | number | أقصى عدد لاعبين لكل فريق |
| `cycles` | array (embedded) | `name`, `discount_type`, `discount`, `price`, `months` |

> `discount_type` بيكون `percentage` (نسبة 0–100) أو `amount` (مبلغ ثابت).
> الافتراضي `percentage`، والـ `price` هو السعر قبل الخصم.
> في حالة `amount` لازم الخصم ما يزيدش عن السعر.
> الباكدج لازم يكون فيها **cycle واحدة على الأقل**.

### `clubs` (Tenant)
| Field | Type | Notes |
|---|---|---|
| `name` | string | |
| `status` | boolean | |
| `subdomain` | string | unique، lowercase، `a-z0-9-` |
| `package_id` | ObjectId → Package | nullable |
| `start_date` | Date | nullable |
| `end_date` | Date | nullable، لازم ≥ `start_date` |

بيتضاف للـ response حقلين محسوبين من `status` + التواريخ + `allowed_days`:

- `subscription_status`: `active` / `inactive` / `pending` / `grace` / `expired`
- `subscription`: `{ status, days_left, grace_days_left, is_late_renewal, allowed_days }`

> **`allowed_days` = فترة سماح بعد `end_date`.**
> مثال: `end_date = 1 نوفمبر` و`allowed_days = 7` → النادي يفضل شغال لحد **8 نوفمبر**
> وبعدها يبقى `expired`. الفترة دي بتديله فرصة يجدد من غير ما يتقطع فورًا.
>
> - `inactive`: النادي متوقف يدويًا (`status=false`)
> - `pending`: `start_date` لسه في المستقبل
> - `active`: جوه الفترة المدفوعة
> - `grace`: بعد `end_date` بس لسه جوه `allowed_days`
> - `expired`: بعد `end_date + allowed_days`

### `orders`
| Field | Type | Notes |
|---|---|---|
| `order_number` | string | **تلقائي** بصيغة `ORD-2026-000123` (unique) |
| `club_id` | ObjectId → Club | required |
| `package_id` | ObjectId → Package | required |
| `cycle_id` | ObjectId | اختياري (cycle داخل الباكدج) |
| `payment_method_id` | ObjectId → PaymentMethod | required |
| `price` | number | لو مش مبعوت بيتاخد من الـ cycle |
| `discount` | number | **مبلغ** مش نسبة |
| `fine` | number | غرامة |
| `final_price` | number | **محسوب تلقائيًا** |
| `status` | enum | `pending` / `paid` / `rejected` / `cancelled` / `refunded` |
| `payment_proof` | string | صورة/إيصال الدفع (URL) |
| `payment_reference` | string | رقم التحويل / المحفظة |
| `paid_at` | Date | بيتسجل تلقائيًا لما الحالة تبقى `paid` |
| `approved_by` | ObjectId → SuperAdmin | مين وافق على الدفع |
| `approved_at` | Date | وقت الموافقة |
| `rejected_at` | Date | وقت الرفض |
| `rejection_reason` | string | سبب الرفض |
| `review_notes` | string | ملاحظات السوبر أدمن وقت المراجعة |
| `applied_to_subscription` | boolean | `true` لما الأوردر يمدد اشتراك النادي |
| `applied_at` | Date | وقت تطبيق الأوردر على الاشتراك |
| `notes` | string | ملاحظات النادي |

**دورة حياة الأوردر:**

```
النادي يرفع إثبات الدفع  →  pending
                              ├── Super Admin approve  →  paid   (+ تجديد الاشتراك)
                              └── Super Admin reject   →  rejected (بدون تجديد)
```

> - الأوردر بيفضل `pending` لحد ما السوبر أدمن يوافق. مفيش تجديد اشتراك قبل الموافقة.
> - الموافقة (`approve`) بتسجل `approved_by` + `approved_at` وبتطبق التجديد.
> - الرفض (`reject`) لازم يكون فيه `reason`، ومش بيلمس اشتراك النادي.
> - مينفعش توافق على أوردر مش `pending`، ومينفعش ترفض أوردر متطبق → `409`.

**القاعدة:** `final_price = price - discount + fine` (مش بيقل عن صفر)، وبيرفض الطلب لو `discount > price`.

> **التجديد التلقائي:** بعد الموافقة (أو أي تحويل للحالة `paid`):
> - اشتراك النادي بيتمدد بمقدار `months` بتاع الـ cycle.
> - `package_id` بتاع النادي بيتحدث للباكدج المختارة.
> - لو النادي كان في `grace` أو `expired` (تجديد متأخر) و`fine` مش مبعوت، بتتطبق غرامة `settings.fines` تلقائيًا.
> - التطبيق بيحصل **مرة واحدة بس** (`applied_to_subscription` + قفل atomic)، فلو الأوردر اتحول لـ `paid` تاني مش هيتمدد مرتين.
> - الأوردر اللي اتطبق مينفعش يترجع `refunded`/`cancelled` ولا يتحذف → `409`.
> - الـ response بيرجع `subscription_applied` عشان تعرف إذا كان الأوردر مدد الاشتراك فعلًا.

### `payment_methods`
| Field | Type | Notes |
|---|---|---|
| `name` | string | unique |
| `status` | boolean | default `true` |
| `description` | string | nullable |

### `settings` (Singleton — الداتابيز المركزية)
| Field | Type | Default |
|---|---|---|
| `allowed_days` | number | `0` (فترة سماح بعد `end_date`) |
| `notification` | boolean | `true` |
| `fines` | number | `0` (غرامة التجديد المتأخر) |

> ده إعداد السوبر أدمن. أما إعدادات كل نادي (لوجو + ألوان) فهي collection منفصلة اسمها `settings`
> جوه database النادي — شوف **قسم 5**.

### `superadmins`
`name`, `email` (unique), `password` (bcrypt hash, never returned), `status`, `last_login_at`.

---

### بيانات `npm run seed:real`

| النوع | العدد | أمثلة |
|---|---|---|
| Games | 4 | Football, Basketball, Volleyball, Handball |
| Actions | 37 | Goal, 3-point shot, Spike, 7m goal... |
| Packages | 11 | Football Starter/Pro/Elite، Basketball Pro... |
| Payment methods | 5 | Cash, Bank Transfer, Vodafone Cash, InstaPay, Credit Card |
| Clubs | 8 | Al Ahly, Zamalek, Cairo Basketball, Alexandria Volleyball... |
| Orders | 18 | pending / paid / rejected / refunded مع إثباتات دفع |

النوادي مغطية كل الحالات: `active`, `grace`, `expired`, `pending`, `inactive`.
السكربت **idempotent** — تشغيله تاني مش بيكرر أي بيانات.

---

## 4. الـ Endpoints

كل الراوتس محمية بـ `Authorization: Bearer <token>` ما عدا `POST /auth/login` و `/health`.
(راوتس `/api/tenant/*` ليها **JWT خاص بكل نادي** — شوف **قسم 5**.)

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | تسجيل دخول (rate limited: 10 محاولات / 15 دقيقة) |
| GET | `/api/auth/me` | بيانات الحساب الحالي |
| PUT | `/api/auth/change-password` | تغيير كلمة السر |
| POST | `/api/auth/logout` | Logout (stateless) |

### Games
| Method | Path |
|---|---|
| GET | `/api/games` |
| GET | `/api/games/select` |
| GET | `/api/games/:id` (بيرجع stats: actions/packages) |
| POST | `/api/games` |
| PUT / PATCH | `/api/games/:id` |
| DELETE | `/api/games/:id` |
| POST | `/api/games/bulk-delete` |
| DELETE | `/api/games/bulk` |

### Actions
نفس نمط Games على `/api/actions`، مع فلتر `?game_id=` و endpoint `/select?game_id=`.

### Packages
نفس النمط على `/api/packages`، مع فلتر `?game_id=` و `/select?game_id=`.

### Clubs
نفس النمط على `/api/clubs`، مع:
- فلتر `?subscription_status=active|pending|grace|expired|inactive`
- فلتر `?package_id=`
- `GET /api/clubs/:id/subscription` → حالة الاشتراك بالتفصيل (`status`, `days_left`, `grace_days_left`, `is_late_renewal`, `allowed_days`)
- `/select`

### Orders
| Method | Path | Description |
|---|---|---|
| GET | `/api/orders` | فلاتر: `club_id`, `package_id`, `payment_method_id`, `status`, `order_number` + بحث بالـ `order_number`/`payment_reference` |
| GET | `/api/orders/:id` | |
| POST | `/api/orders` | إنشاء أوردر (بيبدأ `pending`) |
| PUT / PATCH | `/api/orders/:id` | تعديل البيانات / إرفاق `payment_proof` |
| PATCH | `/api/orders/:id/status` | تغيير الحالة مباشرة |
| **POST** | **`/api/orders/:id/approve`** | **موافقة السوبر أدمن → `paid` + تجديد الاشتراك** |
| **POST** | **`/api/orders/:id/reject`** | **رفض الدفع (body: `{ "reason": "..." }`) → `rejected`** |
| DELETE | `/api/orders/:id` | |
| POST | `/api/orders/bulk-delete` | |
| DELETE | `/api/orders/bulk` | |

### Dashboard
| Method | Path | Description |
|---|---|---|
| GET | `/api/dashboard?months=12` | إحصائيات كاملة للسوبر أدمن |

بيرجع:
- `summary`: عدد games/actions/packages/clubs/orders/payment methods
- `clubs_by_status`: `active` / `pending` / `grace` / `expired` / `inactive`
- `orders_by_status`: `pending` / `paid` / `rejected` / `cancelled` / `refunded`
- `revenue`: `total`, `paid_orders`, `this_month`, `pending`, `pending_orders`
- `monthly_revenue`: إيرادات آخر N شهر (`months` من 1 لـ 24، الافتراضي 12)
- `top_packages`: أفضل 5 باكدجات بالإيراد
- `recent_orders`: آخر 5 أوردرات
- `upcoming_expirations`: نوادي هتنتهي خلال 7 أيام مع `days_left`

### Uploads (multer - local disk)
| Method | Path | Description |
|---|---|---|
| POST | `/api/uploads` | رفع صورة عامة (`multipart/form-data` - field: `image` أو `file`) |
| POST | `/api/orders/:id/payment-proof` | رفع/استبدال إثبات دفع الأوردر مباشرة |
| GET | `/uploads/<filename>` | ملفات مرفوعة تُخدم statically |

الرد:
```json
{
  "success": true,
  "data": {
    "file": {
      "filename": "1730000000000-ab12cd34.png",
      "original_name": "receipt.png",
      "mimetype": "image/png",
      "size": 12345,
      "url": "/uploads/1730000000000-ab12cd34.png",
      "absolute_url": "http://localhost:4000/uploads/1730000000000-ab12cd34.png"
    }
  }
}
```

- الأنواع المسموحة: `jpeg` / `png` / `webp` / `gif`
- الحجم الأقصى: `UPLOAD_MAX_MB` (الافتراضي 5MB)
- مكان التخزين: `UPLOAD_DIR` (الافتراضي `uploads/` في جذر المشروع)
- لو رفعت إثبات دفع جديد لنفس الأوردر، الملف القديم بيتحذف تلقائيًا

### Payment Methods
نفس النمط على `/api/payment-methods` + `/select`.

### Settings
| Method | Path |
|---|---|
| GET | `/api/settings` |
| PUT / PATCH | `/api/settings` |

---

## 5. الـ Tenant API (Wildcard Subdomain)

### إزاي بيتحدد النادي؟

نفس فكرة مشروع `SubAdminECommerceWegostation-main`: **كل نادي ليه database منفصلة**،
واسم الـ database هو **أول جزء قبل النقطة** في الـ host:

| Host | Database |
|---|---|
| `ahly.example.com` | `ahly` |
| `zamalek.example.com` | `zamalek` |
| `cairo-basketball.example.com` | `cairo-basketball` |

ترتيب استخراج الـ subdomain:

1. هيدر `x-subdomain: ahly` (للتطوير وللموبايل)
2. `?subdomain=ahly`
3. أول label من الـ host (`ahly.example.com` → `ahly`، و`ahly.localhost:4000` → `ahly`)

بعد كده الـ middleware (`resolveTenant`):

- بيجيب الـ Club من الـ database المركزية بالـ `subdomain`.
- بيحسب حالة الاشتراك (`active` / `grace` / `pending` / `expired` / `inactive`).
- لو النادي **متوقف** (`status = false`) → **403** فورًا (قبل حتى الـ login).
- بيفتح اتصال الـ tenant بـ `mongoose.connection.useDb(dbName, { useCache: true })`
  (بيشارك نفس الـ pool، فمفيش اتصالات زيادة) ويكمبايل الـ models عليه.

بعد كده `requireTenantSubscription` بيتطبق على **مساحة العمل (Scouting)** بس:

- `teams`, `players`, `matches`, `player-progress`, `admins` → محتاجة `active` أو `grace`.
- أي حالة تانية → **403** مع `details.subscription` + `details.packages` (قائمة الباكدجات للتجديد).
- `auth`, `info`, `settings`, `cart`, `uploads` **شغالين حتى لو الاشتراك منتهي**،
  عشان النادي يقدر يجدد من غير ما يتقفل عليه.

> أسماء محجوزة ممنوعة كـ subdomain: `admin`, `local`, `config`, `test`، واسم الـ database المركزية.
> لو عايز prefix للـ databases (مثلاً `tenant_ahly`) اضبط `TENANT_DB_PREFIX` في `.env`.
> الافتراضي **فاضي** → اسم الـ database = الـ subdomain بالظبط.

### المصادقة (Tenant Auth)

النادي بيسجل دخول **على الـ subdomain بتاعه**، والبيانات بتتأكد من **الـ database بتاعته هو**:

```bash
# 1) Login (public - محتاج subdomain بس)
curl -X POST http://localhost:4000/api/tenant/auth/login \
  -H "Content-Type: application/json" \
  -H "x-subdomain: ahly" \
  -d '{ "email": "admin@ahly.com", "password": "123456" }'
```

- بيقبل `email` أو `phone` أو `identifier` (أي واحد فيهم) + `password`.
- بيرجع `token` (JWT) + `admin` + `club` + `subscription`.
- أي request بعده: `Authorization: Bearer <token>` + نفس الـ subdomain.

**إيه اللي جوه التوكن؟**

| Claim | Meaning |
|---|---|
| `sub` | `_id` بتاع الأدمن **جوه database النادي** |
| `email` | إيميل الأدمن |
| `role` | `admin` / `coach` / `viewer` |
| `club` | subdomain النادي (اسم الـ database) |
| `type` | `tenant` |
| `password_version` | إصدار الباسورد — بيتقارن مع الـ database عشان أي reset يلغي التوكنات القديمة |

**حماية مهمة:**

- توكن السوبر أدمن **مش** بيشتغل على `/api/tenant/*` → `401`.
- توكن نادي `ahly` **مش** بيشتغل على `zamalek` (حتى لو الاتنين عندهم collection `admin`)
  → `403`، لأن الـ `club` claim لازم يطابق الـ subdomain.
- كل request بيتأكد إن الأدمن **لسه موجود ونشط** جوه database النادي،
  فلو اتحذف أو اتعطّل بيفقد الوصول فورًا.

**الأدوار (Roles):**

| Action | admin | coach | viewer |
|---|:---:|:---:|:---:|
| قراءة teams / players / matches / player-progress | ✅ | ✅ | ✅ |
| إضافة/تعديل/حذف teams / players / matches / player-progress | ✅ | ✅ | ❌ |
| قراءة settings / info | ✅ | ✅ | ✅ |
| تعديل settings / رفع اللوجو | ✅ | ❌ | ❌ |
| cart / checkout / إثبات الدفع | ✅ | ❌ | ❌ |
| إدارة الـ admins (`/api/tenant/admins`) | ✅ | ❌ | ❌ |

**أول أدمن في كل نادي:**

- بيتعمل تلقائيًا أول ما السوبر أدمن ينشئ النادي (وكمان مع `seed:tenant`).
- الإيميل: `admin@<subdomain>.com` (مثلاً `admin@ahly.com`).
- الباسورد: `TENANT_DEFAULT_PASSWORD` من `.env` (الافتراضي `123456`).
- **غيّرهم بعد أول دخول** من `PUT /api/tenant/auth/change-password`.
- نسي الباسورد؟ السوبر أدمن بيعمل reset من `/api/clubs/:id/tenant/reset-admin` (شوف تحت).

**Endpoints المصادقة:**

| Method | Path | Description |
|---|---|---|
| POST | `/api/tenant/auth/login` | دخول (public) |
| GET | `/api/tenant/auth/me` | بيانات الأدمن + النادي + الاشتراك |
| PUT / PATCH | `/api/tenant/auth/change-password` | تغيير الباسورد (6 أحرف على الأقل) |
| POST | `/api/tenant/auth/logout` | تسجيل خروج (stateless) |
| GET/POST/PUT/PATCH/DELETE | `/api/tenant/admins` (+`/select`, `/:id`, `/bulk-delete`, `/bulk`) | إدارة موظفي النادي — `admin` بس |

### جداول التينانت (كلها جوه database النادي)

#### `order-cart`
| Field | Type | Notes |
|---|---|---|
| `package_id` | ObjectId → Package | من الداتابيز المركزية |
| `cycle_id` | ObjectId | الـ cycle (المدة) المختارة |
| `cycle_name` | string | snapshot |
| `months` | number | مدة الاشتراك |
| `price` | number | السعر قبل الخصم (من الـ cycle) |
| `discount` | number | مبلغ الخصم المحسوب |
| `discount_type` | enum | `percentage` / `amount` |
| `final_price` | number | **محسوب تلقائيًا** = `price - discount` |
| `status` | enum | `cart` / `checked_out` / `cancelled` |
| `order_id` | ObjectId | الأوردر المركزي اللي اتولد بعد الـ checkout |
| `notes` | string | |

> **الأسعار مش بتيجي من الكلاينت أبدًا** — بتتحسب من الـ cycle بتاعة الباكدج المركزية.
> الـ checkout بيعمل `Order` مركزي بحالة **`pending`**، والاشتراك بيتمدد بس بعد موافقة السوبر أدمن.

#### `settings` (document واحد لكل نادي)
| Field | Type |
|---|---|
| `logo` | string (URL) |
| `background_color` | string[] |
| `color` | string[] |

#### `team`
| Field | Type | Notes |
|---|---|---|
| `name` | string | unique داخل نفس اللعبة |
| `players` | number | **محسوب تلقائيًا** من عدد صفوف `team-players` |
| `game_id` | ObjectId → Game | من الداتابيز المركزية |

#### `team-players`
| Field | Type |
|---|---|
| `game_id` | ObjectId → Game |
| `team_id` | ObjectId → Team |
| `name` | string |
| `height` | number (سم) |
| `weight` | number (كجم) |
| `age` | number (سنة) |

> `game_id` بيتاخد تلقائيًا من الفريق لو مش مبعوت، وبيتحدث لو اللاعب اتنقل لفريق تاني.

#### `player-progress`
| Field | Type |
|---|---|
| `match_id` | ObjectId → Match |
| `action_id` | ObjectId → Action (مركزي) |
| `player_id` | ObjectId → TeamPlayer |

#### `match`
| Field | Type | Notes |
|---|---|---|
| `name` | string | |
| `date` | Date | |
| `team_id` | ObjectId → Team | **الشكل الأول**: فريقنا ضد فريق برّه |
| `opponent_name` | string | اسم الفريق الخارجي (مع `team_id`) |
| `team1_id` | ObjectId → Team | **الشكل التاني**: الفريقين الاتنين على المنصة |
| `team2_id` | ObjectId → Team | |

> لازم **واحد بس** من الشكلين: إما `team_id`، أو `team1_id` + `team2_id` مع بعض (ومختلفين).
> أي خليط → `400`.

### قواعد التكامل (Integrity)

- `player-progress`: الـ action لازم يكون موجود في الداتابيز المركزية، و**نفس لعبة اللاعب**،
  وفريق اللاعب لازم يكون **لعب الماتش ده** فعلاً.
- **مش مسموح تحذف Team** عنده players أو matches → `409`.
- **مش مسموح تحذف Player** عنده player-progress → `409`.
- **مش مسموح تحذف Match** عنده player-progress → `409`.
- **مش مسموح تحذف/تعدّل cart** اتعملّه checkout → `409`.
- `team.players` بيتزامن تلقائيًا مع أي إضافة/تعديل/حذف لاعب.

### الـ Endpoints

كل الـ routes دي تحت `/api/tenant`، بتتحدد من الـ subdomain، و**محتاجة
`Authorization: Bearer <tenant token>`** (ما عدا `/api/tenant/auth/login`):

| Method | Path | Description |
|---|---|---|
| GET | `/api/tenant/info` | بيانات النادي + الاشتراك + اسم الـ database + الإعدادات + عدد المستندات |
| GET | `/api/tenant/settings` | إعدادات النادي (logo + الألوان) |
| PUT / PATCH | `/api/tenant/settings` | تعديل `logo` / `background_color[]` / `color[]` |
| POST | `/api/tenant/settings/logo` | رفع اللوجو (`multipart/form-data` - field: `image`) |
| GET/POST/PUT/PATCH/DELETE | `/api/tenant/teams` (+`/select`, `/:id`, `/bulk-delete`, `/bulk`) | الفرق — فلتر `?game_id=` |
| GET/POST/PUT/PATCH/DELETE | `/api/tenant/players` (+`/:id`, `/bulk-delete`, `/bulk`) | اللاعبين — فلتر `?team_id=` / `?game_id=` |
| GET/POST/PUT/PATCH/DELETE | `/api/tenant/matches` (+`/:id`, `/bulk-delete`, `/bulk`) | الماتشات — فلتر `?team_id=`, `?team1_id=`, `?team2_id=`, `?from=`, `?to=` |
| GET/POST/PUT/PATCH/DELETE | `/api/tenant/player-progress` (+`/:id`, `/bulk-delete`, `/bulk`) | فلتر `?match_id=`, `?player_id=`, `?action_id=` |
| GET/POST/PUT/PATCH/DELETE | `/api/tenant/cart` (+`/:id`, `/bulk-delete`, `/bulk`) | سلة الاشتراك |
| POST | `/api/tenant/cart/:id/checkout` | تحويل السلة لأوردر مركزي `pending` |
| POST | `/api/tenant/cart/:id/payment-proof` | رفع إثبات الدفع للسلة (`multipart/form-data`) |
| GET | `/api/tenant/packages` (+`/:id`) | تصفح الباكدجات المتاحة مع مددها وأسعارها والخصومات |
| GET | `/api/tenant/payment-methods` | طرق الدفع المتاحة وتعليمات التحويل |
| GET | `/api/tenant/orders` (+`/:id`) | قائمة أوردرات واشتراكات النادي وحالتها |
| POST | `/api/tenant/orders` | شراء باكدج فوري (Direct Purchase) بدون خطوات سلة وسيطة |
| POST | `/api/tenant/orders/:id/payment-proof` | رفع إيصال الدفع للأوردر (`multipart/form-data`) |
| GET | `/api/tenant/orders/:id/invoice` | فاتورة تفصيلية بصيغة JSON (أو `?format=html`) |
| GET | `/api/tenant/orders/:id/invoice/html` | فاتورة HTML احترافية جاهزة للطباعة والحفظ كـ PDF |
| POST | `/api/tenant/uploads` | رفع صورة عامة |

وراوتس الفاتورة للسوبر أدمن (`/api/orders`):
| Method | Path | Description |
|---|---|---|
| GET | `/api/orders/:id/invoice` | فاتورة أي أوردر للسوبر أدمن بصيغة JSON |
| GET | `/api/orders/:id/invoice/html` | فاتورة أي أوردر للسوبر أدمن كصفحة HTML قابلة للطباعة |

وراوتس السوبر أدمن للتينانت:

| Method | Path | Description |
|---|---|---|
| GET | `/api/clubs/:id/tenant` | اسم الـ database + عدد المستندات في كل collection |
| POST | `/api/clubs/:id/tenant/init` | إنشاء الـ indexes + document الإعدادات الافتراضي + أول أدمن |
| POST | `/api/clubs/:id/tenant/reset-admin` | **نسيت الباسورد:** reset لباسورد أدمن النادي (السوبر أدمن بس) |

### نسيت باسورد النادي (Reset من السوبر أدمن)

لو النادي نسي الباسورد، السوبر أدمن بيعمل reset من غير ما يفتح الـ database:

```http
POST /api/clubs/<clubId>/tenant/reset-admin
Authorization: Bearer <super-admin-token>
{ }
```

- من غير أي body → بيستهدف `admin@<subdomain>.com`، وبيعمل **باسورد عشوائي** ويرجّعه في `data.password` **مرة واحدة**.
- تقدر تحدد حساب معين بـ `admin_id` أو `email`.
- تقدر تحدد باسورد بنفسك: `{ "password": "NewPass@123" }` (6 أحرف على الأقل).
- `{ "activate": true }` بيفعّل الحساب كمان لو كان متعطّل.
- لو النادي **ماعندوش ولا حساب**، الـ endpoint بينشئ الأدمن الافتراضي بباسورد جديد (`created: true`).
- **كل التوكنات القديمة بتتلغي فورًا** بعد الـ reset (بيتقارن `password_version` في التوكن مع اللي في الـ database).

```json
{
  "data": {
    "club": { "name": "Al Ahly", "subdomain": "ahly", "database": "ahly" },
    "admin": { "email": "admin@ahly.com", "role": "admin", "status": true },
    "password": "Xk3vQ9tRm2Lp",
    "generated": true,
    "created": false
  }
}
```

> ابعت الباسورد للنادي بطريقة آمنة، وخلّيه يغيّره فورًا من
> `PUT /api/tenant/auth/change-password`.

### أمثلة

```bash
# 1) دخول النادي على الـ subdomain بتاعه
TOKEN=$(curl -s -X POST http://localhost:4000/api/tenant/auth/login \
  -H "Content-Type: application/json" \
  -H "x-subdomain: ahly" \
  -d '{"email":"admin@ahly.com","password":"123456"}' | jq -r '.data.token')

# 2) معلومات النادي (على localhost بنستخدم الهيدر)
curl http://localhost:4000/api/tenant/info \
  -H "x-subdomain: ahly" -H "Authorization: Bearer $TOKEN"

# نفس الحاجة بـ wildcard host في production
curl https://ahly.example.com/api/tenant/info -H "Authorization: Bearer $TOKEN"
```

```json
// POST /api/tenant/cart  →  الأسعار بتتحسب من الباكدج
{ "package_id": "<packageId>", "cycle_id": "<cycleId>" }
```

```json
// POST /api/tenant/matches  →  فريقين على المنصة
{ "name": "League Round 1", "date": "2026-10-01", "team1_id": "<teamA>", "team2_id": "<teamB>" }
```

```json
// POST /api/tenant/matches  →  فريقنا ضد فريق برّه
{ "name": "Friendly", "date": "2026-10-05", "team_id": "<teamA>", "opponent_name": "Cairo Stars" }
```

### `npm run seed:tenant`

بيعبّي database كل نادي ببيانات واقعية (idempotent):

- فريقين: `First Team` + `U18`
- 8 لاعبين لكل فريق (طول/وزن/سن حسب نوع اللعبة)
- 6 ماتشات (الشكلين الاتنين)
- 12 صف `player-progress` لكل ماتش
- ألوان النادي (`background_color` + `color`)
- أدمن افتراضي `admin@<subdomain>.com` لو النادي لسه ماعندوش حسابات

```bash
npm run seed:tenant                # كل النوادي
npm run seed:tenant -- ahly        # نادي واحد
npm run seed:tenant -- ahly zamalek
```

---

## 6. Business Rules & Guards

- **مش مسموح تحذف Game** لسه مرتبطة بـ Actions أو Packages → `409`.
- **مش مسموح تحذف Package** مربوطة بـ Club أو Orders → `409`.
- **مش مسموح تحذف Club** عنده Orders → `409` (الأفضل تعملها `status=false`).
- **مش مسموح تحذف Payment Method** مستخدمة في Orders → `409`.
- تكرار `name` / `subdomain` / `game+action name` / `game+package name` → `409`.
- **مش مسموح تحذف Order** اتطبق على اشتراك نادي → `409` (حتى في الـ bulk delete).
- **مش مسموح ترجّع Order** من `paid` لـ `refunded`/`cancelled` بعد ما اتطبق → `409`.
- **الأوردر بيفضل `pending` لحد موافقة السوبر أدمن**. `approve` بس هو اللي بيحوله `paid` ويجدد الاشتراك.
- **الرفض لازم سبب** (`reason`) ومش بيلمس اشتراك النادي → `rejected`.
- مينفعش `approve`/`reject` لأوردر مش `pending` → `409`.
- `discount > price` في الأوردر → `400`.
- `end_date < start_date` في النادي → `400`.
- **فترة السماح (`allowed_days`)**: النادي بيفضل `grace` بعد `end_date` لحد ما `allowed_days` تخلص، وبعدها `expired`.
- **الغرامة (`fines`)**: بتتطبق تلقائيًا على أي أوردر جديد لنادي في `grace` أو `expired` لو `fine` مش مبعوت.
- **التجديد**: الأوردر الـ `paid` بيمدد `end_date` بمقدار `months` بتاع الـ cycle **مرة واحدة بس**.
- `settings` المركزي **global للسوبر أدمن**. إعدادات كل نادي (لوجو + ألوان) في collection
  `settings` جوه database النادي نفسه.
- **مش مسموح تحذف Team** عنده players/matches، ولا Player/Match عنده `player-progress` → `409`.
- **مش مسموح تعدّل/تحذف cart** اتعملّه checkout → `409`.
- `player-progress` بيرفض لو الـ action من لعبة تانية أو فريق اللاعب ملعبش الماتش → `400`.
- **الـ Tenant API بيسمح بـ `active` + `grace` بس**؛ الباقي `403` مع قائمة الباكدجات.

---

## 7. هيكل المشروع

```
src/
├── app.ts                  # Express app (middlewares + routes)
├── server.ts               # Bootstrap + graceful shutdown
├── config/
│   ├── env.ts              # Environment validation
│   ├── db.ts               # MongoDB connection
│   ├── tenant.ts           # Tenant database resolution (subdomain -> db) + stats
│   └── upload.ts           # Multer storage + file helpers
├── models/                 # Mongoose schemas (central database)
│   ├── Game.ts  Action.ts  Package.ts  Club.ts
│   ├── Order.ts  PaymentMethod.ts  Settings.ts  SuperAdmin.ts  Counter.ts
│   └── tenant/             # Per-connection tenant models
│       ├── Team.ts  TeamPlayer.ts  Match.ts  PlayerProgress.ts
│       ├── Cart.ts  TenantSettings.ts
│       └── index.ts        # getTenantModels + ensureTenantIndexes
├── controllers/            # Request handlers (super admin)
│   ├── tenant/             # Tenant handlers (info, settings, teams, players, matches...)
│   └── tenantAdmin.controller.ts
├── routes/                 # Express routers
│   └── tenant/             # /api/tenant router
├── validators/             # Zod schemas (+ validators/tenant/)
├── middlewares/
│   ├── auth.ts             # authenticate + authorize
│   ├── tenant.ts           # Wildcard subdomain + subscription gate
│   ├── validate.ts
│   ├── errorHandler.ts
│   └── notFound.ts
├── services/               # bootstrap, seeds, subscriptions, order numbers, tenant cart/seed
├── utils/                  # response, jwt, pagination, pricing, helpers
└── scripts/
    ├── seed.ts             # bootstrap (+ optional demo data)
    ├── seed-real.ts        # realistic central data
    ├── seed-tenant.ts      # realistic tenant data
    └── check-db.ts
uploads/                    # local uploaded images (gitignored)
test/smoke.ts               # E2E smoke test (in-memory MongoDB)
test/live-check.ts          # Live check + upload test against the real database
```

---

## 8. أمثلة سريعة

### Login
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gmail.com","password":"YourStrongPass123"}'
```

### إنشاء باكدج
```json
POST /api/packages
{
  "name": "Pro",
  "game_id": "<gameId>",
  "teams": 3,
  "players": 25,
  "cycles": [
    { "name": "Monthly", "discount_type": "percentage", "discount": 0, "price": 900, "months": 1 },
    { "name": "Annual", "discount_type": "percentage", "discount": 20, "price": 8640, "months": 12 },
    { "name": "Ramadan offer", "discount_type": "amount", "discount": 200, "price": 900, "months": 1 }
  ]
}
```

### إنشاء نادي
```json
POST /api/clubs
{
  "name": "Cairo Club",
  "subdomain": "cairo-club",
  "package_id": "<packageId>",
  "start_date": "2026-01-01",
  "end_date": "2027-01-01"
}
```

### إنشاء أوردر من cycle (بإثبات الدفع)
```json
POST /api/orders
{
  "club_id": "<clubId>",
  "package_id": "<packageId>",
  "cycle_id": "<cycleId>",
  "payment_method_id": "<paymentMethodId>",
  "payment_proof": "https://cdn.example.com/proofs/receipt-1.jpg",
  "payment_reference": "BANK-99881",
  "status": "pending"
}
```
الـ `price` هيتاخد من الـ cycle، والـ `discount` هيتحسب حسب `discount_type`
(نسبة أو مبلغ)، والـ `final_price` هيتحسب تلقائيًا، والـ `order_number` بيتولد تلقائيًا.
الأوردر بيفضل `pending` لحد ما السوبر أدمن يوافق.

### موافقة السوبر أدمن على الدفع
```json
POST /api/orders/<orderId>/approve
{
  "notes": "Payment proof verified"
}
```
→ الحالة `paid` + تسجيل `approved_by` / `approved_at` + تجديد اشتراك النادي.

### رفض الدفع
```json
POST /api/orders/<orderId>/reject
{
  "reason": "Receipt is unreadable"
}
```
→ الحالة `rejected`، والاشتراك مش بيتأثر.

### الداشبورد
```bash
GET /api/dashboard?months=12
```
بيرجع الإحصائيات + الإيرادات الشهرية + أفضل الباكدجات + آخر الأوردرات + النوادي اللي هتنتهي قريب.

---

## 9. الخطوة الجاية (مقترحة)

1. **تقارير ومؤشرات اللاعبين** من `player-progress` (aggregations لكل ماتش/لاعب/أكشن).
2. **Cron** للتنبيهات (قبل انتهاء الاشتراك / بعد دخول grace) باستخدام `notification` من Settings.
   التجديد نفسه بقى تلقائي بعد موافقة السوبر أدمن.
3. **Wildcard DNS + SSL** في production (`*.example.com`) عشان الـ subdomain يشتغل من غير هيدر.
4. **Refresh tokens / revoke** لو عايز تتحكم في الجلسات بدقة أكتر (دلوقتي JWT stateless).
