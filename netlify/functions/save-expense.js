// netlify/functions/save-expense.js
export default async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), {
        status: 405, headers: { "Content-Type": "application/json" }
      });
    }

    // Basic shared-secret check so only your Letta tool can call this
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token || token !== process.env.TOOL_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json" }
      });
    }

    const body = await req.json();

    // Required fields from the tool call
    const {
      date,            // "YYYY-MM-DD" (or "DD-MM-YYYY" — we normalize)
      amount,          // number
      currency = "INR",
      category = "Miscellaneous",
      description = null,
      user_email,      // email string (the signed-in user)
      household_id = "home-001" // MVP default; you can override later
    } = body || {};

    if (!date || !amount || !user_email) {
      return new Response(JSON.stringify({ error: "Missing fields: date, amount, user_email" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }

    // Normalize date if DD-MM-YYYY
    let isoDate = date;
    if (/^\d{2}-\d{2}-\d{4}$/.test(date)) {
      const [dd, mm, yyyy] = date.split("-");
      isoDate = `${yyyy}-${mm}-${dd}`;
    }

    // Build row for your "expenses" table
    const row = {
      household_id,
      user_email,
      date: isoDate,
      amount: Number(amount),
      currency,
      category,
      description,
      source: "text"   // keep your existing convention
    };

    const SUPABASE_URL = process.env.SUPABASE_URL;                   // e.g. https://xxxx.supabase.co
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;   // service role key
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }

    // Insert via Supabase REST
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/expenses`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(row)
    });

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(JSON.stringify({ error: `Supabase error: ${text}` }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }

    const data = await resp.json();  // inserted row(s)
    return new Response(JSON.stringify({ ok: true, row: data?.[0] || null }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
};
