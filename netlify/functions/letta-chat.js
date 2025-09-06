// netlify/functions/letta-chat.js
export default async (req, context) => {
  try {
    // 1) Only POST allowed
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), {
        status: 405,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2) Parse body
    let bodyJson;
    try {
      bodyJson = await req.json();
    } catch (e) {
      console.error("Bad request body (not JSON):", e?.message || e);
      return new Response(JSON.stringify({ error: "Body must be JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { message, identifier } = bodyJson || {};
    if (!message || !identifier) {
      console.error("Missing fields:", { hasMessage: !!message, hasIdentifier: !!identifier });
      return new Response(JSON.stringify({ error: "message and identifier required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 3) Environment variables
    const LETTA_API_KEY = process.env.LETTA_API_KEY;
    const LETTA_AGENT_ID = process.env.LETTA_AGENT_ID;
    if (!LETTA_API_KEY || !LETTA_AGENT_ID) {
      console.error("Server not configured: missing LETTA_API_KEY or LETTA_AGENT_ID");
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 4) Call Letta with the correct schema
    const url = `https://api.letta.com/v1/agents/${LETTA_AGENT_ID}/messages`; // ✅ use .com

    const headers = {
      Authorization: `Bearer ${LETTA_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "finhippo-netlify-fn/1.0"
    };

    const body = {
      messages: [
        {
          role: "user",
          content: message // ✅ plain string content
        }
      ],
      user: { identifier_key: identifier }
    };

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Letta API error:", res.status, text);
      return new Response(JSON.stringify({ error: `Letta error (status ${res.status}): ${text}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await res.json();

    // 5) Extract assistant reply (safe fallback)
    const assistantMsg = (data.messages || []).reverse().find(m => m.role === "assistant");
    const reply =
      (Array.isArray(assistantMsg?.content)
        ? assistantMsg.content.map(p => p?.text || p).filter(Boolean).join("\n")
        : assistantMsg?.content) ||
      data?.message?.content?.text ||
      data?.output?.text ||
      data?.text ||
      JSON.stringify(data);

    return new Response(JSON.stringify({ reply, raw: data }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (e) {
    console.error("Function crash:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
