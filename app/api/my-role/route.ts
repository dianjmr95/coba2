import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

const USER_ROLE_TABLE = process.env.NEXT_PUBLIC_SUPABASE_ROLE_TABLE || "user_roles";
const FIXED_ADMIN_EMAIL = String(process.env.FIXED_ADMIN_EMAIL || "luluklisdiantoro535@gmail.com")
  .trim()
  .toLowerCase();

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeRole(raw: unknown) {
  const role = String(raw ?? "")
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (role === "admin" || role === "staff" || role === "staff_offline" || role === "viewer") return role;
  return "viewer";
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

export async function GET(request: NextRequest) {
  try {
    const bearerToken = getBearerToken(request);
    if (!bearerToken) {
      return NextResponse.json({ ok: false, error: "Token login tidak ditemukan." }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const {
      data: { user }
    } = await supabaseAdmin.auth.getUser(bearerToken);
    const email = normalizeEmail(user?.email);
    if (!user || !email) {
      return NextResponse.json({ ok: false, error: "Token login tidak valid." }, { status: 401 });
    }

    if (email === FIXED_ADMIN_EMAIL) {
      return NextResponse.json({ ok: true, data: { role: "admin" } });
    }

    const { data, error } = await supabaseAdmin
      .from(USER_ROLE_TABLE)
      .select("role")
      .eq("email", email)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ ok: false, error: `Gagal membaca role: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        role: normalizeRole(data?.role)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terjadi error server.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
