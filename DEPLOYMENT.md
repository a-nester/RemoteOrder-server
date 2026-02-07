# Деплоймент на Render.com

## 📋 Передумови

1. GitHub репозиторій з проектом
2. Обліковий запис Render.com (https://render.com)

## 🚀 Крок 1: Готування Git репозиторію

Переконайтесь, що все закомічено:

```bash
git add .
git commit -m "Setup for Render deployment"
git push origin main
```

## 🌍 Крок 2: Підключення на Render.com

### 2.1 Вхід до Render.com
- Перейдіть на https://render.com
- Увійдіть через GitHub (рекомендується)

### 2.2 Створення нового веб-сервісу
1. Нажміть **"New +"** → **"Web Service"**
2. Обираємо ваш репозиторій
3. Натисніть **"Connect"**

### 2.3 Конфігурація сервісу

Заповніть форму:

| Поле | Значення |
|------|----------|
| **Name** | `remoteorder-server` |
| **Environment** | `Node` |
| **Region** | Выберіть найближчий |
| **Branch** | `main` |
| **Build Command** | `npm install && npx prisma generate && npm run build` |
| **Start Command** | `npx prisma migrate deploy && node dist/index.js` |

⚠️ **ВАЖЛИВО**: Встановіть Start Command у **Settings** → **Build & Deploy** після створення сервісу!

### 2.4 Обирання плану
- Виберіть **Free** (або більший за потреби)
- Натисніть **"Create Web Service"**

## 🗄️ Крок 3: Додавання PostgreSQL БД

### 3.1 Створення БД
1. На сторінці сервісу, натисніть на **"Environment"**
2. Прокрутіть вниз до **"Databases"**
3. Натисніть **"Create Database"**
4. Обирайте параметри:
   - **Name**: `remoteorder-db`
   - **Database**: `remoteorder`
   - **User**: `remoteorder_user`
   - **Region**: Такий же як сервіс
   - **Version**: PostgreSQL 15
5. Натисніть **"Create Database"**

### 3.2 Отримання CONNECTION STRING
1. Перейдіть на сторінку БД
2. Скопіюйте **Internal Database URL** (для сервісів на Render)
   - Або **External Database URL** (для локального тестування)

## 🔧 Крок 4: Налаштування Environment змінних

1. На сторінці Web Service перейдіть у **Environment**
2. Натисніть **"Add Environment Variable"**
3. Додайте змінні:

```
DATABASE_URL = postgresql://user:password@...render.com/remoteorder
NODE_ENV = production
```

**Render автоматично встановлює PORT, тому не потрібно додавати вручну**

### ⭐ КРИТИЧНО: Встановіть Start Command

1. Перейдіть у **Settings** 
2. Знайдіть **Build & Deploy**
3. У полі **Start Command** введіть:
   ```
   npx prisma migrate deploy && node dist/index.js
   ```
4. Натисніть **Save**

## 5️⃣ Крок 5: Розгортання

1. На сторінці Web Service натисніть **"Deploy latest commit"**
2. Слідкуйте за процесом у **Logs**
3. Очікуйте повідомлення: `"Server is running on port..."`

## ✅ Крок 6: Тестування

### Перевірка здоров'я сервера:
```bash
curl https://remoteorder-server.onrender.com/health
```

### Тестування Pull:
```bash
curl -X POST https://remoteorder-server.onrender.com/api/sync/pull \
  -H "Content-Type: application/json" \
  -d '{"userId":"test123","lastSync":"2024-01-01T00:00:00Z"}'
```

## 🔄 Автоматичні переділення (Auto-Deploy)

Render автоматично переділює при push до `main` гілки.

Щоб вимкнути, перейдіть у **Settings** → **Deploy** → **Auto-Deploy** → **Off**

## 📊 Моніторинг

- **Логи**: Dashboard → Logs
- **Метрики**: Dashboard → Metrics
- **БД**: Database Dashboard

## ⚠️ Рекомендації для Production

```env
# На Render.com встановіть:
NODE_ENV=production
LOG_LEVEL=warn
```

### Оновлення схеми БД
Якщо обновити schema.prisma:
```bash
npx prisma migrate dev --name your_migration_name
git push origin main
# Render автоматично запустить: npx prisma migrate deploy
```

## 🆘 Поточні проблеми

### "Can't reach database"
- Перевірте DATABASE_URL у Environment
- Переконайтесь, що БД була створена
- Перезавантажте сервіс

### "Build failed"
- Перевірте Logs для деталей
- Переконайтесь що npm install проходит успішно
- Скопіюйте package.json з версіями

### Міграції не запускаються
- Переконайтесь що `prisma migrate deploy` у Start Command
- Перевірте права доступу БД користувача

## 📚 Корисні посилання

- Render Docs: https://render.com/docs
- Prisma Deployment: https://www.prisma.io/docs/guides/deployment
- PostgreSQL на Render: https://render.com/docs/databases

## 🎉 Готово!

Ваш сервер тепер запущений та доступний на:
```
https://remoteorder-server.onrender.com
```

API endpoints:
- `POST /api/sync/pull` — Отримати данні
- `POST /api/sync/push` — Надіслати зміни
- `POST /api/sync/full` — Комбінована синхронізація
- `GET /api/sync/status/:userId` — Статус
- `GET /health` — Перевірка здоров'я
