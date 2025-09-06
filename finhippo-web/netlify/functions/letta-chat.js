// netlify/functions/letta-chat.js
export default async (req, context) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), {
        status: 405,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { message, identifier } = await req.json(); // identifier = logged-in user's email or uid
    if (!message || !identifier) {
      return new Response(JSON.stringify({ error: "message and identifier required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const LETTA_API_KEY = process.env.LETTA_API_KEY;
    const LETTA_AGENT_ID = process.env.LETTA_AGENT_ID;
    if (!LETTA_API_KEY || !LETTA_AGENT_ID) {
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Call Letta messages API
    const url = `https://api.letta.ai/v1/agents/${LETTA_AGENT_ID}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LETTA_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: message,                       // user's text
        user: { identifier_key: identifier }  // bind memory to this user (adjust if your workspace uses a different key)
      })
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: `Letta error: ${text}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await res.json();

    // Try to pick the assistant's visible text reply.
    const reply =
      data?.message?.content?.text ??
      data?.output?.text ??
      data?.text ??
      (Array.isArray(data?.messages)
        ? data.messages.map(m => m?.content?.text).filter(Boolean).join("\n")
        : JSON.stringify(data));

    return new Response(JSON.stringify({ reply, raw: data }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
