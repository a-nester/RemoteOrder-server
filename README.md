# RemoteOrder Server

Сервер для синхронізації офлайн заказов з React Native мобільного додатка в PostgreSQL.

## Архітектура

```
📱 React Native App (SQLite offline)
        ↓ sync
🌐 Node.js + Express
        ↓ Prisma ORM
🗄️  PostgreSQL (source of truth)
```

## Встановлення

### 1. Установіть залежності
```bash
npm install
```

### 2. Налаштуйте базу даних
Скопіюйте `.env.example` в `.env` і налаштуйте:
```bash
cp .env.example .env
```

Оновіть `DATABASE_URL` у `.env`:
```
DATABASE_URL="postgresql://user:password@localhost:5432/remoteorder"
```

### 3. Мігруйте БД
```bash
npx prisma migrate dev --name init
```

### 4. Генеруйте Prisma Client
```bash
npx prisma generate
```

## Запуск

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

## API Endpoints

### Синхронізація данних

#### 1. Pull (Отримати данні з серверу)
```
POST /api/sync/pull
Body: {
  "userId": "user123",
  "lastSync": "2024-02-07T10:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "order1",
      "userId": "user123",
      "status": "completed",
      "total": 99.99,
      "items": [...],
      "createdAt": "2024-02-07T10:00:00Z",
      "updatedAt": "2024-02-07T10:00:00Z"
    }
  ],
  "timestamp": "2024-02-07T11:00:00Z"
}
```

#### 2. Push (Надіслати зміни на сервер)
```
POST /api/sync/push
Body: {
  "userId": "user123",
  "changes": [
    {
      "id": "order1",
      "operation": "INSERT",
      "data": {
        "status": "pending",
        "total": 99.99,
        "items": [...]
      }
    },
    {
      "id": "order2",
      "operation": "UPDATE",
      "data": {
        "status": "completed"
      }
    },
    {
      "id": "order3",
      "operation": "DELETE",
      "data": {}
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    { "id": "order1", "success": true, "data": {...} },
    { "id": "order2", "success": true, "data": {...} },
    { "id": "order3", "success": true }
  ],
  "timestamp": "2024-02-07T11:00:00Z"
}
```

#### 3. Full Sync (Комбінована операція)
```
POST /api/sync/full
Body: {
  "userId": "user123",
  "lastSync": "2024-02-07T10:00:00Z",
  "changes": [...]
}
```

Одночасно надсилає зміни та отримує оновлені данні.

#### 4. Sync Status
```
GET /api/sync/status/:userId
```

**Response:**
```json
{
  "success": true,
  "lastSyncs": [
    {
      "id": "sync1",
      "userId": "user123",
      "action": "INSERT",
      "table": "Order",
      "recordId": "order1",
      "data": {...},
      "synced": true,
      "createdAt": "2024-02-07T10:00:00Z"
    }
  ]
}
```

### Інші endpoints

#### Health Check
```
GET /health
```

## Структура БД

### User
```prisma
model User {
  id        String
  email     String (unique)
  name      String
  createdAt DateTime
  updatedAt DateTime
}
```

### Order
```prisma
model Order {
  id        String
  userId    String
  status    String
  total     Float
  items     Json (array)
  createdAt DateTime
  updatedAt DateTime
}
```

### SyncLog
```prisma
model SyncLog {
  id        String
  userId    String
  action    String (CREATE, UPDATE, DELETE)
  table     String
  recordId  String
  data      Json
  synced    Boolean
  createdAt DateTime
  updatedAt DateTime
}
```

### OfflineChange
```prisma
model OfflineChange {
  id        String
  deviceId  String
  table     String
  operation String (INSERT, UPDATE, DELETE)
  recordId  String
  data      Json
  timestamp DateTime
  applied   Boolean
}
```

## Примеры использования для мобільного додатка

### React Native (SQLite sync)
```javascript
// 1. Push локальні зміни на сервер
const pushChanges = async (userId, changes) => {
  const response = await fetch('http://localhost:3000/api/sync/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, changes })
  });
  return response.json();
};

// 2. Pull оновлення з сервера
const pullUpdates = async (userId, lastSync) => {
  const response = await fetch('http://localhost:3000/api/sync/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, lastSync })
  });
  return response.json();
};

// 3. Комбінована синхронізація
const fullSync = async (userId, lastSync, changes) => {
  const response = await fetch('http://localhost:3000/api/sync/full', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, lastSync, changes })
  });
  return response.json();
};
```

## Prisma Commands

```bash
# Переглянути БД
npx prisma studio

# Створити міграцію
npx prisma migrate dev --name your_migration_name

# Применить міграції
npx prisma migrate deploy

# Генерувати Client
npx prisma generate

# Reset БД (dev тільки)
npx prisma migrate reset

# Seed БД
npx prisma db seed
```

## Ліцензія
ISC
