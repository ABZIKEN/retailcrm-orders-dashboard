# Setup

## Что уже лежит в репозитории

- `index.html`
- `supabase/import-orders/index.ts`
- `supabase/import-orders/mock_orders.ts`
- `supabase/sync-orders/index.ts`

## Что нужно для Supabase

### Secrets для import-orders
- `RETAILCRM_BASE_URL`
- `RETAILCRM_API_KEY`
- `RETAILCRM_SITE_CODE`

### Secrets для sync-orders
- `RETAILCRM_BASE_URL`
- `RETAILCRM_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

## Что нужно для дашборда

Открой `index.html` и вставь:
- `Project URL`
- `anon key`

## Как задеплоить на Vercel

1. Открой Vercel
2. Нажми `Add New...` → `Project`
3. Подключи GitHub
4. Выбери `ABZIKEN/retailcrm-orders-dashboard`
5. Нажми `Deploy`

Так как проект статический, дополнительных build settings не нужно.
