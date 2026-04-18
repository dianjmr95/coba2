"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

type ShopeeOngkirMode =
  | "off"
  | "bawah-1"
  | "bawah-2"
  | "bawah-3.5"
  | "bawah-5.5"
  | "atas-2.5"
  | "atas-3.5"
  | "atas-5"
  | "atas-7";

type RincianItem = {
  label: string;
  value: number;
};

type CalcResult = {
  total: number;
  net: number;
  rincian: RincianItem[];
};

type PresetData = {
  tokopediaFee: string;
  shopeeFee: string;
  mallFee: string;
  tokopediaGratisOngkir: boolean;
  tokopediaAfiliasiAktif: boolean;
  tokopediaAfiliasiPct: number;
  shopeeGratisOngkir: ShopeeOngkirMode;
  shopeePromo: boolean;
  shopeeAsuransi: boolean;
  shopeeAfiliasiAktif: boolean;
  shopeeAfiliasiPct: number;
  mallBiayaJasa: boolean;
  mallGratisOngkir: boolean;
  mallAfiliasiAktif: boolean;
  mallAfiliasiPct: number;
};

type PresetItem = {
  id: string;
  name: string;
  data: PresetData;
};

type SectionId = "kalkulator-potongan" | "pembuatan-nota" | "rekap-penjualan";
type UserRole = "admin" | "staff" | "viewer";

type InvoiceItem = {
  id: string;
  nama: string;
  qty: number;
  harga: number;
};

type RecapOrderItem = {
  id: string;
  nama: string;
  hargaJual: number;
  modal: number;
  qty: number;
};

type RecapOrderSnapshot = {
  nama: string;
  hargaJual: number;
  modal: number;
  qty: number;
};

type RecapBiayaItem = {
  label: string;
  value: number;
};

type RecapEditDraft = {
  id: string;
  tanggal: string;
  marketplace: SalesRecapRow["marketplace"];
  status: SalesRecapRow["status"];
  alasanCancel: string;
  nominalCancel: number;
  orderItems: RecapOrderSnapshot[];
  noPesanan: string;
  pelanggan: string;
  omzet: number;
  modal: number;
  catatan: string;
  biayaDetail: RecapBiayaItem[];
};

type HealthCheckResult = {
  auth: { ok: boolean; message: string };
  salesRecap: { ok: boolean; message: string };
  userRoles: { ok: boolean; message: string };
};

type SalesRecapRow = {
  id: string;
  tanggal: string;
  marketplace: "Tokopedia" | "Shopee" | "TikTok";
  status: "sukses" | "cancel";
  alasanCancel: string;
  nominalCancel: number;
  tanggalCancel: string | null;
  createdAt: string | null;
  orderItems: RecapOrderSnapshot[];
  noPesanan: string;
  pelanggan: string;
  omzet: number;
  modal: number;
  ongkir: number;
  biayaDetail: RecapBiayaItem[];
  catatan: string;
};

const PRESET_STORAGE_KEY = "marketplace-potongan-presets-v1";
const INVOICE_COUNTER_STORAGE_KEY = "starcomp-invoice-counter-v1";
const RECAP_CACHE_STORAGE_KEY = "sales-recap-cache-v1";
const RECAP_SUPABASE_TABLE = process.env.NEXT_PUBLIC_SUPABASE_RECAP_TABLE || "sales_recap";
const PRESET_SUPABASE_TABLE = process.env.NEXT_PUBLIC_SUPABASE_PRESET_TABLE || "potongan_presets";
const USER_ROLE_TABLE = process.env.NEXT_PUBLIC_SUPABASE_ROLE_TABLE || "user_roles";
const FIXED_ADMIN_EMAIL = "luluklisdiantoro535@gmail.com";
const ROLE_SECTION_ACCESS: Record<UserRole, SectionId[]> = {
  admin: ["kalkulator-potongan", "pembuatan-nota", "rekap-penjualan"],
  staff: ["kalkulator-potongan", "pembuatan-nota", "rekap-penjualan"],
  viewer: ["kalkulator-potongan", "rekap-penjualan"]
};
const MARKETPLACE_VISUAL = {
  tokopedia: {
    label: "Tokopedia",
    short: "TKP",
    gradient: "from-emerald-500/20 via-emerald-400/10 to-transparent",
    badge: "bg-emerald-500 text-white",
    ring: "ring-emerald-200/70",
    text: "text-emerald-700"
  },
  shopee: {
    label: "Shopee",
    short: "SHP",
    gradient: "from-orange-500/20 via-orange-400/10 to-transparent",
    badge: "bg-orange-500 text-white",
    ring: "ring-orange-200/70",
    text: "text-orange-700"
  },
  mall: {
    label: "Tokopedia Mall",
    short: "MALL",
    gradient: "from-sky-500/20 via-cyan-400/10 to-transparent",
    badge: "bg-sky-500 text-white",
    ring: "ring-sky-200/70",
    text: "text-sky-700"
  }
} as const;

const DEFAULT_PRESET_DATA: PresetData = {
  tokopediaFee: "4.75",
  shopeeFee: "5.25",
  mallFee: "3",
  tokopediaGratisOngkir: true,
  tokopediaAfiliasiAktif: false,
  tokopediaAfiliasiPct: 2,
  shopeeGratisOngkir: "bawah-1",
  shopeePromo: true,
  shopeeAsuransi: false,
  shopeeAfiliasiAktif: false,
  shopeeAfiliasiPct: 2,
  mallBiayaJasa: true,
  mallGratisOngkir: true,
  mallAfiliasiAktif: false,
  mallAfiliasiPct: 2
};

const rupiah = (num: number) => `Rp ${Math.round(num).toLocaleString("id-ID")}`;
const rupiahOrDash = (num: number) => (Number.isFinite(num) ? rupiah(num) : "-");
const cap = (value: number, max: number) => Math.min(value, max);
const percent = (value: number, pct: number) => value * (pct / 100);
const waitMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const createRecapRowId = () =>
  typeof globalThis !== "undefined" && globalThis.crypto && "randomUUID" in globalThis.crypto
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function isTemporarySupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  const statusRaw = e.status;
  const status = typeof statusRaw === "number" ? statusRaw : Number(statusRaw || 0);
  if (status === 408 || status === 425 || status === 429 || status >= 500) return true;

  const code = String(e.code ?? "").toUpperCase();
  const message = String(e.message ?? "").toLowerCase();
  return (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timeout") ||
    message.includes("tempor")
  );
}

function isDuplicateIdError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  const code = String(e.code ?? "").toUpperCase();
  const message = String(e.message ?? "").toLowerCase();
  return code === "23505" || (message.includes("duplicate") && message.includes("id"));
}

function getSupabaseErrorInfo(error: unknown) {
  if (!error || typeof error !== "object") {
    return { code: "-", message: "Unknown error" };
  }
  const e = error as Record<string, unknown>;
  return {
    code: String(e.code ?? "-"),
    message: String(e.message ?? "Unknown error")
  };
}

function isMissingColumnError(error: unknown, columnName: string) {
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  const message = String(e.message ?? "").toLowerCase();
  const details = String(e.details ?? "").toLowerCase();
  const col = columnName.toLowerCase();
  return (
    message.includes("column") &&
    message.includes(col) &&
    (message.includes("does not exist") || message.includes("not found") || details.includes("schema cache"))
  );
}

function isAnyMissingColumnError(error: unknown, columnNames: string[]) {
  return columnNames.some((column) => isMissingColumnError(error, column));
}

function formatSupabaseError(action: string, error: unknown) {
  const { code, message } = getSupabaseErrorInfo(error);
  const codeUpper = code.toUpperCase();
  let hint = "Cek koneksi internet dan konfigurasi Supabase.";

  if (code === "42501") {
    hint = "Akses ditolak oleh RLS policy. Pastikan policy SELECT/INSERT/UPDATE/DELETE untuk role authenticated sudah benar.";
  } else if (codeUpper === "PGRST116") {
    hint = "Tabel tidak ditemukan/terbaca. Cek nama tabel di env dan schema public.";
  } else if (code === "23505") {
    hint = "Terjadi bentrok data duplikat. Silakan coba simpan ulang.";
  } else if (isTemporarySupabaseError(error)) {
    hint = "Gangguan jaringan sementara. Coba beberapa saat lagi.";
  }

  return `${action} gagal (code ${code}): ${message}. ${hint}`;
}
const toSafeNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeRole(raw: unknown): UserRole {
  const role = String(raw ?? "").toLowerCase();
  if (role === "admin" || role === "staff" || role === "viewer") return role;
  return "viewer";
}

function getDefaultAuthRole(): UserRole {
  const raw = String(process.env.NEXT_PUBLIC_DEFAULT_AUTH_ROLE ?? "staff").toLowerCase();
  return normalizeRole(raw === "admin" ? "staff" : raw);
}

function resolveWebRole(email: string, roleMap: Record<string, UserRole>) {
  const key = normalizeEmail(email);
  if (!key) return getDefaultAuthRole();
  if (key === normalizeEmail(FIXED_ADMIN_EMAIL)) return "admin" as const;
  return roleMap[key] ?? getDefaultAuthRole();
}

function normalizeRecapRow(value: unknown): SalesRecapRow | null {
  if (typeof value !== "object" || value === null) return null;
  const it = value as Record<string, unknown>;
  const marketplaceValue =
    it.marketplace === "Tokopedia" || it.marketplace === "Shopee" || it.marketplace === "TikTok"
      ? it.marketplace
      : it.marketplace === "Tokopedia Mall"
        ? "TikTok"
        : "Tokopedia";

  const biayaTotal = toSafeNumber(it.ongkir ?? it.biaya);
  const rawOrderItems = it.orderItems ?? it.order_items;
  const orderItems = Array.isArray(rawOrderItems)
    ? rawOrderItems
        .map((entry) => {
          if (typeof entry !== "object" || entry === null) return null;
          const e = entry as Record<string, unknown>;
          const nama = typeof e.nama === "string" ? e.nama.trim() : "";
          if (!nama) return null;
          return {
            nama,
            hargaJual: toSafeNumber(e.hargaJual ?? e.harga_jual),
            modal: toSafeNumber(e.modal),
            qty: Math.max(0, Number(e.qty ?? 0) || 0)
          } satisfies RecapOrderSnapshot;
        })
        .filter((item): item is RecapOrderSnapshot => Boolean(item))
    : [];
  const rawBiayaDetail = it.biayaDetail ?? it.biaya_detail;
  const biayaDetail = Array.isArray(rawBiayaDetail)
    ? rawBiayaDetail
        .map((detail) => {
          if (typeof detail !== "object" || detail === null) return null;
          const d = detail as Record<string, unknown>;
          return {
            label: typeof d.label === "string" ? d.label : "Biaya",
            value: toSafeNumber(d.value)
          } satisfies RecapBiayaItem;
        })
        .filter((d): d is RecapBiayaItem => Boolean(d))
    : [];

  return {
    id:
      typeof it.id === "string"
        ? it.id
        : typeof it.id === "number" && Number.isFinite(it.id)
          ? String(it.id)
          : typeof it.id === "bigint"
            ? String(it.id)
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    tanggal: typeof it.tanggal === "string" ? it.tanggal : new Date().toISOString().slice(0, 10),
    marketplace: marketplaceValue as SalesRecapRow["marketplace"],
    status: it.status === "cancel" ? "cancel" : "sukses",
    alasanCancel:
      typeof it.alasanCancel === "string"
        ? it.alasanCancel
        : typeof it.alasan_cancel === "string"
          ? it.alasan_cancel
          : "",
    nominalCancel: toSafeNumber(it.nominalCancel ?? it.nominal_cancel),
    tanggalCancel:
      typeof it.tanggalCancel === "string"
        ? it.tanggalCancel
        : typeof it.tanggal_cancel === "string"
          ? it.tanggal_cancel
          : null,
    createdAt:
      typeof it.createdAt === "string"
        ? it.createdAt
        : typeof it.created_at === "string"
          ? it.created_at
          : null,
    orderItems,
    noPesanan:
      typeof it.noPesanan === "string"
        ? it.noPesanan
        : typeof it.no_pesanan === "string"
          ? it.no_pesanan
          : "",
    pelanggan: typeof it.pelanggan === "string" ? it.pelanggan : "",
    omzet: toSafeNumber(it.omzet),
    modal: toSafeNumber(it.modal),
    ongkir: biayaTotal,
    biayaDetail: biayaDetail.length ? biayaDetail : [{ label: "Biaya Lain", value: biayaTotal }],
    catatan: typeof it.catatan === "string" ? it.catatan : ""
  };
}

function readRecapCache() {
  if (typeof window === "undefined") return [] as SalesRecapRow[];
  try {
    const raw = window.localStorage.getItem(RECAP_CACHE_STORAGE_KEY);
    if (!raw) return [] as SalesRecapRow[];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [] as SalesRecapRow[];
    return parsed
      .map((item) => normalizeRecapRow(item))
      .filter((row): row is SalesRecapRow => Boolean(row));
  } catch {
    return [] as SalesRecapRow[];
  }
}

function writeRecapCache(rows: SalesRecapRow[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECAP_CACHE_STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // ignore cache write error
  }
}

function toRecapDbPayload(row: SalesRecapRow, includeOrderItems = true) {
  const basePayload = {
    id: row.id,
    tanggal: row.tanggal,
    marketplace: row.marketplace,
    status: row.status,
    alasan_cancel: row.alasanCancel,
    nominal_cancel: row.nominalCancel,
    tanggal_cancel: row.tanggalCancel,
    no_pesanan: row.noPesanan,
    pelanggan: row.pelanggan,
    omzet: row.omzet,
    modal: row.modal,
    ongkir: row.ongkir,
    biaya_detail: row.biayaDetail,
    catatan: row.catatan
  };
  if (!includeOrderItems) return basePayload;
  return {
    ...basePayload,
    order_items: row.orderItems
  };
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function getNextInvoiceNumber() {
  const todayKey = getLocalDateKey(new Date());
  let nextSeq = 1;

  try {
    const raw = window.localStorage.getItem(INVOICE_COUNTER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { date?: string; seq?: number };
      if (parsed?.date === todayKey && typeof parsed.seq === "number" && Number.isFinite(parsed.seq)) {
        nextSeq = parsed.seq + 1;
      }
    }
  } catch {
    nextSeq = 1;
  }

  try {
    window.localStorage.setItem(
      INVOICE_COUNTER_STORAGE_KEY,
      JSON.stringify({ date: todayKey, seq: nextSeq })
    );
  } catch {
    // ignore storage write errors
  }

  return `STCSO-${todayKey}-${String(nextSeq).padStart(3, "0")}`;
}

function cariHargaRekomendasi(targetNet: number, hitungNetDariHarga: (harga: number) => number) {
  if (targetNet <= 0) return 0;

  let low = 0;
  let high = Math.max(1, targetNet);
  let netAtHigh = hitungNetDariHarga(high);

  for (let i = 0; i < 30 && netAtHigh < targetNet && high < 1_000_000_000; i += 1) {
    high *= 2;
    netAtHigh = hitungNetDariHarga(high);
  }

  if (netAtHigh < targetNet) return Number.NaN;

  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    const net = hitungNetDariHarga(mid);

    if (net >= targetNet) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return Math.ceil(high);
}

function normalizePresetData(value: unknown): PresetData | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;

  const rawShopeeMode = typeof v.shopeeGratisOngkir === "string" ? v.shopeeGratisOngkir : DEFAULT_PRESET_DATA.shopeeGratisOngkir;
  const shopeeGratisOngkir: ShopeeOngkirMode = [
    "off",
    "bawah-1",
    "bawah-2",
    "bawah-3.5",
    "bawah-5.5",
    "atas-2.5",
    "atas-3.5",
    "atas-5",
    "atas-7"
  ].includes(rawShopeeMode)
    ? (rawShopeeMode as ShopeeOngkirMode)
    : DEFAULT_PRESET_DATA.shopeeGratisOngkir;

  return {
    tokopediaFee: typeof v.tokopediaFee === "string" ? v.tokopediaFee : DEFAULT_PRESET_DATA.tokopediaFee,
    shopeeFee: typeof v.shopeeFee === "string" ? v.shopeeFee : DEFAULT_PRESET_DATA.shopeeFee,
    mallFee: typeof v.mallFee === "string" ? v.mallFee : DEFAULT_PRESET_DATA.mallFee,
    tokopediaGratisOngkir:
      typeof v.tokopediaGratisOngkir === "boolean" ? v.tokopediaGratisOngkir : DEFAULT_PRESET_DATA.tokopediaGratisOngkir,
    tokopediaAfiliasiAktif:
      typeof v.tokopediaAfiliasiAktif === "boolean" ? v.tokopediaAfiliasiAktif : DEFAULT_PRESET_DATA.tokopediaAfiliasiAktif,
    tokopediaAfiliasiPct:
      typeof v.tokopediaAfiliasiPct === "number" && Number.isFinite(v.tokopediaAfiliasiPct)
        ? v.tokopediaAfiliasiPct
        : DEFAULT_PRESET_DATA.tokopediaAfiliasiPct,
    shopeeGratisOngkir,
    shopeePromo: typeof v.shopeePromo === "boolean" ? v.shopeePromo : DEFAULT_PRESET_DATA.shopeePromo,
    shopeeAsuransi: typeof v.shopeeAsuransi === "boolean" ? v.shopeeAsuransi : DEFAULT_PRESET_DATA.shopeeAsuransi,
    shopeeAfiliasiAktif:
      typeof v.shopeeAfiliasiAktif === "boolean" ? v.shopeeAfiliasiAktif : DEFAULT_PRESET_DATA.shopeeAfiliasiAktif,
    shopeeAfiliasiPct:
      typeof v.shopeeAfiliasiPct === "number" && Number.isFinite(v.shopeeAfiliasiPct)
        ? v.shopeeAfiliasiPct
        : DEFAULT_PRESET_DATA.shopeeAfiliasiPct,
    mallBiayaJasa: typeof v.mallBiayaJasa === "boolean" ? v.mallBiayaJasa : DEFAULT_PRESET_DATA.mallBiayaJasa,
    mallGratisOngkir: typeof v.mallGratisOngkir === "boolean" ? v.mallGratisOngkir : DEFAULT_PRESET_DATA.mallGratisOngkir,
    mallAfiliasiAktif:
      typeof v.mallAfiliasiAktif === "boolean" ? v.mallAfiliasiAktif : DEFAULT_PRESET_DATA.mallAfiliasiAktif,
    mallAfiliasiPct:
      typeof v.mallAfiliasiPct === "number" && Number.isFinite(v.mallAfiliasiPct)
        ? v.mallAfiliasiPct
        : DEFAULT_PRESET_DATA.mallAfiliasiPct
  };
}

function normalizePresetItem(value: unknown): PresetItem | null {
  if (typeof value !== "object" || value === null) return null;
  const it = value as Record<string, unknown>;
  const data = normalizePresetData(it.data ?? it);
  if (!data) return null;

  const idRaw = typeof it.id === "string" ? it.id.trim() : "";
  const nameRaw = typeof it.name === "string" ? it.name.trim() : "";
  return {
    id: idRaw || createRecapRowId(),
    name: nameRaw || "Preset Tanpa Nama",
    data
  };
}

function toPresetDbPayload(item: PresetItem) {
  return {
    id: item.id,
    name: item.name,
    data: item.data
  };
}

function parseShopeeGratisOngkir(mode: ShopeeOngkirMode) {
  if (mode === "off") {
    return { active: false, pct: 0, cap: 0, label: "Tidak aktif" };
  }

  const [kategori, pctRaw] = mode.split("-");
  const pct = Number(pctRaw || 0);
  const capValue = kategori === "atas" ? 60000 : 40000;
  const kategoriLabel = kategori === "atas" ? "Di atas 5kg" : "Di bawah 5kg";

  return {
    active: true,
    pct,
    cap: capValue,
    label: `${kategoriLabel}, ${pct}%`
  };
}

function calcTokopedia(
  harga: number,
  fee: number,
  affiliatePct: number,
  enabledGratisOngkir: boolean,
  enabledAffiliate: boolean
): CalcResult {
  const biayaProses = 1250;
  const admin = percent(harga, fee);
  const gratisOngkir = enabledGratisOngkir ? cap(percent(harga, 4), 40000) : 0;
  const affiliate = enabledAffiliate ? cap(percent(harga, affiliatePct), 50000) : 0;
  const total = admin + biayaProses + gratisOngkir + affiliate;

  const rincian: RincianItem[] = [
    { label: `Fee Admin (${fee}%)`, value: admin },
    { label: "Biaya Proses", value: biayaProses }
  ];

  if (enabledGratisOngkir) rincian.push({ label: "Gratis Ongkir", value: gratisOngkir });
  if (affiliate > 0) rincian.push({ label: `Komisi Afiliasi (${affiliatePct}%)`, value: affiliate });

  return { total, net: harga - total, rincian };
}

function calcShopee(
  harga: number,
  fee: number,
  affiliatePct: number,
  shopeeGratisOngkirMode: ShopeeOngkirMode,
  enabledPromo: boolean,
  enabledAsuransi: boolean,
  enabledAffiliate: boolean
): CalcResult {
  const biayaProses = 1250;
  const biayaTambahan = 350;
  const admin = percent(harga, fee);
  const gratisOngkirCfg = parseShopeeGratisOngkir(shopeeGratisOngkirMode);
  const gratisOngkir = gratisOngkirCfg.active ? cap(percent(harga, gratisOngkirCfg.pct), gratisOngkirCfg.cap) : 0;
  const promo = enabledPromo ? cap(percent(harga, 4.5), 60000) : 0;
  const asuransi = enabledAsuransi ? percent(harga, 0.5) : 0;
  const affiliate = enabledAffiliate ? cap(percent(harga, affiliatePct), 50000) : 0;
  const total = admin + biayaProses + biayaTambahan + gratisOngkir + promo + asuransi + affiliate;

  const rincian: RincianItem[] = [
    { label: `Fee Admin (${fee}%)`, value: admin },
    { label: "Biaya Proses", value: biayaProses },
    { label: "Biaya Tambahan Tetap", value: biayaTambahan }
  ];

  if (gratisOngkirCfg.active) rincian.push({ label: `Gratis Ongkir (${gratisOngkirCfg.label})`, value: gratisOngkir });
  if (enabledPromo) rincian.push({ label: "Promo Ekstra", value: promo });
  if (enabledAsuransi) rincian.push({ label: "Asuransi", value: asuransi });
  if (affiliate > 0) rincian.push({ label: `Komisi Afiliasi (${affiliatePct}%)`, value: affiliate });

  return { total, net: harga - total, rincian };
}

function calcMall(
  harga: number,
  fee: number,
  affiliatePct: number,
  enabledBiayaJasa: boolean,
  enabledGratisOngkir: boolean,
  enabledAffiliate: boolean
): CalcResult {
  const biayaProses = 1250;
  const admin = percent(harga, fee);
  const biayaJasa = enabledBiayaJasa ? cap(percent(harga, 1.8), 50000) : 0;
  const gratisOngkir = enabledGratisOngkir ? cap(percent(harga, 4), 40000) : 0;
  const affiliate = enabledAffiliate ? cap(percent(harga, affiliatePct), 50000) : 0;
  const total = admin + biayaProses + biayaJasa + gratisOngkir + affiliate;

  const rincian: RincianItem[] = [
    { label: `Fee Admin (${fee}%)`, value: admin },
    { label: "Biaya Proses", value: biayaProses }
  ];

  if (enabledBiayaJasa) rincian.push({ label: "Biaya Jasa", value: biayaJasa });
  if (enabledGratisOngkir) rincian.push({ label: "Gratis Ongkir", value: gratisOngkir });
  if (affiliate > 0) rincian.push({ label: `Komisi Afiliasi (${affiliatePct}%)`, value: affiliate });

  return { total, net: harga - total, rincian };
}

function NumberInput({
  label,
  value,
  onChange,
  min = 0,
  step = 0.1
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <label className="grid gap-1.5 text-sm text-slate-600">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value || 0))}
        className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  children
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm text-slate-600">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
      >
        {children}
      </select>
    </label>
  );
}

function ToggleRow({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 rounded-2xl border border-stone-200 bg-white/95 px-3 py-2.5 transition hover:border-stone-300 hover:shadow-sm sm:flex-nowrap sm:items-center">
      <span className="block text-sm text-slate-800">
        {title}
        <small className="mt-0.5 block text-xs text-slate-500">{subtitle}</small>
      </span>
      {children}
    </div>
  );
}

export default function Page() {
  const [harga, setHarga] = useState(0);
  const [modal, setModal] = useState(0);
  const [targetMargin, setTargetMargin] = useState(0);

  const [tokopediaFee, setTokopediaFee] = useState("4.75");
  const [shopeeFee, setShopeeFee] = useState("5.25");
  const [mallFee, setMallFee] = useState("3");

  const [tokopediaGratisOngkir, setTokopediaGratisOngkir] = useState(true);
  const [tokopediaAfiliasiAktif, setTokopediaAfiliasiAktif] = useState(false);
  const [tokopediaAfiliasiPct, setTokopediaAfiliasiPct] = useState(2);

  const [shopeeGratisOngkir, setShopeeGratisOngkir] = useState<ShopeeOngkirMode>("bawah-1");
  const [shopeePromo, setShopeePromo] = useState(true);
  const [shopeeAsuransi, setShopeeAsuransi] = useState(false);
  const [shopeeAfiliasiAktif, setShopeeAfiliasiAktif] = useState(false);
  const [shopeeAfiliasiPct, setShopeeAfiliasiPct] = useState(2);

  const [mallBiayaJasa, setMallBiayaJasa] = useState(true);
  const [mallGratisOngkir, setMallGratisOngkir] = useState(true);
  const [mallAfiliasiAktif, setMallAfiliasiAktif] = useState(false);
  const [mallAfiliasiPct, setMallAfiliasiPct] = useState(2);
  const [presetName, setPresetName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [presetNotice, setPresetNotice] = useState("");
  const [isPresetSaving, setIsPresetSaving] = useState(false);
  const importPresetRef = useRef<HTMLInputElement | null>(null);
  const [showInvoiceWindow, setShowInvoiceWindow] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("kalkulator-potongan");
  const [authReady, setAuthReady] = useState(false);
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [authUser, setAuthUser] = useState<{ id: string; email: string; role: UserRole } | null>(null);
  const [roleMap, setRoleMap] = useState<Record<string, UserRole>>({});
  const [roleTargetEmail, setRoleTargetEmail] = useState("");
  const [roleTargetValue, setRoleTargetValue] = useState<UserRole>("viewer");
  const [roleManageNotice, setRoleManageNotice] = useState("");
  const [roleManageLoading, setRoleManageLoading] = useState(false);
  const [healthCheckLoading, setHealthCheckLoading] = useState(false);
  const [healthCheckResult, setHealthCheckResult] = useState<HealthCheckResult | null>(null);
  const [healthCheckNotice, setHealthCheckNotice] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceBuyer, setInvoiceBuyer] = useState("");
  const [invoicePhone, setInvoicePhone] = useState("");
  const [invoiceWhatsapp, setInvoiceWhatsapp] = useState("");
  const [invoiceAddress, setInvoiceAddress] = useState("");
  const [invoiceCourier, setInvoiceCourier] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([
    { id: `${Date.now()}`, nama: "", qty: 1, harga: 0 }
  ]);
  const [recapTanggal, setRecapTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [recapMarketplace, setRecapMarketplace] = useState<SalesRecapRow["marketplace"]>("Tokopedia");
  const [recapNoPesanan, setRecapNoPesanan] = useState("");
  const [recapPelanggan, setRecapPelanggan] = useState("");
  const [recapOmzet, setRecapOmzet] = useState(0);
  const [recapModal, setRecapModal] = useState(0);
  const [recapOrderItems, setRecapOrderItems] = useState<RecapOrderItem[]>([
    { id: `${Date.now()}`, nama: "", hargaJual: 0, modal: 0, qty: 1 }
  ]);
  const [recapOngkir, setRecapOngkir] = useState(0);
  const [recapMarketplaceBiayaKomisiPlatform, setRecapMarketplaceBiayaKomisiPlatform] = useState(0);
  const [recapMarketplaceBiayaLayananMall, setRecapMarketplaceBiayaLayananMall] = useState(0);
  const [recapMarketplaceKomisiDinamis, setRecapMarketplaceKomisiDinamis] = useState(0);
  const [recapMarketplaceKomisiAfiliasiAktif, setRecapMarketplaceKomisiAfiliasiAktif] = useState(false);
  const [recapMarketplaceKomisiAfiliasi, setRecapMarketplaceKomisiAfiliasi] = useState(0);
  const [recapMarketplaceBiayaPemrosesanPesanan, setRecapMarketplaceBiayaPemrosesanPesanan] = useState(0);
  const [recapShopeeBiayaAdmin, setRecapShopeeBiayaAdmin] = useState(0);
  const [recapShopeeBiayaLayananPromoXtra, setRecapShopeeBiayaLayananPromoXtra] = useState(0);
  const [recapShopeeBiayaLayananGratisOngkirXtra, setRecapShopeeBiayaLayananGratisOngkirXtra] = useState(0);
  const [recapShopeeBiayaProgramHematKirim, setRecapShopeeBiayaProgramHematKirim] = useState(0);
  const [recapShopeeBiayaProsesPesanan, setRecapShopeeBiayaProsesPesanan] = useState(0);
  const [recapShopeeKomisiAmsAktif, setRecapShopeeKomisiAmsAktif] = useState(false);
  const [recapShopeeBiayaKomisiAms, setRecapShopeeBiayaKomisiAms] = useState(0);
  const [recapShopeePremiAktif, setRecapShopeePremiAktif] = useState(false);
  const [recapShopeeBiayaPremi, setRecapShopeeBiayaPremi] = useState(0);
  const [recapCatatan, setRecapCatatan] = useState("");
  const [recapRows, setRecapRows] = useState<SalesRecapRow[]>([]);
  const [recapFilterMarketplace, setRecapFilterMarketplace] = useState<"Semua" | SalesRecapRow["marketplace"]>("Semua");
  const [recapFilterStatus, setRecapFilterStatus] = useState<"Semua" | SalesRecapRow["status"]>("Semua");
  const [recapFilterStartDate, setRecapFilterStartDate] = useState("");
  const [recapFilterEndDate, setRecapFilterEndDate] = useState("");
  const [recapFilterQuery, setRecapFilterQuery] = useState("");
  const [recapNotice, setRecapNotice] = useState("");
  const [isRecapSaving, setIsRecapSaving] = useState(false);
  const [recapSyncStatus, setRecapSyncStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [recapSyncMessage, setRecapSyncMessage] = useState("");
  const [recapMenu, setRecapMenu] = useState<"input" | "hasil">("input");
  const [openBiayaDetailRow, setOpenBiayaDetailRow] = useState<SalesRecapRow | null>(null);
  const [editRecapDraft, setEditRecapDraft] = useState<RecapEditDraft | null>(null);
  const [cancelDraftRow, setCancelDraftRow] = useState<SalesRecapRow | null>(null);
  const [cancelDraftClosingId, setCancelDraftClosingId] = useState<string | null>(null);
  const [cancelDraftReason, setCancelDraftReason] = useState("");
  const [cancelDraftNominal, setCancelDraftNominal] = useState(0);
  const [cancelStatusSaving, setCancelStatusSaving] = useState(false);
  const [cancelTrendDays, setCancelTrendDays] = useState<7 | 14 | 30 | "all">(7);
  const [supportsOrderItemsColumn, setSupportsOrderItemsColumn] = useState(true);
  const cancelDraftCloseTimerRef = useRef<number | null>(null);

  const currentPresetData: PresetData = {
    tokopediaFee,
    shopeeFee,
    mallFee,
    tokopediaGratisOngkir,
    tokopediaAfiliasiAktif,
    tokopediaAfiliasiPct,
    shopeeGratisOngkir,
    shopeePromo,
    shopeeAsuransi,
    shopeeAfiliasiAktif,
    shopeeAfiliasiPct,
    mallBiayaJasa,
    mallGratisOngkir,
    mallAfiliasiAktif,
    mallAfiliasiPct
  };

  const applyAuthUser = useCallback((user: User | null, map: Record<string, UserRole>) => {
    if (!user) {
      setAuthUser(null);
      return;
    }

    const email = user.email || "";
    const role = resolveWebRole(email, map);
    setAuthUser({
      id: user.id,
      email: email || "-",
      role
    });
  }, []);

  const loadRecapRows = useCallback(async () => {
    try {
      const { data, error, status } = await supabase
        .from(RECAP_SUPABASE_TABLE)
        .select("*")
        .order("tanggal", { ascending: false });

      if (error) {
        // Keep the last successful snapshot so data does not disappear on transient fetch errors.
        const cachedRows = readRecapCache();
        if (cachedRows.length) {
          setRecapRows(cachedRows);
          setRecapNotice(
            `${formatSupabaseError(
              `Memuat rekap dari Supabase (status ${status || "-"})`,
              error
            )} Menampilkan cache lokal terakhir.`
          );
          return;
        }

        setRecapNotice(formatSupabaseError(`Memuat rekap dari Supabase (status ${status || "-"})`, error));
        return;
      }

      const rows = (Array.isArray(data) ? data : [])
        .map((item) => normalizeRecapRow(item))
        .filter((row): row is SalesRecapRow => Boolean(row));

      if (!rows.length) {
        const cachedRows = readRecapCache();
        if (cachedRows.length) {
          setRecapRows(cachedRows);
          setRecapNotice(
            "Supabase mengembalikan data kosong. Menampilkan cache lokal terakhir. Cek policy SELECT/RLS bila seharusnya ada data."
          );
          return;
        }

        setRecapRows([]);
        setRecapNotice(
          "Data rekap yang terlihat untuk akun ini kosong. Jika di dashboard Supabase datanya ada, cek policy SELECT/RLS pada tabel rekap atau pastikan login memakai akun yang sama."
        );
        return;
      }

      setRecapRows(rows);
      writeRecapCache(rows);
      setRecapNotice("");
    } catch (error) {
      const cachedRows = readRecapCache();
      if (cachedRows.length) {
        setRecapRows(cachedRows);
        setRecapNotice(`${formatSupabaseError("Memuat data rekap", error)} Menampilkan cache lokal terakhir.`);
        return;
      }
      setRecapNotice(formatSupabaseError("Memuat data rekap", error));
    }
  }, []);

  const loadRoleMapFromSupabase = useCallback(async () => {
    const { data, error } = await supabase.from(USER_ROLE_TABLE).select("email, role");
    if (error) {
      setRoleManageNotice(formatSupabaseError("Memuat data role", error));
      return;
    }

    const next: Record<string, UserRole> = {};
    const rows = Array.isArray(data) ? data : [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Record<string, unknown>;
      const emailKey = normalizeEmail(String(rec.email ?? ""));
      if (!emailKey || emailKey === normalizeEmail(FIXED_ADMIN_EMAIL)) continue;
      next[emailKey] = normalizeRole(rec.role);
    }
    setRoleMap(next);
    setRoleManageNotice("");
  }, []);

  const loadPresetsFromSupabase = useCallback(async () => {
    const { data, error } = await runSupabaseWithRetry(
      () => supabase.from(PRESET_SUPABASE_TABLE).select("*").order("name", { ascending: true }),
      2
    );

    if (error) {
      setPresetNotice(`${formatSupabaseError("Memuat preset potongan", error)} Menampilkan cache lokal.`);
      return;
    }

    const next = (Array.isArray(data) ? data : [])
      .map((item) => normalizePresetItem(item))
      .filter((item): item is PresetItem => Boolean(item));
    setPresets(next);
    setPresetNotice("");
  }, []);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSessionUser(data.session?.user ?? null);
      setAuthReady(true);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    applyAuthUser(sessionUser, roleMap);
  }, [applyAuthUser, roleMap, sessionUser]);

  useEffect(() => {
    if (!sessionUser) {
      setRoleMap({});
      return;
    }
    void loadRoleMapFromSupabase();
  }, [loadRoleMapFromSupabase, sessionUser]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown[];
      if (Array.isArray(parsed)) {
        const cached = parsed
          .map((item) => normalizePresetItem(item))
          .filter((item): item is PresetItem => Boolean(item));
        if (cached.length) setPresets(cached);
      }
    } catch {
      setPresets([]);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
    } catch {
      // ignore write error
    }
  }, [presets]);

  useEffect(() => {
    const cachedRows = readRecapCache();
    if (!cachedRows.length) return;
    setRecapRows(cachedRows);
    setRecapNotice("Menampilkan cache lokal terakhir sambil menunggu sinkronisasi Supabase.");
  }, []);

  useEffect(() => {
    if (!authUser) return;
    void loadPresetsFromSupabase();
  }, [authUser, loadPresetsFromSupabase]);

  useEffect(() => {
    if (!authUser) return;
    const channel = supabase
      .channel(`preset-realtime-${PRESET_SUPABASE_TABLE}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: PRESET_SUPABASE_TABLE
        },
        () => {
          void loadPresetsFromSupabase();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authUser, loadPresetsFromSupabase]);

  useEffect(() => {
    if (!authUser) return;
    void loadRecapRows();
  }, [authUser, loadRecapRows]);

  useEffect(() => {
    if (!authUser) return;
    if (activeSection !== "rekap-penjualan") return;

    const channel = supabase
      .channel(`recap-realtime-${RECAP_SUPABASE_TABLE}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: RECAP_SUPABASE_TABLE
        },
        () => {
          void loadRecapRows();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeSection, authUser, loadRecapRows]);

  const recapOrderTotals = useMemo(() => {
    return recapOrderItems.reduce(
      (acc, item) => {
        const qty = Math.max(0, Number(item.qty) || 0);
        const hargaJual = Math.max(0, Number(item.hargaJual) || 0);
        const modal = Math.max(0, Number(item.modal) || 0);
        acc.omzet += qty * hargaJual;
        acc.modal += qty * modal;
        return acc;
      },
      { omzet: 0, modal: 0 }
    );
  }, [recapOrderItems]);

  useEffect(() => {
    setRecapOmzet(recapOrderTotals.omzet);
    setRecapModal(recapOrderTotals.modal);
  }, [recapOrderTotals]);

  async function runSupabaseWithRetry<T>(
    task: () => PromiseLike<{ data: T; error: unknown }>,
    maxRetry = 2
  ) {
    let lastResult: { data: T; error: unknown } | null = null;

    for (let attempt = 0; attempt <= maxRetry; attempt += 1) {
      let result: { data: T; error: unknown };
      try {
        result = await task();
      } catch (error) {
        result = { data: null as T, error };
      }
      if (!result.error) return result;
      lastResult = result;

      if (!isTemporarySupabaseError(result.error) || attempt === maxRetry) {
        return result;
      }

      await waitMs(500 * (attempt + 1));
    }

    return lastResult ?? { data: null as T, error: { message: "Unknown error" } };
  }

  function applyPreset(data: PresetData) {
    setTokopediaFee(data.tokopediaFee);
    setShopeeFee(data.shopeeFee);
    setMallFee(data.mallFee);
    setTokopediaGratisOngkir(data.tokopediaGratisOngkir);
    setTokopediaAfiliasiAktif(data.tokopediaAfiliasiAktif);
    setTokopediaAfiliasiPct(data.tokopediaAfiliasiPct);
    setShopeeGratisOngkir(data.shopeeGratisOngkir);
    setShopeePromo(data.shopeePromo);
    setShopeeAsuransi(data.shopeeAsuransi);
    setShopeeAfiliasiAktif(data.shopeeAfiliasiAktif);
    setShopeeAfiliasiPct(data.shopeeAfiliasiPct);
    setMallBiayaJasa(data.mallBiayaJasa);
    setMallGratisOngkir(data.mallGratisOngkir);
    setMallAfiliasiAktif(data.mallAfiliasiAktif);
    setMallAfiliasiPct(data.mallAfiliasiPct);
  }

  async function handleSavePreset() {
    if (authUser?.role === "viewer") {
      setPresetNotice("Role viewer hanya bisa memakai preset yang sudah ada.");
      return;
    }
    const name = presetName.trim();
    if (!name) {
      setPresetNotice("Isi nama preset terlebih dahulu.");
      return;
    }
    if (isPresetSaving) return;

    const item: PresetItem = {
      id: createRecapRowId(),
      name,
      data: currentPresetData
    };

    setIsPresetSaving(true);
    const { error } = await runSupabaseWithRetry(
      () => supabase.from(PRESET_SUPABASE_TABLE).insert([toPresetDbPayload(item)]),
      2
    );
    if (error) {
      setPresetNotice(formatSupabaseError("Menyimpan preset", error));
      setIsPresetSaving(false);
      return;
    }

    await loadPresetsFromSupabase();
    setPresetName("");
    setSelectedPresetId(item.id);
    setPresetNotice("Preset berhasil disimpan dan tersinkron ke semua akun.");
    setIsPresetSaving(false);
  }

  function handleLoadPreset() {
    const found = presets.find((p) => p.id === selectedPresetId);
    if (!found) return;
    applyPreset(found.data);
    setPresetNotice(`Preset "${found.name}" diterapkan.`);
  }

  async function handleDeletePreset() {
    if (authUser?.role === "viewer") {
      setPresetNotice("Role viewer tidak punya izin menghapus preset.");
      return;
    }
    if (!selectedPresetId) {
      setPresetNotice("Pilih preset yang ingin dihapus.");
      return;
    }
    if (isPresetSaving) return;

    setIsPresetSaving(true);
    const { error } = await runSupabaseWithRetry(
      () => supabase.from(PRESET_SUPABASE_TABLE).delete().eq("id", selectedPresetId),
      2
    );
    if (error) {
      setPresetNotice(formatSupabaseError("Menghapus preset", error));
      setIsPresetSaving(false);
      return;
    }

    setPresets((prev) => prev.filter((p) => p.id !== selectedPresetId));
    setSelectedPresetId("");
    setPresetNotice("Preset berhasil dihapus dari Supabase.");
    setIsPresetSaving(false);
  }

  async function handleUpdatePreset() {
    if (authUser?.role === "viewer") {
      setPresetNotice("Role viewer tidak punya izin mengubah preset.");
      return;
    }
    if (!selectedPresetId) {
      setPresetNotice("Pilih preset yang ingin diupdate.");
      return;
    }
    if (isPresetSaving) return;

    const nextName = presetName.trim();
    const found = presets.find((p) => p.id === selectedPresetId);
    if (!found) {
      setPresetNotice("Preset yang dipilih tidak ditemukan.");
      return;
    }

    setIsPresetSaving(true);
    const payload = {
      name: nextName || found.name,
      data: currentPresetData
    };
    const { error } = await runSupabaseWithRetry(
      () => supabase.from(PRESET_SUPABASE_TABLE).update(payload).eq("id", selectedPresetId),
      2
    );
    if (error) {
      setPresetNotice(formatSupabaseError("Memperbarui preset", error));
      setIsPresetSaving(false);
      return;
    }

    setPresets((prev) =>
      prev.map((p) =>
        p.id === selectedPresetId
          ? {
              ...p,
              name: payload.name,
              data: currentPresetData
            }
          : p
      )
    );
    setPresetNotice("Preset berhasil diperbarui di Supabase.");
    setIsPresetSaving(false);
  }

  function handleExportPresets() {
    const payload = JSON.stringify(presets, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `preset-potongan-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setPresetNotice("Preset berhasil diexport.");
  }

  function handleImportPresets(event: ChangeEvent<HTMLInputElement>) {
    if (authUser?.role === "viewer") {
      setPresetNotice("Role viewer tidak punya izin import preset.");
      if (importPresetRef.current) importPresetRef.current.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const raw = String(reader.result ?? "").replace(/^\uFEFF/, "").trim();
        const parsed = JSON.parse(raw) as unknown;

        const sourceList = Array.isArray(parsed)
          ? parsed
          : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { presets?: unknown[] }).presets)
            ? (parsed as { presets: unknown[] }).presets
            : typeof parsed === "object" && parsed !== null
              ? [parsed]
              : null;

        if (!sourceList) throw new Error("format invalid");
        if (sourceList.length === 0) {
          setPresetNotice("File JSON valid, tapi belum berisi preset.");
          return;
        }

        const valid: PresetItem[] = sourceList
          .map((item) => {
            if (typeof item !== "object" || item === null) return null;
            const it = item as Record<string, unknown>;
            const name = typeof it.name === "string" && it.name.trim() ? it.name.trim() : "Preset Import";
            const data = normalizePresetData(it.data ?? it);
            if (!data) return null;
            return {
              id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              name,
              data
            } satisfies PresetItem;
          })
          .filter((item): item is PresetItem => Boolean(item));

        if (!valid.length) {
          setPresetNotice("File terbaca, tapi tidak ada data preset yang cocok.");
          return;
        }

        setIsPresetSaving(true);
        const payload = valid.map((item) => toPresetDbPayload(item));
        const { error } = await runSupabaseWithRetry(
          () => supabase.from(PRESET_SUPABASE_TABLE).insert(payload),
          2
        );
        if (error) {
          setPresetNotice(formatSupabaseError("Import preset", error));
          return;
        }

        await loadPresetsFromSupabase();
        setPresetNotice(`${valid.length} preset berhasil diimport ke Supabase.`);
      } catch {
        setPresetNotice("Import gagal. Pastikan file JSON preset valid.");
      } finally {
        setIsPresetSaving(false);
        if (importPresetRef.current) importPresetRef.current.value = "";
      }
    };
    reader.readAsText(file);
  }

  function addInvoiceItem() {
    setInvoiceItems((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, nama: "", qty: 1, harga: 0 }]);
  }

  function removeInvoiceItem(id: string) {
    setInvoiceItems((prev) => (prev.length > 1 ? prev.filter((x) => x.id !== id) : prev));
  }

  function updateInvoiceItem(id: string, key: "nama" | "qty" | "harga", value: string | number) {
    setInvoiceItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [key]: key === "nama" ? String(value) : Number(value) } : item))
    );
  }

  const invoiceSubtotal = useMemo(
    () => invoiceItems.reduce((acc, item) => acc + Math.max(0, item.qty) * Math.max(0, item.harga), 0),
    [invoiceItems]
  );

  function printInvoice() {
    const generatedInvoiceNo = getNextInvoiceNumber();
    setInvoiceNo(generatedInvoiceNo);

    const rows = invoiceItems
      .map((item, idx) => {
        const line = Math.max(0, item.qty) * Math.max(0, item.harga);
        return `<tr>
          <td style="padding:8px;border:1px solid #ddd;">${idx + 1}</td>
          <td style="padding:8px;border:1px solid #ddd;">${item.nama || "-"}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">${item.qty}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">${rupiah(item.harga)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">${rupiah(line)}</td>
        </tr>`;
      })
      .join("");

    const logoUrl = `${window.location.origin}/starcomp-logo.png`;
    const printDate = new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(new Date());

    const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Faktur ${generatedInvoiceNo}</title>
        <style>
          @page { size: A4; margin: 20mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; }
          .header { display: flex; gap: 14px; align-items: center; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 14px; }
          .logo { width: 120px; height: auto; object-fit: contain; }
          .company h1 { margin: 0; font-size: 20px; letter-spacing: 0.02em; }
          .company p { margin: 3px 0 0; color: #333; font-size: 12px; }
          .title { margin: 14px 0 10px; text-align: center; font-size: 16px; font-weight: 700; letter-spacing: 0.08em; }
          .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; margin-bottom: 12px; }
          .box { border: 1px solid #bbb; padding: 10px; border-radius: 4px; }
          .box p { margin: 0 0 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #bbb; padding: 7px; }
          th { background: #f3f3f3; font-weight: 700; }
          td.right, th.right { text-align: right; }
          .total { margin-top: 10px; display: flex; justify-content: flex-end; font-size: 14px; font-weight: 700; }
          .notes { margin-top: 12px; border: 1px solid #bbb; border-radius: 4px; padding: 10px; min-height: 52px; }
          .sign { margin-top: 34px; display: flex; justify-content: flex-end; }
          .sign-box { width: 220px; text-align: center; }
          .sign-space { height: 58px; }
        </style>
      </head>
      <body>
        <div class="header">
          <img class="logo" src="${logoUrl}" alt="Logo Starcomp" />
          <div class="company">
            <h1>STARCOMP SOLO</h1>
            <p>Computer Store</p>
            <p>Faktur Penjualan Resmi</p>
          </div>
        </div>

        <div class="title">FAKTUR PENJUALAN</div>

        <div class="meta">
          <div class="box">
            <p><strong>No Faktur:</strong> ${generatedInvoiceNo}</p>
            <p><strong>Tanggal Cetak:</strong> ${printDate}</p>
            <p><strong>Kurir:</strong> ${invoiceCourier || "-"}</p>
          </div>
          <div class="box">
            <p><strong>Pembeli:</strong> ${invoiceBuyer || "-"}</p>
            <p><strong>Telepon:</strong> ${invoicePhone || "-"}</p>
            <p><strong>Alamat:</strong> ${invoiceAddress || "-"}</p>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:40px;">No</th>
              <th>Nama Barang</th>
              <th class="right" style="width:60px;">Qty</th>
              <th class="right" style="width:140px;">Harga Satuan</th>
              <th class="right" style="width:150px;">Jumlah</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="total">TOTAL: ${rupiah(invoiceSubtotal)}</div>
        <div class="notes"><strong>Catatan:</strong> ${invoiceNotes || "-"}</div>

        <div class="sign">
          <div class="sign-box">
            <div>Hormat kami,</div>
            <div class="sign-space"></div>
            <div><strong>STARCOMP SOLO</strong></div>
          </div>
        </div>

        <script>
          (function () {
            const images = Array.from(document.images || []);
            const waitImages = images.map((img) => {
              if (img.complete) return Promise.resolve();
              return new Promise((resolve) => {
                img.addEventListener("load", resolve, { once: true });
                img.addEventListener("error", resolve, { once: true });
              });
            });

            Promise.all(waitImages).finally(() => {
              setTimeout(() => window.print(), 120);
            });
          })();
        <\/script>
      </body>
    </html>`;

    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function normalizeWhatsappNumber(input: string) {
    const digits = input.replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("62")) return digits;
    if (digits.startsWith("0")) return `62${digits.slice(1)}`;
    return digits;
  }

  function sendInvoiceToWhatsapp() {
    const target = normalizeWhatsappNumber(invoiceWhatsapp || invoicePhone);
    if (!target) {
      window.alert("Isi No WhatsApp tujuan terlebih dahulu.");
      return;
    }

    const draftNo = invoiceNo || "Belum dicetak";
    const printDate = new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(new Date());

    const lines = invoiceItems.map((item, idx) => {
      const qty = Math.max(0, item.qty);
      const harga = Math.max(0, item.harga);
      const total = qty * harga;
      return `${idx + 1}. ${item.nama || "-"} x${qty} = ${rupiah(total)}`;
    });

    const text = [
      "*FAKTUR PENJUALAN STARCOMP SOLO*",
      `No Faktur: ${draftNo}`,
      `Tanggal: ${printDate}`,
      `Pembeli: ${invoiceBuyer || "-"}`,
      `Telepon: ${invoicePhone || "-"}`,
      `Kurir: ${invoiceCourier || "-"}`,
      `Alamat: ${invoiceAddress || "-"}`,
      "",
      "*Rincian Barang:*",
      ...lines,
      "",
      `*TOTAL: ${rupiah(invoiceSubtotal)}*`,
      `Catatan: ${invoiceNotes || "-"}`
    ].join("\n");

    const url = `https://wa.me/${target}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  function addRecapOrderItem() {
    setRecapOrderItems((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, nama: "", hargaJual: 0, modal: 0, qty: 1 }
    ]);
  }

  function updateRecapOrderItem(id: string, field: "nama" | "hargaJual" | "modal" | "qty", value: string | number) {
    setRecapOrderItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (field === "nama") return { ...item, nama: String(value) };
        return { ...item, [field]: Math.max(0, Number(value) || 0) };
      })
    );
  }

  function removeRecapOrderItem(id: string) {
    setRecapOrderItems((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthNotice("");

    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword
    });

    if (error) {
      setAuthNotice(`Login gagal: ${error.message}`);
      setAuthLoading(false);
      return;
    }

    setLoginPassword("");
    setAuthNotice("");
    setAuthLoading(false);
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthNotice(`Gagal logout: ${error.message}`);
    }
  }

  async function handleSaveRole() {
    const emailKey = normalizeEmail(roleTargetEmail);
    if (!emailKey) {
      setRoleManageNotice("Isi email user terlebih dahulu.");
      return;
    }

    if (emailKey === normalizeEmail(FIXED_ADMIN_EMAIL)) {
      setRoleManageNotice("Email admin utama sudah otomatis role admin.");
      return;
    }

    if (roleTargetValue === "admin") {
      setRoleManageNotice("Role admin hanya untuk email admin utama.");
      return;
    }

    setRoleManageLoading(true);
    const { error } = await supabase
      .from(USER_ROLE_TABLE)
      .upsert([{ email: emailKey, role: roleTargetValue }], { onConflict: "email" });

    if (error) {
      setRoleManageNotice(`Gagal simpan role: ${error.message}`);
      setRoleManageLoading(false);
      return;
    }

    setRoleMap((prev) => ({ ...prev, [emailKey]: normalizeRole(roleTargetValue) }));
    setRoleManageNotice(`Role untuk ${emailKey} disimpan sebagai ${roleTargetValue}.`);
    setRoleTargetEmail("");
    setRoleTargetValue("viewer");
    setRoleManageLoading(false);
  }

  async function handleResetRole(email: string) {
    const emailKey = normalizeEmail(email);
    if (!emailKey || emailKey === normalizeEmail(FIXED_ADMIN_EMAIL)) return;

    setRoleManageLoading(true);
    const { error } = await supabase.from(USER_ROLE_TABLE).delete().eq("email", emailKey);
    if (error) {
      setRoleManageNotice(`Gagal reset role: ${error.message}`);
      setRoleManageLoading(false);
      return;
    }

    setRoleMap((prev) => {
      const next = { ...prev };
      delete next[emailKey];
      return next;
    });
    setRoleManageNotice(`Role ${emailKey} direset ke viewer (default).`);
    setRoleManageLoading(false);
  }

  async function runSupabaseHealthCheck() {
    if (healthCheckLoading) return;

    setHealthCheckLoading(true);
    setHealthCheckNotice("Menjalankan health check Supabase...");
    setHealthCheckResult(null);

    try {
      const [sessionResult, salesResult, salesCancelColumnsResult, rolesResult] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from(RECAP_SUPABASE_TABLE).select("id", { count: "exact", head: true }),
        supabase
          .from(RECAP_SUPABASE_TABLE)
          .select("status, alasan_cancel, nominal_cancel, tanggal_cancel", { count: "exact", head: true }),
        supabase.from(USER_ROLE_TABLE).select("email", { count: "exact", head: true })
      ]);

      const authOk = Boolean(sessionResult.data.session?.user);
      const salesBasicOk = !salesResult.error;
      const salesCancelColumnsOk = !salesCancelColumnsResult.error;
      const salesOk = salesBasicOk && salesCancelColumnsOk;
      const rolesOk = !rolesResult.error;
      const salesBaseMessage = salesBasicOk
        ? `Akses tabel ${RECAP_SUPABASE_TABLE} OK.`
        : formatSupabaseError(`Akses tabel ${RECAP_SUPABASE_TABLE}`, salesResult.error);
      const salesCancelColumnsMessage = salesCancelColumnsOk
        ? "Kolom cancel terdeteksi (status, alasan_cancel, nominal_cancel, tanggal_cancel)."
        : formatSupabaseError("Cek kolom cancel di tabel rekap", salesCancelColumnsResult.error);
      const result: HealthCheckResult = {
        auth: {
          ok: authOk,
          message: authOk
            ? "Session login aktif."
            : "Belum ada session login aktif. Silakan logout-login ulang."
        },
        salesRecap: {
          ok: salesOk,
          message: `${salesBaseMessage} ${salesCancelColumnsMessage}`
        },
        userRoles: {
          ok: rolesOk,
          message: rolesOk
            ? `Akses tabel ${USER_ROLE_TABLE} OK.`
            : formatSupabaseError(`Akses tabel ${USER_ROLE_TABLE}`, rolesResult.error)
        }
      };

      setHealthCheckResult(result);
      if (authOk && salesOk && rolesOk) {
        setHealthCheckNotice("Health check berhasil: auth dan akses tabel OK.");
      } else {
        setHealthCheckNotice("Health check menemukan masalah. Lihat detail status di bawah.");
      }
    } catch (error) {
      setHealthCheckNotice(formatSupabaseError("Health check Supabase", error));
    } finally {
      setHealthCheckLoading(false);
    }
  }

  async function addRecapRow() {
    if (authUser?.role === "viewer") {
      setRecapNotice("Role viewer hanya bisa melihat data rekap.");
      return false;
    }
    if (isRecapSaving) return false;

    setIsRecapSaving(true);
    setRecapSyncStatus("saving");
    setRecapSyncMessage("Menyimpan ke Supabase...");

    try {
      const komisiAfiliasiMarketplace = recapMarketplaceKomisiAfiliasiAktif ? recapMarketplaceKomisiAfiliasi : 0;
      const totalBiaya =
        recapMarketplace === "Shopee"
          ? recapShopeeTotalBiaya
          : recapMarketplace === "Tokopedia" || recapMarketplace === "TikTok"
            ? recapMarketplaceTotalBiaya
            : recapOngkir;
      const biayaDetail: RecapBiayaItem[] =
        recapMarketplace === "Shopee"
          ? [
              { label: "Biaya Administrasi", value: recapShopeeBiayaAdmin },
              { label: "Biaya Layanan Promo XTRA", value: recapShopeeBiayaLayananPromoXtra },
              { label: "Biaya Layanan Gratis Ongkir XTRA", value: recapShopeeBiayaLayananGratisOngkirXtra },
              { label: "Biaya Program Hemat Biaya Kirim", value: recapShopeeBiayaProgramHematKirim },
              { label: "Biaya Proses Pesanan", value: recapShopeeBiayaProsesPesanan },
              { label: "Biaya Komisi AMS", value: recapShopeeKomisiAmsAktif ? recapShopeeBiayaKomisiAms : 0 },
              { label: "Biaya Premi", value: recapShopeePremiAktif ? recapShopeeBiayaPremi : 0 }
            ].filter((item) => item.value > 0)
          : recapMarketplace === "Tokopedia" || recapMarketplace === "TikTok"
            ? [
                { label: "Biaya Komisi Platform", value: recapMarketplaceBiayaKomisiPlatform },
                { label: "Biaya Layanan Mall", value: recapMarketplaceBiayaLayananMall },
                { label: "Komisi Dinamis", value: recapMarketplaceKomisiDinamis },
                { label: "Komisi Afiliasi", value: komisiAfiliasiMarketplace },
                { label: "Biaya Pemrosesan Pesanan", value: recapMarketplaceBiayaPemrosesanPesanan }
              ].filter((item) => item.value > 0)
            : [{ label: "Biaya Lain", value: recapOngkir }];

      let row: SalesRecapRow = {
        id: createRecapRowId(),
        tanggal: recapTanggal,
        marketplace: recapMarketplace,
        status: "sukses",
        alasanCancel: "",
        nominalCancel: 0,
        tanggalCancel: null,
        createdAt: new Date().toISOString(),
        orderItems: recapOrderItems
          .map((item) => ({
            nama: item.nama.trim(),
            hargaJual: Math.max(0, Number(item.hargaJual) || 0),
            modal: Math.max(0, Number(item.modal) || 0),
            qty: Math.max(0, Number(item.qty) || 0)
          }))
          .filter((item) => item.nama && item.qty > 0),
        noPesanan: recapNoPesanan,
        pelanggan: recapPelanggan,
        omzet: Math.max(0, recapOmzet),
        modal: Math.max(0, recapModal),
        ongkir: Math.max(0, totalBiaya),
        biayaDetail: biayaDetail.length ? biayaDetail : [{ label: "Biaya", value: Math.max(0, totalBiaya) }],
        catatan: recapCatatan
      };

      let insertResult = await runSupabaseWithRetry(
        () => supabase.from(RECAP_SUPABASE_TABLE).insert([toRecapDbPayload(row, supportsOrderItemsColumn)]),
        2
      );
      if (insertResult.error && supportsOrderItemsColumn && isMissingColumnError(insertResult.error, "order_items")) {
        setSupportsOrderItemsColumn(false);
        insertResult = await runSupabaseWithRetry(
          () => supabase.from(RECAP_SUPABASE_TABLE).insert([toRecapDbPayload(row, false)]),
          2
        );
      }
      if (insertResult.error && isDuplicateIdError(insertResult.error)) {
        row = { ...row, id: createRecapRowId() };
        insertResult = await runSupabaseWithRetry(
          () => supabase.from(RECAP_SUPABASE_TABLE).insert([toRecapDbPayload(row, supportsOrderItemsColumn)]),
          1
        );
      }

      if (insertResult.error) {
        setRecapSyncStatus("error");
        setRecapSyncMessage("Gagal sinkronisasi. Coba lagi.");
        setRecapNotice(formatSupabaseError("Menyimpan rekap ke Supabase", insertResult.error));
        return false;
      }

      setRecapRows((prev) => {
        const next = [row, ...prev];
        writeRecapCache(next);
        return next;
      });
      setRecapSyncStatus("success");
      setRecapSyncMessage("Tersimpan ke Supabase.");
      setRecapNotice("Data rekap berhasil disimpan ke Supabase.");
      setRecapNoPesanan("");
      setRecapPelanggan("");
      setRecapOmzet(0);
      setRecapModal(0);
      setRecapOrderItems([{ id: `${Date.now()}`, nama: "", hargaJual: 0, modal: 0, qty: 1 }]);
      setRecapOngkir(0);
      setRecapMarketplaceBiayaKomisiPlatform(0);
      setRecapMarketplaceBiayaLayananMall(0);
      setRecapMarketplaceKomisiDinamis(0);
      setRecapMarketplaceKomisiAfiliasiAktif(false);
      setRecapMarketplaceKomisiAfiliasi(0);
      setRecapMarketplaceBiayaPemrosesanPesanan(0);
      setRecapShopeeBiayaAdmin(0);
      setRecapShopeeBiayaLayananPromoXtra(0);
      setRecapShopeeBiayaLayananGratisOngkirXtra(0);
      setRecapShopeeBiayaProgramHematKirim(0);
      setRecapShopeeBiayaProsesPesanan(0);
      setRecapShopeeKomisiAmsAktif(false);
      setRecapShopeeBiayaKomisiAms(0);
      setRecapShopeePremiAktif(false);
      setRecapShopeeBiayaPremi(0);
      setRecapCatatan("");
      return true;
    } finally {
      setIsRecapSaving(false);
    }
  }

  async function deleteRecapRow(id: string) {
    if (authUser?.role !== "admin") {
      setRecapNotice("Hanya role admin yang bisa menghapus data rekap.");
      return;
    }
    const { error } = await runSupabaseWithRetry(
      () => supabase.from(RECAP_SUPABASE_TABLE).delete().eq("id", id),
      2
    );
    if (error) {
      setRecapNotice(formatSupabaseError("Menghapus data rekap", error));
      return;
    }

    setRecapRows((prev) => {
      const next = prev.filter((row) => row.id !== id);
      writeRecapCache(next);
      return next;
    });
    setOpenBiayaDetailRow((prev) => (prev && prev.id === id ? null : prev));
    setEditRecapDraft((prev) => (prev && prev.id === id ? null : prev));
    if (cancelDraftRow?.id === id) {
      closeCancelDraft(true);
    } else {
      setCancelDraftRow((prev) => (prev && prev.id === id ? null : prev));
    }
    setRecapNotice("Data rekap berhasil dihapus.");
  }

  function openEditRecap(row: SalesRecapRow) {
    if (authUser?.role === "viewer") {
      setRecapNotice("Role viewer tidak punya izin mengubah data.");
      return;
    }
    setOpenBiayaDetailRow(null);
    closeCancelDraft(true);
    setEditRecapDraft({
      id: row.id,
      tanggal: row.tanggal,
      marketplace: row.marketplace,
      status: row.status,
      alasanCancel: row.alasanCancel,
      nominalCancel: Math.max(0, Number(row.nominalCancel) || 0),
      orderItems: row.orderItems.length ? row.orderItems.map((item) => ({ ...item })) : [],
      noPesanan: row.noPesanan,
      pelanggan: row.pelanggan,
      omzet: row.omzet,
      modal: row.modal,
      catatan: row.catatan,
      biayaDetail: row.biayaDetail.length ? row.biayaDetail.map((item) => ({ ...item })) : [{ label: "Biaya", value: row.ongkir }]
    });
  }

  function updateEditRecapField<K extends keyof Omit<RecapEditDraft, "biayaDetail">>(key: K, value: RecapEditDraft[K]) {
    setEditRecapDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateEditRecapBiayaDetail(index: number, field: "label" | "value", value: string | number) {
    setEditRecapDraft((prev) => {
      if (!prev) return prev;
      const next = prev.biayaDetail.map((item, idx) => {
        if (idx !== index) return item;
        if (field === "label") return { ...item, label: String(value) };
        return { ...item, value: Math.max(0, Number(value) || 0) };
      });
      return { ...prev, biayaDetail: next };
    });
  }

  function addEditRecapBiayaDetail() {
    setEditRecapDraft((prev) => (prev ? { ...prev, biayaDetail: [...prev.biayaDetail, { label: "", value: 0 }] } : prev));
  }

  function removeEditRecapBiayaDetail(index: number) {
    setEditRecapDraft((prev) => {
      if (!prev) return prev;
      if (prev.biayaDetail.length <= 1) return prev;
      return { ...prev, biayaDetail: prev.biayaDetail.filter((_, idx) => idx !== index) };
    });
  }

  async function saveEditRecap() {
    if (authUser?.role === "viewer") {
      setRecapNotice("Role viewer tidak punya izin mengubah data.");
      return;
    }
    if (!editRecapDraft) return;

    const sanitizedBiayaDetail = editRecapDraft.biayaDetail
      .map((item) => ({
        label: item.label.trim() || "Biaya",
        value: Math.max(0, Number(item.value) || 0)
      }))
      .filter((item) => item.label || item.value > 0);

    const biayaDetail = sanitizedBiayaDetail.length ? sanitizedBiayaDetail : [{ label: "Biaya", value: 0 }];
    const totalBiaya = biayaDetail.reduce((acc, item) => acc + item.value, 0);

    const updatedRow: SalesRecapRow = {
      id: editRecapDraft.id,
      tanggal: editRecapDraft.tanggal,
      marketplace: editRecapDraft.marketplace,
      status: editRecapDraft.status,
      alasanCancel: editRecapDraft.status === "cancel" ? editRecapDraft.alasanCancel.trim() : "",
      nominalCancel: editRecapDraft.status === "cancel" ? Math.max(0, Number(editRecapDraft.nominalCancel) || 0) : 0,
      tanggalCancel: editRecapDraft.status === "cancel" ? new Date().toISOString() : null,
      createdAt: recapRows.find((row) => row.id === editRecapDraft.id)?.createdAt ?? null,
      orderItems: editRecapDraft.orderItems.length ? editRecapDraft.orderItems.map((item) => ({ ...item })) : [],
      noPesanan: editRecapDraft.noPesanan,
      pelanggan: editRecapDraft.pelanggan,
      omzet: Math.max(0, Number(editRecapDraft.omzet) || 0),
      modal: Math.max(0, Number(editRecapDraft.modal) || 0),
      ongkir: totalBiaya,
      biayaDetail,
      catatan: editRecapDraft.catatan
    };

    let updateResult = await runSupabaseWithRetry(
      () =>
        supabase
          .from(RECAP_SUPABASE_TABLE)
          .update(toRecapDbPayload(updatedRow, supportsOrderItemsColumn))
          .eq("id", updatedRow.id),
      2
    );
    if (updateResult.error && supportsOrderItemsColumn && isMissingColumnError(updateResult.error, "order_items")) {
      setSupportsOrderItemsColumn(false);
      updateResult = await runSupabaseWithRetry(
        () =>
          supabase
            .from(RECAP_SUPABASE_TABLE)
            .update(toRecapDbPayload(updatedRow, false))
            .eq("id", updatedRow.id),
        2
      );
    }
    if (updateResult.error) {
      setRecapNotice(formatSupabaseError("Memperbarui data rekap", updateResult.error));
      return;
    }

    setRecapRows((prev) => {
      const next = prev.map((row) => (row.id === updatedRow.id ? updatedRow : row));
      writeRecapCache(next);
      return next;
    });
    setOpenBiayaDetailRow((prev) => (prev && prev.id === updatedRow.id ? updatedRow : prev));
    setEditRecapDraft(null);
    setRecapNotice("Data rekap berhasil diperbarui di Supabase.");
  }

  async function toggleRecapCancelStatus(row: SalesRecapRow) {
    if (authUser?.role === "viewer") {
      setRecapNotice("Role viewer tidak punya izin mengubah status transaksi.");
      return;
    }
    if (cancelStatusSaving) return;

    if (row.status === "cancel") {
      await applyRecapCancelStatus(row, "sukses", "", 0);
      return;
    }

    if (cancelDraftRow?.id === row.id) {
      closeCancelDraft();
      return;
    }

    if (cancelDraftCloseTimerRef.current !== null) {
      window.clearTimeout(cancelDraftCloseTimerRef.current);
      cancelDraftCloseTimerRef.current = null;
    }
    setCancelDraftClosingId(null);
    setCancelDraftRow(row);
    setCancelDraftReason(row.alasanCancel || "");
    setCancelDraftNominal(Math.max(0, Number(row.nominalCancel) || 0));
  }

  async function applyRecapCancelStatus(
    row: SalesRecapRow,
    nextStatus: SalesRecapRow["status"],
    reason: string,
    nominalCancel: number
  ) {
    const updatedRow: SalesRecapRow = {
      ...row,
      status: nextStatus,
      alasanCancel: nextStatus === "cancel" ? reason.trim() : "",
      nominalCancel: nextStatus === "cancel" ? Math.max(0, Number(nominalCancel) || 0) : 0,
      tanggalCancel: nextStatus === "cancel" ? new Date().toISOString() : null
    };

    const cancelPayload = {
      status: updatedRow.status,
      alasan_cancel: updatedRow.alasanCancel,
      nominal_cancel: updatedRow.nominalCancel,
      tanggal_cancel: updatedRow.tanggalCancel
    };

    setCancelStatusSaving(true);
    let updateResult = await runSupabaseWithRetry(
      () =>
        supabase
          .from(RECAP_SUPABASE_TABLE)
          .update(cancelPayload, { count: "exact" })
          .eq("id", row.id),
      2
    );

    if (updateResult.error) {
      if (
        isAnyMissingColumnError(updateResult.error, [
          "status",
          "alasan_cancel",
          "nominal_cancel",
          "tanggal_cancel"
        ])
      ) {
        setRecapNotice(
          "Update status cancel gagal karena kolom cancel belum ada di tabel Supabase. Jalankan migration `20260418_recap_cancel_status.sql` dan `20260418_recap_cancel_nominal.sql`."
        );
      } else {
        setRecapNotice(formatSupabaseError("Mengubah status cancel transaksi", updateResult.error));
      }
      setCancelStatusSaving(false);
      return false;
    }

    const rawAffectedRows = (updateResult as { count?: unknown }).count;
    const affectedRows = typeof rawAffectedRows === "number" ? rawAffectedRows : null;
    if (affectedRows === 0) {
      setRecapNotice(
        "Status cancel tidak tersimpan karena tidak ada baris yang ter-update. Cek id data dan policy UPDATE/RLS di Supabase."
      );
      setCancelStatusSaving(false);
      return false;
    }

    setRecapRows((prev) => {
      const next = prev.map((it) => (it.id === updatedRow.id ? updatedRow : it));
      writeRecapCache(next);
      return next;
    });
    setOpenBiayaDetailRow((prev) => (prev && prev.id === updatedRow.id ? updatedRow : prev));
    setCancelStatusSaving(false);
    setRecapNotice(
      nextStatus === "cancel"
        ? "Transaksi ditandai sebagai cancel."
        : "Status transaksi berhasil dikembalikan ke sukses."
    );
    return true;
  }

  async function confirmRecapCancel() {
    if (!cancelDraftRow) return;
    const ok = await applyRecapCancelStatus(
      cancelDraftRow,
      "cancel",
      cancelDraftReason,
      cancelDraftNominal
    );
    if (!ok) return;
    closeCancelDraft();
  }

  function closeCancelDraft(immediate = false) {
    if (cancelDraftCloseTimerRef.current !== null) {
      window.clearTimeout(cancelDraftCloseTimerRef.current);
      cancelDraftCloseTimerRef.current = null;
    }

    if (!cancelDraftRow || immediate) {
      setCancelDraftClosingId(null);
      setCancelDraftRow(null);
      setCancelDraftReason("");
      setCancelDraftNominal(0);
      return;
    }

    const closingId = cancelDraftRow.id;
    setCancelDraftClosingId(closingId);
    cancelDraftCloseTimerRef.current = window.setTimeout(() => {
      setCancelDraftClosingId(null);
      setCancelDraftRow(null);
      setCancelDraftReason("");
      setCancelDraftNominal(0);
      cancelDraftCloseTimerRef.current = null;
    }, 240);
  }

  useEffect(() => {
    return () => {
      if (cancelDraftCloseTimerRef.current !== null) {
        window.clearTimeout(cancelDraftCloseTimerRef.current);
      }
    };
  }, []);

  function isCancelDraftVisibleForRow(rowId: string) {
    return cancelDraftRow?.id === rowId || cancelDraftClosingId === rowId;
  }

  function isCancelDraftOpenForRow(rowId: string) {
    return cancelDraftRow?.id === rowId;
  }

  function getCancelDraftPanelClass(rowId: string) {
    return isCancelDraftOpenForRow(rowId)
      ? "cancel-inline-panel cancel-inline-panel-open"
      : "cancel-inline-panel cancel-inline-panel-close";
  }

  function exportRecapPdf() {
    const byPeriodRows = recapRows.filter((row) => {
      const passStartDate = recapFilterStartDate ? row.tanggal >= recapFilterStartDate : true;
      const passEndDate = recapFilterEndDate ? row.tanggal <= recapFilterEndDate : true;
      return passStartDate && passEndDate;
    });

    if (!byPeriodRows.length) {
      setRecapNotice("Tidak ada data pada periode tanggal yang dipilih.");
      return;
    }

    const suksesRows = byPeriodRows.filter((row) => row.status === "sukses");
    const cancelRows = byPeriodRows.filter((row) => row.status === "cancel");

    const summary = suksesRows.reduce(
      (acc, row) => {
        acc.omzet += row.omzet;
        acc.modal += row.modal;
        acc.biaya += row.ongkir;
        acc.laba += row.omzet - row.modal - row.ongkir;
        acc.transaksiSukses += 1;
        return acc;
      },
      { omzet: 0, modal: 0, biaya: 0, laba: 0, transaksiSukses: 0 }
    );
    const totalBiayaCancel = cancelRows.reduce((acc, row) => acc + Math.max(0, Number(row.nominalCancel) || 0), 0);
    const labaFinal = summary.laba - totalBiayaCancel;

    const byMarketplace: Record<SalesRecapRow["marketplace"], { omzet: number; laba: number; transaksi: number; cancel: number; biayaCancel: number }> = {
      Tokopedia: { omzet: 0, laba: 0, transaksi: 0, cancel: 0, biayaCancel: 0 },
      Shopee: { omzet: 0, laba: 0, transaksi: 0, cancel: 0, biayaCancel: 0 },
      TikTok: { omzet: 0, laba: 0, transaksi: 0, cancel: 0, biayaCancel: 0 }
    };

    for (const row of byPeriodRows) {
      byMarketplace[row.marketplace].transaksi += 1;
      if (row.status === "cancel") {
        byMarketplace[row.marketplace].cancel += 1;
        byMarketplace[row.marketplace].biayaCancel += Math.max(0, Number(row.nominalCancel) || 0);
        continue;
      }
      byMarketplace[row.marketplace].omzet += row.omzet;
      byMarketplace[row.marketplace].laba += row.omzet - row.modal - row.ongkir;
    }

    const idDateFormatter = new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
    const formatDate = (value: string) => {
      if (!value) return "-";
      const date = new Date(`${value}T00:00:00`);
      if (Number.isNaN(date.getTime())) return value;
      return idDateFormatter.format(date);
    };
    const periodLabel =
      recapFilterStartDate || recapFilterEndDate
        ? `${formatDate(recapFilterStartDate)} s/d ${formatDate(recapFilterEndDate)}`
        : "Semua tanggal";
    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const rowsHtml = byPeriodRows
      .map((row, idx) => {
        const labaSukses = row.omzet - row.modal - row.ongkir;
        const labaFinalTransaksi = labaSukses - row.nominalCancel;
        const statusLabel = row.status === "cancel" ? "Cancel" : "Sukses";
        return `
          <tr class="${row.status === "cancel" ? "cancel-row" : ""}">
            <td>${idx + 1}</td>
            <td>${escapeHtml(row.tanggal)}</td>
            <td>${escapeHtml(row.marketplace)}</td>
            <td><span class="status-badge ${row.status === "cancel" ? "status-cancel" : "status-success"}">${escapeHtml(statusLabel)}</span></td>
            <td>${escapeHtml(row.noPesanan || "-")}</td>
            <td>${escapeHtml(row.pelanggan || "-")}</td>
            <td class="num">${rupiah(row.omzet)}</td>
            <td class="num">${rupiah(row.modal)}</td>
            <td class="num">${rupiah(row.ongkir)}</td>
            <td class="num ${row.nominalCancel > 0 ? "neg" : ""}">${rupiah(row.nominalCancel)}</td>
            <td class="num ${labaSukses < 0 ? "neg" : ""}">${rupiah(labaSukses)}</td>
            <td class="num ${labaFinalTransaksi < 0 ? "neg" : ""}">${rupiah(labaFinalTransaksi)}</td>
            <td>${escapeHtml(row.catatan || "-")}</td>
            <td>${escapeHtml(row.alasanCancel || "-")}</td>
          </tr>
        `;
      })
      .join("");

    const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Rekap Penjualan PDF</title>
        <style>
          body { font-family: Arial, sans-serif; color: #0f172a; margin: 20px; }
          h1 { margin: 0 0 4px; font-size: 20px; }
          p { margin: 0 0 4px; font-size: 12px; color: #334155; }
          .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin: 14px 0; }
          .box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; }
          .box b { display: block; font-size: 13px; margin-top: 4px; color: #0f172a; }
          .market { margin: 12px 0; }
          .market table { width: 100%; border-collapse: collapse; }
          .market th, .market td { border: 1px solid #e2e8f0; padding: 6px 8px; font-size: 12px; text-align: left; }
          .market td.num, .data td.num { text-align: right; }
          .data { width: 100%; border-collapse: collapse; margin-top: 12px; }
          .data th, .data td { border: 1px solid #e2e8f0; padding: 6px 8px; font-size: 11px; vertical-align: top; }
          .data thead { background: #f1f5f9; }
          .data td.num, .data th.num { text-align: right; }
          .cancel-row td { background: #fff1f2; }
          .status-badge { display: inline-block; border-radius: 999px; padding: 2px 8px; font-size: 10px; font-weight: 700; }
          .status-success { background: #dcfce7; color: #166534; }
          .status-cancel { background: #ffe4e6; color: #be123c; }
          .neg { color: #be123c; }
        </style>
      </head>
      <body>
        <h1>Rekap Penjualan Marketplace</h1>
        <p>Periode: <strong>${escapeHtml(periodLabel)}</strong></p>
        <p>Tanggal cetak: ${escapeHtml(idDateFormatter.format(new Date()))}</p>

        <div class="summary">
          <div class="box">Total Transaksi<b>${byPeriodRows.length}</b></div>
          <div class="box">Transaksi Sukses<b>${summary.transaksiSukses}</b></div>
          <div class="box">Transaksi Cancel<b>${cancelRows.length}</b></div>
          <div class="box">Total Omzet<b>${rupiah(summary.omzet)}</b></div>
          <div class="box">Total Modal<b>${rupiah(summary.modal)}</b></div>
          <div class="box">Total Biaya<b>${rupiah(summary.biaya)}</b></div>
          <div class="box">Laba Bersih<b class="${summary.laba < 0 ? "neg" : ""}">${rupiah(summary.laba)}</b></div>
          <div class="box">Biaya Cancel<b class="${totalBiayaCancel > 0 ? "neg" : ""}">${rupiah(totalBiayaCancel)}</b></div>
          <div class="box">Laba Final<b class="${labaFinal < 0 ? "neg" : ""}">${rupiah(labaFinal)}</b></div>
        </div>

        <div class="market">
          <table>
            <thead>
              <tr>
                <th>Marketplace</th>
                <th class="num">Transaksi</th>
                <th class="num">Cancel</th>
                <th class="num">Biaya Cancel</th>
                <th class="num">Omzet</th>
                <th class="num">Laba</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Tokopedia</td><td class="num">${byMarketplace.Tokopedia.transaksi}</td><td class="num">${byMarketplace.Tokopedia.cancel}</td><td class="num">${rupiah(byMarketplace.Tokopedia.biayaCancel)}</td><td class="num">${rupiah(byMarketplace.Tokopedia.omzet)}</td><td class="num ${byMarketplace.Tokopedia.laba < 0 ? "neg" : ""}">${rupiah(byMarketplace.Tokopedia.laba)}</td></tr>
              <tr><td>Shopee</td><td class="num">${byMarketplace.Shopee.transaksi}</td><td class="num">${byMarketplace.Shopee.cancel}</td><td class="num">${rupiah(byMarketplace.Shopee.biayaCancel)}</td><td class="num">${rupiah(byMarketplace.Shopee.omzet)}</td><td class="num ${byMarketplace.Shopee.laba < 0 ? "neg" : ""}">${rupiah(byMarketplace.Shopee.laba)}</td></tr>
              <tr><td>TikTok</td><td class="num">${byMarketplace.TikTok.transaksi}</td><td class="num">${byMarketplace.TikTok.cancel}</td><td class="num">${rupiah(byMarketplace.TikTok.biayaCancel)}</td><td class="num">${rupiah(byMarketplace.TikTok.omzet)}</td><td class="num ${byMarketplace.TikTok.laba < 0 ? "neg" : ""}">${rupiah(byMarketplace.TikTok.laba)}</td></tr>
            </tbody>
          </table>
        </div>

        <table class="data">
          <thead>
            <tr>
              <th>No</th>
              <th>Tanggal</th>
              <th>Marketplace</th>
              <th>Status</th>
              <th>No Pesanan</th>
              <th>Pelanggan</th>
              <th class="num">Omzet</th>
              <th class="num">Modal</th>
              <th class="num">Biaya</th>
              <th class="num">Biaya Cancel</th>
              <th class="num">Laba (Sukses)</th>
              <th class="num">Laba Final</th>
              <th>Catatan</th>
              <th>Alasan Cancel</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <script>
          window.onload = function () { setTimeout(function () { window.print(); }, 120); };
        </script>
      </body>
    </html>`;

    const w = window.open("", "_blank", "width=1280,height=800");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    setRecapNotice(`PDF siap dicetak untuk periode ${periodLabel}.`);
  }

  const filteredRecapRows = useMemo(() => {
    const query = recapFilterQuery.trim().toLowerCase();

    return recapRows.filter((row) => {
      const passMarketplace = recapFilterMarketplace === "Semua" ? true : row.marketplace === recapFilterMarketplace;
      const passStatus = recapFilterStatus === "Semua" ? true : row.status === recapFilterStatus;
      const passStartDate = recapFilterStartDate ? row.tanggal >= recapFilterStartDate : true;
      const passEndDate = recapFilterEndDate ? row.tanggal <= recapFilterEndDate : true;
      const passQuery = query
        ? `${row.noPesanan} ${row.pelanggan} ${row.catatan} ${row.alasanCancel} ${row.nominalCancel}`.toLowerCase().includes(query)
        : true;

      return passMarketplace && passStatus && passStartDate && passEndDate && passQuery;
    });
  }, [recapRows, recapFilterMarketplace, recapFilterStatus, recapFilterStartDate, recapFilterEndDate, recapFilterQuery]);

  const recapSummary = useMemo(() => {
    const suksesRows = filteredRecapRows.filter((r) => r.status === "sukses");
    const cancelRows = filteredRecapRows.filter((r) => r.status === "cancel");
    const omzet = suksesRows.reduce((acc, r) => acc + r.omzet, 0);
    const modal = suksesRows.reduce((acc, r) => acc + r.modal, 0);
    const ongkir = suksesRows.reduce((acc, r) => acc + r.ongkir, 0);
    const totalBiayaCancel = cancelRows.reduce((acc, r) => acc + Math.max(0, Number(r.nominalCancel) || 0), 0);
    const laba = omzet - modal - ongkir;
    const labaFinal = laba - totalBiayaCancel;
    const transaksi = filteredRecapRows.length;
    const transaksiSukses = suksesRows.length;
    const transaksiCancel = cancelRows.length;
    const cancelRate = transaksi > 0 ? (transaksiCancel / transaksi) * 100 : 0;
    return { omzet, modal, ongkir, laba, labaFinal, totalBiayaCancel, transaksi, transaksiSukses, transaksiCancel, cancelRate };
  }, [filteredRecapRows]);

  const recapByMarketplace = useMemo(() => {
    const groups: Record<SalesRecapRow["marketplace"], { omzet: number; laba: number; transaksi: number; cancel: number; biayaCancel: number }> = {
      Tokopedia: { omzet: 0, laba: 0, transaksi: 0, cancel: 0, biayaCancel: 0 },
      Shopee: { omzet: 0, laba: 0, transaksi: 0, cancel: 0, biayaCancel: 0 },
      TikTok: { omzet: 0, laba: 0, transaksi: 0, cancel: 0, biayaCancel: 0 }
    };

    for (const row of filteredRecapRows) {
      groups[row.marketplace].transaksi += 1;
      if (row.status === "cancel") {
        groups[row.marketplace].cancel += 1;
        groups[row.marketplace].biayaCancel += Math.max(0, Number(row.nominalCancel) || 0);
        continue;
      }
      groups[row.marketplace].omzet += row.omzet;
      groups[row.marketplace].laba += row.omzet - row.modal - row.ongkir;
    }

    return groups;
  }, [filteredRecapRows]);

  const recapAiInsights = useMemo(() => {
    if (!filteredRecapRows.length) return [] as string[];

    const insights: string[] = [];
    const activeMarkets = (Object.keys(recapByMarketplace) as SalesRecapRow["marketplace"][])
      .map((name) => ({ name, ...recapByMarketplace[name] }))
      .filter((item) => item.transaksi > 0)
      .sort((a, b) => b.laba - a.laba);

    if (activeMarkets.length) {
      const best = activeMarkets[0];
      insights.push(
        `Marketplace paling profit saat ini: ${best.name} (${best.transaksi} transaksi, laba ${rupiah(best.laba)}).`
      );
    }

    if (activeMarkets.length > 1) {
      const weakest = activeMarkets[activeMarkets.length - 1];
      insights.push(
        `Marketplace yang perlu dievaluasi: ${weakest.name} (laba ${rupiah(weakest.laba)}).`
      );
    }

    const avgOmzet = recapSummary.transaksiSukses > 0 ? recapSummary.omzet / recapSummary.transaksiSukses : 0;
    const avgLaba = recapSummary.transaksiSukses > 0 ? recapSummary.laba / recapSummary.transaksiSukses : 0;
    insights.push(`Rata-rata omzet per transaksi: ${rupiah(avgOmzet)}.`);
    insights.push(`Rata-rata laba per transaksi: ${rupiah(avgLaba)}.`);
    if (recapSummary.transaksiCancel > 0) {
      insights.push(`Cancel rate: ${recapSummary.cancelRate.toFixed(1)}% (${recapSummary.transaksiCancel} transaksi cancel).`);
      insights.push(`Total biaya cancel: ${rupiah(recapSummary.totalBiayaCancel)}.`);
      insights.push(`Laba final setelah biaya cancel: ${rupiah(recapSummary.labaFinal)}.`);
    }

    const ratioBiaya = recapSummary.omzet > 0 ? (recapSummary.ongkir / recapSummary.omzet) * 100 : 0;
    insights.push(`Rasio biaya terhadap omzet: ${ratioBiaya.toFixed(1)}%.`);

    const suksesRows = filteredRecapRows.filter((row) => row.status === "sukses");
    const rugiCount = suksesRows.filter((row) => row.omzet - row.modal - row.ongkir < 0).length;
    if (rugiCount > 0) {
      insights.push(`Ada ${rugiCount} transaksi rugi, cek detail biaya untuk menekan kebocoran margin.`);
    }

    const highCostCount = suksesRows.filter((row) => row.omzet > 0 && row.ongkir / row.omzet >= 0.2).length;
    if (highCostCount > 0) {
      insights.push(`Ada ${highCostCount} transaksi dengan rasio biaya >= 20% dari omzet.`);
    }

    if (suksesRows.length >= 4) {
      const sortedRows = [...suksesRows].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
      const half = Math.floor(sortedRows.length / 2);
      const firstHalf = sortedRows.slice(0, half);
      const secondHalf = sortedRows.slice(half);
      const avgFirst =
        firstHalf.reduce((acc, row) => acc + (row.omzet - row.modal - row.ongkir), 0) / Math.max(1, firstHalf.length);
      const avgSecond =
        secondHalf.reduce((acc, row) => acc + (row.omzet - row.modal - row.ongkir), 0) / Math.max(1, secondHalf.length);
      const diff = avgSecond - avgFirst;

      if (Math.abs(diff) < 1000) {
        insights.push("Tren laba relatif stabil di periode terfilter.");
      } else if (diff > 0) {
        insights.push(`Tren laba membaik, naik sekitar ${rupiah(diff)} per transaksi.`);
      } else {
        insights.push(`Tren laba menurun, turun sekitar ${rupiah(Math.abs(diff))} per transaksi.`);
      }
    }

    return insights;
  }, [filteredRecapRows, recapSummary, recapByMarketplace]);

  const recapShopeeTotalBiaya = useMemo(() => {
    const komisiAms = recapShopeeKomisiAmsAktif ? recapShopeeBiayaKomisiAms : 0;
    const premi = recapShopeePremiAktif ? recapShopeeBiayaPremi : 0;
    return (
      recapShopeeBiayaAdmin +
      recapShopeeBiayaLayananPromoXtra +
      recapShopeeBiayaLayananGratisOngkirXtra +
      recapShopeeBiayaProgramHematKirim +
      recapShopeeBiayaProsesPesanan +
      komisiAms +
      premi
    );
  }, [
    recapShopeeBiayaAdmin,
    recapShopeeBiayaLayananPromoXtra,
    recapShopeeBiayaLayananGratisOngkirXtra,
    recapShopeeBiayaProgramHematKirim,
    recapShopeeBiayaProsesPesanan,
    recapShopeeKomisiAmsAktif,
    recapShopeeBiayaKomisiAms,
    recapShopeePremiAktif,
    recapShopeeBiayaPremi
  ]);

  const recapMarketplaceTotalBiaya = useMemo(() => {
    const komisiAfiliasiMarketplace = recapMarketplaceKomisiAfiliasiAktif ? recapMarketplaceKomisiAfiliasi : 0;
    return (
      recapMarketplaceBiayaKomisiPlatform +
      recapMarketplaceBiayaLayananMall +
      recapMarketplaceKomisiDinamis +
      komisiAfiliasiMarketplace +
      recapMarketplaceBiayaPemrosesanPesanan
    );
  }, [
    recapMarketplaceBiayaKomisiPlatform,
    recapMarketplaceBiayaLayananMall,
    recapMarketplaceKomisiDinamis,
    recapMarketplaceKomisiAfiliasiAktif,
    recapMarketplaceKomisiAfiliasi,
    recapMarketplaceBiayaPemrosesanPesanan
  ]);

  const recapLineChart = useMemo(() => {
    const omzetByDate = new Map<string, number>();
    for (const row of recapRows) {
      const prev = omzetByDate.get(row.tanggal) ?? 0;
      omzetByDate.set(row.tanggal, prev + row.omzet);
    }

    const sorted = Array.from(omzetByDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const recent = sorted.slice(-7);
    const values = recent.map((item) => item[1]);
    const labels = recent.map((item) => item[0].slice(5));
    const maxValue = Math.max(...values, 1);

    const width = 680;
    const height = 190;
    const padX = 24;
    const padY = 22;

    const points = recent.map((item, index) => {
      const x =
        recent.length <= 1
          ? width / 2
          : padX + (index * (width - padX * 2)) / (recent.length - 1);
      const y = height - padY - (item[1] / maxValue) * (height - padY * 2);
      return { x, y, value: item[1], date: item[0] };
    });

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");

    const areaPath = points.length
      ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${(height - padY).toFixed(2)} L ${points[0].x.toFixed(2)} ${(height - padY).toFixed(2)} Z`
      : "";

    const latestValue = values.length ? values[values.length - 1] : 0;
    const previousValue = values.length > 1 ? values[values.length - 2] : latestValue;
    const deltaPct =
      previousValue > 0 ? ((latestValue - previousValue) / previousValue) * 100 : latestValue > 0 ? 100 : 0;

    return {
      width,
      height,
      padY,
      points,
      linePath,
      areaPath,
      labels,
      latestValue,
      deltaPct,
      hasData: points.length > 0
    };
  }, [recapRows]);

  const recapCancelTrend = useMemo(() => {
    const cancelByDate = new Map<string, { count: number; nominal: number }>();
    const dayMs = 24 * 60 * 60 * 1000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let earliestCancelDate: Date | null = null;
    let thisWeekCount = 0;
    let prevWeekCount = 0;
    let thisWeekNominal = 0;
    let prevWeekNominal = 0;

    for (const row of recapRows) {
      if (row.status !== "cancel") continue;
      const nominal = Math.max(0, Number(row.nominalCancel) || 0);
      const prev = cancelByDate.get(row.tanggal) ?? { count: 0, nominal: 0 };
      cancelByDate.set(row.tanggal, { count: prev.count + 1, nominal: prev.nominal + nominal });

      const dateObj = new Date(`${row.tanggal}T00:00:00`);
      if (Number.isNaN(dateObj.getTime())) continue;
      if (!earliestCancelDate || dateObj.getTime() < earliestCancelDate.getTime()) {
        earliestCancelDate = dateObj;
      }
    }

    const allDays =
      earliestCancelDate !== null
        ? Math.max(1, Math.floor((today.getTime() - earliestCancelDate.getTime()) / dayMs) + 1)
        : 7;
    const periodDays = cancelTrendDays === "all" ? allDays : cancelTrendDays;

    for (const row of recapRows) {
      if (row.status !== "cancel") continue;
      const nominal = Math.max(0, Number(row.nominalCancel) || 0);
      const dateObj = new Date(`${row.tanggal}T00:00:00`);
      if (Number.isNaN(dateObj.getTime())) continue;
      const diffDay = Math.floor((today.getTime() - dateObj.getTime()) / dayMs);
      if (diffDay >= 0 && diffDay < periodDays) {
        thisWeekCount += 1;
        thisWeekNominal += nominal;
      } else if (diffDay >= periodDays && diffDay < periodDays * 2) {
        prevWeekCount += 1;
        prevWeekNominal += nominal;
      }
    }

    const sorted = Array.from(cancelByDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const recent = sorted.slice(-periodDays).map(([date, val]) => ({ date, ...val, label: date.slice(5) }));
    const maxNominal = Math.max(1, ...recent.map((item) => item.nominal));
    const countDeltaPct =
      prevWeekCount > 0 ? ((thisWeekCount - prevWeekCount) / prevWeekCount) * 100 : thisWeekCount > 0 ? 100 : 0;
    const nominalDeltaPct =
      prevWeekNominal > 0
        ? ((thisWeekNominal - prevWeekNominal) / prevWeekNominal) * 100
        : thisWeekNominal > 0
          ? 100
          : 0;

    return {
      recent,
      maxNominal,
      periodDays,
      isAllRange: cancelTrendDays === "all",
      hasData: recent.length > 0,
      thisWeekCount,
      prevWeekCount,
      thisWeekNominal,
      prevWeekNominal,
      countDeltaPct,
      nominalDeltaPct
    };
  }, [recapRows, cancelTrendDays]);

  const recapProductLeaderboard = useMemo(() => {
    const productMap = new Map<
      string,
      {
        nama: string;
        qty: number;
        omzet: number;
        modal: number;
        labaKotor: number;
        cancelNominal: number;
        transaksi: number;
      }
    >();

    for (const row of filteredRecapRows) {
      if (!row.orderItems.length) continue;
      const totalOrderOmzet = row.orderItems.reduce(
        (acc, item) => acc + Math.max(0, Number(item.hargaJual) || 0) * Math.max(0, Number(item.qty) || 0),
        0
      );
      for (const item of row.orderItems) {
        const key = item.nama.trim().toLowerCase();
        if (!key) continue;
        const qty = Math.max(0, Number(item.qty) || 0);
        const omzet = Math.max(0, Number(item.hargaJual) || 0) * qty;
        const modal = Math.max(0, Number(item.modal) || 0) * qty;
        const labaKotor = omzet - modal;
        const cancelNominal =
          row.status === "cancel"
            ? totalOrderOmzet > 0
              ? (omzet / totalOrderOmzet) * row.nominalCancel
              : row.nominalCancel / Math.max(1, row.orderItems.length)
            : 0;
        const prev = productMap.get(key) ?? {
          nama: item.nama.trim(),
          qty: 0,
          omzet: 0,
          modal: 0,
          labaKotor: 0,
          cancelNominal: 0,
          transaksi: 0
        };
        productMap.set(key, {
          nama: prev.nama,
          qty: prev.qty + qty,
          omzet: prev.omzet + omzet,
          modal: prev.modal + modal,
          labaKotor: prev.labaKotor + labaKotor,
          cancelNominal: prev.cancelNominal + cancelNominal,
          transaksi: prev.transaksi + 1
        });
      }
    }

    const items = Array.from(productMap.values()).map((item) => ({
      ...item,
      labaFinal: item.labaKotor - item.cancelNominal
    }));

    const topQty = [...items].sort((a, b) => b.qty - a.qty).slice(0, 8);
    const topProfit = [...items].sort((a, b) => b.labaFinal - a.labaFinal).slice(0, 8);

    return { hasData: items.length > 0, totalProduk: items.length, topQty, topProfit };
  }, [filteredRecapRows]);

  const recapBusyHourAnalysis = useMemo(() => {
    const hourBuckets = new Map<number, { transaksi: number; sukses: number; cancel: number; omzet: number }>();

    for (const row of filteredRecapRows) {
      const source = row.createdAt ? new Date(row.createdAt) : new Date(`${row.tanggal}T00:00:00`);
      if (Number.isNaN(source.getTime())) continue;
      const hour = source.getHours();
      const prev = hourBuckets.get(hour) ?? { transaksi: 0, sukses: 0, cancel: 0, omzet: 0 };
      hourBuckets.set(hour, {
        transaksi: prev.transaksi + 1,
        sukses: prev.sukses + (row.status === "sukses" ? 1 : 0),
        cancel: prev.cancel + (row.status === "cancel" ? 1 : 0),
        omzet: prev.omzet + (row.status === "sukses" ? row.omzet : 0)
      });
    }

    const hours = Array.from({ length: 24 }, (_, hour) => {
      const base = hourBuckets.get(hour) ?? { transaksi: 0, sukses: 0, cancel: 0, omzet: 0 };
      return { hour, ...base };
    });
    const activeHours = hours.filter((h) => h.transaksi > 0);
    const topByTransaksi = [...activeHours].sort((a, b) => b.transaksi - a.transaksi)[0] ?? null;
    const topByOmzet = [...activeHours].sort((a, b) => b.omzet - a.omzet)[0] ?? null;

    return {
      hasData: activeHours.length > 0,
      activeHours,
      topByTransaksi,
      topByOmzet
    };
  }, [filteredRecapRows]);

  const recapRepeatBuyerCohort = useMemo(() => {
    const buyers = new Map<string, { buyer: string; transaksi: number; sukses: number; cancel: number; omzet: number; labaFinal: number }>();

    for (const row of filteredRecapRows) {
      const key = row.pelanggan.trim().toLowerCase();
      if (!key) continue;
      const prev = buyers.get(key) ?? { buyer: row.pelanggan.trim(), transaksi: 0, sukses: 0, cancel: 0, omzet: 0, labaFinal: 0 };
      const labaSukses = row.status === "sukses" ? row.omzet - row.modal - row.ongkir : 0;
      buyers.set(key, {
        buyer: prev.buyer,
        transaksi: prev.transaksi + 1,
        sukses: prev.sukses + (row.status === "sukses" ? 1 : 0),
        cancel: prev.cancel + (row.status === "cancel" ? 1 : 0),
        omzet: prev.omzet + (row.status === "sukses" ? row.omzet : 0),
        labaFinal: prev.labaFinal + labaSukses - row.nominalCancel
      });
    }

    const entries = Array.from(buyers.values());
    const repeatBuyers = entries.filter((b) => b.transaksi >= 2);
    const oneTimeBuyers = entries.filter((b) => b.transaksi === 1);
    const totalTransaksi = entries.reduce((acc, b) => acc + b.transaksi, 0);
    const repeatTransaksi = repeatBuyers.reduce((acc, b) => acc + b.transaksi, 0);
    const repeatOmzet = repeatBuyers.reduce((acc, b) => acc + b.omzet, 0);
    const repeatShare = totalTransaksi > 0 ? (repeatTransaksi / totalTransaksi) * 100 : 0;

    return {
      totalBuyer: entries.length,
      repeatBuyer: repeatBuyers.length,
      oneTimeBuyer: oneTimeBuyers.length,
      repeatTransaksi,
      repeatShare,
      repeatOmzet,
      topRepeatBuyers: repeatBuyers.sort((a, b) => b.transaksi - a.transaksi).slice(0, 8)
    };
  }, [filteredRecapRows]);

  const recapForecastWeekly = useMemo(() => {
    const omzetByDate = new Map<string, number>();
    const labaFinalByDate = new Map<string, number>();
    for (const row of recapRows) {
      const omzet = row.status === "sukses" ? row.omzet : 0;
      const labaSukses = row.status === "sukses" ? row.omzet - row.modal - row.ongkir : 0;
      const labaFinal = labaSukses - row.nominalCancel;
      omzetByDate.set(row.tanggal, (omzetByDate.get(row.tanggal) ?? 0) + omzet);
      labaFinalByDate.set(row.tanggal, (labaFinalByDate.get(row.tanggal) ?? 0) + labaFinal);
    }

    const dates = Array.from(omzetByDate.keys()).sort((a, b) => a.localeCompare(b));
    const recentDates = dates.slice(-14);
    const recentOmzet = recentDates.map((d) => omzetByDate.get(d) ?? 0);
    const recentLabaFinal = recentDates.map((d) => labaFinalByDate.get(d) ?? 0);
    const avgDailyOmzet =
      recentOmzet.length > 0 ? recentOmzet.reduce((acc, val) => acc + val, 0) / recentOmzet.length : 0;
    const avgDailyLabaFinal =
      recentLabaFinal.length > 0 ? recentLabaFinal.reduce((acc, val) => acc + val, 0) / recentLabaFinal.length : 0;

    const forecast7Omzet = avgDailyOmzet * 7;
    const forecast7LabaFinal = avgDailyLabaFinal * 7;
    const hasData = recentDates.length >= 3;

    return {
      hasData,
      basisHari: recentDates.length,
      avgDailyOmzet,
      avgDailyLabaFinal,
      forecast7Omzet,
      forecast7LabaFinal,
      latestDate: recentDates[recentDates.length - 1] ?? null
    };
  }, [recapRows]);

  const hasil = useMemo(() => {
    if (harga <= 0 || modal <= 0) {
      const emptyCalc: CalcResult = { total: 0, net: 0, rincian: [] };
      return {
        tokopedia: emptyCalc,
        shopee: emptyCalc,
        mall: emptyCalc,
        targetNet: 0,
        marginTokopedia: 0,
        marginShopee: 0,
        marginMall: 0,
        pctTokopedia: 0,
        pctShopee: 0,
        pctMall: 0,
        rekomTokopedia: 0,
        rekomShopee: 0,
        rekomMall: 0,
        best: { name: "-", margin: 0 }
      };
    }

    const tokopedia = calcTokopedia(
      harga,
      Number(tokopediaFee),
      tokopediaAfiliasiPct,
      tokopediaGratisOngkir,
      tokopediaAfiliasiAktif
    );

    const shopee = calcShopee(
      harga,
      Number(shopeeFee),
      shopeeAfiliasiPct,
      shopeeGratisOngkir,
      shopeePromo,
      shopeeAsuransi,
      shopeeAfiliasiAktif
    );

    const mall = calcMall(
      harga,
      Number(mallFee),
      mallAfiliasiPct,
      mallBiayaJasa,
      mallGratisOngkir,
      mallAfiliasiAktif
    );

    const targetNet = modal * (1 + targetMargin / 100);

    const marginTokopedia = tokopedia.net - modal;
    const marginShopee = shopee.net - modal;
    const marginMall = mall.net - modal;

    const pctTokopedia = modal > 0 ? (marginTokopedia / modal) * 100 : 0;
    const pctShopee = modal > 0 ? (marginShopee / modal) * 100 : 0;
    const pctMall = modal > 0 ? (marginMall / modal) * 100 : 0;

    const rekomTokopedia = cariHargaRekomendasi(targetNet, (hargaJual) =>
      calcTokopedia(
        hargaJual,
        Number(tokopediaFee),
        tokopediaAfiliasiPct,
        tokopediaGratisOngkir,
        tokopediaAfiliasiAktif
      ).net
    );

    const rekomShopee = cariHargaRekomendasi(targetNet, (hargaJual) =>
      calcShopee(
        hargaJual,
        Number(shopeeFee),
        shopeeAfiliasiPct,
        shopeeGratisOngkir,
        shopeePromo,
        shopeeAsuransi,
        shopeeAfiliasiAktif
      ).net
    );

    const rekomMall = cariHargaRekomendasi(targetNet, (hargaJual) =>
      calcMall(
        hargaJual,
        Number(mallFee),
        mallAfiliasiPct,
        mallBiayaJasa,
        mallGratisOngkir,
        mallAfiliasiAktif
      ).net
    );

    const best = [
      { name: "Tokopedia", margin: marginTokopedia },
      { name: "Shopee", margin: marginShopee },
      { name: "Tokopedia Mall", margin: marginMall }
    ].sort((a, b) => b.margin - a.margin)[0];

    return {
      tokopedia,
      shopee,
      mall,
      targetNet,
      marginTokopedia,
      marginShopee,
      marginMall,
      pctTokopedia,
      pctShopee,
      pctMall,
      rekomTokopedia,
      rekomShopee,
      rekomMall,
      best
    };
  }, [
    harga,
    modal,
    targetMargin,
    tokopediaFee,
    shopeeFee,
    mallFee,
    tokopediaGratisOngkir,
    tokopediaAfiliasiAktif,
    tokopediaAfiliasiPct,
    shopeeGratisOngkir,
    shopeePromo,
    shopeeAsuransi,
    shopeeAfiliasiAktif,
    shopeeAfiliasiPct,
    mallBiayaJasa,
    mallGratisOngkir,
    mallAfiliasiAktif,
    mallAfiliasiPct
  ]);

  const marketplaceHighlights = [
    {
      key: "tokopedia",
      title: MARKETPLACE_VISUAL.tokopedia.label,
      subtitle: "Marketplace stabil untuk jaga margin",
      net: hasil.tokopedia.net,
      margin: hasil.marginTokopedia,
      pct: hasil.pctTokopedia,
      rekom: hasil.rekomTokopedia
    },
    {
      key: "shopee",
      title: MARKETPLACE_VISUAL.shopee.label,
      subtitle: "Komponen promo paling fleksibel",
      net: hasil.shopee.net,
      margin: hasil.marginShopee,
      pct: hasil.pctShopee,
      rekom: hasil.rekomShopee
    },
    {
      key: "mall",
      title: MARKETPLACE_VISUAL.mall.label,
      subtitle: "Cocok untuk branding official store",
      net: hasil.mall.net,
      margin: hasil.marginMall,
      pct: hasil.pctMall,
      rekom: hasil.rekomMall
    }
  ] as const;

  const tokopediaFeatureCount = Number(tokopediaGratisOngkir) + Number(tokopediaAfiliasiAktif);
  const shopeeFeatureCount =
    Number(shopeeGratisOngkir !== "off") +
    Number(shopeePromo) +
    Number(shopeeAsuransi) +
    Number(shopeeAfiliasiAktif);
  const mallFeatureCount = Number(mallBiayaJasa) + Number(mallGratisOngkir) + Number(mallAfiliasiAktif);
  const sectionMeta: Record<
    SectionId,
    { title: string; subtitle: string; tone: string; chip: string; dot: string; badge: string; stats: string[] }
  > = {
    "kalkulator-potongan": {
      title: "Mode Kalkulator Aktif",
      subtitle: "Bandingkan margin dan net profit antar marketplace secara real-time.",
      tone: "from-emerald-50 to-white",
      chip: "bg-emerald-100 text-emerald-700",
      dot: "bg-emerald-500",
      badge: "Kalkulator",
      stats: [
        `Paling menguntungkan: ${hasil.best.name}`,
        `Target net: ${rupiah(hasil.targetNet)}`,
        `Harga jual aktif: ${rupiah(harga)}`
      ]
    },
    "pembuatan-nota": {
      title: "Mode Nota/Faktur Aktif",
      subtitle: "Siapkan invoice cepat dengan data pembeli, item, dan ringkasan total.",
      tone: "from-orange-50 to-white",
      chip: "bg-orange-100 text-orange-700",
      dot: "bg-orange-500",
      badge: "Nota/Faktur",
      stats: [
        `Jumlah item: ${invoiceItems.length}`,
        `Pembeli: ${invoiceBuyer || "-"}`,
        `Tanggal nota: ${invoiceDate || "-"}`
      ]
    },
    "rekap-penjualan": {
      title: "Mode Rekap Penjualan Aktif",
      subtitle: "Pantau transaksi, omzet, biaya, dan laba seluruh marketplace.",
      tone: "from-sky-50 to-white",
      chip: "bg-sky-100 text-sky-700",
      dot: "bg-sky-500",
      badge: "Rekap",
      stats: [
        `Total transaksi: ${recapSummary.transaksi}`,
        `Transaksi cancel: ${recapSummary.transaksiCancel}`,
        `Total omzet: ${rupiah(recapSummary.omzet)}`,
        `Laba final: ${rupiah(recapSummary.labaFinal)}`
      ]
    }
  };
  const activeMeta = sectionMeta[activeSection];
  const currentRole = authUser?.role ?? null;
  const allowedSections = currentRole ? ROLE_SECTION_ACCESS[currentRole] : [];
  const canManageRecap = currentRole === "admin" || currentRole === "staff";
  const canDeleteRecap = currentRole === "admin";
  const canManagePreset = currentRole === "admin" || currentRole === "staff";
  const roleEntries = useMemo(
    () => Object.entries(roleMap).sort((a, b) => a[0].localeCompare(b[0])),
    [roleMap]
  );

  useEffect(() => {
    if (!currentRole) return;
    if (allowedSections.includes(activeSection)) return;
    setActiveSection(allowedSections[0] ?? "rekap-penjualan");
  }, [activeSection, allowedSections, currentRole]);

  useEffect(() => {
    if (!currentRole) return;
    if (canManageRecap) return;
    setRecapMenu("hasil");
  }, [canManageRecap, currentRole]);

  if (!authReady) {
    return (
      <main className="mx-auto my-10 w-[92vw] max-w-md">
        <div className="card-shell p-6 text-center">
          <p className="text-sm font-medium text-slate-700">Memuat autentikasi...</p>
        </div>
      </main>
    );
  }

  if (!authUser) {
    return (
      <main className="mx-auto my-10 w-[92vw] max-w-md">
        <div className="card-shell p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Starcomp Login</p>
          <h1 className="mt-1 text-lg font-bold text-slate-900">Masuk ke Dashboard Marketplace</h1>
          <form onSubmit={handleLogin} className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm text-slate-600">
              <span>Email</span>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
              />
            </label>
            <label className="grid gap-1 text-sm text-slate-600">
              <span>Password</span>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
              />
            </label>
            <button
              type="submit"
              disabled={authLoading}
              className="rounded-2xl border border-stone-900 bg-slate-900 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {authLoading ? "Memproses..." : "Login"}
            </button>
          </form>
          {authNotice ? <p className="mt-3 text-xs text-rose-600">{authNotice}</p> : null}
        </div>
      </main>
    );
  }

  return (
    <main className="animate-fade-up relative mx-auto my-6 w-[94vw] max-w-[1320px] overflow-x-clip">
      <div className="animate-float-soft pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
      <div className="animate-float-soft pointer-events-none absolute -right-20 top-20 h-72 w-72 rounded-full bg-orange-300/20 blur-3xl" style={{ animationDelay: "1.2s" }} />
      <div className="animate-float-soft pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-sky-300/20 blur-3xl" style={{ animationDelay: "2.1s" }} />

      <header className="relative mb-4 overflow-hidden rounded-3xl border border-stone-200 bg-white/85 px-4 py-4 shadow-sm backdrop-blur-md md:px-6">
        <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-gradient-to-l from-stone-100/80 to-transparent md:block" />
        <div className="relative z-10 flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Starcomp Sales Toolkit</p>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-3xl">
                Sistem Pembantu Penjualan 3 Marketplace
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Simulasi biaya Tokopedia, Shopee, dan Tokopedia Mall dalam satu dashboard yang lebih dinamis.
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white/90 px-3 py-2 text-xs text-slate-600">
              <p className="break-all">
                Login: <strong className="text-slate-900">{authUser.email}</strong>
              </p>
              <p>
                Role: <strong className="uppercase text-slate-900">{authUser.role}</strong>
              </p>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-1 rounded-xl border border-stone-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-stone-100"
              >
                Logout
              </button>
            </div>
          </div>
          {activeSection === "kalkulator-potongan" ? (
            <div className="grid gap-2 md:grid-cols-3">
              {marketplaceHighlights.map((item, index) => {
                const visual = MARKETPLACE_VISUAL[item.key];
                return (
                  <div
                    key={`top-highlight-${item.key}`}
                    className={`animate-sweep-in relative overflow-hidden rounded-2xl border border-white/80 bg-white/90 p-3 ring-1 ${visual.ring}`}
                    style={{ animationDelay: `${index * 90}ms` }}
                  >
                    <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${visual.gradient}`} />
                    <div className="relative">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] ${visual.badge}`}>
                          {visual.short}
                        </span>
                        <span className="text-[11px] text-slate-500">{item.pct.toFixed(2)}%</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="text-[11px] text-slate-600">{item.subtitle}</p>
                      <p className={`mt-2 text-sm font-semibold ${visual.text}`}>Margin: {rupiah(item.margin)}</p>
                      <p className="text-[11px] text-slate-600">Net: {rupiah(item.net)}</p>
                      <p className="text-[11px] text-slate-500">Rekomendasi: {rupiahOrDash(item.rekom)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </header>

      <div className="sticky top-2 z-30 mb-4 lg:hidden">
        <div className="card-shell border-stone-200/80 bg-white/90 p-2 backdrop-blur-md">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Navigasi</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {allowedSections.includes("kalkulator-potongan") ? (
              <button
                type="button"
                onClick={() => setActiveSection("kalkulator-potongan")}
                className={`whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  activeSection === "kalkulator-potongan"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-stone-200 bg-white text-slate-700 hover:bg-stone-50"
                }`}
              >
                Kalkulator
              </button>
            ) : null}
            {allowedSections.includes("pembuatan-nota") ? (
              <button
                type="button"
                onClick={() => setActiveSection("pembuatan-nota")}
                className={`whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  activeSection === "pembuatan-nota"
                    ? "border-orange-300 bg-orange-50 text-orange-700"
                    : "border-stone-200 bg-white text-slate-700 hover:bg-stone-50"
                }`}
              >
                Nota/Faktur
              </button>
            ) : null}
            {allowedSections.includes("rekap-penjualan") ? (
              <button
                type="button"
                onClick={() => setActiveSection("rekap-penjualan")}
                className={`whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  activeSection === "rekap-penjualan"
                    ? "border-sky-300 bg-sky-50 text-sky-700"
                    : "border-stone-200 bg-white text-slate-700 hover:bg-stone-50"
                }`}
              >
                Rekap Penjualan
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="card-shell hidden h-fit p-3 lg:sticky lg:top-4 lg:block">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Navigasi</p>
          <nav className="grid gap-2 text-sm">
            {allowedSections.includes("kalkulator-potongan") ? (
              <button
                type="button"
                onClick={() => setActiveSection("kalkulator-potongan")}
                className={`rounded-2xl border px-3 py-2 text-left font-medium transition duration-200 hover:-translate-y-0.5 ${
                  activeSection === "kalkulator-potongan"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-stone-200 bg-white text-slate-700 hover:bg-stone-50"
                }`}
              >
                Kalkulator Potongan
              </button>
            ) : null}
            {allowedSections.includes("pembuatan-nota") ? (
              <button
                type="button"
                onClick={() => setActiveSection("pembuatan-nota")}
                className={`rounded-2xl border px-3 py-2 text-left font-medium transition duration-200 hover:-translate-y-0.5 ${
                  activeSection === "pembuatan-nota"
                    ? "border-orange-300 bg-orange-50 text-orange-700"
                    : "border-stone-200 bg-white text-slate-700 hover:bg-stone-50"
                }`}
              >
                Pembuatan Nota/Faktur
              </button>
            ) : null}
            {allowedSections.includes("rekap-penjualan") ? (
              <button
                type="button"
                onClick={() => setActiveSection("rekap-penjualan")}
                className={`rounded-2xl border px-3 py-2 text-left font-medium transition duration-200 hover:-translate-y-0.5 ${
                  activeSection === "rekap-penjualan"
                    ? "border-sky-300 bg-sky-50 text-sky-700"
                    : "border-stone-200 bg-white text-slate-700 hover:bg-stone-50"
                }`}
              >
                Rekap Penjualan Marketplace
              </button>
            ) : null}
          </nav>

          {currentRole === "admin" ? (
            <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50/90 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Manajemen Role</p>
              <p className="mt-1 text-[11px] text-slate-600">User baru otomatis viewer. Admin hanya untuk email utama.</p>
              <div className="mt-2 grid gap-2">
                <input
                  type="email"
                  placeholder="Email user"
                  value={roleTargetEmail}
                  onChange={(e) => setRoleTargetEmail(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                />
                <select
                  value={roleTargetValue}
                  onChange={(e) => setRoleTargetValue(e.target.value as UserRole)}
                  className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                >
                  <option value="viewer">viewer</option>
                  <option value="staff">staff</option>
                </select>
                <button
                  type="button"
                  onClick={handleSaveRole}
                  disabled={roleManageLoading}
                  className="rounded-xl border border-stone-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {roleManageLoading ? "Menyimpan..." : "Simpan Role"}
                </button>
              </div>
              {roleManageNotice ? <p className="mt-2 text-[11px] text-slate-600">{roleManageNotice}</p> : null}
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px]">
                  <span className="truncate text-emerald-800">{normalizeEmail(FIXED_ADMIN_EMAIL)}</span>
                  <strong className="uppercase text-emerald-700">admin</strong>
                </div>
                {roleEntries.map(([email, role]) => (
                  <div key={`role-${email}`} className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-2 py-1.5 text-[11px]">
                    <span className="flex-1 truncate text-slate-700">{email}</span>
                    <strong className="uppercase text-slate-900">{role}</strong>
                    <button
                      type="button"
                      onClick={() => handleResetRole(email)}
                      disabled={roleManageLoading}
                      className="rounded-lg border border-stone-300 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Reset
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {currentRole === "admin" ? (
            <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50/80 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">Health Check</p>
                <button
                  type="button"
                  onClick={runSupabaseHealthCheck}
                  disabled={healthCheckLoading}
                  className="rounded-xl border border-sky-300 bg-white px-2 py-1 text-[11px] font-medium text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {healthCheckLoading ? "Checking..." : "Run Check"}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-600">Cek auth, koneksi, dan akses tabel Supabase.</p>
              {healthCheckNotice ? <p className="mt-2 text-[11px] text-slate-700">{healthCheckNotice}</p> : null}
              {healthCheckResult ? (
                <div className="mt-2 space-y-1.5">
                  <div className={`rounded-xl border px-2 py-1.5 text-[11px] ${healthCheckResult.auth.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
                    <strong>Auth:</strong> {healthCheckResult.auth.message}
                  </div>
                  <div className={`rounded-xl border px-2 py-1.5 text-[11px] ${healthCheckResult.salesRecap.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
                    <strong>{RECAP_SUPABASE_TABLE}:</strong> {healthCheckResult.salesRecap.message}
                  </div>
                  <div className={`rounded-xl border px-2 py-1.5 text-[11px] ${healthCheckResult.userRoles.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
                    <strong>{USER_ROLE_TABLE}:</strong> {healthCheckResult.userRoles.message}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>

        <div className="min-w-0 space-y-5">
          {activeSection === "rekap-penjualan" ? (
          <section className="animate-sweep-in card-shell border border-sky-200/70 bg-gradient-to-r from-sky-50/80 via-white to-emerald-50/70 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Grafik Penjualan Harian</p>
                <p className="text-sm font-semibold text-slate-900">Omzet 7 Hari Terakhir (Realtime)</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  Realtime ON
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    recapLineChart.deltaPct >= 0 ? "bg-sky-100 text-sky-700" : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {recapLineChart.deltaPct >= 0 ? "+" : ""}
                  {recapLineChart.deltaPct.toFixed(1)}%
                </span>
              </div>
            </div>

            {recapLineChart.hasData ? (
              <div className="overflow-x-auto rounded-2xl border border-sky-100 bg-white/85 p-2">
                <svg viewBox={`0 0 ${recapLineChart.width} ${recapLineChart.height}`} className="h-52 w-full min-w-[520px] sm:min-w-[640px]">
                  <defs>
                    <linearGradient id="lineAreaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.03" />
                    </linearGradient>
                  </defs>

                  <line
                    x1="24"
                    y1={recapLineChart.height - recapLineChart.padY}
                    x2={recapLineChart.width - 24}
                    y2={recapLineChart.height - recapLineChart.padY}
                    stroke="#cbd5e1"
                    strokeDasharray="4 4"
                  />

                  {recapLineChart.areaPath ? (
                    <path d={recapLineChart.areaPath} fill="url(#lineAreaFill)" />
                  ) : null}
                  {recapLineChart.linePath ? (
                    <path d={recapLineChart.linePath} fill="none" stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round" />
                  ) : null}

                  {recapLineChart.points.map((point) => (
                    <g key={`line-point-${point.date}`}>
                      <circle cx={point.x} cy={point.y} r="4.5" fill="#fff" stroke="#0284c7" strokeWidth="2" />
                      <text x={point.x} y={point.y - 10} textAnchor="middle" fontSize="10" fill="#0f172a">
                        {Math.round(point.value / 1000)}k
                      </text>
                    </g>
                  ))}
                </svg>

                <div
                  className="mt-2 grid gap-1 text-center text-[11px] text-slate-500"
                  style={{ gridTemplateColumns: `repeat(${Math.max(recapLineChart.labels.length, 1)}, minmax(0, 1fr))` }}
                >
                  {recapLineChart.labels.map((label) => (
                    <span key={`line-label-${label}`}>{label}</span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-sky-100 bg-white/85 px-3 py-8 text-center text-sm text-slate-500">
                Belum ada data penjualan untuk ditampilkan di grafik garis.
              </div>
            )}

            <div className="mt-3 rounded-2xl border border-rose-200/70 bg-white/85 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-700">Cancel Trend</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {recapCancelTrend.isAllRange ? "Semua Riwayat" : `${recapCancelTrend.periodDays} Hari Terakhir`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {[7, 14, 30, "all"].map((day) => (
                    <button
                      key={`cancel-trend-day-${day}`}
                      type="button"
                      onClick={() => setCancelTrendDays(day as 7 | 14 | 30 | "all")}
                      className={`rounded-xl border px-2.5 py-1 text-[11px] font-semibold transition ${
                        recapCancelTrend.periodDays === day
                          || (day === "all" && recapCancelTrend.isAllRange)
                          ? "border-rose-300 bg-rose-100 text-rose-700"
                          : "border-stone-200 bg-white text-slate-600 hover:bg-stone-50"
                      }`}
                    >
                      {day === "all" ? "Semua" : `${day}H`}
                    </button>
                  ))}
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      recapCancelTrend.nominalDeltaPct <= 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {recapCancelTrend.nominalDeltaPct > 0 ? "+" : ""}
                    {recapCancelTrend.nominalDeltaPct.toFixed(1)}% nominal vs periode lalu
                  </span>
                </div>
              </div>
              {recapCancelTrend.hasData ? (
                <div className="space-y-1.5">
                  {recapCancelTrend.recent.map((item) => (
                    <div key={`cancel-trend-${item.date}`} className="rounded-xl border border-stone-200 bg-stone-50/70 px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-700">{item.label}</span>
                        <span className="text-rose-700">{item.count} cancel</span>
                        <span className="font-medium text-slate-700">{rupiah(item.nominal)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-200">
                        <div
                          className="h-full rounded-full bg-rose-400"
                          style={{ width: `${Math.max(6, (item.nominal / recapCancelTrend.maxNominal) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-4 text-sm text-slate-500">
                  Belum ada transaksi cancel pada periode data saat ini.
                </p>
              )}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-slate-600">
                  Periode ini ({recapCancelTrend.isAllRange ? "Semua" : `${recapCancelTrend.periodDays}H`}): <strong className="text-slate-900">{recapCancelTrend.thisWeekCount} cancel</strong> ({rupiah(recapCancelTrend.thisWeekNominal)})
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-slate-600">
                  Periode lalu ({recapCancelTrend.isAllRange ? "Semua" : `${recapCancelTrend.periodDays}H`}): <strong className="text-slate-900">{recapCancelTrend.prevWeekCount} cancel</strong> ({rupiah(recapCancelTrend.prevWeekNominal)})
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <div className="rounded-2xl border border-white/80 bg-white/80 px-3 py-2 text-sm text-slate-700">
                Omzet Hari Terakhir
                <p className="font-semibold text-slate-900">{rupiah(recapLineChart.latestValue)}</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/80 px-3 py-2 text-sm text-slate-700">
                Total Transaksi
                <p className="font-semibold text-slate-900">{recapSummary.transaksi}</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/80 px-3 py-2 text-sm text-slate-700">
                Total Omzet
                <p className="font-semibold text-slate-900">{rupiah(recapSummary.omzet)}</p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/80 px-3 py-2 text-sm text-slate-700">
                Biaya Cancel
                <p className="font-semibold text-rose-700">{rupiah(recapSummary.totalBiayaCancel)}</p>
              </div>
            </div>
          </section>
          ) : null}

          <section
            key={`section-meta-${activeSection}`}
            className={`animate-sweep-in rounded-3xl border border-stone-200 bg-gradient-to-r p-4 ${activeMeta.tone}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span className={`h-2 w-2 rounded-full ${activeMeta.dot} animate-pulse-soft`} />
                  {activeMeta.title}
                </p>
                <p className="mt-1 text-xs text-slate-600">{activeMeta.subtitle}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${activeMeta.chip}`}>
                {activeMeta.badge}
              </span>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {activeMeta.stats.map((stat) => (
                <div key={stat} className="rounded-2xl border border-white/70 bg-white/70 px-3 py-2 text-xs text-slate-700">
                  {stat}
                </div>
              ))}
            </div>
          </section>
          {activeSection === "kalkulator-potongan" ? (
          <section id="kalkulator-potongan" className="animate-sweep-in grid gap-4 lg:grid-cols-[1.08fr_1fr]">
        <article className="card-shell p-5">
          <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Data Produk, Fee, dan Fitur Marketplace
          </h2>
          <p className="mb-4 text-xs text-slate-500">Atur parameter utama, lalu bandingkan performa tiap channel penjualan.</p>

          <div className="mb-4 rounded-2xl border border-stone-200 bg-gradient-to-br from-stone-100/70 to-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Preset Potongan</p>
            {canManagePreset ? (
              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  disabled={isPresetSaving}
                  placeholder="Nama preset (contoh: Mode Shopee Aman)"
                  className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                />
                <button
                  type="button"
                  onClick={handleSavePreset}
                  disabled={isPresetSaving}
                  className="rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-stone-100"
                >
                  {isPresetSaving ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            ) : null}
            <div className={`${canManagePreset ? "mt-2" : ""} grid gap-2 ${canManagePreset ? "md:grid-cols-[1fr_auto_auto]" : "md:grid-cols-[1fr_auto]"}`}>
              <select
                value={selectedPresetId}
                onChange={(e) => setSelectedPresetId(e.target.value)}
                className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
              >
                <option value="">Pilih preset tersimpan</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleLoadPreset}
                disabled={isPresetSaving}
                className="rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-stone-100"
              >
                Pakai
              </button>
              {canManagePreset ? (
                <button
                  type="button"
                  onClick={handleDeletePreset}
                  disabled={isPresetSaving}
                  className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
                >
                  Hapus
                </button>
              ) : null}
            </div>
            {canManagePreset ? (
              <div className="mt-2 grid gap-2 md:grid-cols-[auto_auto_1fr]">
                <button
                  type="button"
                  onClick={handleUpdatePreset}
                  disabled={isPresetSaving}
                  className="rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-stone-100"
                >
                  Update
                </button>
                <button
                  type="button"
                  onClick={handleExportPresets}
                  disabled={isPresetSaving}
                  className="rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-stone-100"
                >
                  Export JSON
                </button>
                <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-stone-100">
                  Import JSON
                  <input
                    ref={importPresetRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={handleImportPresets}
                    disabled={isPresetSaving}
                    className="hidden"
                  />
                </label>
              </div>
            ) : null}
            {presetNotice ? <p className="mt-2 text-xs text-slate-600">{presetNotice}</p> : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <NumberInput label="Harga Jual (Rp)" value={harga} onChange={setHarga} step={100} />
            <NumberInput label="Modal (Rp)" value={modal} onChange={setModal} step={100} />
            <NumberInput label="Target Margin (%)" value={targetMargin} onChange={setTargetMargin} step={0.1} />
            <SelectInput label="Fee Tokopedia (%)" value={tokopediaFee} onChange={setTokopediaFee}>
              { ["4.75","6.25","7.5","7.75","8","9.5","10"].map((v)=> <option key={v} value={v}>{v}%</option>) }
            </SelectInput>
            <SelectInput label="Fee Shopee (%)" value={shopeeFee} onChange={setShopeeFee}>
              { ["5.25","6.50","6.75","9","9.50","10"].map((v)=> <option key={v} value={v}>{v}%</option>) }
            </SelectInput>
            <SelectInput label="Fee Tokopedia Mall (%)" value={mallFee} onChange={setMallFee}>
              { ["3","3.7","6.95","7.2","7.75","8.2","9.2","10.2","11.7","12.2"].map((v)=> <option key={v} value={v}>{v}%</option>) }
            </SelectInput>
          </div>

          <div className="mt-4 grid gap-2.5">
            <div className="grid gap-2 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Tokopedia</h3>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{tokopediaFeatureCount} fitur aktif</span>
              </div>
              <ToggleRow title="Gratis Ongkir Tokopedia" subtitle="4% (maks Rp 40.000)">
                <input type="checkbox" checked={tokopediaGratisOngkir} onChange={(e) => setTokopediaGratisOngkir(e.target.checked)} className="h-4 w-4 accent-stone-700" />
              </ToggleRow>
              <ToggleRow title="Komisi Afiliasi Tokopedia" subtitle="Opsional, isi persen sesuai kebutuhan">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <input type="number" value={tokopediaAfiliasiPct} min={0} step={0.1} onChange={(e) => setTokopediaAfiliasiPct(Number(e.target.value || 0))} className="w-16 rounded-xl border border-stone-200 px-2 py-1 text-right text-sm" />
                  <span className="text-xs text-slate-500">%</span>
                  <input type="checkbox" checked={tokopediaAfiliasiAktif} onChange={(e) => setTokopediaAfiliasiAktif(e.target.checked)} className="h-4 w-4 accent-stone-700" />
                </div>
              </ToggleRow>
            </div>

            <div className="grid gap-2 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-orange-700">Shopee</h3>
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">{shopeeFeatureCount} fitur aktif</span>
              </div>
              <ToggleRow title="Gratis Ongkir Shopee" subtitle="Pilih kategori dan persentase">
                <select value={shopeeGratisOngkir} onChange={(e) => setShopeeGratisOngkir(e.target.value as ShopeeOngkirMode)} className="w-full max-w-[220px] rounded-xl border border-stone-200 px-2 py-1 text-sm outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200">
                  <option value="off">Tidak aktif</option>
                  <optgroup label="Di bawah 5kg (maks Rp 40.000)">
                    <option value="bawah-1">1%</option>
                    <option value="bawah-2">2%</option>
                    <option value="bawah-3.5">3.5%</option>
                    <option value="bawah-5.5">5.5%</option>
                  </optgroup>
                  <optgroup label="Di atas 5kg (maks Rp 60.000)">
                    <option value="atas-2.5">2.5%</option>
                    <option value="atas-3.5">3.5%</option>
                    <option value="atas-5">5%</option>
                    <option value="atas-7">7%</option>
                  </optgroup>
                </select>
              </ToggleRow>
              <ToggleRow title="Promo Ekstra Shopee" subtitle="4.5% (maks Rp 60.000)">
                <input type="checkbox" checked={shopeePromo} onChange={(e) => setShopeePromo(e.target.checked)} className="h-4 w-4 accent-stone-700" />
              </ToggleRow>
              <ToggleRow title="Asuransi Shopee" subtitle="0.5%">
                <input type="checkbox" checked={shopeeAsuransi} onChange={(e) => setShopeeAsuransi(e.target.checked)} className="h-4 w-4 accent-stone-700" />
              </ToggleRow>
              <ToggleRow title="Komisi Afiliasi Shopee" subtitle="Opsional, isi persen sesuai kebutuhan">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <input type="number" value={shopeeAfiliasiPct} min={0} step={0.1} onChange={(e) => setShopeeAfiliasiPct(Number(e.target.value || 0))} className="w-16 rounded-xl border border-stone-200 px-2 py-1 text-right text-sm" />
                  <span className="text-xs text-slate-500">%</span>
                  <input type="checkbox" checked={shopeeAfiliasiAktif} onChange={(e) => setShopeeAfiliasiAktif(e.target.checked)} className="h-4 w-4 accent-stone-700" />
                </div>
              </ToggleRow>
            </div>

            <div className="grid gap-2 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">Tokopedia Mall</h3>
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">{mallFeatureCount} fitur aktif</span>
              </div>
              <ToggleRow title="Biaya Jasa Tokopedia Mall" subtitle="1.8% (maks Rp 50.000)">
                <input type="checkbox" checked={mallBiayaJasa} onChange={(e) => setMallBiayaJasa(e.target.checked)} className="h-4 w-4 accent-stone-700" />
              </ToggleRow>
              <ToggleRow title="Gratis Ongkir Tokopedia Mall" subtitle="4% (maks Rp 40.000)">
                <input type="checkbox" checked={mallGratisOngkir} onChange={(e) => setMallGratisOngkir(e.target.checked)} className="h-4 w-4 accent-stone-700" />
              </ToggleRow>
              <ToggleRow title="Komisi Afiliasi Tokopedia Mall" subtitle="Opsional, isi persen sesuai kebutuhan">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <input type="number" value={mallAfiliasiPct} min={0} step={0.1} onChange={(e) => setMallAfiliasiPct(Number(e.target.value || 0))} className="w-16 rounded-xl border border-stone-200 px-2 py-1 text-right text-sm" />
                  <span className="text-xs text-slate-500">%</span>
                  <input type="checkbox" checked={mallAfiliasiAktif} onChange={(e) => setMallAfiliasiAktif(e.target.checked)} className="h-4 w-4 accent-stone-700" />
                </div>
              </ToggleRow>
            </div>
          </div>
        </article>

        <article className="card-shell p-5">
          {([hasil.marginTokopedia, hasil.marginShopee, hasil.marginMall].some((margin) => margin < 0)) ? (
            <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              Alert: ada marketplace dengan margin minus. Periksa harga jual atau komponen potongan yang aktif.
            </div>
          ) : null}
          {([hasil.tokopedia.net, hasil.shopee.net, hasil.mall.net].some((net) => net < hasil.targetNet)) ? (
            <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              Ada marketplace yang belum mencapai target margin pada harga jual saat ini.
            </div>
          ) : (
            <div className="mb-3 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-slate-700">
              Semua marketplace sudah mencapai target margin pada harga jual saat ini.
            </div>
          )}
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">Hasil Simulasi Marketplace</h2>
            <p className="text-sm text-slate-600">
              Biaya proses semua marketplace: <strong>Rp 1.250</strong>
            </p>
          </div>

          {[
            { key: "tokopedia", title: "Tokopedia", data: hasil.tokopedia },
            { key: "shopee", title: "Shopee", data: hasil.shopee },
            { key: "mall", title: "Tokopedia Mall", data: hasil.mall }
          ].map((m) => (
            <section
              key={m.key}
              className={`mb-2 rounded-2xl border bg-white/90 p-3 ring-1 transition hover:shadow-sm ${
                m.key === "tokopedia"
                  ? "border-emerald-200 ring-emerald-200/60"
                  : m.key === "shopee"
                    ? "border-orange-200 ring-orange-200/60"
                    : "border-sky-200 ring-sky-200/60"
              }`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">{m.title}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    m.data.net >= hasil.targetNet
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {m.data.net >= hasil.targetNet ? "Target tercapai" : "Di bawah target"}
                </span>
              </div>
              <ul className="grid gap-1 text-sm text-slate-600">
                {m.key === "shopee" ? (
                  <li className="flex justify-between gap-2"><span>Potongan Tetap</span><strong className="tabular-nums text-slate-900">Rp 350</strong></li>
                ) : null}
                <li className="flex justify-between gap-2"><span>Total Potongan</span><strong className="tabular-nums text-slate-900">{rupiah(m.data.total)}</strong></li>
                <li className="flex justify-between gap-2"><span>Pendapatan Bersih</span><strong className="tabular-nums text-slate-900">{rupiah(m.data.net)}</strong></li>
                <li className="flex justify-between gap-2">
                  <span>Status Target Margin</span>
                  <strong className={m.data.net >= hasil.targetNet ? "text-slate-900" : "text-rose-600"}>
                    {m.data.net >= hasil.targetNet ? "Aman" : "Belum Margin"}
                  </strong>
                </li>
              </ul>
              <div className="mt-2">
                <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Progress ke target net</span>
                  <span>{Math.min(100, Math.max(0, (m.data.net / Math.max(hasil.targetNet, 1)) * 100)).toFixed(0)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
                  <div
                    className={`h-full rounded-full ${
                      m.key === "tokopedia"
                        ? "bg-emerald-500"
                        : m.key === "shopee"
                          ? "bg-orange-500"
                          : "bg-sky-500"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, (m.data.net / Math.max(hasil.targetNet, 1)) * 100))}%` }}
                  />
                </div>
              </div>
              <div className="mt-2 border-t border-dashed border-slate-300 pt-2">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rincian Potongan Terpilih</p>
                <ul className="grid gap-1 text-xs text-slate-600">
                  {m.data.rincian.filter((i) => i.value > 0).map((i) => (
                    <li key={i.label} className="flex justify-between gap-2">
                      <span>{i.label}</span>
                      <strong className="tabular-nums text-slate-900">{rupiah(i.value)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ))}

          <div className="mt-3 grid gap-1 border-t border-dashed border-slate-300 pt-2 text-sm text-slate-600">
            <div className="flex justify-between gap-2"><span>Margin Tokopedia</span><strong className="tabular-nums text-slate-900">{`${rupiah(hasil.marginTokopedia)} (${hasil.pctTokopedia.toFixed(2)}%)`}</strong></div>
            <div className="flex justify-between gap-2"><span>Margin Shopee</span><strong className="tabular-nums text-slate-900">{`${rupiah(hasil.marginShopee)} (${hasil.pctShopee.toFixed(2)}%)`}</strong></div>
            <div className="flex justify-between gap-2"><span>Margin Tokopedia Mall</span><strong className="tabular-nums text-slate-900">{`${rupiah(hasil.marginMall)} (${hasil.pctMall.toFixed(2)}%)`}</strong></div>
            <div className="flex justify-between gap-2"><span>Harga Rekomendasi Tokopedia</span><strong className="tabular-nums text-slate-900">{rupiahOrDash(hasil.rekomTokopedia)}</strong></div>
            <div className="flex justify-between gap-2"><span>Harga Rekomendasi Shopee</span><strong className="tabular-nums text-slate-900">{rupiahOrDash(hasil.rekomShopee)}</strong></div>
            <div className="flex justify-between gap-2"><span>Harga Rekomendasi Tokopedia Mall</span><strong className="tabular-nums text-slate-900">{rupiahOrDash(hasil.rekomMall)}</strong></div>
            <div className="flex justify-between gap-2 font-semibold">
              <span>Paling Menguntungkan</span>
              <strong className={hasil.best.margin >= 0 ? "tabular-nums text-slate-900" : "tabular-nums text-rose-600"}>{`${hasil.best.name} (${rupiah(hasil.best.margin)})`}</strong>
            </div>
          </div>
        </article>
      </section>
          ) : null}

      {activeSection === "pembuatan-nota" ? (
      <section id="pembuatan-nota" className="animate-sweep-in">
        <article className="card-shell p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold">Jendela Nota / Faktur Penjualan</h2>
            <button
              type="button"
              onClick={() => setShowInvoiceWindow((v) => !v)}
              className="rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-stone-100"
            >
              {showInvoiceWindow ? "Tutup Jendela" : "Buka Jendela"}
            </button>
          </div>

          {showInvoiceWindow ? (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1.5 text-sm text-slate-600">
                  <span>No Faktur (otomatis saat cetak)</span>
                  <input value={invoiceNo} readOnly placeholder="Akan dibuat otomatis: STCSO-YYYYMMDD-001" className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-slate-800 outline-none" />
                </label>
                <label className="grid gap-1.5 text-sm text-slate-600">
                  <span>Tanggal</span>
                  <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                </label>
                <label className="grid gap-1.5 text-sm text-slate-600">
                  <span>Nama Pembeli</span>
                  <input value={invoiceBuyer} onChange={(e) => setInvoiceBuyer(e.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                </label>
                <label className="grid gap-1.5 text-sm text-slate-600">
                  <span>No Telepon</span>
                  <input value={invoicePhone} onChange={(e) => setInvoicePhone(e.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                </label>
                <label className="grid gap-1.5 text-sm text-slate-600">
                  <span>No WhatsApp Tujuan</span>
                  <input value={invoiceWhatsapp} onChange={(e) => setInvoiceWhatsapp(e.target.value)} placeholder="Contoh: 08123456789 / 628123456789" className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                </label>
                <label className="grid gap-1.5 text-sm text-slate-600">
                  <span>Kurir Pengiriman</span>
                  <input value={invoiceCourier} onChange={(e) => setInvoiceCourier(e.target.value)} placeholder="Contoh: JNE REG" className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                </label>
              </div>

              <label className="grid gap-1.5 text-sm text-slate-600">
                <span>Alamat</span>
                <textarea value={invoiceAddress} onChange={(e) => setInvoiceAddress(e.target.value)} rows={2} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
              </label>

              <div className="rounded-2xl border border-stone-200 bg-stone-50/80 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">Item Penjualan</p>
                  <button type="button" onClick={addInvoiceItem} className="rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-stone-100">Tambah Item</button>
                </div>
                <div className="grid gap-2">
                  {invoiceItems.map((item) => {
                    const lineTotal = Math.max(0, item.qty) * Math.max(0, item.harga);
                    return (
                      <div key={item.id} className="grid gap-2 rounded-xl border border-stone-200 bg-white p-2 lg:grid-cols-[1.6fr_90px_130px_130px_auto]">
                        <input placeholder="Nama barang" value={item.nama} onChange={(e) => updateInvoiceItem(item.id, "nama", e.target.value)} className="rounded-xl border border-stone-200 px-2 py-2 text-sm outline-none focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                        <input type="number" min={0} value={item.qty} onChange={(e) => updateInvoiceItem(item.id, "qty", Number(e.target.value || 0))} className="rounded-xl border border-stone-200 px-2 py-2 text-right text-sm outline-none focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                        <input type="number" min={0} value={item.harga} onChange={(e) => updateInvoiceItem(item.id, "harga", Number(e.target.value || 0))} className="rounded-xl border border-stone-200 px-2 py-2 text-right text-sm outline-none focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                        <div className="flex items-center justify-end rounded-xl border border-stone-200 bg-stone-50 px-2 py-2 text-sm font-medium text-slate-700">{rupiah(lineTotal)}</div>
                        <button type="button" onClick={() => removeInvoiceItem(item.id)} className="rounded-xl border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-100">Hapus</button>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-end text-sm font-semibold text-slate-800">Subtotal: {rupiah(invoiceSubtotal)}</div>
              </div>

              <label className="grid gap-1.5 text-sm text-slate-600">
                <span>Catatan</span>
                <textarea value={invoiceNotes} onChange={(e) => setInvoiceNotes(e.target.value)} rows={2} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
              </label>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setInvoiceNo("");
                    setInvoiceDate(new Date().toISOString().slice(0, 10));
                    setInvoiceBuyer("");
                    setInvoicePhone("");
                    setInvoiceWhatsapp("");
                    setInvoiceCourier("");
                    setInvoiceAddress("");
                    setInvoiceNotes("");
                    setInvoiceItems([{ id: `${Date.now()}`, nama: "", qty: 1, harga: 0 }]);
                  }}
                  className="rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-stone-100"
                >
                  Reset Nota
                </button>
                <button
                  type="button"
                  onClick={sendInvoiceToWhatsapp}
                  className="rounded-2xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
                >
                  Kirim WhatsApp
                </button>
                <button
                  type="button"
                  onClick={printInvoice}
                  className="rounded-2xl border border-stone-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  Cetak Faktur
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Klik "Buka Jendela" untuk membuat nota/faktur penjualan terpisah dari kalkulator.</p>
          )}
        </article>
      </section>
      ) : null}

      {activeSection === "rekap-penjualan" ? (
      <section id="rekap-penjualan" className="animate-sweep-in">
        <article className="card-shell p-5">
          <div className="mb-3 border-b border-stone-200 pb-3">
            <h2 className="text-base font-bold">Rekap Penjualan Marketplace</h2>
            <p className="text-xs text-slate-500">Pisahkan menu input dan hasil agar data tidak tercampur.</p>
          </div>
          {recapNotice ? <p className="mb-3 text-xs text-slate-600">{recapNotice}</p> : null}
          {!canManageRecap ? (
            <p className="mb-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
              Akun role `viewer` hanya bisa melihat hasil rekap.
            </p>
          ) : null}
          <div className="mb-4 grid gap-2 sm:w-fit sm:grid-cols-2">
            {canManageRecap ? (
              <button
                type="button"
                onClick={() => setRecapMenu("input")}
                className={`rounded-2xl border px-3 py-2 text-sm font-medium transition ${
                  recapMenu === "input"
                    ? "border-stone-700 bg-slate-900 text-white"
                    : "border-stone-200 bg-stone-50 text-slate-700 hover:bg-stone-100"
                }`}
              >
                Input Rekap
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setRecapMenu("hasil")}
              className={`rounded-2xl border px-3 py-2 text-sm font-medium transition ${
                recapMenu === "hasil"
                  ? "border-stone-700 bg-slate-900 text-white"
                  : "border-stone-200 bg-stone-50 text-slate-700 hover:bg-stone-100"
              }`}
            >
              Hasil Rekap
            </button>
          </div>

          {recapMenu === "input" ? (
          <div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm text-slate-600">
              <span>Tanggal</span>
              <input type="date" value={recapTanggal} onChange={(e) => setRecapTanggal(e.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
            </label>
            <label className="grid gap-1.5 text-sm text-slate-600">
              <span>Marketplace</span>
              <select value={recapMarketplace} onChange={(e) => setRecapMarketplace(e.target.value as SalesRecapRow["marketplace"])} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200">
                <option value="Tokopedia">Tokopedia</option>
                <option value="Shopee">Shopee</option>
                <option value="TikTok">TikTok</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm text-slate-600">
              <span>No Pesanan</span>
              <input value={recapNoPesanan} onChange={(e) => setRecapNoPesanan(e.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
            </label>
            <label className="grid gap-1.5 text-sm text-slate-600">
              <span>Nama Pelanggan</span>
              <input value={recapPelanggan} onChange={(e) => setRecapPelanggan(e.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
            </label>
            <div className="grid gap-2 md:col-span-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Item Barang per Order</p>
                <button type="button" onClick={addRecapOrderItem} className="rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-stone-100">
                  Tambah Barang
                </button>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2 text-xs text-slate-600">
                Isi per item: <strong>Nama Barang</strong>, <strong>Harga Jual (satuan)</strong>, <strong>Modal (satuan)</strong>, dan <strong>Jumlah Barang (Qty)</strong>.
                Total omzet dan modal akan dihitung otomatis dari `qty x harga`.
              </div>
              <div className="grid gap-2">
                {recapOrderItems.map((item) => {
                  const itemQty = Math.max(0, Number(item.qty) || 0);
                  const itemHargaJual = Math.max(0, Number(item.hargaJual) || 0);
                  const itemModal = Math.max(0, Number(item.modal) || 0);
                  const lineOmzet = itemQty * itemHargaJual;
                  const lineModal = itemQty * itemModal;
                  return (
                  <div key={item.id} className="grid gap-2 rounded-xl border border-stone-200 bg-white p-2 lg:grid-cols-[1.4fr_130px_130px_90px_140px_140px_auto]">
                    <input
                      placeholder="Nama barang"
                      value={item.nama}
                      onChange={(e) => updateRecapOrderItem(item.id, "nama", e.target.value)}
                      className="rounded-xl border border-stone-200 px-2 py-2 text-sm outline-none focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Harga jual"
                      value={item.hargaJual}
                      onChange={(e) => updateRecapOrderItem(item.id, "hargaJual", Number(e.target.value || 0))}
                      className="rounded-xl border border-stone-200 px-2 py-2 text-right text-sm outline-none focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Modal"
                      value={item.modal}
                      onChange={(e) => updateRecapOrderItem(item.id, "modal", Number(e.target.value || 0))}
                      className="rounded-xl border border-stone-200 px-2 py-2 text-right text-sm outline-none focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Qty"
                      value={item.qty}
                      onChange={(e) => updateRecapOrderItem(item.id, "qty", Number(e.target.value || 0))}
                      className="rounded-xl border border-stone-200 px-2 py-2 text-right text-sm outline-none focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                    />
                    <div className="flex items-center justify-end rounded-xl border border-stone-200 bg-stone-50 px-2 py-2 text-sm font-medium text-slate-700">
                      Omzet: {rupiah(lineOmzet)}
                    </div>
                    <div className="flex items-center justify-end rounded-xl border border-stone-200 bg-stone-50 px-2 py-2 text-sm font-medium text-slate-700">
                      Modal: {rupiah(lineModal)}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRecapOrderItem(item.id)}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={recapOrderItems.length <= 1}
                    >
                      Hapus
                    </button>
                  </div>
                );
                })}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="grid gap-1.5 text-sm text-slate-600">
                  <span>Total Omzet (Rp)</span>
                  <input type="number" min={0} value={recapOmzet} readOnly className="w-full rounded-2xl border border-stone-200 bg-stone-100 px-3 py-2.5 text-slate-800 outline-none" />
                </label>
                <label className="grid gap-1.5 text-sm text-slate-600">
                  <span>Total Modal (Rp)</span>
                  <input type="number" min={0} value={recapModal} readOnly className="w-full rounded-2xl border border-stone-200 bg-stone-100 px-3 py-2.5 text-slate-800 outline-none" />
                </label>
              </div>
            </div>
            {recapMarketplace === "Shopee" ? (
              <div className="grid gap-2 md:col-span-2">
                <p className="text-sm font-semibold text-slate-700">Rincian Biaya Shopee</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="grid gap-1.5 text-sm text-slate-600">
                    <span>Biaya Administrasi (Rp)</span>
                    <input type="number" min={0} value={recapShopeeBiayaAdmin} onChange={(e) => setRecapShopeeBiayaAdmin(Number(e.target.value || 0))} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                  </label>
                  <label className="grid gap-1.5 text-sm text-slate-600">
                    <span>Biaya Layanan Promo XTRA (Rp)</span>
                    <input type="number" min={0} value={recapShopeeBiayaLayananPromoXtra} onChange={(e) => setRecapShopeeBiayaLayananPromoXtra(Number(e.target.value || 0))} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                  </label>
                  <label className="grid gap-1.5 text-sm text-slate-600">
                    <span>Biaya Layanan Gratis Ongkir XTRA (Rp)</span>
                    <input type="number" min={0} value={recapShopeeBiayaLayananGratisOngkirXtra} onChange={(e) => setRecapShopeeBiayaLayananGratisOngkirXtra(Number(e.target.value || 0))} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                  </label>
                  <label className="grid gap-1.5 text-sm text-slate-600">
                    <span>Biaya Program Hemat Biaya Kirim (Rp)</span>
                    <input type="number" min={0} value={recapShopeeBiayaProgramHematKirim} onChange={(e) => setRecapShopeeBiayaProgramHematKirim(Number(e.target.value || 0))} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                  </label>
                  <label className="grid gap-1.5 text-sm text-slate-600">
                    <span>Biaya Proses Pesanan (Rp)</span>
                    <input type="number" min={0} value={recapShopeeBiayaProsesPesanan} onChange={(e) => setRecapShopeeBiayaProsesPesanan(Number(e.target.value || 0))} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                  </label>
                  <div className="grid gap-1.5 rounded-2xl border border-stone-200 bg-stone-50/80 p-3 text-sm text-slate-600">
                    <span className="font-medium text-slate-700">Biaya Komisi AMS</span>
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={recapShopeeKomisiAmsAktif} onChange={(e) => setRecapShopeeKomisiAmsAktif(e.target.checked)} />
                      Komisi AMS aktif (jika ada)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={recapShopeeKomisiAmsAktif ? recapShopeeBiayaKomisiAms : 0}
                      onChange={(e) => setRecapShopeeBiayaKomisiAms(Number(e.target.value || 0))}
                      disabled={!recapShopeeKomisiAmsAktif}
                      className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition disabled:cursor-not-allowed disabled:bg-stone-100 focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                    />
                  </div>
                  <div className="grid gap-1.5 rounded-2xl border border-stone-200 bg-stone-50/80 p-3 text-sm text-slate-600">
                    <span className="font-medium text-slate-700">Biaya Premi</span>
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={recapShopeePremiAktif} onChange={(e) => setRecapShopeePremiAktif(e.target.checked)} />
                      Premi aktif (jika ada)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={recapShopeePremiAktif ? recapShopeeBiayaPremi : 0}
                      onChange={(e) => setRecapShopeeBiayaPremi(Number(e.target.value || 0))}
                      disabled={!recapShopeePremiAktif}
                      className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition disabled:cursor-not-allowed disabled:bg-stone-100 focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-600">
                  Total biaya Shopee: <strong className="text-slate-900">{rupiah(recapShopeeTotalBiaya)}</strong>
                </p>
              </div>
            ) : recapMarketplace === "Tokopedia" || recapMarketplace === "TikTok" ? (
              <div className="grid gap-2 md:col-span-2">
                <p className="text-sm font-semibold text-slate-700">Rincian Biaya {recapMarketplace}</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="grid gap-1.5 text-sm text-slate-600">
                    <span>Biaya Komisi Platform (Rp)</span>
                    <input type="number" min={0} value={recapMarketplaceBiayaKomisiPlatform} onChange={(e) => setRecapMarketplaceBiayaKomisiPlatform(Number(e.target.value || 0))} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                  </label>
                  <label className="grid gap-1.5 text-sm text-slate-600">
                    <span>Biaya Layanan Mall (Rp)</span>
                    <input type="number" min={0} value={recapMarketplaceBiayaLayananMall} onChange={(e) => setRecapMarketplaceBiayaLayananMall(Number(e.target.value || 0))} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                  </label>
                  <label className="grid gap-1.5 text-sm text-slate-600">
                    <span>Komisi Dinamis (Rp)</span>
                    <input type="number" min={0} value={recapMarketplaceKomisiDinamis} onChange={(e) => setRecapMarketplaceKomisiDinamis(Number(e.target.value || 0))} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                  </label>
                  <div className="grid gap-1.5 rounded-2xl border border-stone-200 bg-stone-50/80 p-3 text-sm text-slate-600">
                    <span className="font-medium text-slate-700">Komisi Afiliasi</span>
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={recapMarketplaceKomisiAfiliasiAktif} onChange={(e) => setRecapMarketplaceKomisiAfiliasiAktif(e.target.checked)} />
                      Komisi Afiliasi aktif (jika ada)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={recapMarketplaceKomisiAfiliasiAktif ? recapMarketplaceKomisiAfiliasi : 0}
                      onChange={(e) => setRecapMarketplaceKomisiAfiliasi(Number(e.target.value || 0))}
                      disabled={!recapMarketplaceKomisiAfiliasiAktif}
                      className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition disabled:cursor-not-allowed disabled:bg-stone-100 focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                    />
                  </div>
                  <label className="grid gap-1.5 text-sm text-slate-600">
                    <span>Biaya Pemrosesan Pesanan (Rp)</span>
                    <input type="number" min={0} value={recapMarketplaceBiayaPemrosesanPesanan} onChange={(e) => setRecapMarketplaceBiayaPemrosesanPesanan(Number(e.target.value || 0))} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                  </label>
                </div>
                <p className="text-xs text-slate-600">
                  Total biaya {recapMarketplace}: <strong className="text-slate-900">{rupiah(recapMarketplaceTotalBiaya)}</strong>
                </p>
              </div>
            ) : (
              <label className="grid gap-1.5 text-sm text-slate-600">
                <span>Ongkir / Biaya Lain (Rp)</span>
                <input type="number" min={0} value={recapOngkir} onChange={(e) => setRecapOngkir(Number(e.target.value || 0))} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
              </label>
            )}
            <label className="grid gap-1.5 text-sm text-slate-600">
              <span>Catatan</span>
              <input value={recapCatatan} onChange={(e) => setRecapCatatan(e.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
            </label>
          </div>

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              disabled={isRecapSaving}
              onClick={async () => { const ok = await addRecapRow(); if (ok) setRecapMenu("hasil"); }}
              className="rounded-2xl border border-stone-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isRecapSaving ? "Menyimpan..." : "Tambah Rekap & Lihat Hasil"}
            </button>
          </div>
          {recapSyncStatus !== "idle" ? (
            <p className={`mt-2 text-right text-xs ${recapSyncStatus === "error" ? "text-rose-600" : recapSyncStatus === "success" ? "text-emerald-700" : "text-slate-600"}`}>
              {recapSyncMessage}
            </p>
          ) : null}
          </div>
          ) : null}

          {recapMenu === "hasil" ? (
          <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <button type="button" onClick={exportRecapPdf} className="rounded-2xl border border-stone-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800">
              Export PDF (Periode Tanggal)
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50/70 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Filter Data</p>
              <button
                type="button"
                onClick={() => {
                  setRecapFilterStartDate("");
                  setRecapFilterEndDate("");
                  setRecapFilterMarketplace("Semua");
                  setRecapFilterStatus("Semua");
                  setRecapFilterQuery("");
                }}
                className="rounded-xl border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-stone-100"
              >
                Reset Filter
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-5">
              <label className="grid gap-1 text-xs text-slate-600">
                <span>Dari Tanggal</span>
                <input type="date" value={recapFilterStartDate} onChange={(e) => setRecapFilterStartDate(e.target.value)} className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
              </label>
              <label className="grid gap-1 text-xs text-slate-600">
                <span>Sampai Tanggal</span>
                <input type="date" value={recapFilterEndDate} onChange={(e) => setRecapFilterEndDate(e.target.value)} className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
              </label>
              <label className="grid gap-1 text-xs text-slate-600">
                <span>Marketplace</span>
                <select value={recapFilterMarketplace} onChange={(e) => setRecapFilterMarketplace(e.target.value as "Semua" | SalesRecapRow["marketplace"])} className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200">
                  <option value="Semua">Semua Marketplace</option>
                  <option value="Tokopedia">Tokopedia</option>
                  <option value="Shopee">Shopee</option>
                  <option value="TikTok">TikTok</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-slate-600">
                <span>Status</span>
                <select value={recapFilterStatus} onChange={(e) => setRecapFilterStatus(e.target.value as "Semua" | SalesRecapRow["status"])} className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200">
                  <option value="Semua">Semua Status</option>
                  <option value="sukses">Sukses</option>
                  <option value="cancel">Cancel</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-slate-600">
                <span>Cari Data</span>
                <input value={recapFilterQuery} onChange={(e) => setRecapFilterQuery(e.target.value)} placeholder="No pesanan / pelanggan / catatan / alasan / nominal cancel" className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
              </label>
            </div>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-7">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
              <p className="text-xs text-slate-500">Total Transaksi</p>
              <p className="font-semibold text-slate-900">{recapSummary.transaksi}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
              <p className="text-xs text-slate-500">Transaksi Cancel</p>
              <p className="font-semibold text-rose-700">{recapSummary.transaksiCancel}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
              <p className="text-xs text-slate-500">Total Omzet</p>
              <p className="font-semibold text-slate-900">{rupiah(recapSummary.omzet)}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
              <p className="text-xs text-slate-500">Total Modal</p>
              <p className="font-semibold text-slate-900">{rupiah(recapSummary.modal)}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
              <p className="text-xs text-slate-500">Total Ongkir/Biaya</p>
              <p className="font-semibold text-slate-900">{rupiah(recapSummary.ongkir)}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
              <p className="text-xs text-slate-500">Laba Bersih (Sukses)</p>
              <p className={recapSummary.laba >= 0 ? "font-semibold text-slate-900" : "font-semibold text-rose-600"}>
                {rupiah(recapSummary.laba)}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
              <p className="text-xs text-slate-500">Biaya Cancel</p>
              <p className="font-semibold text-rose-700">{rupiah(recapSummary.totalBiayaCancel)}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
              <p className="text-xs text-slate-500">Cancel Rate</p>
              <p className="font-semibold text-rose-700">{recapSummary.cancelRate.toFixed(1)}%</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
              <p className="text-xs text-slate-500">Laba Final</p>
              <p className={recapSummary.labaFinal >= 0 ? "font-semibold text-slate-900" : "font-semibold text-rose-600"}>
                {rupiah(recapSummary.labaFinal)}
              </p>
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Analisa AI</p>
            {recapAiInsights.length ? (
              <div className="mt-2 grid gap-1.5">
                {recapAiInsights.map((insight, index) => (
                  <p key={`ai-insight-${index}`} className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-sm text-slate-700">
                    {index + 1}. {insight}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Belum ada data untuk dianalisa.</p>
            )}
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {(Object.keys(recapByMarketplace) as SalesRecapRow["marketplace"][]).map((name) => (
              <div key={name} className="rounded-2xl border border-stone-200 bg-white px-3 py-2">
                <p className="text-xs font-semibold text-slate-700">{name}</p>
                <p className="text-xs text-slate-500">{recapByMarketplace[name].transaksi} transaksi</p>
                <p className="text-xs text-rose-600">{recapByMarketplace[name].cancel} cancel</p>
                <p className="mt-1 text-sm text-slate-600">Omzet: <strong className="text-slate-900">{rupiah(recapByMarketplace[name].omzet)}</strong></p>
                <p className="text-sm text-slate-600">Laba: <strong className={recapByMarketplace[name].laba >= 0 ? "text-slate-900" : "text-rose-600"}>{rupiah(recapByMarketplace[name].laba)}</strong></p>
                <p className="text-sm text-rose-700">Biaya Cancel: <strong>{rupiah(recapByMarketplace[name].biayaCancel)}</strong></p>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-2 xl:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Leaderboard Produk</p>
              {recapProductLeaderboard.hasData ? (
                <div className="mt-2 grid gap-2 lg:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium text-slate-600">Top Produk (Qty)</p>
                    <div className="mt-1 space-y-1">
                      {recapProductLeaderboard.topQty.map((item, index) => (
                        <div key={`lb-qty-${item.nama}-${index}`} className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs">
                          <p className="font-semibold text-slate-800">{index + 1}. {item.nama}</p>
                          <p className="text-slate-600">Qty {item.qty} · Omzet {rupiah(item.omzet)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-600">Top Produk (Laba Final)</p>
                    <div className="mt-1 space-y-1">
                      {recapProductLeaderboard.topProfit.map((item, index) => (
                        <div key={`lb-profit-${item.nama}-${index}`} className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs">
                          <p className="font-semibold text-slate-800">{index + 1}. {item.nama}</p>
                          <p className={item.labaFinal >= 0 ? "text-slate-600" : "text-rose-700"}>
                            Laba Final {rupiah(item.labaFinal)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Belum ada data produk. Simpan transaksi dengan item barang agar leaderboard terisi.</p>
              )}
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Jam Ramai Transaksi</p>
              {recapBusyHourAnalysis.hasData ? (
                <div className="mt-2 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-slate-600">
                      Jam terpadat:{" "}
                      <strong className="text-slate-900">
                        {String(recapBusyHourAnalysis.topByTransaksi?.hour ?? 0).padStart(2, "0")}:00
                      </strong>{" "}
                      ({recapBusyHourAnalysis.topByTransaksi?.transaksi ?? 0} transaksi)
                    </div>
                    <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-slate-600">
                      Jam omzet tertinggi:{" "}
                      <strong className="text-slate-900">
                        {String(recapBusyHourAnalysis.topByOmzet?.hour ?? 0).padStart(2, "0")}:00
                      </strong>{" "}
                      ({rupiah(recapBusyHourAnalysis.topByOmzet?.omzet ?? 0)})
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    {recapBusyHourAnalysis.activeHours
                      .sort((a, b) => b.transaksi - a.transaksi)
                      .slice(0, 8)
                      .map((hour) => (
                        <div key={`hour-${hour.hour}`} className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-slate-600">
                          <strong className="text-slate-900">{String(hour.hour).padStart(2, "0")}:00</strong> · {hour.transaksi} transaksi · {hour.cancel} cancel · Omzet {rupiah(hour.omzet)}
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Belum ada data waktu transaksi untuk dianalisa.</p>
              )}
            </div>
          </div>

          <div className="mt-3 grid gap-2 xl:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Cohort Repeat Buyer</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-slate-600">
                  Total buyer unik <strong className="text-slate-900">{recapRepeatBuyerCohort.totalBuyer}</strong>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-slate-600">
                  Repeat buyer <strong className="text-slate-900">{recapRepeatBuyerCohort.repeatBuyer}</strong>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-slate-600">
                  One-time buyer <strong className="text-slate-900">{recapRepeatBuyerCohort.oneTimeBuyer}</strong>
                </div>
                <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-slate-600">
                  Share repeat transaksi <strong className="text-slate-900">{recapRepeatBuyerCohort.repeatShare.toFixed(1)}%</strong>
                </div>
              </div>
              {recapRepeatBuyerCohort.topRepeatBuyers.length ? (
                <div className="mt-2 space-y-1.5">
                  {recapRepeatBuyerCohort.topRepeatBuyers.map((buyer, index) => (
                    <div key={`repeat-${buyer.buyer}-${index}`} className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-slate-600">
                      <strong className="text-slate-900">{index + 1}. {buyer.buyer}</strong> · {buyer.transaksi} trx · Omzet {rupiah(buyer.omzet)}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Belum ada repeat buyer pada filter aktif.</p>
              )}
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Forecast 7 Hari</p>
              {recapForecastWeekly.hasData ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-slate-600">
                    Basis data <strong className="text-slate-900">{recapForecastWeekly.basisHari} hari</strong>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-slate-600">
                    Rata-rata omzet harian <strong className="text-slate-900">{rupiah(recapForecastWeekly.avgDailyOmzet)}</strong>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-slate-600">
                    Prediksi omzet 7 hari <strong className="text-slate-900">{rupiah(recapForecastWeekly.forecast7Omzet)}</strong>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-xs text-slate-600">
                    Prediksi laba final 7 hari <strong className={recapForecastWeekly.forecast7LabaFinal >= 0 ? "text-slate-900" : "text-rose-700"}>{rupiah(recapForecastWeekly.forecast7LabaFinal)}</strong>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Butuh minimal 3 hari data untuk membuat forecast mingguan.</p>
              )}
            </div>
          </div>

          <div className="mt-3 grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
            {filteredRecapRows.length ? (
              filteredRecapRows.map((row) => {
                const laba = row.omzet - row.modal - row.ongkir;
                const labaFinalTransaksi = laba - row.nominalCancel;
                const detailOpen = openBiayaDetailRow?.id === row.id;
                return (
                  <div key={`recap-card-${row.id}`} className={row.status === "cancel" ? "rounded-2xl border border-rose-200 bg-rose-50/40 p-3" : "rounded-2xl border border-stone-200 bg-white p-3"}>
                    <div className="grid gap-1.5 text-sm sm:grid-cols-2">
                      <p className="text-slate-600">Tanggal: <strong className="text-slate-900">{row.tanggal}</strong></p>
                      <p className="text-slate-600">Marketplace: <strong className="text-slate-900">{row.marketplace}</strong></p>
                      <p className="text-slate-600">
                        Status:{" "}
                        <strong className={row.status === "cancel" ? "text-rose-700" : "text-emerald-700"}>
                          {row.status === "cancel" ? "Cancel" : "Sukses"}
                        </strong>
                      </p>
                      <p className="break-all text-slate-600">No Pesanan: <strong className="text-slate-900">{row.noPesanan || "-"}</strong></p>
                      <p className="break-all text-slate-600">Pelanggan: <strong className="text-slate-900">{row.pelanggan || "-"}</strong></p>
                    </div>
                    <div className="mt-2 rounded-xl border border-stone-200 bg-white/90 p-2.5">
                      <div className="grid gap-1 text-sm sm:grid-cols-2">
                        <p className="text-slate-600">Omzet: <strong className="text-slate-900">{rupiah(row.omzet)}</strong></p>
                        <p className="text-slate-600">Modal: <strong className="text-slate-900">{rupiah(row.modal)}</strong></p>
                        <p className="text-slate-600">Biaya: <strong className="text-slate-900">{rupiah(row.ongkir)}</strong></p>
                        <p className="text-slate-600">Biaya Cancel: <strong className={row.nominalCancel > 0 ? "text-rose-700" : "text-slate-900"}>{rupiah(row.nominalCancel)}</strong></p>
                        <p className="text-slate-600">Laba (Sukses): <strong className={laba >= 0 ? "text-slate-900" : "text-rose-600"}>{rupiah(laba)}</strong></p>
                        <p className="text-slate-600">Laba Final: <strong className={labaFinalTransaksi >= 0 ? "text-slate-900" : "text-rose-600"}>{rupiah(labaFinalTransaksi)}</strong></p>
                      </div>
                    </div>
                    <p className="mt-1 break-words text-sm text-slate-600">Catatan: <strong className="text-slate-900">{row.catatan || "-"}</strong></p>
                    {row.status === "cancel" ? (
                      <div className="mt-1 space-y-0.5">
                        <p className="break-words text-sm text-rose-700">
                          Alasan Cancel: <strong>{row.alasanCancel || "-"}</strong>
                        </p>
                      </div>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {canManageRecap ? (
                        <button type="button" onClick={() => openEditRecap(row)} className="whitespace-nowrap rounded-xl border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 transition hover:bg-sky-100">
                          Edit
                        </button>
                      ) : null}
                      {canManageRecap ? (
                        <button
                          type="button"
                          onClick={() => toggleRecapCancelStatus(row)}
                          disabled={cancelStatusSaving}
                          className={row.status === "cancel"
                            ? "whitespace-nowrap rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                            : "whitespace-nowrap rounded-xl border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
                          }
                        >
                          {row.status === "cancel"
                            ? "Batalkan Cancel"
                            : isCancelDraftOpenForRow(row.id)
                              ? "Tutup Cancel"
                              : "Tandai Cancel"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          setOpenBiayaDetailRow((current) =>
                            current?.id === row.id ? null : row
                          )
                        }
                        className="whitespace-nowrap rounded-xl border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-stone-100"
                      >
                        {detailOpen ? "Tutup Detail" : "Detail Biaya"}
                      </button>
                      {canDeleteRecap ? (
                        <button type="button" onClick={() => deleteRecapRow(row.id)} className="whitespace-nowrap rounded-xl border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100">
                          Hapus
                        </button>
                      ) : null}
                    </div>
                    {isCancelDraftVisibleForRow(row.id) && row.status !== "cancel" ? (
                      <div className={`mt-2 rounded-2xl border border-rose-200 bg-rose-50/60 p-3 ${getCancelDraftPanelClass(row.id)}`}>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-700">Input Cancel</p>
                        <label className="mt-2 grid gap-1 text-xs text-slate-600">
                          <span>Alasan Cancel (opsional)</span>
                          <textarea
                            value={cancelDraftReason}
                            onChange={(e) => setCancelDraftReason(e.target.value)}
                            rows={2}
                            placeholder="Contoh: customer tidak respon, stok kosong."
                            className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                          />
                        </label>
                        <label className="mt-2 grid gap-1 text-xs text-slate-600">
                          <span>Nominal Biaya Cancel (Rp)</span>
                          <input
                            type="number"
                            min={0}
                            value={cancelDraftNominal}
                            onChange={(e) => setCancelDraftNominal(Math.max(0, Number(e.target.value || 0)))}
                            className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                          />
                        </label>
                        <div className="mt-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => closeCancelDraft()}
                            disabled={cancelStatusSaving}
                            className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={confirmRecapCancel}
                            disabled={cancelStatusSaving}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                        {cancelStatusSaving ? "Menyimpan..." : "Simpan Cancel"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {detailOpen ? (
                      <div className="mt-2 animate-sweep-in rounded-2xl border border-stone-200 bg-stone-50/70 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Detail Biaya</p>
                        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                          {row.biayaDetail.length ? (
                            row.biayaDetail.map((detail, index) => (
                              <div key={`${detail.label}-${index}`} className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm">
                                <span className="text-slate-700">{detail.label}</span>
                                <strong className="text-slate-900">{rupiah(detail.value)}</strong>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-slate-500">Belum ada detail biaya.</p>
                          )}
                        </div>
                        <div className="mt-2 border-t border-stone-200 pt-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-700">Total Biaya</span>
                            <strong className="text-slate-900">{rupiah(row.ongkir)}</strong>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <p className="rounded-2xl border border-stone-200 bg-white px-3 py-4 text-center text-slate-500">
                Belum ada data rekap.
              </p>
            )}
          </div>

          <div className="hidden mt-3 overflow-x-auto rounded-2xl border border-stone-200">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2 text-left">Tanggal</th>
                  <th className="px-3 py-2 text-left">Marketplace</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">No Pesanan</th>
                  <th className="px-3 py-2 text-left">Pelanggan</th>
                  <th className="px-3 py-2 text-right">Omzet</th>
                  <th className="px-3 py-2 text-right">Modal</th>
                  <th className="px-3 py-2 text-right">Biaya</th>
                  <th className="px-3 py-2 text-right">Laba</th>
                  <th className="px-3 py-2 text-left">Catatan</th>
                  <th className="min-w-[220px] px-3 py-2 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecapRows.length ? (
                  filteredRecapRows.map((row) => {
                    const laba = row.omzet - row.modal - row.ongkir;
                    return (
                      <Fragment key={row.id}>
                        <tr className={row.status === "cancel" ? "border-t border-stone-100 bg-rose-50/40" : "border-t border-stone-100"}>
                          <td className="px-3 py-2">{row.tanggal}</td>
                          <td className="px-3 py-2">{row.marketplace}</td>
                          <td className="px-3 py-2">
                            <span className={row.status === "cancel" ? "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700" : "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"}>
                              {row.status === "cancel" ? "Cancel" : "Sukses"}
                            </span>
                          </td>
                          <td className="break-all px-3 py-2">{row.noPesanan || "-"}</td>
                          <td className="break-all px-3 py-2">{row.pelanggan || "-"}</td>
                          <td className="px-3 py-2 text-right">{rupiah(row.omzet)}</td>
                          <td className="px-3 py-2 text-right">{rupiah(row.modal)}</td>
                          <td className="px-3 py-2 text-right">{rupiah(row.ongkir)}</td>
                          <td className={laba >= 0 ? "px-3 py-2 text-right text-slate-900" : "px-3 py-2 text-right text-rose-600"}>{rupiah(laba)}</td>
                          <td className="break-words px-3 py-2">
                            {row.catatan || "-"}
                            {row.status === "cancel" ? (
                              <div className="mt-1 space-y-0.5 text-xs text-rose-700">
                                <p>Alasan: {row.alasanCancel || "-"}</p>
                                <p>Biaya Cancel: {rupiah(row.nominalCancel)}</p>
                              </div>
                            ) : null}
                          </td>
                          <td className="min-w-[220px] px-3 py-2 text-center">
                            <div className="flex flex-wrap items-center justify-center gap-1.5">
                              {canManageRecap ? (
                                <button type="button" onClick={() => openEditRecap(row)} className="whitespace-nowrap rounded-xl border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 transition hover:bg-sky-100">
                                  Edit
                                </button>
                              ) : null}
                              {canManageRecap ? (
                                <button
                                  type="button"
                                  onClick={() => toggleRecapCancelStatus(row)}
                                  disabled={cancelStatusSaving}
                                  className={row.status === "cancel"
                                    ? "whitespace-nowrap rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
                                    : "whitespace-nowrap rounded-xl border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
                                  }
                                >
                                  {row.status === "cancel"
                                    ? "Batalkan Cancel"
                                    : isCancelDraftOpenForRow(row.id)
                                      ? "Tutup Cancel"
                                      : "Tandai Cancel"}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenBiayaDetailRow((current) =>
                                    current?.id === row.id ? null : row
                                  )
                                }
                                className="whitespace-nowrap rounded-xl border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-stone-100"
                              >
                                {openBiayaDetailRow?.id === row.id ? "Tutup Detail" : "Detail Biaya"}
                              </button>
                              {canDeleteRecap ? (
                                <button type="button" onClick={() => deleteRecapRow(row.id)} className="whitespace-nowrap rounded-xl border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100">
                                  Hapus
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        {isCancelDraftVisibleForRow(row.id) && row.status !== "cancel" ? (
                          <tr className="border-t border-stone-100 bg-rose-50/40">
                            <td className="px-3 py-3" colSpan={11}>
                              <div className={`rounded-2xl border border-rose-200 bg-white p-3 ${getCancelDraftPanelClass(row.id)}`}>
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-700">Input Cancel</p>
                                <div className="mt-2 grid gap-2 lg:grid-cols-[1fr_220px_auto]">
                                  <textarea
                                    value={cancelDraftReason}
                                    onChange={(e) => setCancelDraftReason(e.target.value)}
                                    rows={2}
                                    placeholder="Alasan cancel (opsional)"
                                    className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                                  />
                                  <input
                                    type="number"
                                    min={0}
                                    value={cancelDraftNominal}
                                    onChange={(e) => setCancelDraftNominal(Math.max(0, Number(e.target.value || 0)))}
                                    className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-right text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                                  />
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => closeCancelDraft()}
                                      disabled={cancelStatusSaving}
                                      className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                      Batal
                                    </button>
                                    <button
                                      type="button"
                                      onClick={confirmRecapCancel}
                                      disabled={cancelStatusSaving}
                                      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                                    >
                                      {cancelStatusSaving ? "Menyimpan..." : "Simpan Cancel"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                        {openBiayaDetailRow?.id === row.id ? (
                          <tr className="border-t border-stone-100 bg-stone-50/60">
                            <td className="px-3 py-3" colSpan={11}>
                              <div className="animate-sweep-in rounded-2xl border border-stone-200 bg-white p-3">
                                <div className="mb-2 flex items-start justify-between gap-2 border-b border-stone-200 pb-2">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">Detail Biaya</p>
                                    <p className="text-xs text-slate-500">
                                      {row.marketplace} · {row.noPesanan || "-"}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setOpenBiayaDetailRow(null)}
                                    className="rounded-xl border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-stone-100"
                                  >
                                    Tutup
                                  </button>
                                </div>
                                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                                  {row.biayaDetail.length ? (
                                    row.biayaDetail.map((detail, index) => (
                                      <div key={`${detail.label}-${index}`} className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-sm">
                                        <span className="text-slate-700">{detail.label}</span>
                                        <strong className="text-slate-900">{rupiah(detail.value)}</strong>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-sm text-slate-500">Belum ada detail biaya.</p>
                                  )}
                                </div>
                                <div className="mt-2 border-t border-stone-200 pt-2 text-sm">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-700">Total Biaya</span>
                                    <strong className="text-slate-900">{rupiah(row.ongkir)}</strong>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-3 py-4 text-center text-slate-500" colSpan={11}>
                      Belum ada data rekap.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {editRecapDraft ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
              <div className="w-full max-w-2xl rounded-2xl border border-stone-200 bg-white p-4 shadow-xl">
                <div className="mb-3 flex items-center justify-between border-b border-stone-200 pb-2">
                  <p className="text-sm font-semibold text-slate-900">Edit Data Rekap</p>
                  <button
                    type="button"
                    onClick={() => setEditRecapDraft(null)}
                    className="rounded-xl border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-stone-100"
                  >
                    Tutup
                  </button>
                </div>

                <div className="grid gap-2 md:grid-cols-2">
                  <label className="grid gap-1 text-xs text-slate-600">
                    <span>Tanggal</span>
                    <input type="date" value={editRecapDraft.tanggal} onChange={(e) => updateEditRecapField("tanggal", e.target.value)} className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-600">
                    <span>Marketplace</span>
                    <select value={editRecapDraft.marketplace} onChange={(e) => updateEditRecapField("marketplace", e.target.value as SalesRecapRow["marketplace"])} className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200">
                      <option value="Tokopedia">Tokopedia</option>
                      <option value="Shopee">Shopee</option>
                      <option value="TikTok">TikTok</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-slate-600">
                    <span>No Pesanan</span>
                    <input value={editRecapDraft.noPesanan} onChange={(e) => updateEditRecapField("noPesanan", e.target.value)} className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-600">
                    <span>Pelanggan</span>
                    <input value={editRecapDraft.pelanggan} onChange={(e) => updateEditRecapField("pelanggan", e.target.value)} className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-600">
                    <span>Omzet (Rp)</span>
                    <input type="number" min={0} value={editRecapDraft.omzet} onChange={(e) => updateEditRecapField("omzet", Number(e.target.value || 0))} className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-600">
                    <span>Modal (Rp)</span>
                    <input type="number" min={0} value={editRecapDraft.modal} onChange={(e) => updateEditRecapField("modal", Number(e.target.value || 0))} className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                  </label>
                </div>

                <div className="mt-3 rounded-2xl border border-stone-200 bg-stone-50/80 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Rincian Biaya</p>
                    <button type="button" onClick={addEditRecapBiayaDetail} className="rounded-xl border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-stone-100">
                      Tambah Biaya
                    </button>
                  </div>
                  <div className="space-y-2">
                    {editRecapDraft.biayaDetail.map((item, index) => (
                      <div key={`edit-biaya-${index}`} className="grid gap-2 lg:grid-cols-[1.4fr_140px_auto]">
                        <input
                          value={item.label}
                          onChange={(e) => updateEditRecapBiayaDetail(index, "label", e.target.value)}
                          placeholder="Nama biaya"
                          className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                        />
                        <input
                          type="number"
                          min={0}
                          value={item.value}
                          onChange={(e) => updateEditRecapBiayaDetail(index, "value", Number(e.target.value || 0))}
                          className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-right text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                        />
                        <button
                          type="button"
                          onClick={() => removeEditRecapBiayaDetail(index)}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={editRecapDraft.biayaDetail.length <= 1}
                        >
                          Hapus
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-slate-600">Total Biaya</span>
                    <strong className="text-slate-900">
                      {rupiah(editRecapDraft.biayaDetail.reduce((acc, item) => acc + Math.max(0, Number(item.value) || 0), 0))}
                    </strong>
                  </div>
                </div>

                <label className="mt-3 grid gap-1 text-xs text-slate-600">
                  <span>Catatan</span>
                  <input value={editRecapDraft.catatan} onChange={(e) => updateEditRecapField("catatan", e.target.value)} className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                </label>

                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditRecapDraft(null)}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-stone-100"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={saveEditRecap}
                    className="rounded-xl border border-stone-900 bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800"
                  >
                    Simpan Perubahan
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          </div>
          ) : null}
        </article>
      </section>
      ) : null}
        </div>
      </div>
    </main>
  );
}
