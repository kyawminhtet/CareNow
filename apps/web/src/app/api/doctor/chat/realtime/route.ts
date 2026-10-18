import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getAuthorizedSession } from "@/lib/auth/server";
import { getApiOrigin } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const authorized = await getAuthorizedSession();
  if (authorized.kind !== "ready" || authorized.session.role !== "DOCTOR" || authorized.session.accountStatus !== "ACTIVE" || authorized.session.verificationStatus !== "VERIFIED") {
    return NextResponse.json({ code: "DOCTOR_AUTH_REQUIRED" }, { status: 401 });
  }
  const supabaseAuth = await createSupabaseServerClient();
  const { data: { session } } = supabaseAuth ? await supabaseAuth.auth.getSession() : { data: { session: null } };
  const accessToken = session?.access_token;
  if (!accessToken) return NextResponse.json({ code: "DOCTOR_AUTH_REQUIRED" }, { status: 401 });

  let conversations: Array<{ id: string }>;
  try {
    const response = await fetch(`${getApiOrigin()}/v1/chat/conversations?limit=100`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ code: "CHAT_ACCESS_DENIED" }, { status: response.status });
    conversations = ((await response.json()) as { items?: Array<{ id: string }> }).items ?? [];
  } catch {
    return NextResponse.json({ code: "CARENOW_API_UNAVAILABLE" }, { status: 503 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) return NextResponse.json({ code: "REALTIME_NOT_CONFIGURED" }, { status: 503 });
  const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await client.realtime.setAuth(accessToken);
  const encoder = new TextEncoder();
  let closed = false;
  const channels: Array<ReturnType<typeof client.channel>> = [];
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let cleanup: () => void = () => {};
  let ready = 0;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (event: string, payload: unknown) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)); }
        catch { close(); }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        for (const channel of channels) void client.removeChannel(channel);
        request.signal.removeEventListener("abort", close);
        try { controller.close(); } catch { /* already closed */ }
      };
      cleanup = close;
      request.signal.addEventListener("abort", close, { once: true });
      if (conversations.length === 0) write("ready", { ok: true });
      for (const { id } of conversations) {
        const channel = client.channel(`chat:${id}`, { config: { private: true } })
          .on("broadcast", { event: "message.created" }, (event) => write("message.created", { ...(event.payload ?? {}), conversationId: id }))
          .on("broadcast", { event: "messages.read" }, (event) => write("messages.read", { ...(event.payload ?? {}), conversationId: id }));
        channels.push(channel);
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED" && ++ready === conversations.length) write("ready", { ok: true });
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") { write("realtime.error", { status }); close(); }
        });
      }
      heartbeat = setInterval(() => {
        if (!closed) { try { controller.enqueue(encoder.encode(": keep-alive\n\n")); } catch { close(); } }
      }, 20_000);
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}
