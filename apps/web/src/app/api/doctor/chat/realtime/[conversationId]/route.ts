import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getAuthorizedSession } from "@/lib/auth/server";
import { getApiOrigin } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  if (!UUID.test(conversationId)) return NextResponse.json({ code: "INVALID_CHAT_CONVERSATION_ID" }, { status: 400 });

  const authorized = await getAuthorizedSession();
  if (authorized.kind !== "ready" || authorized.session.role !== "DOCTOR" || authorized.session.accountStatus !== "ACTIVE" || authorized.session.verificationStatus !== "VERIFIED") {
    return NextResponse.json({ code: "DOCTOR_AUTH_REQUIRED" }, { status: 401 });
  }
  const supabaseAuth = await createSupabaseServerClient();
  const { data: { session } } = supabaseAuth ? await supabaseAuth.auth.getSession() : { data: { session: null } };
  const accessToken = session?.access_token;
  if (!accessToken) return NextResponse.json({ code: "DOCTOR_AUTH_REQUIRED" }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) return NextResponse.json({ code: "REALTIME_NOT_CONFIGURED" }, { status: 503 });

  // The API verifies the doctor is a participant before this server opens the
  // private Realtime topic. The service-role key is never used by the portal.
  try {
    const membership = await fetch(`${getApiOrigin()}/v1/chat/conversations/${encodeURIComponent(conversationId)}/messages?limit=1`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      cache: "no-store",
    });
    if (!membership.ok) return NextResponse.json({ code: membership.status === 404 ? "CHAT_CONVERSATION_NOT_FOUND" : "CHAT_ACCESS_DENIED" }, { status: membership.status === 404 ? 404 : 403 });
  } catch {
    return NextResponse.json({ code: "CARENOW_API_UNAVAILABLE" }, { status: 503 });
  }

  const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await client.realtime.setAuth(accessToken);
  const encoder = new TextEncoder();
  let closed = false;
  let channel: ReturnType<typeof client.channel> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let cleanup: () => void = () => {};

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
        if (channel) void client.removeChannel(channel);
        request.signal.removeEventListener("abort", close);
        try { controller.close(); } catch { /* already closed */ }
      };
      cleanup = close;
      request.signal.addEventListener("abort", close, { once: true });
      channel = client.channel(`chat:${conversationId}`, { config: { private: true } })
        .on("broadcast", { event: "message.created" }, (payload) => write("message.created", payload))
        .on("broadcast", { event: "messages.read" }, (payload) => write("messages.read", payload));
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") write("ready", { ok: true });
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          write("realtime.error", { status });
          close();
        }
      });
      heartbeat = setInterval(() => {
        if (!closed) {
          try { controller.enqueue(encoder.encode(": keep-alive\n\n")); }
          catch { close(); }
        }
      }, 20_000);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}
