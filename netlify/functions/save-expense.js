// netlify/functions/save-expense.js
export default async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), {
        status: 405, headers: { "Content-Type": "application/json" }
      });
    }

    // simple shared-secret check so only Letta can call this
    const secret =
      req.headers.get("x-letta-tool-secret") ||
      req.headers.get("X-Letta-Tool-Secret");
    if (!secret || secret !== process.env.LETTA_TOOL_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json" }
      });
    }

    const body = await req.json(); // what Letta sends
    const {
      date, amount, currency = "INR",
      category, description = null,
      user_email = null, user_id = null,
      household_id, source = "letta-tool"
    } = body || {};

    if (!date || !amount || !category || !household_id) {
      return new Response(JSON.stringify({
        error: "missing fields",
        required: ["date","amount","category","household_id"]
      }), { status: 400, headers: { "Content-Type": "application/json" }});
    }

    // insert into Supabase via REST (no extra packages needed)
    const url = `${process.env.SUPABASE_URL}/rest/v1/expenses`;
    const payload = [{
      household_id, user_id, user_email,
      date, amount, currency, category, description, source
    }];

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Prefer": "return=representation"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: `Supabase error: ${text}` }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }

    const inserted = await res.json();
    return new Response(JSON.stringify({ ok: true, row: inserted?.[0] || null }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
};
