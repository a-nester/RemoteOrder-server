#!/bin/bash

# Скрипт для швидкого деплоймену на Render.com

echo "🚀 Підготовка до деплоймену на Render.com"
echo ""

# Перевірка git
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Не знаходится у git репозиторії"
    exit 1
fi

# Git commit
echo "📝 Комітуємо зміни..."
git add .
git commit -m "Prepare for Render deployment" || echo "Нічого комітувати"

# Git push
echo "📤 Пушимо на GitHub..."
git push origin main

echo ""
echo "✅ Готово до деплоймену!"
echo ""
echo "📋 Наступні кроки:"
echo "1. Перейдіть на https://render.com"
echo "2. Натисніть 'New +' → 'Web Service'"
echo "3. Оберіть ваш GitHub репозиторій"
echo "4. Заповніть форму:"
echo "   - Name: remoteorder-server"
echo "   - Environment: Node"
echo "   - Build Command: npm install && npx prisma generate && npm run build"
echo "   - Start Command: npx prisma migrate deploy && npm start"
echo "5. Додайте DATABASE_URL у Environment змінних"
echo ""
echo "📚 Див. DEPLOYMENT.md для детальних інструкцій"
