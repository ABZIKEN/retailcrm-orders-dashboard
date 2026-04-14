import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { mockOrders } from "./mock_orders.ts";

const RETAILCRM_BASE_URL = Deno.env.get("RETAILCRM_BASE_URL") ?? "";
const RETAILCRM_API_KEY = Deno.env.get("RETAILCRM_API_KEY") ?? "";
const RETAILCRM_SITE_CODE = Deno.env.get("RETAILCRM_SITE_CODE") ?? "";

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type MockItem = {
  productName: string;
  quantity: number;
  initialPrice: number;
};

type MockOrder = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  orderType: string;
  orderMethod: string;
  status: string;
  items: MockItem[];
  delivery?: {
    address?: {
      city?: string;
      text?: string;
    };
  };
  customFields?: Record<string, string>;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateTotal(items: MockItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.initialPrice, 0);
}

function buildRetailCrmOrder(order: MockOrder, index: number) {
  const total = calculateTotal(order.items);

  return {
    site: RETAILCRM_SITE_CODE,
    order: {
      externalId: `mock-${String(index + 1).padStart(3, "0")}`,
      number: `TEST-${String(index + 1).padStart(3, "0")}`,
      firstName: order.firstName,
      lastName: order.lastName,
      phone: order.phone,
      email: order.email,
      orderType: order.orderType,
      orderMethod: order.orderMethod,
      status: order.status,
      items: order.items.map((item) => ({
        initialPrice: item.initialPrice,
        quantity: item.quantity,
        productName: item.productName,
      })),
      delivery: {
        address: {
          city: order.delivery?.address?.city ?? "",
          text: order.delivery?.address?.text ?? "",
        },
      },
      customFields: order.customFields ?? {},
      totalSumm: total,
      createdAt: new Date(Date.now() - index * 86400000).toISOString(),
    },
  };
}

async function createOrder(order: MockOrder, index: number) {
  const payload = buildRetailCrmOrder(order, index);
  const body = new URLSearchParams();
  body.set("apiKey", RETAILCRM_API_KEY);
  body.set("site", RETAILCRM_SITE_CODE);
  body.set("order", JSON.stringify(payload.order));

  const response = await fetch(`${RETAILCRM_BASE_URL}/api/v5/orders/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      "X-API-KEY": RETAILCRM_API_KEY,
    },
    body: body.toString(),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`RetailCRM HTTP ${response.status}: ${text}`);
  }

  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`RetailCRM returned invalid JSON: ${text}`);
  }

  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!RETAILCRM_BASE_URL || !RETAILCRM_API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing RETAILCRM_BASE_URL or RETAILCRM_API_KEY" }),
        { status: 500, headers: corsHeaders },
      );
    }

    const results = [];
    let imported = 0;
    let failed = 0;

    for (let i = 0; i < mockOrders.length; i++) {
      const order = mockOrders[i] as MockOrder;
      const total = calculateTotal(order.items);
      const externalId = `mock-${String(i + 1).padStart(3, "0")}`;
      const number = `TEST-${String(i + 1).padStart(3, "0")}`;

      try {
        const data = await createOrder(order, i);
        imported += 1;
        results.push({ externalId, number, total, ok: true, data });
      } catch (error) {
        failed += 1;
        results.push({
          externalId,
          number,
          total,
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }

      await sleep(150);
    }

    return new Response(
      JSON.stringify({ ok: failed === 0, imported, failed, results }, null, 2),
      { status: 200, headers: corsHeaders },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: corsHeaders },
    );
  }
});
