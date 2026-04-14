import { createClient } from 'npm:@supabase/supabase-js@2'

const RETAILCRM_BASE_URL = (Deno.env.get('RETAILCRM_BASE_URL') || '').replace(/\/$/, '')
const RETAILCRM_API_KEY = Deno.env.get('RETAILCRM_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || ''
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID') || ''

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function getStatusCode(status: unknown): string | null {
  if (!status) return null
  if (typeof status === 'string') return status
  if (typeof status === 'object' && status !== null && 'code' in status) {
    const code = (status as Record<string, unknown>).code
    return typeof code === 'string' ? code : null
  }
  return null
}

function getCustomerField(order: Record<string, unknown>, field: string): string | null {
  const direct = order[field]
  if (typeof direct === 'string' && direct.trim()) return direct.trim()

  const customer = order.customer
  if (customer && typeof customer === 'object') {
    const value = (customer as Record<string, unknown>)[field]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  return null
}

function getPhone(order: Record<string, unknown>): string | null {
  const direct = order.phone
  if (typeof direct === 'string' && direct.trim()) return direct.trim()

  const customer = order.customer
  if (customer && typeof customer === 'object') {
    const c = customer as Record<string, unknown>

    if (typeof c.phone === 'string' && c.phone.trim()) return c.phone.trim()

    const phones = c.phones
    if (Array.isArray(phones)) {
      for (const item of phones) {
        if (typeof item === 'string' && item.trim()) return item.trim()
        if (item && typeof item === 'object') {
          const number = (item as Record<string, unknown>).number
          if (typeof number === 'string' && number.trim()) return number.trim()
        }
      }
    }
  }

  return null
}

function getEmail(order: Record<string, unknown>): string | null {
  const direct = order.email
  if (typeof direct === 'string' && direct.trim()) return direct.trim()

  const customer = order.customer
  if (customer && typeof customer === 'object') {
    const c = customer as Record<string, unknown>

    if (typeof c.email === 'string' && c.email.trim()) return c.email.trim()

    const emails = c.emails
    if (Array.isArray(emails)) {
      for (const item of emails) {
        if (typeof item === 'string' && item.trim()) return item.trim()
        if (item && typeof item === 'object') {
          const address = (item as Record<string, unknown>).address
          if (typeof address === 'string' && address.trim()) return address.trim()
        }
      }
    }
  }

  return null
}

function getAddress(order: Record<string, unknown>): { city: string | null; address: string | null } {
  const delivery = order.delivery && typeof order.delivery === 'object'
    ? order.delivery as Record<string, unknown>
    : null

  const addressObj = delivery?.address && typeof delivery.address === 'object'
    ? delivery.address as Record<string, unknown>
    : null

  const city = typeof addressObj?.city === 'string' && addressObj.city.trim()
    ? addressObj.city.trim()
    : null

  const text = typeof addressObj?.text === 'string' && addressObj.text.trim()
    ? addressObj.text.trim()
    : null

  return { city, address: text }
}

function getUtmSource(order: Record<string, unknown>): string | null {
  const customFields = order.customFields
  if (customFields && typeof customFields === 'object') {
    const cf = customFields as Record<string, unknown>
    const direct = cf.utm_source ?? cf.utmSource
    if (typeof direct === 'string' && direct.trim()) return direct.trim()
  }
  return null
}

function calcTotals(order: Record<string, unknown>): { totalAmount: number; itemsCount: number } {
  const items = Array.isArray(order.items) ? order.items : []

  let totalAmount = 0
  let itemsCount = 0

  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== 'object') continue
    const item = rawItem as Record<string, unknown>

    const quantity = Number(item.quantity ?? 0)
    const price = Number(item.initialPrice ?? item.price ?? 0)

    if (Number.isFinite(quantity)) itemsCount += quantity
    if (Number.isFinite(quantity) && Number.isFinite(price)) totalAmount += quantity * price
  }

  const retailcrmTotal = Number(order.totalSumm ?? order.summ ?? 0)
  if (Number.isFinite(retailcrmTotal) && retailcrmTotal > 0) totalAmount = retailcrmTotal

  return { totalAmount, itemsCount }
}

function normalizeOrder(rawOrder: Record<string, unknown>) {
  const { city, address } = getAddress(rawOrder)
  const { totalAmount, itemsCount } = calcTotals(rawOrder)

  const createdAtRaw = rawOrder.createdAt
  const createdAt = typeof createdAtRaw === 'string' && createdAtRaw.trim()
    ? new Date(createdAtRaw).toISOString()
    : new Date().toISOString()

  return {
    retailcrm_id: typeof rawOrder.id === 'number' ? rawOrder.id : Number(rawOrder.id ?? 0) || null,
    external_id: typeof rawOrder.externalId === 'string' && rawOrder.externalId.trim()
      ? rawOrder.externalId.trim()
      : null,
    number: typeof rawOrder.number === 'string' ? rawOrder.number : null,
    created_at: createdAt,
    status: getStatusCode(rawOrder.status),
    first_name: getCustomerField(rawOrder, 'firstName'),
    last_name: getCustomerField(rawOrder, 'lastName'),
    phone: getPhone(rawOrder),
    email: getEmail(rawOrder),
    city,
    address,
    total_amount: totalAmount,
    currency: typeof rawOrder.currency === 'string' && rawOrder.currency.trim() ? rawOrder.currency.trim() : 'KZT',
    items_count: itemsCount,
    utm_source: getUtmSource(rawOrder),
    raw: rawOrder,
    synced_at: new Date().toISOString(),
  }
}

async function fetchRetailCrmOrders(page: number, limit: number) {
  const url = new URL(`${RETAILCRM_BASE_URL}/api/v5/orders`)
  url.searchParams.set('page', String(page))
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('apiKey', RETAILCRM_API_KEY)

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-API-KEY': RETAILCRM_API_KEY,
    },
  })

  const text = await response.text()
  let data: Record<string, unknown>

  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`RetailCRM returned non-JSON response: ${text}`)
  }

  if (!response.ok) {
    throw new Error(`RetailCRM HTTP ${response.status}: ${text}`)
  }

  return data
}

async function sendTelegramMessage(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return { ok: false, skipped: true }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
    }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(`Telegram HTTP ${response.status}: ${JSON.stringify(data)}`)
  }

  return data
}

Deno.serve(async (req) => {
  try {
    if (!RETAILCRM_BASE_URL || !RETAILCRM_API_KEY) {
      return jsonResponse({ ok: false, error: 'Missing RETAILCRM_BASE_URL or RETAILCRM_API_KEY' }, 500)
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500)
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const limit = Number((body as Record<string, unknown>).limit ?? 50)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    let page = 1
    let totalPages = 1
    let totalFetched = 0
    let totalSaved = 0
    const pageStats: Array<{ page: number; fetched: number; saved: number }> = []

    while (page <= totalPages) {
      const data = await fetchRetailCrmOrders(page, limit)

      const orders = Array.isArray(data.orders) ? data.orders : []
      const pagination = data.pagination && typeof data.pagination === 'object'
        ? data.pagination as Record<string, unknown>
        : {}

      totalPages = Number(pagination.totalPageCount ?? 1) || 1
      totalFetched += orders.length

      const normalized = orders
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map(normalizeOrder)
        .filter((item) => item.external_id)

      if (normalized.length > 0) {
        const { error } = await supabase
          .from('orders')
          .upsert(normalized, { onConflict: 'external_id' })

        if (error) throw new Error(`Supabase upsert error on page ${page}: ${error.message}`)
      }

      totalSaved += normalized.length
      pageStats.push({ page, fetched: orders.length, saved: normalized.length })
      page += 1
    }

    const { data: alertsToSend, error: alertsError } = await supabase
      .from('orders')
      .select('id, number, first_name, last_name, city, total_amount, utm_source, notification_sent')
      .gt('total_amount', 50000)
      .eq('notification_sent', false)

    if (alertsError) {
      throw new Error(`Supabase alerts query error: ${alertsError.message}`)
    }

    const alerts = []

    for (const order of alertsToSend ?? []) {
      const clientName = [order.first_name, order.last_name].filter(Boolean).join(' ') || 'Без имени'
      const text = [
        'Новый крупный заказ',
        `Номер: ${order.number ?? '—'}`,
        `Клиент: ${clientName}`,
        `Сумма: ${order.total_amount ?? 0} ₸`,
        `Город: ${order.city ?? '—'}`,
        `Источник: ${order.utm_source ?? '—'}`,
      ].join('\n')

      const telegramResult = await sendTelegramMessage(text)

      const { error: updateError } = await supabase
        .from('orders')
        .update({ notification_sent: true })
        .eq('id', order.id)

      if (updateError) {
        throw new Error(`Supabase notification update error: ${updateError.message}`)
      }

      alerts.push({
        number: order.number,
        total_amount: order.total_amount,
        sent: true,
        telegramResult,
      })
    }

    return jsonResponse({
      ok: true,
      fetched: totalFetched,
      saved: totalSaved,
      pages: pageStats,
      alerts,
    })
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    )
  }
})
