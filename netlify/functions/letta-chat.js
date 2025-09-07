// netlify/functions/letta-chat.js
export default async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), {
        status: 405, headers: { "Content-Type": "application/json" }
      });
    }

    // Parse body
    let bodyJson;
    try { bodyJson = await req.json(); }
    catch {
      return new Response(JSON.stringify({ error: "Body must be JSON" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }

    const { message, identifier } = bodyJson || {};
    if (!message || !identifier) {
      return new Response(JSON.stringify({ error: "message and identifier required" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }

    // Env
    const LETTA_API_KEY = process.env.LETTA_API_KEY;
    const LETTA_AGENT_ID = process.env.LETTA_AGENT_ID;
    const DEFAULT_HOUSEHOLD_ID = process.env.DEFAULT_HOUSEHOLD_ID || "unknown";

    if (!LETTA_API_KEY || !LETTA_AGENT_ID) {
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }

    // ---- Add hidden session context as the first message
    const contextLine =
      `SESSION_CONTEXT: user_email=${identifier}; household_id=${DEFAULT_HOUSEHOLD_ID}`;

    const url = `https://api.letta.com/v1/agents/${LETTA_AGENT_ID}/messages`;
    const headers = {
      Authorization: `Bearer ${LETTA_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "finhippo-netlify-fn/1.1"
    };

    const body = {
      messages: [
        // hidden context so the agent knows who/where to save
        {
          type: "message",
          role: "user",
          content: [{ type: "text", text: contextLine }]
        },
        // the actual user message
        {
          type: "message",
          role: "user",
          content: [{ type: "text", text: message }]
        }
      ]
    };

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(
        JSON.stringify({ error: `Letta error (status ${res.status}): ${text}` }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();

    // Prefer the assistant's last message text; safe fallbacks otherwise
    const assistantMsg = (data.messages || []).slice().reverse()
      .find(m => m.role === "assistant");

    const reply =
      (Array.isArray(assistantMsg?.content)
        ? assistantMsg.content.map(p => p?.text || "").filter(Boolean).join("\n")
        : null) ||
      data?.message?.content?.text ||
      data?.output?.text ||
      data?.text ||
      JSON.stringify(data);

    return new Response(JSON.stringify({ reply, raw: data }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
};
