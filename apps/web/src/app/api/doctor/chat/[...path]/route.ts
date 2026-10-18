import { NextResponse } from "next/server";
import { getAuthorizedSession } from "@/lib/auth/server";
import { getApiOrigin } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function apiToken() {
  const authorized = await getAuthorizedSession();
  if (authorized.kind !== "ready" || authorized.session.role !== "DOCTOR" || authorized.session.accountStatus !== "ACTIVE" || authorized.session.verificationStatus !== "VERIFIED") return null;
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  return session?.access_token ?? null;
}

function allowedPath(parts: string[], method: string) {
  if (parts.length === 1 && parts[0] === "conversations" && method === "GET") return true;
  if (parts.length === 1 && parts[0] === "unread-count" && method === "GET") return true;
  if (parts.length === 3 && parts[0] === "conversations" && UUID.test(parts[1]) && parts[2] === "messages" && ["GET", "POST"].includes(method)) return true;
  if (parts.length === 3 && parts[0] === "conversations" && UUID.test(parts[1]) && parts[2] === "read" && method === "POST") return true;
  return false;
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await params, "GET");
}

export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await params, "POST");
}

async function proxy(request: Request, { path }: { path: string[] }, method: "GET" | "POST") {
  if (!allowedPath(path, method)) return NextResponse.json({ code: "CHAT_ROUTE_NOT_FOUND" }, { status: 404 });
  const token = await apiToken();
  if (!token) return NextResponse.json({ code: "DOCTOR_AUTH_REQUIRED" }, { status: 401 });

  const incoming = new URL(request.url);
  const target = new URL(`/v1/chat/${path.map(encodeURIComponent).join("/")}`, getApiOrigin());
  if (method === "GET") target.search = incoming.search;
  let body: string | undefined;
  if (method === "POST") {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 8_192) return NextResponse.json({ code: "CHAT_REQUEST_TOO_LARGE" }, { status: 413 });
    body = await request.text();
    if (body.length > 8_192) return NextResponse.json({ code: "CHAT_REQUEST_TOO_LARGE" }, { status: 413 });
  }
  try {
    const response = await fetch(target, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
      body,
      cache: "no-store",
    });
    return new Response(await response.text(), { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json" } });
  } catch {
    return NextResponse.json({ code: "CARENOW_API_UNAVAILABLE" }, { status: 503 });
  }
}
