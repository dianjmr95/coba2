"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
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

type SectionId = "kalkulator-potongan" | "compare-harga" | "pembuatan-nota" | "rekap-penjualan";
type UserRole = "admin" | "staff" | "staff_offline" | "viewer";
type InvoiceDocumentType = "faktur" | "penawaran";
type InvoiceTaxMode = "exclude" | "include";
type RecapProfitLossPreset = "1bulan" | "3bulan" | "1tahun" | "custom";

type InvoiceItem = {
  id: string;
  nama: string;
  qty: number;
  harga: number;
};
type SalesDocumentSaveResponse = {
  ok: boolean;
  error?: string;
  data?: {
    documentNo: string;
    publicToken: string;
    shareUrl: string;
  };
};
type SalesDocumentDetailResponse = {
  ok: boolean;
  error?: string;
  data?: {
    publicToken: string;
    documentNo: string;
    documentType: InvoiceDocumentType;
    invoiceDate: string;
    validUntil: string | null;
    buyer: string;
    phone: string;
    whatsapp: string;
    address: string;
    courier: string;
    salesPic: string;
    notes: string;
    items: Array<{ nama: string; qty: number; harga: number }>;
    subtotal: number;
    discountAmount?: number;
    taxEnabled: boolean;
    taxRate: number;
    taxAmount: number;
    grandTotal: number;
    taxMode?: InvoiceTaxMode;
  };
};
type SalesDocumentHistoryRow = {
  id: string;
  publicToken: string;
  documentNo: string;
  documentType: InvoiceDocumentType;
  invoiceDate: string;
  buyer: string;
  subtotal: number;
  createdAt: string | null;
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

type PriceFetchTarget = "harga_jual" | "modal";

type ScrapeApiResponse = {
  ok: boolean;
  error?: string;
  data?: {
    price?: number;
    store_name?: string;
    marketplace?: string;
    scraped_via?: "http" | "playwright" | "proxy";
  };
};
type PriceCompareStatus = "today_cheaper" | "previous_cheaper" | "same" | "unmatched";
type PriceCompareRow = {
  todayRowNumber: number;
  todayProductName: string;
  todayPrice: number;
  matched: boolean;
  previousProductName?: string;
  previousPrice?: number;
  difference?: number;
  similarityScore: number;
  status: PriceCompareStatus;
};
type PriceCompareApiResponse = {
  ok: boolean;
  error?: string;
  data?: {
    rows: PriceCompareRow[];
    summary: PriceCompareSummary;
  };
};
type PriceCompareSummary = {
  totalRows: number;
  matchedRows: number;
  todayCheaperCount: number;
  previousCheaperCount: number;
  samePriceCount: number;
};
type PriceCompareItemCalc = {
  targetNet: number;
  rekomTokopedia: number;
  rekomShopee: number;
  rekomMall: number;
};
type CompareCalcMarketplace = "shopee" | "mall";
type MyRoleApiResponse = {
  ok: boolean;
  error?: string;
  data?: {
    role?: UserRole;
  };
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
const PRICE_COMPARE_PRESET_ACTIVE = "__active__";
const PRICE_COMPARE_PRESET_AUTO_LAPTOP = "__auto_preset_laptop__";
const INVOICE_COUNTER_STORAGE_KEY = "starcomp-invoice-counter-v1";
const RECAP_CACHE_STORAGE_KEY = "sales-recap-cache-v1";
const NAV_VISIBILITY_STORAGE_KEY = "starcomp-nav-hidden-v1";
const RECAP_SUPABASE_TABLE = process.env.NEXT_PUBLIC_SUPABASE_RECAP_TABLE || "sales_recap";
const PRESET_SUPABASE_TABLE = process.env.NEXT_PUBLIC_SUPABASE_PRESET_TABLE || "potongan_presets";
const USER_ROLE_TABLE = process.env.NEXT_PUBLIC_SUPABASE_ROLE_TABLE || "user_roles";
const DEFAULT_BANK_ACCOUNT_INFO = "BCA : 861-0995960\nA/n : CV STAR MEDIA COMPUTAMA";
const ORDER_ITEMS_FEATURE_START_DATE = "2026-04-18";
const ENABLE_AUTO_PRICE_FETCH = String(process.env.NEXT_PUBLIC_ENABLE_AUTO_PRICE_FETCH || "").toLowerCase() === "true";
const FIXED_ADMIN_EMAIL = "luluklisdiantoro535@gmail.com";
const SECTION_LABEL: Record<SectionId, string> = {
  "kalkulator-potongan": "Kalkulator Potongan",
  "compare-harga": "Compare Harga",
  "pembuatan-nota": "Pembuatan Nota/Faktur",
  "rekap-penjualan": "Rekap Penjualan"
};
const ROLE_SECTION_ACCESS: Record<UserRole, SectionId[]> = {
  admin: ["kalkulator-potongan", "compare-harga", "pembuatan-nota", "rekap-penjualan"],
  staff: ["kalkulator-potongan", "compare-harga", "pembuatan-nota", "rekap-penjualan"],
  staff_offline: ["kalkulator-potongan", "compare-harga", "pembuatan-nota", "rekap-penjualan"],
  viewer: ["kalkulator-potongan", "compare-harga", "rekap-penjualan"]
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
  const codeUpper = String(e.code ?? "").toUpperCase();
  const message = String(e.message ?? "").toLowerCase();
  const details = String(e.details ?? "").toLowerCase();
  const col = columnName.toLowerCase();
  if (codeUpper === "PGRST204" && (message.includes(col) || details.includes(col))) {
    return true;
  }
  return (
    message.includes("column") &&
    message.includes(col) &&
    (
      message.includes("does not exist") ||
      message.includes("not found") ||
      message.includes("could not find") ||
      message.includes("schema cache") ||
      details.includes("schema cache")
    )
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
  } else if (codeUpper === "PGRST204") {
    hint = "Kolom yang diakses tidak terdeteksi di schema cache. Cek migration kolom tabel rekap atau refresh schema cache Supabase.";
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
const priceCompareStatusLabel: Record<PriceCompareStatus, string> = {
  today_cheaper: "Hari Ini Lebih Murah",
  previous_cheaper: "Sebelumnya Lebih Murah",
  same: "Tidak Naik",
  unmatched: "Tidak Match"
};

function calcRecapOrderTotals(items: RecapOrderSnapshot[]) {
  return items.reduce(
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
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeRole(raw: unknown): UserRole {
  const role = String(raw ?? "")
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (role === "admin" || role === "staff" || role === "staff_offline" || role === "viewer") return role;
  return "viewer";
}

function getDefaultAuthRole(): UserRole {
  const raw = String(process.env.NEXT_PUBLIC_DEFAULT_AUTH_ROLE ?? "viewer").toLowerCase();
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
  const parsedOrderItems =
    Array.isArray(rawOrderItems)
      ? rawOrderItems
      : typeof rawOrderItems === "string"
        ? (() => {
            try {
              const parsed = JSON.parse(rawOrderItems);
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          })()
        : [];
  const orderItems = parsedOrderItems
        .map((entry) => {
          if (typeof entry !== "object" || entry === null) return null;
          const e = entry as Record<string, unknown>;
          const nama = typeof (e.nama ?? e.nama_barang ?? e.product_name ?? e.name) === "string"
            ? String(e.nama ?? e.nama_barang ?? e.product_name ?? e.name).trim()
            : "";
          if (!nama) return null;
          return {
            nama,
            hargaJual: toSafeNumber(e.hargaJual ?? e.harga_jual ?? e.harga ?? e.price),
            modal: toSafeNumber(e.modal ?? e.harga_modal ?? e.cost),
            qty: Math.max(0, Number(e.qty ?? e.jumlah ?? e.quantity ?? 0) || 0)
          } satisfies RecapOrderSnapshot;
        })
        .filter((item): item is RecapOrderSnapshot => Boolean(item));
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

function normalizeSalesDocumentHistoryRow(value: unknown): SalesDocumentHistoryRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  const publicToken = String(row.public_token ?? row.publicToken ?? "").trim();
  const documentNo = String(row.document_no ?? row.documentNo ?? "").trim();
  const rawType = String(row.document_type ?? row.documentType ?? "faktur").toLowerCase();
  const documentType: InvoiceDocumentType = rawType === "penawaran" ? "penawaran" : "faktur";
  const invoiceDate = String(row.invoice_date ?? row.invoiceDate ?? "").trim();
  const buyer = String(row.buyer ?? "").trim();
  const subtotal = Math.max(0, Number(row.grand_total ?? row.grandTotal ?? row.subtotal ?? 0) || 0);
  const createdAtRaw = row.created_at ?? row.createdAt;
  const createdAt = typeof createdAtRaw === "string" && createdAtRaw.trim() ? createdAtRaw : null;

  if (!id || !publicToken || !documentNo || !invoiceDate) return null;
  return {
    id,
    publicToken,
    documentNo,
    documentType,
    invoiceDate,
    buyer,
    subtotal,
    createdAt
  };
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function getNextInvoiceNumber(docType: InvoiceDocumentType = "faktur") {
  const todayKey = getLocalDateKey(new Date());
  let nextSeq = 1;

  try {
    const raw = window.localStorage.getItem(INVOICE_COUNTER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        date?: string;
        seq?: number;
        seqByType?: Partial<Record<InvoiceDocumentType, number>>;
      };
      if (parsed?.date === todayKey) {
        const seqByType = parsed.seqByType ?? {};
        const legacyFakturSeq =
          typeof parsed.seq === "number" && Number.isFinite(parsed.seq) ? Math.max(0, parsed.seq) : 0;
        const currentSeq =
          typeof seqByType[docType] === "number" && Number.isFinite(seqByType[docType])
            ? Math.max(0, Number(seqByType[docType]))
            : docType === "faktur"
              ? legacyFakturSeq
              : 0;
        nextSeq = currentSeq + 1;
      }
    }
  } catch {
    nextSeq = 1;
  }

  try {
    const raw = window.localStorage.getItem(INVOICE_COUNTER_STORAGE_KEY);
    const parsed = raw
      ? (JSON.parse(raw) as { date?: string; seqByType?: Partial<Record<InvoiceDocumentType, number>> })
      : null;
    const baseSeqByType: Record<InvoiceDocumentType, number> =
      parsed?.date === todayKey
        ? {
            faktur: Math.max(0, Number(parsed?.seqByType?.faktur || 0)),
            penawaran: Math.max(0, Number(parsed?.seqByType?.penawaran || 0))
          }
        : { faktur: 0, penawaran: 0 };
    baseSeqByType[docType] = nextSeq;
    window.localStorage.setItem(
      INVOICE_COUNTER_STORAGE_KEY,
      JSON.stringify({ date: todayKey, seqByType: baseSeqByType })
    );
  } catch {
    // ignore storage write errors
  }

  const prefix = docType === "faktur" ? "STCSO" : "STCSPN";
  return `${prefix}-${todayKey}-${String(nextSeq).padStart(3, "0")}`;
}

function cariHargaRekomendasi(targetNet: number, hitungNetDariHarga: (harga: number) => number) {
  if (targetNet <= 0) return 0;

  const netAtZero = hitungNetDariHarga(0);
  const netAtOne = hitungNetDariHarga(1);
  const slopeLinear = netAtOne - netAtZero;
  const safeSlope = Number.isFinite(slopeLinear) && slopeLinear > 0.000001 ? slopeLinear : 1;
  let harga = Math.max(1, (targetNet - netAtZero) / safeSlope);

  for (let i = 0; i < 100; i += 1) {
    const net = hitungNetDariHarga(harga);
    const diff = targetNet - net;
    if (Math.abs(diff) < 0.01) {
      break;
    }

    harga += diff;
    if (!Number.isFinite(harga) || harga <= 0) {
      harga = 1;
    }
    if (harga > 1_000_000_000) {
      return Number.NaN;
    }
  }

  let hasil = Math.ceil(harga);
  if (!Number.isFinite(hasil) || hasil <= 0) return Number.NaN;

  for (let i = 0; i < 50; i += 1) {
    if (hitungNetDariHarga(hasil) >= targetNet) return hasil;
    hasil += 1;
  }

  return Number.NaN;
}

function normalizeOrderNo(value: string) {
  return value.trim().toLowerCase();
}

function toInputDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMonths(base: Date, months: number) {
  const next = new Date(base);
  next.setMonth(next.getMonth() + months);
  return next;
}

function findRecapOrderNoDuplicates(rows: SalesRecapRow[], noPesanan: string, excludeId?: string) {
  const normalizedNo = normalizeOrderNo(noPesanan);
  if (!normalizedNo) return [];
  return rows.filter((row) => {
    if (excludeId && row.id === excludeId) return false;
    return normalizeOrderNo(row.noPesanan) === normalizedNo;
  });
}

function buildDuplicateOrderNoWarning(noPesanan: string, duplicateRows: SalesRecapRow[]) {
  const normalizedNo = noPesanan.trim();
  const preview = duplicateRows
    .slice(0, 3)
    .map((row) => `${row.tanggal} | ${row.marketplace} | ${row.pelanggan || "-"}`)
    .join("\n- ");
  const remainCount = Math.max(0, duplicateRows.length - 3);
  const remainLine = remainCount > 0 ? `\n- +${remainCount} data lainnya` : "";
  return `No pesanan "${normalizedNo}" sudah ada di rekap (${duplicateRows.length} data):\n- ${preview}${remainLine}\n\nLanjut simpan data ini?`;
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

function calcItemPriceFromPreset(modal: number, targetMargin: number, preset: PresetData): PriceCompareItemCalc {
  if (modal <= 0) {
    return { targetNet: 0, rekomTokopedia: 0, rekomShopee: 0, rekomMall: 0 };
  }

  const targetNet = modal * (1 + targetMargin / 100);
  const rekomTokopedia = cariHargaRekomendasi(targetNet, (hargaJual) =>
    calcTokopedia(
      hargaJual,
      Number(preset.tokopediaFee),
      preset.tokopediaAfiliasiPct,
      preset.tokopediaGratisOngkir,
      preset.tokopediaAfiliasiAktif
    ).net
  );
  const rekomShopee = cariHargaRekomendasi(targetNet, (hargaJual) =>
    calcShopee(
      hargaJual,
      Number(preset.shopeeFee),
      preset.shopeeAfiliasiPct,
      preset.shopeeGratisOngkir,
      preset.shopeePromo,
      preset.shopeeAsuransi,
      preset.shopeeAfiliasiAktif
    ).net
  );
  const rekomMall = cariHargaRekomendasi(targetNet, (hargaJual) =>
    calcMall(
      hargaJual,
      Number(preset.mallFee),
      preset.mallAfiliasiPct,
      preset.mallBiayaJasa,
      preset.mallGratisOngkir,
      preset.mallAfiliasiAktif
    ).net
  );

  return { targetNet, rekomTokopedia, rekomShopee, rekomMall };
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
  const [targetMargin, setTargetMargin] = useState(5);
  const [priceSourceUrl, setPriceSourceUrl] = useState("");
  const [priceFetchTarget, setPriceFetchTarget] = useState<PriceFetchTarget>("modal");
  const [isPriceFetching, setIsPriceFetching] = useState(false);
  const [priceFetchNotice, setPriceFetchNotice] = useState("");
  const [todayPriceListFile, setTodayPriceListFile] = useState<File | null>(null);
  const [previousPriceListFile, setPreviousPriceListFile] = useState<File | null>(null);
  const [isTodayPriceListDragOver, setIsTodayPriceListDragOver] = useState(false);
  const [isPreviousPriceListDragOver, setIsPreviousPriceListDragOver] = useState(false);
  const [isPriceCompareLoading, setIsPriceCompareLoading] = useState(false);
  const [isPriceCompareExporting, setIsPriceCompareExporting] = useState(false);
  const [priceCompareRows, setPriceCompareRows] = useState<PriceCompareRow[]>([]);
  const [priceCompareNotice, setPriceCompareNotice] = useState("");
  const [priceCompareSummary, setPriceCompareSummary] = useState<PriceCompareSummary | null>(null);
  const [priceComparePresetId, setPriceComparePresetId] = useState<string>(PRICE_COMPARE_PRESET_AUTO_LAPTOP);
  const [priceCompareFilterQuery, setPriceCompareFilterQuery] = useState("");
  const [priceCompareFilterStatus, setPriceCompareFilterStatus] = useState<"semua" | PriceCompareStatus>("semua");
  const [priceCompareFilterMatch, setPriceCompareFilterMatch] = useState<"semua" | "match" | "tidak_match">("semua");
  const [priceCompareRowPresetMap, setPriceCompareRowPresetMap] = useState<Record<string, string>>({});
  const [priceCompareRowMarketplaceMap, setPriceCompareRowMarketplaceMap] = useState<Record<string, CompareCalcMarketplace>>({});
  const [priceCompareRowFinalPriceShopeeMap, setPriceCompareRowFinalPriceShopeeMap] = useState<Record<string, string>>({});
  const [priceCompareRowFinalPriceMallMap, setPriceCompareRowFinalPriceMallMap] = useState<Record<string, string>>({});
  const todayPriceListInputRef = useRef<HTMLInputElement | null>(null);
  const previousPriceListInputRef = useRef<HTMLInputElement | null>(null);

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
  const [activeSection, setActiveSection] = useState<SectionId>("kalkulator-potongan");
  const [isNavHidden, setIsNavHidden] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [authUser, setAuthUser] = useState<{ id: string; email: string; role: UserRole } | null>(null);
  const [roleMap, setRoleMap] = useState<Record<string, UserRole>>({});
  const [roleTargetEmail, setRoleTargetEmail] = useState("");
  const [roleTargetValue, setRoleTargetValue] = useState<UserRole>("viewer");
  const [roleEditDraftMap, setRoleEditDraftMap] = useState<Record<string, UserRole>>({});
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
  const [invoicePublicToken, setInvoicePublicToken] = useState("");
  const [invoiceDocType, setInvoiceDocType] = useState<InvoiceDocumentType>("faktur");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceValidUntil, setInvoiceValidUntil] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceSalesPic, setInvoiceSalesPic] = useState("");
  const [invoiceBuyer, setInvoiceBuyer] = useState("");
  const [invoicePhone, setInvoicePhone] = useState("");
  const [invoiceWhatsapp, setInvoiceWhatsapp] = useState("");
  const [invoiceDiscountAmount, setInvoiceDiscountAmount] = useState(0);
  const [invoiceTaxEnabled, setInvoiceTaxEnabled] = useState(false);
  const [invoiceTaxMode, setInvoiceTaxMode] = useState<InvoiceTaxMode>("exclude");
  const [invoiceIncludeSignAndStamp, setInvoiceIncludeSignAndStamp] = useState(true);
  const [invoiceIncludeBankAccount, setInvoiceIncludeBankAccount] = useState(true);
  const [invoiceIncludeSuratJalan, setInvoiceIncludeSuratJalan] = useState(true);
  const [invoiceAddress, setInvoiceAddress] = useState("");
  const [invoiceCourier, setInvoiceCourier] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [invoiceSaveNotice, setInvoiceSaveNotice] = useState("");
  const [isInvoiceSaving, setIsInvoiceSaving] = useState(false);
  const [invoiceHistoryRows, setInvoiceHistoryRows] = useState<SalesDocumentHistoryRow[]>([]);
  const [invoiceHistoryLoading, setInvoiceHistoryLoading] = useState(false);
  const [invoiceHistoryNotice, setInvoiceHistoryNotice] = useState("");
  const [invoiceHistoryDeletingToken, setInvoiceHistoryDeletingToken] = useState<string | null>(null);
  const [invoiceHistoryEditingToken, setInvoiceHistoryEditingToken] = useState<string | null>(null);
  const [invoiceHistoryTypeFilter, setInvoiceHistoryTypeFilter] = useState<"Semua" | InvoiceDocumentType>("Semua");
  const [invoiceHistoryStartDate, setInvoiceHistoryStartDate] = useState("");
  const [invoiceHistoryEndDate, setInvoiceHistoryEndDate] = useState("");
  const [invoiceHistoryBuyerQuery, setInvoiceHistoryBuyerQuery] = useState("");
  const [invoiceHistoryPage, setInvoiceHistoryPage] = useState(1);
  const [invoiceHistoryPageSize, setInvoiceHistoryPageSize] = useState<10 | 25 | 50>(10);
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
  const [recapFilterLaba, setRecapFilterLaba] = useState<"Semua" | "rugi" | "tidak_rugi">("Semua");
  const [recapFilterStartDate, setRecapFilterStartDate] = useState("");
  const [recapFilterEndDate, setRecapFilterEndDate] = useState("");
  const [recapFilterQuery, setRecapFilterQuery] = useState("");
  const [recapProfitLossPreset, setRecapProfitLossPreset] = useState<RecapProfitLossPreset>("1bulan");
  const [recapProfitLossStartDate, setRecapProfitLossStartDate] = useState("");
  const [recapProfitLossEndDate, setRecapProfitLossEndDate] = useState(toInputDate(new Date()));
  const [recapNotice, setRecapNotice] = useState("");
  const [isRecapSaving, setIsRecapSaving] = useState(false);
  const [recapSyncStatus, setRecapSyncStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [recapSyncMessage, setRecapSyncMessage] = useState("");
  const [recapMenu, setRecapMenu] = useState<"input" | "hasil">("input");
  const [openBiayaDetailRow, setOpenBiayaDetailRow] = useState<SalesRecapRow | null>(null);
  const [editRecapDraft, setEditRecapDraft] = useState<RecapEditDraft | null>(null);
  const [isEditRecapSaving, setIsEditRecapSaving] = useState(false);
  const [editRecapNotice, setEditRecapNotice] = useState("");
  const [cancelDraftRow, setCancelDraftRow] = useState<SalesRecapRow | null>(null);
  const [cancelDraftClosingId, setCancelDraftClosingId] = useState<string | null>(null);
  const [cancelDraftReason, setCancelDraftReason] = useState("");
  const [cancelDraftNominal, setCancelDraftNominal] = useState(0);
  const [cancelStatusSaving, setCancelStatusSaving] = useState(false);
  const [cancelTrendDays, setCancelTrendDays] = useState<7 | 14 | 30 | "all">(7);
  const [recapLineHoverDate, setRecapLineHoverDate] = useState<string | null>(null);
  const [supportsOrderItemsColumn, setSupportsOrderItemsColumn] = useState(true);
  const cancelDraftCloseTimerRef = useRef<number | null>(null);
  const invoiceDocLabel = invoiceDocType === "faktur" ? "Faktur" : "Penawaran";
  const invoiceDocUpperLabel = invoiceDocType === "faktur" ? "FAKTUR PENJUALAN" : "SURAT PENAWARAN BARANG";

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
  const priceComparePresetResolved = useMemo(() => {
    const normalizeName = (value: string) => value.trim().toLowerCase();
    const laptopPreset = presets.find((preset) => {
      const key = normalizeName(preset.name);
      return key === "preset laptop" || key.includes("preset laptop");
    });

    if (priceComparePresetId === PRICE_COMPARE_PRESET_AUTO_LAPTOP) {
      if (laptopPreset) {
        return { label: `${laptopPreset.name} (auto)`, data: laptopPreset.data };
      }
      return { label: "Preset Aktif di Kalkulator (fallback auto)", data: currentPresetData };
    }

    if (priceComparePresetId === PRICE_COMPARE_PRESET_ACTIVE) {
      return { label: "Preset Aktif di Kalkulator", data: currentPresetData };
    }

    const selectedPreset = presets.find((preset) => preset.id === priceComparePresetId);
    if (selectedPreset) {
      return { label: selectedPreset.name, data: selectedPreset.data };
    }

    return { label: "Preset Aktif di Kalkulator", data: currentPresetData };
  }, [currentPresetData, presets, priceComparePresetId]);

  const priceCompareRowsWithCalc = useMemo(
    () =>
      priceCompareRows.map((row) => {
        const rowKey = getPriceCompareRowKey(row);
        const presetId = priceCompareRowPresetMap[rowKey] ?? priceComparePresetId;
        const marketplace = priceCompareRowMarketplaceMap[rowKey] ?? "shopee";
        const targetMarginUsed = targetMargin;
        const resolvedPreset = resolveComparePresetById(presetId);
        const calc = calcItemPriceFromPreset(row.todayPrice, targetMarginUsed, resolvedPreset.data);
        const rawFinalShopee = (priceCompareRowFinalPriceShopeeMap[rowKey] ?? "").trim();
        const rawFinalMall = (priceCompareRowFinalPriceMallMap[rowKey] ?? "").trim();
        const parsedFinalShopee = Number(rawFinalShopee);
        const parsedFinalMall = Number(rawFinalMall);
        const hasManualFinalShopee = rawFinalShopee !== "" && Number.isFinite(parsedFinalShopee) && parsedFinalShopee > 0;
        const hasManualFinalMall = rawFinalMall !== "" && Number.isFinite(parsedFinalMall) && parsedFinalMall > 0;
        const hasManualFinal = hasManualFinalShopee || hasManualFinalMall;
        const hasPresetOverride = Object.prototype.hasOwnProperty.call(priceCompareRowPresetMap, rowKey);
        const hasMarketplaceOverride = Object.prototype.hasOwnProperty.call(priceCompareRowMarketplaceMap, rowKey);
        const hasRowAdjustment = hasPresetOverride || hasMarketplaceOverride;
        const finalPriceShopee = hasManualFinalShopee ? Math.round(parsedFinalShopee) : Math.round(calc.rekomShopee || 0);
        const finalPriceMall = hasManualFinalMall ? Math.round(parsedFinalMall) : Math.round(calc.rekomMall || 0);
        const finalPrice = marketplace === "shopee" ? finalPriceShopee : finalPriceMall;
        const marketplaceLabel = marketplace === "shopee" ? "Shopee" : "Tokopedia Mall";
        const sourceLabelShopee = hasManualFinalShopee
          ? "Manual Override (Shopee)"
          : hasRowAdjustment
            ? "Penyesuaian Baris (Shopee)"
            : "Global Margin (Shopee)";
        const sourceLabelMall = hasManualFinalMall
          ? "Manual Override (Tokopedia Mall)"
          : hasRowAdjustment
            ? "Penyesuaian Baris (Tokopedia Mall)"
            : "Global Margin (Tokopedia Mall)";
        return {
          row,
          rowKey,
          presetId,
          targetMarginUsed,
          resolvedPreset,
          marketplace,
          marketplaceLabel,
          calc,
          finalPriceShopee,
          finalPriceMall,
          finalPrice,
          hasManualFinalShopee,
          hasManualFinalMall,
          hasManualFinal,
          sourceLabelShopee,
          sourceLabelMall,
          sourceLabel: marketplace === "shopee" ? sourceLabelShopee : sourceLabelMall
        };
      }),
    [
      priceCompareRows,
      priceCompareRowPresetMap,
      priceComparePresetId,
      priceCompareRowMarketplaceMap,
      priceCompareRowFinalPriceShopeeMap,
      priceCompareRowFinalPriceMallMap,
      resolveComparePresetById,
      targetMargin
    ]
  );
  const filteredPriceCompareRowsWithCalc = useMemo(() => {
    const query = priceCompareFilterQuery.trim().toLowerCase();
    return priceCompareRowsWithCalc.filter(({ row }) => {
      if (priceCompareFilterStatus !== "semua" && row.status !== priceCompareFilterStatus) return false;
      if (priceCompareFilterMatch === "match" && !row.matched) return false;
      if (priceCompareFilterMatch === "tidak_match" && row.matched) return false;
      if (!query) return true;

      const todayName = row.todayProductName.toLowerCase();
      const previousName = String(row.previousProductName || "").toLowerCase();
      return todayName.includes(query) || previousName.includes(query);
    });
  }, [priceCompareFilterMatch, priceCompareFilterQuery, priceCompareFilterStatus, priceCompareRowsWithCalc]);

  function getPriceCompareRowKey(row: PriceCompareRow) {
    return `${row.todayRowNumber}-${row.todayProductName}`;
  }

  function handleChangeGlobalTargetMargin(nextValue: number) {
    const safeValue = Number.isFinite(nextValue) ? Math.max(0, nextValue) : 0;
    setTargetMargin(safeValue);
  }

  function resolveComparePresetById(presetId: string) {
    const normalizeName = (value: string) => value.trim().toLowerCase();
    const laptopPreset = presets.find((preset) => {
      const key = normalizeName(preset.name);
      return key === "preset laptop" || key.includes("preset laptop");
    });

    if (presetId === PRICE_COMPARE_PRESET_AUTO_LAPTOP) {
      if (laptopPreset) return { label: `${laptopPreset.name} (auto)`, data: laptopPreset.data };
      return { label: "Preset Aktif di Kalkulator (fallback auto)", data: currentPresetData };
    }

    if (presetId === PRICE_COMPARE_PRESET_ACTIVE) {
      return { label: "Preset Aktif di Kalkulator", data: currentPresetData };
    }

    const found = presets.find((preset) => preset.id === presetId);
    if (found) return { label: found.name, data: found.data };

    return { label: "Preset Aktif di Kalkulator", data: currentPresetData };
  }

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

  const syncCurrentUserRoleFromServer = useCallback(async () => {
    if (!sessionUser) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return;

      const response = await fetch("/api/my-role", {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      const payload = (await response.json()) as MyRoleApiResponse;
      if (!response.ok || !payload.ok) return;
      const nextRole = normalizeRole(payload.data?.role);

      setRoleMap((prev) => {
        const emailKey = normalizeEmail(sessionUser.email || "");
        if (!emailKey || emailKey === normalizeEmail(FIXED_ADMIN_EMAIL)) return prev;
        if (prev[emailKey] === nextRole) return prev;
        return { ...prev, [emailKey]: nextRole };
      });

      setAuthUser((prev) => {
        if (!prev) return prev;
        if (prev.role === nextRole) return prev;
        return { ...prev, role: nextRole };
      });
    } catch {
      // keep current role state when server sync fails
    }
  }, [sessionUser]);

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

  const loadInvoiceHistory = useCallback(async () => {
    setInvoiceHistoryLoading(true);
    try {
      const retentionCutoff = new Date();
      retentionCutoff.setUTCDate(retentionCutoff.getUTCDate() - 365);
      const retentionCutoffIso = retentionCutoff.toISOString();
      const primaryQuery = await supabase
        .from("sales_documents")
        .select("id, public_token, document_no, document_type, invoice_date, buyer, subtotal, grand_total, created_at")
        .gte("created_at", retentionCutoffIso)
        .order("created_at", { ascending: false })
        .limit(300);
      let data: unknown[] | null = Array.isArray(primaryQuery.data) ? primaryQuery.data : null;
      let error = primaryQuery.error;
      let status = primaryQuery.status;

      if (error && isMissingColumnError(error, "grand_total")) {
        const legacyQuery = await supabase
          .from("sales_documents")
          .select("id, public_token, document_no, document_type, invoice_date, buyer, subtotal, created_at")
          .gte("created_at", retentionCutoffIso)
          .order("created_at", { ascending: false })
          .limit(300);
        data = Array.isArray(legacyQuery.data) ? legacyQuery.data : null;
        error = legacyQuery.error;
        status = legacyQuery.status;
      }

      if (error) {
        setInvoiceHistoryNotice(formatSupabaseError(`Memuat riwayat dokumen (status ${status || "-"})`, error));
        setInvoiceHistoryRows([]);
        return;
      }

      const rows = (Array.isArray(data) ? data : [])
        .map((item) => normalizeSalesDocumentHistoryRow(item))
        .filter((item): item is SalesDocumentHistoryRow => Boolean(item));

      setInvoiceHistoryRows(rows);
      setInvoiceHistoryNotice(rows.length ? "" : "Belum ada dokumen tersimpan.");
    } catch (error) {
      setInvoiceHistoryNotice(formatSupabaseError("Memuat riwayat dokumen", error));
      setInvoiceHistoryRows([]);
    } finally {
      setInvoiceHistoryLoading(false);
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
    if (!sessionUser) return;

    const refreshRoles = () => {
      void loadRoleMapFromSupabase();
    };

    const timer = window.setInterval(refreshRoles, 5000);
    window.addEventListener("focus", refreshRoles);
    document.addEventListener("visibilitychange", refreshRoles);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshRoles);
      document.removeEventListener("visibilitychange", refreshRoles);
    };
  }, [loadRoleMapFromSupabase, sessionUser]);

  useEffect(() => {
    if (!sessionUser) return;

    const refreshCurrentRole = () => {
      void syncCurrentUserRoleFromServer();
    };

    void syncCurrentUserRoleFromServer();
    const timer = window.setInterval(refreshCurrentRole, 5000);
    window.addEventListener("focus", refreshCurrentRole);
    document.addEventListener("visibilitychange", refreshCurrentRole);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshCurrentRole);
      document.removeEventListener("visibilitychange", refreshCurrentRole);
    };
  }, [sessionUser, syncCurrentUserRoleFromServer]);

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

  useEffect(() => {
    if (!authUser) return;
    if (activeSection !== "pembuatan-nota") return;
    void loadInvoiceHistory();
  }, [activeSection, authUser, loadInvoiceHistory]);

  useEffect(() => {
    if (!authUser) return;
    if (activeSection !== "pembuatan-nota") return;

    const channel = supabase
      .channel("sales-documents-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sales_documents"
        },
        () => {
          void loadInvoiceHistory();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeSection, authUser, loadInvoiceHistory]);

  useEffect(() => {
    setInvoiceSaveNotice("");
  }, [invoiceDocType]);

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

  const recapDuplicateOrderNoRows = useMemo(
    () => findRecapOrderNoDuplicates(recapRows, recapNoPesanan),
    [recapNoPesanan, recapRows]
  );
  const editRecapDuplicateOrderNoRows = useMemo(() => {
    if (!editRecapDraft) return [] as SalesRecapRow[];
    return findRecapOrderNoDuplicates(recapRows, editRecapDraft.noPesanan, editRecapDraft.id);
  }, [editRecapDraft, recapRows]);

  useEffect(() => {
    setRecapOmzet(recapOrderTotals.omzet);
    setRecapModal(recapOrderTotals.modal);
  }, [recapOrderTotals]);

  useEffect(() => {
    if (recapProfitLossPreset === "custom") return;
    const today = new Date();
    const endDate = toInputDate(today);
    const monthOffset = recapProfitLossPreset === "1bulan" ? -1 : recapProfitLossPreset === "3bulan" ? -3 : -12;
    const startDate = toInputDate(addMonths(today, monthOffset));
    setRecapProfitLossStartDate(startDate);
    setRecapProfitLossEndDate(endDate);
  }, [recapProfitLossPreset]);

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
    if (authUser?.role === "viewer" || authUser?.role === "staff_offline") {
      setPresetNotice("Role ini hanya bisa memakai preset yang sudah ada.");
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
    if (authUser?.role === "viewer" || authUser?.role === "staff_offline") {
      setPresetNotice("Role ini tidak punya izin menghapus preset.");
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
    if (authUser?.role === "viewer" || authUser?.role === "staff_offline") {
      setPresetNotice("Role ini tidak punya izin mengubah preset.");
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

  function addInvoiceItem() {
    setInvoiceItems((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, nama: "", qty: 1, harga: 0 }]);
  }

  function removeInvoiceItem(id: string) {
    setInvoiceItems((prev) => (prev.length > 1 ? prev.filter((x) => x.id !== id) : prev));
  }

  function resetInvoiceWithConfirmation() {
    const confirmed = window.confirm("Yakin ingin menghapus nota/transaksi ini?");
    if (!confirmed) return;

    setInvoiceNo("");
    setInvoicePublicToken("");
    setInvoiceDate(new Date().toISOString().slice(0, 10));
    setInvoiceValidUntil(new Date().toISOString().slice(0, 10));
    setInvoiceSalesPic("");
    setInvoiceBuyer("");
    setInvoicePhone("");
    setInvoiceWhatsapp("");
    setInvoiceDiscountAmount(0);
    setInvoiceTaxEnabled(false);
    setInvoiceTaxMode("exclude");
    setInvoiceIncludeBankAccount(true);
    setInvoiceIncludeSuratJalan(true);
    setInvoiceCourier("");
    setInvoiceAddress("");
    setInvoiceNotes("");
    setInvoiceItems([{ id: `${Date.now()}`, nama: "", qty: 1, harga: 0 }]);
    setInvoiceSaveNotice("");
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
  const invoiceDiscountValue = useMemo(
    () => Math.min(invoiceSubtotal, Math.max(0, Number(invoiceDiscountAmount) || 0)),
    [invoiceDiscountAmount, invoiceSubtotal]
  );
  const invoiceSubtotalAfterDiscount = useMemo(
    () => Math.max(0, invoiceSubtotal - invoiceDiscountValue),
    [invoiceSubtotal, invoiceDiscountValue]
  );
  const invoiceTaxRate = 11;
  const invoiceDppSubtotal = useMemo(() => {
    if (!invoiceTaxEnabled || invoiceTaxMode === "exclude") return invoiceSubtotalAfterDiscount;
    return Math.round((invoiceSubtotalAfterDiscount * 100) / (100 + invoiceTaxRate));
  }, [invoiceSubtotalAfterDiscount, invoiceTaxEnabled, invoiceTaxMode, invoiceTaxRate]);
  const invoiceTaxAmount = useMemo(
    () =>
      invoiceTaxEnabled
        ? invoiceTaxMode === "include"
          ? Math.max(0, invoiceSubtotalAfterDiscount - invoiceDppSubtotal)
          : Math.round((invoiceSubtotalAfterDiscount * invoiceTaxRate) / 100)
        : 0,
    [invoiceSubtotalAfterDiscount, invoiceTaxEnabled, invoiceTaxMode, invoiceDppSubtotal]
  );
  const invoiceDisplaySubtotal = useMemo(
    () => (invoiceTaxEnabled && invoiceTaxMode === "include" ? invoiceDppSubtotal : invoiceSubtotalAfterDiscount),
    [invoiceTaxEnabled, invoiceTaxMode, invoiceDppSubtotal, invoiceSubtotalAfterDiscount]
  );
  const invoiceSubtotalLabel = invoiceTaxEnabled && invoiceTaxMode === "include" ? "Subtotal (DPP)" : "Subtotal";
  const invoiceGrandTotal = useMemo(
    () =>
      invoiceTaxEnabled
        ? invoiceTaxMode === "include"
          ? invoiceSubtotalAfterDiscount
          : invoiceSubtotalAfterDiscount + invoiceTaxAmount
        : invoiceSubtotalAfterDiscount,
    [invoiceSubtotalAfterDiscount, invoiceTaxAmount, invoiceTaxEnabled, invoiceTaxMode]
  );

  useEffect(() => {
    setInvoiceDiscountAmount((prev) => Math.min(Math.max(0, Number(prev) || 0), Math.max(0, Math.round(invoiceSubtotal))));
  }, [invoiceSubtotal]);

  const filteredInvoiceHistory = useMemo(() => {
    const buyerNeedle = invoiceHistoryBuyerQuery.trim().toLowerCase();
    return invoiceHistoryRows.filter((row) => {
      if (invoiceHistoryTypeFilter !== "Semua" && row.documentType !== invoiceHistoryTypeFilter) {
        return false;
      }
      if (invoiceHistoryStartDate && row.invoiceDate < invoiceHistoryStartDate) {
        return false;
      }
      if (invoiceHistoryEndDate && row.invoiceDate > invoiceHistoryEndDate) {
        return false;
      }
      if (buyerNeedle && !row.buyer.toLowerCase().includes(buyerNeedle)) {
        return false;
      }
      return true;
    });
  }, [
    invoiceHistoryBuyerQuery,
    invoiceHistoryEndDate,
    invoiceHistoryRows,
    invoiceHistoryStartDate,
    invoiceHistoryTypeFilter
  ]);
  const invoiceHistoryTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredInvoiceHistory.length / invoiceHistoryPageSize));
  }, [filteredInvoiceHistory.length, invoiceHistoryPageSize]);
  const paginatedInvoiceHistory = useMemo(() => {
    const start = (invoiceHistoryPage - 1) * invoiceHistoryPageSize;
    return filteredInvoiceHistory.slice(start, start + invoiceHistoryPageSize);
  }, [filteredInvoiceHistory, invoiceHistoryPage, invoiceHistoryPageSize]);

  useEffect(() => {
    setInvoiceHistoryPage(1);
  }, [invoiceHistoryTypeFilter, invoiceHistoryStartDate, invoiceHistoryEndDate, invoiceHistoryBuyerQuery, invoiceHistoryPageSize]);

  useEffect(() => {
    setInvoiceHistoryPage((prev) => Math.min(Math.max(prev, 1), invoiceHistoryTotalPages));
  }, [invoiceHistoryTotalPages]);

  function createDocumentPublicToken() {
    if (typeof globalThis !== "undefined" && globalThis.crypto && "randomUUID" in globalThis.crypto) {
      return globalThis.crypto.randomUUID().replace(/-/g, "");
    }
    return `${Date.now()}${Math.random().toString(16).slice(2)}`;
  }

  async function saveInvoiceDocument(options?: { forceNewNumber?: boolean; markPrinted?: boolean }) {
    const forceNewNumber = Boolean(options?.forceNewNumber);
    const markPrinted = options?.markPrinted !== false;

    if (isInvoiceSaving) {
      throw new Error("Dokumen sedang disimpan. Coba lagi beberapa detik.");
    }

    const documentNo = forceNewNumber
      ? getNextInvoiceNumber(invoiceDocType)
      : invoiceNo || getNextInvoiceNumber(invoiceDocType);
    const publicToken = forceNewNumber ? createDocumentPublicToken() : invoicePublicToken || createDocumentPublicToken();
    const normalizedItems = invoiceItems
      .map((item) => ({
        nama: String(item.nama || "").trim(),
        qty: Math.max(0, Number(item.qty) || 0),
        harga: Math.max(0, Number(item.harga) || 0)
      }))
      .filter((item) => item.nama && item.qty > 0);

    if (!normalizedItems.length) {
      throw new Error("Isi minimal 1 item barang valid sebelum menyimpan dokumen.");
    }

    setIsInvoiceSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sesi login tidak ditemukan. Silakan login ulang.");

      const response = await fetch("/api/sales-documents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          publicToken,
          documentNo,
          documentType: invoiceDocType,
          invoiceDate,
          validUntil: invoiceDocType === "penawaran" ? invoiceValidUntil || null : null,
          buyer: invoiceBuyer,
          phone: invoicePhone,
          whatsapp: invoiceWhatsapp,
          address: invoiceAddress,
          courier: invoiceCourier,
          salesPic: invoiceDocType === "penawaran" ? invoiceSalesPic : "",
          notes: invoiceNotes,
          items: normalizedItems,
          subtotal: invoiceSubtotal,
          discountAmount: invoiceDiscountValue,
          taxEnabled: invoiceTaxEnabled,
          taxMode: invoiceTaxMode,
          taxRate: invoiceTaxRate,
          taxAmount: invoiceTaxAmount,
          grandTotal: invoiceGrandTotal,
          markPrinted
        })
      });

      const parsed = (await response.json()) as SalesDocumentSaveResponse;
      if (!response.ok || !parsed.ok || !parsed.data) {
        throw new Error(parsed.error || "Gagal menyimpan dokumen ke Supabase.");
      }

      setInvoiceNo(parsed.data.documentNo);
      setInvoicePublicToken(parsed.data.publicToken);
      setInvoiceSaveNotice("Dokumen tersimpan di Supabase dan siap dibagikan.");
      void loadInvoiceHistory();
      return parsed.data;
    } finally {
      setIsInvoiceSaving(false);
    }
  }

  async function printInvoice() {
    let savedDoc: { documentNo: string; publicToken: string; shareUrl: string };
    try {
      savedDoc = await saveInvoiceDocument({ forceNewNumber: true, markPrinted: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal menyimpan dokumen.";
      setInvoiceSaveNotice(message);
      window.alert(message);
      return;
    }

    const generatedInvoiceNo = savedDoc.documentNo;

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
    const signatureUrl = `${window.location.origin}/signature-starcomp.png`;
    const buyerValue = invoiceBuyer.trim();
    const phoneValue = invoicePhone.trim();
    const whatsappValue = invoiceWhatsapp.trim();
    const addressValue = invoiceAddress.trim();
    const courierValue = invoiceCourier.trim();
    const salesPicValue = invoiceSalesPic.trim();
    const bankAccountValue = DEFAULT_BANK_ACCOUNT_INFO.trim();
    const showBankAccount = invoiceIncludeBankAccount && Boolean(bankAccountValue);
    const bankAccountHtml = bankAccountValue.replace(/\n/g, "<br />");
    const printDate = new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(new Date());
    const validUntilDate = invoiceValidUntil
      ? new Intl.DateTimeFormat("id-ID", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        }).format(new Date(invoiceValidUntil))
      : "-";

    const docLabel = invoiceDocType === "faktur" ? "Faktur" : "Penawaran";
    const docNoLabel = invoiceDocType === "faktur" ? "No Faktur" : "No Penawaran";
    const totalLabel = invoiceDocType === "faktur" ? "TOTAL" : "TOTAL PENAWARAN";
    const taxRateLabel = invoiceTaxRate.toFixed(2).replace(".", ",");
    const taxTermsLine =
      invoiceTaxMode === "include"
        ? "* Harga diatas sudah termasuk Faktur Pajak."
        : "* Harga diatas belum termasuk Faktur Pajak (PPN ditambahkan terpisah).";
    const hasBuyerBox = Boolean(buyerValue || phoneValue || whatsappValue || addressValue);
    const signVisuals = invoiceIncludeSignAndStamp
      ? `<img class="stamp" src="${logoUrl}" alt="Cap Starcomp" />
                <img class="signature" src="${signatureUrl}" alt="Tanda tangan" />`
      : "";
    const suratJalanNo = `${generatedInvoiceNo}/SJ`;
    const suratJalanRows = invoiceItems
      .map((item, idx) => {
        return `<tr>
          <td style="padding:8px;border:1px solid #ddd;">${idx + 1}</td>
          <td style="padding:8px;border:1px solid #ddd;">${item.nama || "-"}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">${item.qty}</td>
          <td style="padding:8px;border:1px solid #ddd;">&nbsp;</td>
        </tr>`;
      })
      .join("");
    const suratJalanSection =
      invoiceDocType === "faktur" && invoiceIncludeSuratJalan
        ? `<div class="sheet page-break">
          <div class="header">
            <div class="company">
              <h1>STARCOMP SOLO</h1>
              <p>Computer Store</p>
              <p>Dokumen Pengiriman Barang</p>
              <p class="address">Jl. Garuda Mas, Gonilan, Kec. Kartasura, Kabupaten Sukoharjo, Jawa Tengah 57169</p>
              <p>No. Telp/WA: 08112642352</p>
            </div>
            <div class="logo-wrap">
              <img class="logo" src="${logoUrl}" alt="Logo Starcomp" />
            </div>
          </div>

          <div class="title">SURAT JALAN</div>

          <div class="meta">
            <div class="box">
              <p><strong>No Surat Jalan:</strong> ${suratJalanNo}</p>
              <p><strong>Referensi Faktur:</strong> ${generatedInvoiceNo}</p>
              <p><strong>Tanggal:</strong> ${printDate}</p>
              ${courierValue ? `<p><strong>Kurir:</strong> ${courierValue}</p>` : ""}
            </div>
            <div class="box">
              ${buyerValue ? `<p><strong>Dikirim Kepada:</strong> ${buyerValue}</p>` : `<p><strong>Dikirim Kepada:</strong> -</p>`}
              ${phoneValue ? `<p><strong>Telepon:</strong> ${phoneValue}</p>` : ""}
              ${addressValue ? `<p><strong>Alamat:</strong> ${addressValue}</p>` : `<p><strong>Alamat:</strong> -</p>`}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width:36px;">No</th>
                <th>Nama Barang</th>
                <th class="right" style="width:70px;">Qty</th>
                <th style="width:160px;">Keterangan</th>
              </tr>
            </thead>
            <tbody>${suratJalanRows}</tbody>
          </table>

          <div class="notes"><strong>Catatan Pengiriman:</strong> ${invoiceNotes || "-"}</div>

          <div class="delivery-sign">
            <div class="delivery-sign-box">
              <div>Pengirim,</div>
              <div class="delivery-sign-space ${invoiceIncludeSignAndStamp ? "" : "no-visual"}">
                ${
                  invoiceIncludeSignAndStamp
                    ? `<img class="delivery-stamp" src="${logoUrl}" alt="Cap Starcomp" />
                       <img class="delivery-signature" src="${signatureUrl}" alt="Tanda tangan" />`
                    : ""
                }
              </div>
              <div><strong>STARCOMP SOLO</strong></div>
            </div>
            <div class="delivery-sign-box">
              <div>Penerima,</div>
              <div class="delivery-sign-space"></div>
              <div><strong>(________________)</strong></div>
            </div>
          </div>
        </div>`
        : "";
    const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${docLabel} ${generatedInvoiceNo}</title>
        <style>
          @page { size: A4; margin: 12mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11px; }
          .sheet { max-width: 760px; margin: 0 auto; }
          .header { display: flex; align-items: center; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
          .company { width: 50%; padding-right: 8px; }
          .logo-wrap { width: 50%; display: flex; justify-content: flex-end; }
          .logo { width: 220px; max-width: 100%; height: auto; object-fit: contain; }
          .company h1 { margin: 0; font-size: 28px; letter-spacing: 0.015em; line-height: 1.02; }
          .company p { margin: 1px 0 0; color: #222; font-size: 10px; line-height: 1.25; }
          .company .address { margin-top: 2px; font-size: 9px; line-height: 1.3; max-width: 500px; color: #333; }
          .title { margin: 10px 0 8px; text-align: center; font-size: 20px; font-weight: 700; letter-spacing: 0.11em; }
          .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
          .meta.single { grid-template-columns: 1fr; }
          .box { border: 1px solid #999; border-radius: 3px; padding: 8px; min-height: 68px; }
          .box p { margin: 0 0 3px; font-size: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 4px; }
          th, td { border: 1px solid #999; padding: 5px; font-size: 10px; }
          th { background: #f2f2f2; font-weight: 700; }
          td.right, th.right { text-align: right; }
          .total { margin-top: 8px; display: flex; justify-content: flex-end; font-size: 14px; font-weight: 700; }
          .notes { margin-top: 8px; border: 1px solid #999; border-radius: 3px; padding: 8px; min-height: 42px; font-size: 10px; }
          .terms { margin-top: 8px; border: 1px solid #999; border-radius: 3px; padding: 8px; font-size: 10px; line-height: 1.5; }
          .terms-title { font-weight: 700; margin-bottom: 4px; }
          .terms-list { margin: 0; padding-left: 16px; }
          .terms-closing { margin-top: 8px; }
          .bank-section { margin-top: 8px; border: 1px solid #999; border-radius: 3px; padding: 8px; font-size: 10px; line-height: 1.45; }
          .bank-box { margin-top: 8px; border-top: 1px dashed #bbb; padding-top: 6px; line-height: 1.45; }
          .bank-label { font-weight: 700; }
          .sign { margin-top: 30px; display: flex; justify-content: flex-end; }
          .sign-box { width: 180px; text-align: center; font-size: 10px; position: relative; }
          .sign-space { height: 74px; position: relative; }
          .sign-space.no-visual { height: 74px; }
          .stamp { position: absolute; left: 50%; top: 2px; width: 132px; transform: translateX(-50%) rotate(-14deg); opacity: 0.24; z-index: 2; }
          .signature { position: absolute; left: 50%; top: 17px; width: 106px; transform: translateX(-50%); z-index: 1; }
          .page-break { break-before: page; page-break-before: always; }
          .delivery-sign { margin-top: 26px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
          .delivery-sign-box { text-align: center; font-size: 10px; }
          .delivery-sign-space { height: 82px; position: relative; }
          .delivery-sign-space.no-visual { height: 82px; }
          .delivery-stamp { position: absolute; left: 50%; top: 6px; width: 126px; transform: translateX(-50%) rotate(-14deg); opacity: 0.24; z-index: 2; }
          .delivery-signature { position: absolute; left: 50%; top: 22px; width: 102px; transform: translateX(-50%); z-index: 1; }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="header">
            <div class="company">
              <h1>STARCOMP SOLO</h1>
              <p>Computer Store</p>
              <p>${invoiceDocType === "faktur" ? "Faktur Penjualan Resmi" : "Dokumen Penawaran Barang"}</p>
              <p class="address">Jl. Garuda Mas, Gonilan, Kec. Kartasura, Kabupaten Sukoharjo, Jawa Tengah 57169</p>
              <p>No. Telp/WA: 08112642352</p>
            </div>
            <div class="logo-wrap">
              <img class="logo" src="${logoUrl}" alt="Logo Starcomp" />
            </div>
          </div>

          <div class="title">${invoiceDocUpperLabel}</div>

          <div class="meta${hasBuyerBox ? "" : " single"}">
            <div class="box">
              <p><strong>${docNoLabel}:</strong> ${generatedInvoiceNo}</p>
              ${
                invoiceDocType === "penawaran" && salesPicValue
                  ? `<p><strong>PIC Sales:</strong> ${salesPicValue}</p>`
                  : ""
              }
              <p><strong>Tanggal Cetak:</strong> ${printDate}</p>
              ${
                invoiceDocType === "penawaran"
                  ? `<p><strong>Berlaku Sampai:</strong> ${validUntilDate}</p>`
                  : ""
              }
              ${courierValue ? `<p><strong>Kurir:</strong> ${courierValue}</p>` : ""}
            </div>
            ${
              hasBuyerBox
                ? `<div class="box">
              ${buyerValue ? `<p><strong>Pembeli:</strong> ${buyerValue}</p>` : ""}
              ${phoneValue ? `<p><strong>Telepon:</strong> ${phoneValue}</p>` : ""}
              ${whatsappValue ? `<p><strong>WhatsApp:</strong> ${whatsappValue}</p>` : ""}
              ${addressValue ? `<p><strong>Alamat:</strong> ${addressValue}</p>` : ""}
            </div>`
                : ""
            }
          </div>

          <table>
            <thead>
              <tr>
                <th style="width:36px;">No</th>
                <th>Nama Barang</th>
                <th class="right" style="width:56px;">Qty</th>
                <th class="right" style="width:130px;">Harga Satuan</th>
                <th class="right" style="width:138px;">Jumlah</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          ${
            invoiceTaxEnabled
              ? `<div style="margin-top:8px;display:grid;gap:3px;font-size:10px;">
                  ${
                    invoiceDiscountValue > 0
                      ? `<div style="display:flex;justify-content:flex-end;gap:8px;"><span>Subtotal Barang</span><strong>${rupiah(invoiceSubtotal)}</strong></div>
                         <div style="display:flex;justify-content:flex-end;gap:8px;"><span>Diskon</span><strong>-${rupiah(invoiceDiscountValue)}</strong></div>`
                      : ""
                  }
                  <div style="display:flex;justify-content:flex-end;gap:8px;"><span>${invoiceSubtotalLabel}</span><strong>${rupiah(invoiceDisplaySubtotal)}</strong></div>
                  <div style="display:flex;justify-content:flex-end;gap:8px;"><span>PPN (${taxRateLabel}%)</span><strong>${rupiah(invoiceTaxAmount)}</strong></div>
                </div>`
              : invoiceDiscountValue > 0
                ? `<div style="margin-top:8px;display:grid;gap:3px;font-size:10px;">
                    <div style="display:flex;justify-content:flex-end;gap:8px;"><span>Subtotal Barang</span><strong>${rupiah(invoiceSubtotal)}</strong></div>
                    <div style="display:flex;justify-content:flex-end;gap:8px;"><span>Diskon</span><strong>-${rupiah(invoiceDiscountValue)}</strong></div>
                    <div style="display:flex;justify-content:flex-end;gap:8px;"><span>Subtotal</span><strong>${rupiah(invoiceSubtotalAfterDiscount)}</strong></div>
                  </div>`
                : ""
          }
          <div class="total">${totalLabel}: ${rupiah(invoiceGrandTotal)}</div>
          <div class="notes"><strong>Catatan:</strong> ${invoiceNotes || "-"}</div>
          ${
            showBankAccount && invoiceDocType === "faktur"
              ? `<div class="bank-section"><div class="bank-label">Rekening Pembayaran:</div><div>${bankAccountHtml}</div></div>`
              : ""
          }
          ${
            invoiceDocType === "faktur"
              ? `<div class="terms">
                  <div class="terms-title">KETERANGAN :</div>
                  <div>* Barang yang sudah dibeli tidak bisa dikembalikan.</div>
                  <div>* Pihak Starcomp bertanggung jawab atas garansi barang tersebut.</div>
                  ${
                    invoiceTaxEnabled
                      ? `<div>${taxTermsLine}</div>`
                      : ""
                  }
                  <div>* Pihak Starcomp tidak bertanggung jawab atas software yang ada di PC/Laptop.</div>
                  <div class="terms-closing">Terima kasih atas kepercayaan Anda.</div>
                </div>`
              : ""
          }
          ${
            invoiceDocType === "penawaran"
              ? `<div class="terms">
                <div class="terms-title">Syarat dan Ketentuan:</div>
                <ol class="terms-list">
                    ${
                      invoiceTaxEnabled
                        ? `<li>${taxTermsLine.replace("* ", "")}</li>`
                        : ""
                    }
                    <li>Harga yang tertera tidak mengikat dan bisa berubah sewaktu-waktu.</li>
                    <li>Pembayaran dilakukan secara tunai/transfer sebelum pengiriman.</li>
                    <li>Pengiriman barang akan dilakukan setelah pembayaran dikonfirmasi.</li>
                    <li>Pihak Starcomp bertanggung jawab atas garansi barang tersebut.</li>
                    <li>Pihak Starcomp tidak bertanggung jawab atas software yang ada di PC/Laptop.</li>
                  </ol>
                  ${
                    showBankAccount
                      ? `<div class="bank-box"><span class="bank-label">Rekening Pembayaran:</span><br />${bankAccountHtml}</div>`
                      : ""
                  }
                  <div class="terms-closing">Demikian surat penawaran ini kami sampaikan. Atas perhatian dan kerjasamanya, kami ucapkan terima kasih.</div>
                </div>`
              : ""
          }
          <div class="sign">
            <div class="sign-box">
              <div>Hormat kami,</div>
              <div class="sign-space ${invoiceIncludeSignAndStamp ? "" : "no-visual"}">
                ${signVisuals}
              </div>
              <div><strong>STARCOMP SOLO</strong></div>
            </div>
          </div>
        </div>
        ${suratJalanSection}

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

  function getDocumentShareUrl(publicToken: string) {
    const params = new URLSearchParams({
      includeSign: invoiceIncludeSignAndStamp ? "1" : "0",
      includeBank: invoiceIncludeBankAccount ? "1" : "0",
      includeTax: invoiceTaxEnabled ? "1" : "0",
      includeTaxMode: invoiceTaxMode,
      includeTaxRate: String(invoiceTaxRate),
      includeTaxAmount: String(invoiceTaxAmount),
      includeDiscountAmount: String(invoiceDiscountValue),
      includeSJ: invoiceIncludeSuratJalan ? "1" : "0"
    });
    return `${window.location.origin}/dokumen/${publicToken}?${params.toString()}`;
  }

  async function sendInvoiceToWhatsapp() {
    const target = normalizeWhatsappNumber(invoiceWhatsapp || invoicePhone);
    if (!target) {
      window.alert("Isi No WhatsApp tujuan terlebih dahulu.");
      return;
    }

    let savedDoc: { documentNo: string; publicToken: string; shareUrl: string };
    try {
      savedDoc = await saveInvoiceDocument({ forceNewNumber: !invoiceNo, markPrinted: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal menyimpan dokumen.";
      setInvoiceSaveNotice(message);
      window.alert(message);
      return;
    }

    const draftNo = savedDoc.documentNo || "Belum dicetak";
    const printDate = new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(new Date());
    const validUntilDate = invoiceValidUntil
      ? new Intl.DateTimeFormat("id-ID", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        }).format(new Date(invoiceValidUntil))
      : "-";

    const lines = invoiceItems.map((item, idx) => {
      const qty = Math.max(0, item.qty);
      const harga = Math.max(0, item.harga);
      const total = qty * harga;
      return `${idx + 1}. ${item.nama || "-"} x${qty} = ${rupiah(total)}`;
    });

    const docLabel = invoiceDocType === "faktur" ? "Faktur" : "Penawaran";
    const text = [
      `*${invoiceDocUpperLabel} STARCOMP SOLO*`,
      `No ${docLabel}: ${draftNo}`,
      `Tanggal: ${printDate}`,
      `Pembeli: ${invoiceBuyer || "-"}`,
      `Telepon: ${invoicePhone || "-"}`,
      `Kurir: ${invoiceCourier || "-"}`,
      `Alamat: ${invoiceAddress || "-"}`,
      ...(invoiceDocType === "penawaran"
        ? [`Berlaku sampai: ${validUntilDate}`, `PIC Sales: ${invoiceSalesPic || "-"}`]
        : []),
      "",
      "*Rincian Barang:*",
      ...lines,
      "",
      ...(invoiceTaxEnabled
        ? [
            ...(invoiceDiscountValue > 0
              ? [`Subtotal Barang: ${rupiah(invoiceSubtotal)}`, `Diskon: -${rupiah(invoiceDiscountValue)}`]
              : []),
            `${invoiceSubtotalLabel}: ${rupiah(invoiceDisplaySubtotal)}`,
            `PPN ${invoiceTaxRate}%: ${rupiah(invoiceTaxAmount)}`,
            `Mode PPN: ${invoiceTaxMode === "include" ? "Sudah termasuk PPN" : "PPN ditambahkan"}`
          ]
        : invoiceDiscountValue > 0
          ? [
              `Subtotal Barang: ${rupiah(invoiceSubtotal)}`,
              `Diskon: -${rupiah(invoiceDiscountValue)}`,
              `Subtotal: ${rupiah(invoiceSubtotalAfterDiscount)}`
            ]
          : []),
      `*${invoiceDocType === "faktur" ? "TOTAL" : "TOTAL PENAWARAN"}: ${rupiah(invoiceGrandTotal)}*`,
      `Catatan: ${invoiceNotes || "-"}`,
      `Link dokumen: ${getDocumentShareUrl(savedDoc.publicToken)}`
    ].join("\n");

    const url = `https://wa.me/${target}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  async function copyDocumentLinkByToken(publicToken: string) {
    if (!publicToken) return;
    const link = `${window.location.origin}/dokumen/${publicToken}`;
    try {
      await navigator.clipboard.writeText(link);
      setInvoiceSaveNotice("Link dokumen berhasil disalin.");
    } catch {
      setInvoiceSaveNotice(`Link dokumen: ${link}`);
    }
  }

  async function copyDocumentLink() {
    if (!invoicePublicToken) {
      setInvoiceSaveNotice("Link belum tersedia. Simpan atau kirim dokumen dulu.");
      return;
    }
    await copyDocumentLinkByToken(invoicePublicToken);
  }

  function exportInvoiceHistoryToExcel() {
    const rows = filteredInvoiceHistory;
    if (!rows.length) {
      setInvoiceSaveNotice("Tidak ada data riwayat untuk diexport.");
      return;
    }

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const tableRows = rows
      .map((row, index) => {
        const docType = row.documentType === "faktur" ? "Faktur" : "Penawaran";
        const shareUrl = `${window.location.origin}/dokumen/${row.publicToken}`;
        return `<tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(row.invoiceDate)}</td>
          <td>${escapeHtml(docType)}</td>
          <td>${escapeHtml(row.documentNo)}</td>
          <td>${escapeHtml(row.buyer || "-")}</td>
          <td style="mso-number-format:'\\#\\,\\#\\#0';">${Math.round(row.subtotal)}</td>
          <td>${escapeHtml(shareUrl)}</td>
        </tr>`;
      })
      .join("");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
</head>
<body>
  <table border="1">
    <thead>
      <tr>
        <th>No</th>
        <th>Tanggal</th>
        <th>Jenis</th>
        <th>No Dokumen</th>
        <th>Pembeli</th>
        <th>Subtotal</th>
        <th>Link Dokumen</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>`;

    const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const dateLabel = new Date().toISOString().slice(0, 10);
    const fileName = `riwayat-dokumen-${dateLabel}.xls`;
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setInvoiceSaveNotice(`Export Excel berhasil: ${fileName}`);
  }

  async function loadInvoiceHistoryDocumentToForm(publicToken: string) {
    if (!publicToken) return false;
    if (authUser?.role === "viewer") {
      setInvoiceSaveNotice("Role viewer tidak punya izin mengubah dokumen.");
      return false;
    }

    setInvoiceHistoryEditingToken(publicToken);
    try {
      const response = await fetch(`/api/sales-documents/${publicToken}`);
      const payload = (await response.json()) as SalesDocumentDetailResponse;
      if (!response.ok || !payload.ok || !payload.data) {
        setInvoiceSaveNotice(payload.error || "Gagal memuat data dokumen.");
        return false;
      }

      const detail = payload.data;
      const nextItems =
        Array.isArray(detail.items) && detail.items.length
          ? detail.items.map((item, index) => ({
              id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
              nama: String(item.nama || ""),
              qty: Math.max(0, Number(item.qty) || 0),
              harga: Math.max(0, Number(item.harga) || 0)
            }))
          : [{ id: `${Date.now()}`, nama: "", qty: 1, harga: 0 }];

      setInvoiceDocType(detail.documentType === "penawaran" ? "penawaran" : "faktur");
      setInvoiceNo(detail.documentNo || "");
      setInvoicePublicToken(detail.publicToken || publicToken);
      setInvoiceDate(detail.invoiceDate || new Date().toISOString().slice(0, 10));
      setInvoiceValidUntil(detail.validUntil || new Date().toISOString().slice(0, 10));
      setInvoiceSalesPic(detail.salesPic || "");
      setInvoiceBuyer(detail.buyer || "");
      setInvoicePhone(detail.phone || "");
      setInvoiceWhatsapp(detail.whatsapp || detail.phone || "");
      setInvoiceAddress(detail.address || "");
      setInvoiceCourier(detail.courier || "");
      setInvoiceNotes(detail.notes || "");
      setInvoiceDiscountAmount(
        Math.min(
          Math.max(0, Number(detail.subtotal) || 0),
          Math.max(0, Number(detail.discountAmount) || 0)
        )
      );
      setInvoiceTaxEnabled(Boolean(detail.taxEnabled));
      const detailTaxMode =
        detail.taxMode === "include" || detail.taxMode === "exclude"
          ? detail.taxMode
          : Boolean(detail.taxEnabled) &&
              Math.abs((Number(detail.grandTotal) || 0) - (Number(detail.subtotal) || 0)) <= 1 &&
              (Number(detail.taxAmount) || 0) > 0
            ? "include"
            : "exclude";
      setInvoiceTaxMode(detailTaxMode);
      setInvoiceItems(nextItems);
      setInvoiceSaveNotice(`Dokumen ${detail.documentNo} dimuat ke form. Kamu bisa edit lalu simpan/cetak ulang.`);
      return true;
    } catch (error) {
      setInvoiceSaveNotice(formatSupabaseError("Memuat dokumen dari riwayat", error));
      return false;
    } finally {
      setInvoiceHistoryEditingToken(null);
    }
  }

  async function saveInvoiceHistoryEdits() {
    if (authUser?.role === "viewer") {
      setInvoiceSaveNotice("Role viewer tidak punya izin menyimpan perubahan dokumen.");
      return;
    }
    if (!invoicePublicToken || !invoiceNo) {
      setInvoiceSaveNotice("Pilih dokumen dari riwayat dulu sebelum simpan perubahan.");
      return;
    }
    try {
      await saveInvoiceDocument({ forceNewNumber: false, markPrinted: false });
      setInvoiceSaveNotice(`Perubahan dokumen ${invoiceNo} berhasil disimpan.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal menyimpan perubahan dokumen.";
      setInvoiceSaveNotice(message);
    }
  }

  async function reprintHistoryDocument(publicToken: string) {
    if (!publicToken) return;
    if (authUser?.role === "viewer") {
      setInvoiceSaveNotice("Role viewer tidak punya izin cetak ulang dokumen.");
      return;
    }
    let includeTax = invoiceTaxEnabled ? "1" : "0";
    let includeTaxMode = invoiceTaxMode;
    let includeTaxRate = String(invoiceTaxRate);
    let includeTaxAmount = String(invoiceTaxEnabled ? invoiceTaxAmount : 0);
    let includeDiscountAmount = String(invoiceDiscountValue);
    try {
      const response = await fetch(`/api/sales-documents/${publicToken}`);
      const payload = (await response.json()) as SalesDocumentDetailResponse;
      if (response.ok && payload.ok && payload.data) {
        const detail = payload.data;
        const subtotal = Math.max(0, Number(detail.subtotal) || 0);
        const detailTaxEnabled = Boolean(detail.taxEnabled);
        const detailTaxMode = detail.taxMode === "include" ? "include" : "exclude";
        const detailTaxRate = Math.max(0, Number(detail.taxRate) || invoiceTaxRate);
        const detailTaxAmount = Math.max(0, Number(detail.taxAmount) || 0);
        const detailGrandTotal = Math.max(0, Number(detail.grandTotal) || 0);
        const discountFromData = Math.min(subtotal, Math.max(0, Number(detail.discountAmount) || 0));
        const inferredDiscountFromTotals = Math.max(
          0,
          detailTaxEnabled
            ? detailTaxMode === "exclude"
              ? subtotal + detailTaxAmount - detailGrandTotal
              : subtotal - detailGrandTotal
            : subtotal - detailGrandTotal
        );
        const discount = Math.min(
          subtotal,
          discountFromData > 0 ? discountFromData : inferredDiscountFromTotals
        );
        const subtotalAfterDiscount = Math.max(0, subtotal - discount);
        includeTax = detailTaxEnabled ? "1" : "0";
        includeTaxMode = detailTaxMode;
        includeTaxRate = String(detailTaxRate);
        includeDiscountAmount = String(discount);
        if (detailTaxEnabled) {
          const computedTax =
            detailTaxMode === "include"
              ? Math.max(0, subtotalAfterDiscount - Math.round((subtotalAfterDiscount * 100) / (100 + detailTaxRate)))
              : Math.max(0, Math.round((subtotalAfterDiscount * detailTaxRate) / 100));
          includeTaxAmount = String(computedTax);
        } else {
          includeTaxAmount = "0";
        }
      }
    } catch {
      // Fallback: keep current form-based tax settings
    }
    const params = new URLSearchParams({
      autoprint: "1",
      includeSign: invoiceIncludeSignAndStamp ? "1" : "0",
      includeBank: invoiceIncludeBankAccount ? "1" : "0",
      includeTax,
      includeTaxMode,
      includeTaxRate,
      includeTaxAmount,
      includeDiscountAmount,
      includeSJ: invoiceIncludeSuratJalan ? "1" : "0"
    });
    const url = `/dokumen/${publicToken}?${params.toString()}`;
    window.open(url, "_blank");
  }

  async function deleteInvoiceHistoryRow(row: SalesDocumentHistoryRow) {
    if (authUser?.role !== "admin") {
      setInvoiceSaveNotice("Hanya role admin yang bisa menghapus riwayat dokumen.");
      return;
    }
    const confirmed = window.confirm(
      `Yakin ingin menghapus dokumen ini?\n\nNo Dokumen: ${row.documentNo}\nJenis: ${row.documentType === "faktur" ? "Faktur" : "Penawaran"}\nPembeli: ${row.buyer || "-"}\n\nData yang dihapus tidak bisa dikembalikan.`
    );
    if (!confirmed) return;

    setInvoiceHistoryDeletingToken(row.publicToken);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setInvoiceSaveNotice("Sesi login tidak ditemukan. Silakan login ulang.");
        return;
      }

      const response = await fetch(`/api/sales-documents/${row.publicToken}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setInvoiceSaveNotice(payload.error || "Gagal menghapus riwayat dokumen.");
        return;
      }

      if (invoicePublicToken === row.publicToken) {
        setInvoicePublicToken("");
      }
      setInvoiceSaveNotice(`Dokumen ${row.documentNo} berhasil dihapus.`);
      void loadInvoiceHistory();
    } catch (error) {
      setInvoiceSaveNotice(formatSupabaseError("Menghapus riwayat dokumen", error));
    } finally {
      setInvoiceHistoryDeletingToken(null);
    }
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
    await loadRoleMapFromSupabase();
    setRoleManageNotice(`Role untuk ${emailKey} disimpan sebagai ${roleTargetValue.replace(/_/g, " ")}.`);
    setRoleTargetEmail("");
    setRoleTargetValue("viewer");
    setRoleManageLoading(false);
  }

  async function handleUpdateRole(email: string, nextRoleRaw: UserRole) {
    const emailKey = normalizeEmail(email);
    if (!emailKey) return;
    if (emailKey === normalizeEmail(FIXED_ADMIN_EMAIL)) {
      setRoleManageNotice("Email admin utama sudah otomatis role admin.");
      return;
    }

    const nextRole = normalizeRole(nextRoleRaw);
    if (nextRole === "admin") {
      setRoleManageNotice("Role admin hanya untuk email admin utama.");
      return;
    }

    setRoleManageLoading(true);
    const { error } = await supabase
      .from(USER_ROLE_TABLE)
      .upsert([{ email: emailKey, role: nextRole }], { onConflict: "email" });

    if (error) {
      setRoleManageNotice(`Gagal update role: ${error.message}`);
      setRoleManageLoading(false);
      return;
    }

    setRoleMap((prev) => ({ ...prev, [emailKey]: nextRole }));
    await loadRoleMapFromSupabase();
    setRoleEditDraftMap((prev) => {
      const next = { ...prev };
      delete next[emailKey];
      return next;
    });
    setRoleManageNotice(`Role untuk ${emailKey} berhasil diubah ke ${nextRole.replace(/_/g, " ")}.`);
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
    await loadRoleMapFromSupabase();
    setRoleManageNotice(`Role ${emailKey} direset ke viewer (default).`);
    setRoleManageLoading(false);
  }

  async function handleFetchPrice() {
    const targetUrl = priceSourceUrl.trim();
    if (!targetUrl) {
      setPriceFetchNotice("Isi URL produk terlebih dahulu.");
      return;
    }

    setIsPriceFetching(true);
    setPriceFetchNotice("Mengambil harga otomatis...");

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl })
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/json")) {
        const rawText = await response.text();
        const preview = rawText.slice(0, 120).replace(/\s+/g, " ").trim();
        setPriceFetchNotice(
          `API mengembalikan respons non-JSON. Kemungkinan ada error server. Preview: ${preview || "-"}`
        );
        setIsPriceFetching(false);
        return;
      }

      const payload = (await response.json()) as ScrapeApiResponse;
      if (!response.ok || !payload.ok) {
        const rawError = (payload.error || "Gagal mengambil harga dari URL produk.").trim();
        const lowered = rawError.toLowerCase();
        if (lowered.includes("anti-bot") || lowered.includes("captcha")) {
          setPriceFetchNotice(
            `${rawError} Kamu tetap bisa lanjut dengan isi Harga Jual/Modal manual untuk sementara.`
          );
        } else {
          setPriceFetchNotice(rawError);
        }
        setIsPriceFetching(false);
        return;
      }

      const fetchedPrice = Math.round(Math.max(0, Number(payload.data?.price) || 0));
      if (!fetchedPrice) {
        setPriceFetchNotice("Harga tidak ditemukan dari halaman produk.");
        setIsPriceFetching(false);
        return;
      }

      if (priceFetchTarget === "modal") {
        setModal(fetchedPrice);
      } else {
        setHarga(fetchedPrice);
      }

      const labelTarget = priceFetchTarget === "modal" ? "Modal" : "Harga Jual";
      const sourceLabel = payload.data?.store_name || payload.data?.marketplace || "website";
      const viaLabel =
        payload.data?.scraped_via === "playwright"
          ? " (mode browser fallback)"
          : payload.data?.scraped_via === "proxy"
            ? " (mode anti-bot proxy)"
            : "";
      setPriceFetchNotice(`Harga dari ${sourceLabel} berhasil dimasukkan ke ${labelTarget}${viaLabel}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terjadi kesalahan saat fetch harga.";
      setPriceFetchNotice(message);
    } finally {
      setIsPriceFetching(false);
    }
  }

  function isAllowedPriceFile(file: File) {
    const name = file.name.toLowerCase();
    return name.endsWith(".xlsx") || name.endsWith(".csv");
  }

  function handlePriceListFile(file: File | null, target: "today" | "previous") {
    if (!file) return;
    if (!isAllowedPriceFile(file)) {
      setPriceCompareNotice("Format file tidak didukung. Gunakan .xlsx atau .csv.");
      return;
    }

    if (target === "today") {
      setTodayPriceListFile(file);
      setPriceCompareNotice(`File price list hari ini siap: ${file.name}`);
      return;
    }
    setPreviousPriceListFile(file);
    setPriceCompareNotice(`File price list sebelumnya siap: ${file.name}`);
  }

  function handleTodayPriceListInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    handlePriceListFile(file, "today");
  }

  function handlePreviousPriceListInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    handlePriceListFile(file, "previous");
  }

  function handleTodayPriceListDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsTodayPriceListDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    handlePriceListFile(file, "today");
  }

  function handlePreviousPriceListDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsPreviousPriceListDragOver(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    handlePriceListFile(file, "previous");
  }

  function handleTodayPriceListDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsTodayPriceListDragOver(true);
  }

  function handlePreviousPriceListDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsPreviousPriceListDragOver(true);
  }

  function handleTodayPriceListDragLeave() {
    setIsTodayPriceListDragOver(false);
  }

  function handlePreviousPriceListDragLeave() {
    setIsPreviousPriceListDragOver(false);
  }

  async function handleRunPriceCompare() {
    if (!todayPriceListFile || !previousPriceListFile) {
      setPriceCompareNotice("Pilih file price list hari ini dan sebelumnya terlebih dahulu.");
      return;
    }

    setIsPriceCompareLoading(true);
    setPriceCompareNotice("Menganalisis file price list hari ini dan sebelumnya...");

    try {
      const formData = new FormData();
      formData.append("today_file", todayPriceListFile);
      formData.append("previous_file", previousPriceListFile);

      const response = await fetch("/api/price-compare", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as PriceCompareApiResponse;

      if (!response.ok || !payload.ok) {
        setPriceCompareNotice(payload.error || "Gagal membandingkan data harga.");
        return;
      }

      const rows = payload.data?.rows ?? [];
      const summary = payload.data?.summary ?? null;
      setPriceCompareRows(rows);
      setPriceCompareRowPresetMap({});
      setPriceCompareRowMarketplaceMap({});
      setPriceCompareRowFinalPriceShopeeMap({});
      setPriceCompareRowFinalPriceMallMap({});
      setPriceCompareSummary(summary);
      setPriceCompareNotice(
        summary
          ? `Perbandingan selesai: ${summary.matchedRows}/${summary.totalRows} produk berhasil dicocokkan.`
          : "Perbandingan selesai."
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terjadi kesalahan saat upload file.";
      setPriceCompareNotice(message);
    } finally {
      setIsPriceCompareLoading(false);
    }
  }

  function useComparisonPrice(value: number, target: PriceFetchTarget) {
    if (!Number.isFinite(value) || value <= 0) return;
    const rounded = Math.round(value);
    if (target === "modal") {
      setModal(rounded);
      setPriceCompareNotice(`Harga ${rupiah(rounded)} (price list hari ini) diterapkan ke Modal.`);
      return;
    }
    setHarga(rounded);
    setPriceCompareNotice(`Harga ${rupiah(rounded)} (price list hari ini) diterapkan ke Harga Jual.`);
  }

  function handleCalculateRowToCalculator(row: PriceCompareRow) {
    if (!row.todayPrice || row.todayPrice <= 0) {
      setPriceCompareNotice("Harga hari ini tidak valid untuk dihitung ke kalkulator.");
      return;
    }

    const rowKey = getPriceCompareRowKey(row);
    const presetId = priceCompareRowPresetMap[rowKey] ?? priceComparePresetId;
    const marketplace = priceCompareRowMarketplaceMap[rowKey] ?? "shopee";
    const targetMarginUsed = targetMargin;
    const resolvedPreset = resolveComparePresetById(presetId);
    const calc = calcItemPriceFromPreset(row.todayPrice, targetMarginUsed, resolvedPreset.data);

    const rekomHarga = marketplace === "shopee" ? calc.rekomShopee : calc.rekomMall;
    const rawManualFinal =
      marketplace === "shopee"
        ? (priceCompareRowFinalPriceShopeeMap[rowKey] ?? "").trim()
        : (priceCompareRowFinalPriceMallMap[rowKey] ?? "").trim();
    const parsedManualFinal = Number(rawManualFinal);
    const finalHarga =
      rawManualFinal !== "" && Number.isFinite(parsedManualFinal) && parsedManualFinal > 0
        ? Math.round(parsedManualFinal)
        : Math.round(rekomHarga || 0);
    const modalForCalculator = Math.round(row.todayPrice * 1000);
    const finalHargaForCalculator = Number.isFinite(finalHarga) && finalHarga > 0 ? Math.round(finalHarga * 1000) : 0;

    applyPreset(resolvedPreset.data);
    setModal(modalForCalculator);
    if (finalHargaForCalculator > 0) {
      setHarga(finalHargaForCalculator);
    }
    setActiveSection("kalkulator-potongan");

    const marketplaceLabel = marketplace === "shopee" ? "Shopee" : "Tokopedia Mall";
    setPriceCompareNotice(
      `Produk "${row.todayProductName}" diproses ke Kalkulator. Preset: ${resolvedPreset.label}, margin target ${targetMarginUsed}% dipakai, modal & target harga ${marketplaceLabel} dikali 1000 (tambah 000). Target: ${rupiahOrDash(finalHargaForCalculator)}.`
    );
  }

  async function handleExportPriceCompare() {
    if (!priceCompareRowsWithCalc.length) {
      setPriceCompareNotice("Belum ada hasil compare untuk diekspor.");
      return;
    }
    if (isPriceCompareExporting) return;

    setIsPriceCompareExporting(true);
    try {
      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      const compareSheet = workbook.addWorksheet("Compare");
      compareSheet.columns = [
        { header: "Baris Hari Ini", key: "todayRow", width: 14 },
        { header: "Produk Hari Ini", key: "todayProduct", width: 38 },
        { header: "Harga Hari Ini", key: "todayPrice", width: 16 },
        { header: "Produk Sebelumnya", key: "previousProduct", width: 38 },
        { header: "Harga Sebelumnya", key: "previousPrice", width: 16 },
        { header: "Selisih", key: "difference", width: 14 },
        { header: "Status", key: "status", width: 24 },
        { header: "Similarity", key: "similarity", width: 12 },
        { header: "Preset Dipakai", key: "presetLabel", width: 26 },
        { header: "Marketplace Hitung", key: "marketplace", width: 20 },
        { header: "Target Margin Dipakai (%)", key: "targetMarginUsed", width: 24 },
        { header: "Target Net", key: "targetNet", width: 16 },
        { header: "Rekom Tokopedia", key: "rekomTokopedia", width: 18 },
        { header: "Rekom Shopee", key: "rekomShopee", width: 16 },
        { header: "Rekom Mall", key: "rekomMall", width: 16 },
        { header: "Harga Final Shopee", key: "finalPriceShopee", width: 18 },
        { header: "Harga Final Mall", key: "finalPriceMall", width: 18 },
        { header: "Harga Final Dipakai", key: "finalPrice", width: 18 },
        { header: "Sumber Perhitungan", key: "sourceLabel", width: 20 }
      ];

      compareSheet.getRow(1).font = { bold: true };
      compareSheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE5E7EB" }
      };

      const getStatusFill = (status: PriceCompareStatus) => {
        if (status === "today_cheaper") return "FFD1FAE5";
        if (status === "previous_cheaper") return "FFFEE2E2";
        if (status === "same") return "FFFEF3C7";
        return "FFF1F5F9";
      };

      for (const { row, calc, marketplace, targetMarginUsed, resolvedPreset, finalPriceShopee, finalPriceMall, finalPrice, hasManualFinalShopee, hasManualFinalMall, sourceLabel } of priceCompareRowsWithCalc) {
        const marketplaceLabel = marketplace === "shopee" ? "Shopee" : "Tokopedia Mall";
        const hasManualFinalSelectedMarketplace =
          marketplace === "shopee" ? hasManualFinalShopee : hasManualFinalMall;
        const added = compareSheet.addRow({
          todayRow: row.todayRowNumber,
          todayProduct: row.todayProductName,
          todayPrice: row.todayPrice,
          previousProduct: row.previousProductName || "",
          previousPrice: row.previousPrice ?? "",
          difference: row.difference ?? "",
          status: priceCompareStatusLabel[row.status],
          similarity: row.similarityScore,
          presetLabel: resolvedPreset.label,
          marketplace: marketplaceLabel,
          targetMarginUsed,
          targetNet: Math.round(calc.targetNet),
          rekomTokopedia: Number.isFinite(calc.rekomTokopedia) ? Math.round(calc.rekomTokopedia) : "",
          rekomShopee: Number.isFinite(calc.rekomShopee) ? Math.round(calc.rekomShopee) : "",
          rekomMall: Number.isFinite(calc.rekomMall) ? Math.round(calc.rekomMall) : "",
          finalPriceShopee: hasManualFinalShopee && Number.isFinite(finalPriceShopee) && finalPriceShopee > 0 ? finalPriceShopee : "",
          finalPriceMall: hasManualFinalMall && Number.isFinite(finalPriceMall) && finalPriceMall > 0 ? finalPriceMall : "",
          finalPrice: hasManualFinalSelectedMarketplace && Number.isFinite(finalPrice) && finalPrice > 0 ? finalPrice : "",
          sourceLabel
        });

        const statusFill = getStatusFill(row.status);
        const statusCell = added.getCell(7);
        statusCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: statusFill }
        };
        statusCell.font = { bold: true };
      }

      for (const col of [3, 5, 6, 12, 13, 14, 15, 16, 17, 18]) {
        compareSheet.getColumn(col).numFmt = "#,##0";
      }

      const summarySheet = workbook.addWorksheet("Summary");
      summarySheet.columns = [
        { header: "Metrik", key: "metric", width: 28 },
        { header: "Nilai", key: "value", width: 30 }
      ];
      summarySheet.getRow(1).font = { bold: true };
      summarySheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE5E7EB" }
      };
      const summaryRows = [
        { metric: "Waktu Export", value: new Date().toLocaleString("id-ID") },
        { metric: "Preset Perhitungan", value: priceComparePresetResolved.label },
        { metric: "Target Margin (%)", value: targetMargin },
        { metric: "Total Baris", value: priceCompareSummary?.totalRows ?? priceCompareRowsWithCalc.length },
        { metric: "Berhasil Match", value: priceCompareSummary?.matchedRows ?? 0 },
        { metric: "Baris Manual Override Shopee/Mall", value: priceCompareRowsWithCalc.filter((item) => item.hasManualFinal).length },
        { metric: "Hari Ini Lebih Murah", value: priceCompareSummary?.todayCheaperCount ?? 0 },
        { metric: "Sebelumnya Lebih Murah", value: priceCompareSummary?.previousCheaperCount ?? 0 },
        { metric: "Tidak Naik", value: priceCompareSummary?.samePriceCount ?? 0 }
      ];
      summaryRows.forEach((item) => summarySheet.addRow(item));

      const stamp = new Date().toISOString().slice(0, 10);
      const fileName = `hasil-compare-pricelist-${stamp}.xlsx`;
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setPriceCompareNotice("File hasil compare berhasil diekspor ke Excel.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal mengekspor hasil compare.";
      setPriceCompareNotice(message);
    } finally {
      setIsPriceCompareExporting(false);
    }
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
    if (authUser?.role === "viewer" || authUser?.role === "staff_offline") {
      setRecapNotice("Role ini hanya bisa melihat data rekap.");
      return false;
    }
    if (isRecapSaving) return false;

    const duplicateOrderNoRows = findRecapOrderNoDuplicates(recapRows, recapNoPesanan);
    if (duplicateOrderNoRows.length) {
      const shouldContinue = window.confirm(buildDuplicateOrderNoWarning(recapNoPesanan, duplicateOrderNoRows));
      if (!shouldContinue) {
        setRecapSyncStatus("error");
        setRecapSyncMessage("No pesanan duplikat. Penyimpanan dibatalkan.");
        setRecapNotice("No pesanan terdeteksi duplikat. Silakan cek ulang sebelum simpan.");
        return false;
      }
    }

    setIsRecapSaving(true);
    setRecapNotice("");
    setRecapSyncStatus("saving");
    setRecapSyncMessage("Menyimpan ke Supabase...");

    try {
      const komisiAfiliasiMarketplace = recapMarketplaceKomisiAfiliasiAktif ? recapMarketplaceKomisiAfiliasi : 0;
      const normalizedOrderItems = recapOrderItems
        .map((item) => ({
          nama: item.nama.trim(),
          hargaJual: Math.max(0, Number(item.hargaJual) || 0),
          modal: Math.max(0, Number(item.modal) || 0),
          qty: Math.max(0, Number(item.qty) || 0)
        }))
        .filter((item) => item.nama && item.hargaJual > 0 && item.qty > 0);

      if (!normalizedOrderItems.length) {
        setRecapSyncStatus("error");
        setRecapSyncMessage("Data item belum lengkap.");
        setRecapNotice("Isi minimal 1 item dengan Nama Barang dan Harga Jual sebelum simpan rekap.");
        return false;
      }

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
        orderItems: normalizedOrderItems,
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
      setRecapSyncMessage("Data sudah tersimpan.");
      setRecapNotice("Data sudah tersimpan.");
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

  async function deleteRecapRow(row: SalesRecapRow) {
    const { id } = row;
    if (authUser?.role !== "admin") {
      setRecapNotice("Hanya role admin yang bisa menghapus data rekap.");
      return;
    }
    const noPesanan = row.noPesanan?.trim() || "-";
    const pelanggan = row.pelanggan?.trim() || "-";
    const confirmed = window.confirm(
      `Yakin ingin menghapus transaksi rekap ini?\n\nTanggal: ${row.tanggal}\nMarketplace: ${row.marketplace}\nNo Pesanan: ${noPesanan}\nPelanggan: ${pelanggan}\n\nData yang dihapus tidak bisa dikembalikan.`
    );
    if (!confirmed) return;

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
    if (authUser?.role === "viewer" || authUser?.role === "staff_offline") {
      setRecapNotice("Role ini tidak punya izin mengubah data rekap.");
      return;
    }
    if (editRecapDraft?.id === row.id) {
      setEditRecapDraft(null);
      return;
    }
    setOpenBiayaDetailRow(null);
    closeCancelDraft(true);
    const normalizedOrderItems = row.orderItems
      .map((item) => ({
          nama: item.nama,
          hargaJual: Math.max(0, Number(item.hargaJual) || 0),
          modal: Math.max(0, Number(item.modal) || 0),
          qty: Math.max(0, Number(item.qty) || 0)
        }))
      .filter((item) => item.nama.trim() || item.hargaJual > 0 || item.modal > 0 || item.qty > 0);
    const rowDateKey = row.tanggal && /^\d{4}-\d{2}-\d{2}$/.test(row.tanggal) ? row.tanggal : "";
    const isAfterOrderItemsFeature = rowDateKey >= ORDER_ITEMS_FEATURE_START_DATE;
    const needsLegacyFallback =
      normalizedOrderItems.length === 0 &&
      !isAfterOrderItemsFeature &&
      (row.omzet > 0 || row.modal > 0);
    const needsPostFeatureWarning =
      normalizedOrderItems.length === 0 &&
      isAfterOrderItemsFeature &&
      (row.omzet > 0 || row.modal > 0);
    const initialOrderItems = normalizedOrderItems.length
      ? normalizedOrderItems
      : needsLegacyFallback
        ? [{ nama: "Item Lama", hargaJual: Math.max(0, row.omzet), modal: Math.max(0, row.modal), qty: 1 }]
        : [{ nama: "", hargaJual: 0, modal: 0, qty: 1 }];
    setEditRecapNotice(
      needsLegacyFallback
        ? "Detail item lama belum tersimpan. Sistem mengisi item awal dari total omzet/modal, silakan sesuaikan nama/qty/harga."
        : needsPostFeatureWarning
          ? "Item barang belum terbaca untuk data ini. Cek kembali data order_items pada transaksi tersebut."
          : ""
    );
    const initialTotals = calcRecapOrderTotals(initialOrderItems);
    setEditRecapDraft({
      id: row.id,
      tanggal: row.tanggal,
      marketplace: row.marketplace,
      status: row.status,
      alasanCancel: row.alasanCancel,
      nominalCancel: Math.max(0, Number(row.nominalCancel) || 0),
      orderItems: initialOrderItems,
      noPesanan: row.noPesanan,
      pelanggan: row.pelanggan,
      omzet: initialTotals.omzet,
      modal: initialTotals.modal,
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

  function updateEditRecapOrderItem(index: number, field: keyof RecapOrderSnapshot, value: string | number) {
    setEditRecapDraft((prev) => {
      if (!prev) return prev;
      const next = prev.orderItems.map((item, idx) => {
        if (idx !== index) return item;
        if (field === "nama") return { ...item, nama: String(value) };
        if (field === "qty") return { ...item, qty: Math.max(0, Number(value) || 0) };
        if (field === "hargaJual") return { ...item, hargaJual: Math.max(0, Number(value) || 0) };
        return { ...item, modal: Math.max(0, Number(value) || 0) };
      });
      const totals = calcRecapOrderTotals(next);
      return {
        ...prev,
        orderItems: next,
        omzet: totals.omzet,
        modal: totals.modal
      };
    });
  }

  function addEditRecapOrderItem() {
    setEditRecapDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        orderItems: [...prev.orderItems, { nama: "", hargaJual: 0, modal: 0, qty: 1 }]
      };
    });
  }

  function removeEditRecapOrderItem(index: number) {
    setEditRecapDraft((prev) => {
      if (!prev) return prev;
      if (prev.orderItems.length <= 1) return prev;
      const next = prev.orderItems.filter((_, idx) => idx !== index);
      const totals = calcRecapOrderTotals(next);
      return {
        ...prev,
        orderItems: next,
        omzet: totals.omzet,
        modal: totals.modal
      };
    });
  }

  function removeEditRecapBiayaDetail(index: number) {
    setEditRecapDraft((prev) => {
      if (!prev) return prev;
      if (prev.biayaDetail.length <= 1) return prev;
      return { ...prev, biayaDetail: prev.biayaDetail.filter((_, idx) => idx !== index) };
    });
  }

  async function saveEditRecap() {
    if (authUser?.role === "viewer" || authUser?.role === "staff_offline") {
      setRecapNotice("Role ini tidak punya izin mengubah data rekap.");
      setEditRecapNotice("Role ini tidak punya izin mengubah data rekap.");
      return;
    }
    if (isEditRecapSaving) return;
    if (!editRecapDraft) {
      setEditRecapNotice("Mode edit sudah tertutup. Klik Edit lagi lalu simpan.");
      return;
    }

    const sanitizedOrderItems = editRecapDraft.orderItems
      .map((item) => ({
        nama: item.nama.trim(),
        hargaJual: Math.max(0, Number(item.hargaJual) || 0),
        modal: Math.max(0, Number(item.modal) || 0),
        qty: Math.max(0, Number(item.qty) || 0)
      }))
      .filter((item) => item.nama && item.qty > 0);

    if (!sanitizedOrderItems.length) {
      const message = "Isi minimal 1 item barang valid sebelum menyimpan perubahan.";
      setRecapNotice(message);
      setEditRecapNotice(message);
      return;
    }

    const sanitizedBiayaDetail = editRecapDraft.biayaDetail
      .map((item) => ({
        label: item.label.trim() || "Biaya",
        value: Math.max(0, Number(item.value) || 0)
      }))
      .filter((item) => item.label || item.value > 0);

    const biayaDetail = sanitizedBiayaDetail.length ? sanitizedBiayaDetail : [{ label: "Biaya", value: 0 }];
    const totalBiaya = biayaDetail.reduce((acc, item) => acc + item.value, 0);
    const orderTotals = calcRecapOrderTotals(sanitizedOrderItems);

    const updatedRow: SalesRecapRow = {
      id: editRecapDraft.id,
      tanggal: editRecapDraft.tanggal,
      marketplace: editRecapDraft.marketplace,
      status: editRecapDraft.status,
      alasanCancel: editRecapDraft.status === "cancel" ? editRecapDraft.alasanCancel.trim() : "",
      nominalCancel: editRecapDraft.status === "cancel" ? Math.max(0, Number(editRecapDraft.nominalCancel) || 0) : 0,
      tanggalCancel: editRecapDraft.status === "cancel" ? new Date().toISOString() : null,
      createdAt: recapRows.find((row) => row.id === editRecapDraft.id)?.createdAt ?? null,
      orderItems: sanitizedOrderItems,
      noPesanan: editRecapDraft.noPesanan,
      pelanggan: editRecapDraft.pelanggan,
      omzet: orderTotals.omzet,
      modal: orderTotals.modal,
      ongkir: totalBiaya,
      biayaDetail,
      catatan: editRecapDraft.catatan
    };

    const duplicateOrderNoRows = findRecapOrderNoDuplicates(recapRows, updatedRow.noPesanan, updatedRow.id);
    if (duplicateOrderNoRows.length) {
      const shouldContinue = window.confirm(buildDuplicateOrderNoWarning(updatedRow.noPesanan, duplicateOrderNoRows));
      if (!shouldContinue) {
        const message = "No pesanan duplikat. Perubahan dibatalkan, silakan cek ulang sebelum simpan.";
        setRecapNotice(message);
        setEditRecapNotice(message);
        return;
      }
    }

    setIsEditRecapSaving(true);
    setEditRecapNotice("Memproses simpan perubahan...");
    try {
      let updateResult = await runSupabaseWithRetry(
        () =>
          supabase
            .from(RECAP_SUPABASE_TABLE)
            .update(toRecapDbPayload(updatedRow, supportsOrderItemsColumn), { count: "exact" })
            .eq("id", updatedRow.id),
        2
      );
      if (updateResult.error && supportsOrderItemsColumn && isMissingColumnError(updateResult.error, "order_items")) {
        setSupportsOrderItemsColumn(false);
        updateResult = await runSupabaseWithRetry(
          () =>
            supabase
              .from(RECAP_SUPABASE_TABLE)
              .update(toRecapDbPayload(updatedRow, false), { count: "exact" })
              .eq("id", updatedRow.id),
          2
        );
      }
      if (updateResult.error) {
        const message = formatSupabaseError("Memperbarui data rekap", updateResult.error);
        setRecapNotice(message);
        setEditRecapNotice(message);
        return;
      }

      const rawAffectedRows = (updateResult as { count?: unknown }).count;
      const affectedRows = typeof rawAffectedRows === "number" ? rawAffectedRows : null;
      if (affectedRows === 0) {
        const message =
          "Data tidak tersimpan karena tidak ada baris yang ter-update. Cek id data dan policy UPDATE/RLS di Supabase."
        setRecapNotice(message);
        setEditRecapNotice(message);
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
      setEditRecapNotice("");
    } catch (error) {
      const message = formatSupabaseError("Memperbarui data rekap", error);
      setRecapNotice(message);
      setEditRecapNotice(message);
    } finally {
      setIsEditRecapSaving(false);
    }
  }

  async function toggleRecapCancelStatus(row: SalesRecapRow) {
    if (authUser?.role === "viewer" || authUser?.role === "staff_offline") {
      setRecapNotice("Role ini tidak punya izin mengubah status transaksi.");
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

  function isEditRecapOpenForRow(rowId: string) {
    return editRecapDraft?.id === rowId;
  }

  function exportRecapPdf() {
    if (!isRecapProfitLossDateRangeValid) {
      setRecapNotice("Export PDF dibatalkan: rentang tanggal laba rugi tidak valid.");
      return;
    }

    const byPeriodRows = recapRows.filter((row) => {
      const passStartDate = recapProfitLossStartDate ? row.tanggal >= recapProfitLossStartDate : true;
      const passEndDate = recapProfitLossEndDate ? row.tanggal <= recapProfitLossEndDate : true;
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
      recapProfitLossStartDate || recapProfitLossEndDate
        ? `${formatDate(recapProfitLossStartDate)} s/d ${formatDate(recapProfitLossEndDate)}`
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

    const logoUrl = `${window.location.origin}/starcomp-logo.png`;
    const reportNo = `RKP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
    const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Laporan Rekap Penjualan ${reportNo}</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11px; }
          .sheet { width: 100%; }
          .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 8px; }
          .company h1 { margin: 0; font-size: 26px; line-height: 1.02; letter-spacing: 0.01em; }
          .company p { margin: 1px 0 0; font-size: 10px; color: #222; }
          .company .address { max-width: 520px; color: #333; }
          .logo { width: 210px; max-width: 100%; height: auto; object-fit: contain; }
          .title { text-align: center; margin: 8px 0 10px; }
          .title h2 { margin: 0; font-size: 17px; letter-spacing: 0.09em; }
          .title p { margin: 2px 0 0; font-size: 10px; color: #374151; }
          .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
          .box { border: 1px solid #999; border-radius: 4px; padding: 6px 8px; }
          .box p { margin: 0 0 3px; font-size: 10px; }
          .section-title { margin: 10px 0 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: #374151; }
          .summary { display: grid; grid-template-columns: repeat(9, minmax(120px, 1fr)); gap: 6px; margin-bottom: 8px; }
          .summary .box b { display: block; margin-top: 3px; font-size: 12px; color: #111; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #999; padding: 5px 6px; font-size: 10px; vertical-align: top; }
          th { background: #f3f4f6; font-weight: 700; }
          td.num, th.num { text-align: right; }
          .cancel-row td { background: #fff1f2; }
          .status-badge { display: inline-block; border-radius: 999px; padding: 2px 7px; font-size: 9px; font-weight: 700; }
          .status-success { background: #dcfce7; color: #166534; }
          .status-cancel { background: #ffe4e6; color: #be123c; }
          .neg { color: #be123c; }
          .approval { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 14px; }
          .approval-box { text-align: center; font-size: 10px; }
          .approval-sign-space { height: 54px; }
          .footer-note { margin-top: 8px; font-size: 9px; color: #4b5563; text-align: right; }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="header">
            <div class="company">
              <h1>STARCOMP SOLO</h1>
              <p>Computer Store</p>
              <p class="address">Jl. Garuda Mas, Gonilan, Kec. Kartasura, Kabupaten Sukoharjo, Jawa Tengah 57169</p>
              <p>No. Telp/WA: 08112642352</p>
            </div>
            <img class="logo" src="${logoUrl}" alt="Logo Starcomp" />
          </div>

          <div class="title">
            <h2>LAPORAN REKAP PENJUALAN MARKETPLACE</h2>
            <p>Periode: ${escapeHtml(periodLabel)} | Tanggal Cetak: ${escapeHtml(idDateFormatter.format(new Date()))}</p>
          </div>

          <div class="meta">
            <div class="box">
              <p><strong>No. Laporan:</strong> ${reportNo}</p>
              <p><strong>Rentang Tanggal:</strong> ${escapeHtml(periodLabel)}</p>
              <p><strong>Total Data:</strong> ${byPeriodRows.length} transaksi</p>
            </div>
            <div class="box">
              <p><strong>Transaksi Sukses:</strong> ${summary.transaksiSukses}</p>
              <p><strong>Transaksi Cancel:</strong> ${cancelRows.length}</p>
              <p><strong>Jenis Laporan:</strong> Ringkasan dan Detail Laba Rugi</p>
            </div>
          </div>

          <div class="section-title">RINGKASAN LABA RUGI</div>
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

          <div class="section-title">RINCIAN PER MARKETPLACE</div>
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

          <div class="section-title">DETAIL TRANSAKSI</div>
          <table>
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

          <div class="approval">
            <div class="approval-box">
              <div>Mengetahui,</div>
              <div class="approval-sign-space"></div>
              <div><strong>Manager Operasional</strong></div>
            </div>
            <div class="approval-box">
              <div>Disusun oleh,</div>
              <div class="approval-sign-space"></div>
              <div><strong>Admin Rekap Penjualan</strong></div>
            </div>
          </div>
          <div class="footer-note">Dokumen ini dihasilkan otomatis dari sistem rekap penjualan Starcomp Solo.</div>
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
      const labaFinalTransaksi = row.omzet - row.modal - row.ongkir - row.nominalCancel;
      const passLaba =
        recapFilterLaba === "Semua"
          ? true
          : recapFilterLaba === "rugi"
            ? labaFinalTransaksi < 0
            : labaFinalTransaksi >= 0;
      const passStartDate = recapFilterStartDate ? row.tanggal >= recapFilterStartDate : true;
      const passEndDate = recapFilterEndDate ? row.tanggal <= recapFilterEndDate : true;
      const passQuery = query
        ? `${row.noPesanan} ${row.pelanggan} ${row.catatan} ${row.alasanCancel} ${row.nominalCancel}`.toLowerCase().includes(query)
        : true;

      return passMarketplace && passStatus && passLaba && passStartDate && passEndDate && passQuery;
    });
  }, [recapRows, recapFilterMarketplace, recapFilterStatus, recapFilterLaba, recapFilterStartDate, recapFilterEndDate, recapFilterQuery]);

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

  const recapProfitLossRows = useMemo(() => {
    const start = recapProfitLossStartDate;
    const end = recapProfitLossEndDate;
    if (start && end && start > end) return [] as SalesRecapRow[];
    return recapRows.filter((row) => {
      const passStart = start ? row.tanggal >= start : true;
      const passEnd = end ? row.tanggal <= end : true;
      return passStart && passEnd;
    });
  }, [recapRows, recapProfitLossStartDate, recapProfitLossEndDate]);

  const isRecapProfitLossDateRangeValid = useMemo(() => {
    if (!recapProfitLossStartDate || !recapProfitLossEndDate) return true;
    return recapProfitLossStartDate <= recapProfitLossEndDate;
  }, [recapProfitLossStartDate, recapProfitLossEndDate]);

  const recapProfitLossSummary = useMemo(() => {
    const suksesRows = recapProfitLossRows.filter((row) => row.status === "sukses");
    const cancelRows = recapProfitLossRows.filter((row) => row.status === "cancel");
    const omzet = suksesRows.reduce((acc, row) => acc + row.omzet, 0);
    const modal = suksesRows.reduce((acc, row) => acc + row.modal, 0);
    const ongkir = suksesRows.reduce((acc, row) => acc + row.ongkir, 0);
    const totalBiayaCancel = cancelRows.reduce((acc, row) => acc + Math.max(0, Number(row.nominalCancel) || 0), 0);
    const labaKotor = omzet - modal - ongkir;
    const labaFinal = labaKotor - totalBiayaCancel;
    const status = labaFinal >= 0 ? "laba" : "rugi";
    const margin = omzet > 0 ? (labaFinal / omzet) * 100 : 0;
    const transaksi = recapProfitLossRows.length;
    const transaksiSukses = suksesRows.length;
    const transaksiCancel = cancelRows.length;
    const cancelRate = transaksi > 0 ? (transaksiCancel / transaksi) * 100 : 0;
    return {
      omzet,
      modal,
      ongkir,
      totalBiayaCancel,
      labaKotor,
      labaFinal,
      status,
      margin,
      transaksi,
      transaksiSukses,
      transaksiCancel,
      cancelRate
    };
  }, [recapProfitLossRows]);

  const recapProfitLossByMarketplace = useMemo(() => {
    const groups: Record<SalesRecapRow["marketplace"], { transaksi: number; omzet: number; labaFinal: number; biayaCancel: number }> = {
      Tokopedia: { transaksi: 0, omzet: 0, labaFinal: 0, biayaCancel: 0 },
      Shopee: { transaksi: 0, omzet: 0, labaFinal: 0, biayaCancel: 0 },
      TikTok: { transaksi: 0, omzet: 0, labaFinal: 0, biayaCancel: 0 }
    };
    for (const row of recapProfitLossRows) {
      const group = groups[row.marketplace];
      group.transaksi += 1;
      if (row.status === "sukses") {
        group.omzet += row.omzet;
      }
      const labaSukses = row.status === "sukses" ? row.omzet - row.modal - row.ongkir : 0;
      group.labaFinal += labaSukses - Math.max(0, Number(row.nominalCancel) || 0);
      group.biayaCancel += row.status === "cancel" ? Math.max(0, Number(row.nominalCancel) || 0) : 0;
    }
    return groups;
  }, [recapProfitLossRows]);

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
    const baselineValues = values.length > 1 ? values.slice(0, -1) : values;
    const baselineAvg = baselineValues.length
      ? baselineValues.reduce((acc, value) => acc + value, 0) / baselineValues.length
      : 0;
    const deltaPct =
      baselineAvg > 0 ? ((latestValue - baselineAvg) / baselineAvg) * 100 : latestValue > 0 ? 100 : 0;

    return {
      width,
      height,
      padY,
      points,
      linePath,
      areaPath,
      labels,
      latestValue,
      baselineAvg,
      deltaPct,
      hasData: points.length > 0
    };
  }, [recapRows]);

  const recapLineActivePoint = useMemo(() => {
    if (!recapLineChart.points.length) return null;
    if (!recapLineHoverDate) return recapLineChart.points[recapLineChart.points.length - 1] ?? null;
    return recapLineChart.points.find((point) => point.date === recapLineHoverDate) ?? recapLineChart.points[recapLineChart.points.length - 1] ?? null;
  }, [recapLineChart.points, recapLineHoverDate]);

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
    "compare-harga": {
      title: "Mode Compare Harga Aktif",
      subtitle: "Bandingkan price list hari ini dengan sebelumnya, lalu hitung rekomendasi harga per barang.",
      tone: "from-cyan-50 to-white",
      chip: "bg-cyan-100 text-cyan-700",
      dot: "bg-cyan-500",
      badge: "Compare",
      stats: [
        `Baris compare: ${priceCompareSummary?.totalRows ?? priceCompareRows.length}`,
        `Produk match: ${priceCompareSummary?.matchedRows ?? 0}`,
        `Preset compare: ${priceComparePresetResolved.label}`
      ]
    },
    "pembuatan-nota": {
      title: `Mode ${invoiceDocLabel} Aktif`,
      subtitle: "Siapkan dokumen penjualan atau penawaran cepat dengan data pembeli, item, dan ringkasan total.",
      tone: "from-orange-50 to-white",
      chip: "bg-orange-100 text-orange-700",
      dot: "bg-orange-500",
      badge: invoiceDocLabel,
      stats: [
        `Jenis dokumen: ${invoiceDocLabel}`,
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
  const canManageDocuments = currentRole === "admin" || currentRole === "staff" || currentRole === "staff_offline";
  const canManageRecap = currentRole === "admin" || currentRole === "staff";
  const canDeleteRecap = currentRole === "admin";
  const canManagePreset = currentRole === "admin" || currentRole === "staff";
  const shouldShowDesktopSidebar = !isNavHidden || currentRole === "admin";
  const canQuickSwitchSection = allowedSections.length > 1;
  const roleEntries = useMemo(
    () => Object.entries(roleMap).sort((a, b) => a[0].localeCompare(b[0])),
    [roleMap]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(NAV_VISIBILITY_STORAGE_KEY);
      if (saved === "0") setIsNavHidden(false);
      if (saved === "1") setIsNavHidden(true);
    } catch {
      // ignore storage read error
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(NAV_VISIBILITY_STORAGE_KEY, isNavHidden ? "1" : "0");
    } catch {
      // ignore storage write error
    }
  }, [isNavHidden]);

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
                Role: <strong className="uppercase text-slate-900">{authUser.role.replace(/_/g, " ")}</strong>
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

      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => setIsNavHidden((current) => !current)}
          className="rounded-2xl border border-stone-300 bg-white/90 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-stone-100"
        >
          {isNavHidden ? "Tampilkan Navigasi" : "Sembunyikan Navigasi"}
        </button>
      </div>

      {canQuickSwitchSection ? (
        <div className="mb-4 grid gap-2 rounded-2xl border border-stone-200 bg-white/85 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="grid gap-1 text-xs text-slate-600">
            <span className="font-semibold uppercase tracking-[0.12em] text-stone-600">Menu Aktif</span>
            <select
              value={activeSection}
              onChange={(e) => setActiveSection(e.target.value as SectionId)}
              className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
            >
              {allowedSections.map((section) => (
                <option key={`quick-switch-${section}`} value={section}>
                  {SECTION_LABEL[section]}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-slate-500">
            Sedang di: <strong className="text-slate-700">{SECTION_LABEL[activeSection]}</strong>
          </p>
        </div>
      ) : null}

      {!isNavHidden ? (
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
            {allowedSections.includes("compare-harga") ? (
              <button
                type="button"
                onClick={() => setActiveSection("compare-harga")}
                className={`whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  activeSection === "compare-harga"
                    ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                    : "border-stone-200 bg-white text-slate-700 hover:bg-stone-50"
                }`}
              >
                Compare Harga
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
      ) : null}

      <div className={`grid gap-4 ${shouldShowDesktopSidebar ? "lg:grid-cols-[260px_1fr]" : "lg:grid-cols-1"}`}>
        {shouldShowDesktopSidebar ? (
        <aside className="card-shell hidden h-fit p-3 lg:sticky lg:top-4 lg:block">
          {!isNavHidden ? (
            <>
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
                {allowedSections.includes("compare-harga") ? (
                  <button
                    type="button"
                    onClick={() => setActiveSection("compare-harga")}
                    className={`rounded-2xl border px-3 py-2 text-left font-medium transition duration-200 hover:-translate-y-0.5 ${
                      activeSection === "compare-harga"
                        ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                        : "border-stone-200 bg-white text-slate-700 hover:bg-stone-50"
                    }`}
                  >
                    Compare Harga Pricelist
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
            </>
          ) : null}

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
                  <option value="staff_offline">staff offline</option>
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
                  <div key={`role-${email}`} className="rounded-xl border border-stone-200 bg-white px-2 py-1.5 text-[11px]">
                    <div className="mb-1 flex items-center gap-1">
                      <span className="flex-1 truncate text-slate-700">{email}</span>
                      <strong className="uppercase text-slate-900">{role.replace(/_/g, " ")}</strong>
                    </div>
                    <div className="grid gap-1 sm:grid-cols-[1fr_auto_auto]">
                      <select
                        value={roleEditDraftMap[email] ?? role}
                        onChange={(e) =>
                          setRoleEditDraftMap((prev) => ({
                            ...prev,
                            [email]: normalizeRole(e.target.value)
                          }))
                        }
                        disabled={roleManageLoading}
                        className="w-full rounded-lg border border-stone-200 bg-white px-2 py-1 text-[10px] text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                      >
                        <option value="viewer">viewer</option>
                        <option value="staff">staff</option>
                        <option value="staff_offline">staff offline</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleUpdateRole(email, roleEditDraftMap[email] ?? role)}
                        disabled={roleManageLoading || (roleEditDraftMap[email] ?? role) === role}
                        className="rounded-lg border border-stone-300 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetRole(email)}
                        disabled={roleManageLoading}
                        className="rounded-lg border border-stone-300 bg-white px-1.5 py-0.5 text-[10px] text-slate-600 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        Reset
                      </button>
                    </div>
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
        ) : null}

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
                  title={`Perubahan omzet terbaru vs rata-rata periode: ${rupiah(recapLineChart.baselineAvg)}`}
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
              <div className="relative overflow-x-auto rounded-2xl border border-sky-100 bg-white/85 p-2">
                {recapLineActivePoint ? (
                  <div
                    className="pointer-events-none absolute top-2 z-10 hidden -translate-x-1/2 rounded-xl border border-sky-200 bg-white/95 px-2.5 py-1.5 text-[11px] shadow-sm sm:block"
                    style={{
                      left: `${(recapLineActivePoint.x / recapLineChart.width) * 100}%`
                    }}
                  >
                    <p className="font-semibold text-slate-800">{recapLineActivePoint.date.slice(5)}</p>
                    <p className="text-sky-700">{rupiah(recapLineActivePoint.value)}</p>
                  </div>
                ) : null}
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
                    opacity="0"
                  >
                    <animate attributeName="opacity" from="0" to="1" dur="0.35s" fill="freeze" />
                  </line>

                  {recapLineChart.areaPath ? (
                    <path d={recapLineChart.areaPath} fill="url(#lineAreaFill)" opacity="0">
                      <animate attributeName="opacity" from="0" to="1" begin="0.12s" dur="0.55s" fill="freeze" />
                    </path>
                  ) : null}
                  {recapLineChart.linePath ? (
                    <path
                      d={recapLineChart.linePath}
                      fill="none"
                      stroke="#0ea5e9"
                      strokeWidth="3"
                      strokeLinecap="round"
                      pathLength={1}
                      strokeDasharray={1}
                      strokeDashoffset={1}
                    >
                      <animate attributeName="stroke-dashoffset" from="1" to="0" dur="0.9s" fill="freeze" />
                    </path>
                  ) : null}

                  {recapLineChart.points.length ? (
                    <circle
                      cx={(recapLineActivePoint ?? recapLineChart.points[recapLineChart.points.length - 1]).x}
                      cy={(recapLineActivePoint ?? recapLineChart.points[recapLineChart.points.length - 1]).y}
                      r="7.5"
                      fill="#0ea5e9"
                      opacity="0.16"
                    >
                      <animate attributeName="r" values="6.5;9.5;6.5" dur="1.8s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.14;0.24;0.14" dur="1.8s" repeatCount="indefinite" />
                    </circle>
                  ) : null}

                  {recapLineChart.points.map((point, index) => (
                    <g
                      key={`line-point-${point.date}`}
                      onMouseEnter={() => setRecapLineHoverDate(point.date)}
                      onMouseLeave={() => setRecapLineHoverDate(null)}
                      onFocus={() => setRecapLineHoverDate(point.date)}
                      onBlur={() => setRecapLineHoverDate(null)}
                    >
                      <circle cx={point.x} cy={point.y} r="12" fill="transparent" tabIndex={0} />
                      <circle cx={point.x} cy={point.y} r="0" fill="#0ea5e9" opacity="0.18">
                        <animate
                          attributeName="r"
                          from="0"
                          to="8"
                          begin={`${0.45 + index * 0.08}s`}
                          dur="0.35s"
                          fill="freeze"
                        />
                      </circle>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={recapLineHoverDate === point.date ? "5.5" : "0"}
                        fill="#fff"
                        stroke="#0284c7"
                        strokeWidth="2"
                      >
                        <animate
                          attributeName="r"
                          from="0"
                          to="4.5"
                          begin={`${0.48 + index * 0.08}s`}
                          dur="0.3s"
                          fill="freeze"
                        />
                      </circle>
                      <text x={point.x} y={point.y - 10} textAnchor="middle" fontSize="10" fill="#0f172a" opacity="0">
                        <animate
                          attributeName="opacity"
                          from="0"
                          to="1"
                          begin={`${0.55 + index * 0.08}s`}
                          dur="0.22s"
                          fill="freeze"
                        />
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
          {activeSection === "kalkulator-potongan" || activeSection === "compare-harga" ? (
          <section
            id="kalkulator-potongan"
            className={`animate-sweep-in grid gap-4 ${
              activeSection === "compare-harga" ? "lg:grid-cols-1" : "lg:grid-cols-[1.08fr_1fr]"
            }`}
          >
        <article className="card-shell p-5">
          <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900">
            <span className={`h-2 w-2 rounded-full ${activeSection === "compare-harga" ? "bg-cyan-500" : "bg-emerald-500"}`} />{" "}
            {activeSection === "compare-harga" ? "Compare Harga Pricelist" : "Data Produk, Fee, dan Fitur Marketplace"}
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            {activeSection === "compare-harga"
              ? "Upload dua file pricelist untuk membandingkan harga hari ini vs sebelumnya."
              : "Atur parameter utama, lalu bandingkan performa tiap channel penjualan."}
          </p>

          {activeSection === "kalkulator-potongan" ? (
          <div className="mb-4 rounded-2xl border border-stone-200 bg-gradient-to-br from-stone-100/70 to-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Preset Potongan</p>
            {canManagePreset ? (
              <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
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
                <button
                  type="button"
                  onClick={handleUpdatePreset}
                  disabled={isPresetSaving || !selectedPresetId}
                  className="rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Update
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
            {presetNotice ? <p className="mt-2 text-xs text-slate-600">{presetNotice}</p> : null}
          </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            {activeSection === "kalkulator-potongan" ? <NumberInput label="Harga Jual (Rp)" value={harga} onChange={setHarga} step={100} /> : null}
            {activeSection === "kalkulator-potongan" ? <NumberInput label="Modal (Rp)" value={modal} onChange={setModal} step={100} /> : null}
            {activeSection === "kalkulator-potongan" ? <NumberInput label="Target Margin (%)" value={targetMargin} onChange={handleChangeGlobalTargetMargin} step={0.1} /> : null}
            {ENABLE_AUTO_PRICE_FETCH && activeSection === "kalkulator-potongan" ? (
              <div className="md:col-span-2 rounded-2xl border border-sky-200 bg-sky-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">Ambil Harga Otomatis</p>
                <div className="mt-2 grid gap-2 md:grid-cols-[1fr_150px_auto]">
                  <input
                    type="url"
                    value={priceSourceUrl}
                    onChange={(e) => setPriceSourceUrl(e.target.value)}
                    placeholder="Tempel URL produk Tokopedia/Shopee/toko lain"
                    className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                  />
                  <select
                    value={priceFetchTarget}
                    onChange={(e) => setPriceFetchTarget(e.target.value as PriceFetchTarget)}
                    className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                  >
                    <option value="modal">Isi ke Modal</option>
                    <option value="harga_jual">Isi ke Harga Jual</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleFetchPrice}
                    disabled={isPriceFetching}
                    className="rounded-2xl border border-sky-200 bg-sky-100 px-3 py-2 text-sm font-medium text-sky-800 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isPriceFetching ? "Fetching..." : "Fetch Price"}
                  </button>
                </div>
                {priceFetchNotice ? <p className="mt-2 text-xs text-slate-600">{priceFetchNotice}</p> : null}
              </div>
            ) : null}
            {activeSection === "compare-harga" ? (
            <div className="md:col-span-2 rounded-2xl border border-cyan-200 bg-cyan-50/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700">Bandingkan Price List Hari Ini vs Sebelumnya</p>
                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
                  Format: .xlsx / .csv
                </span>
              </div>
              <div className="mt-2 rounded-xl border border-cyan-200 bg-white px-3 py-2 text-xs text-slate-600">
                Alur cepat: <strong>1) Upload 2 file</strong> {"->"} <strong>2) Atur margin + preset</strong> {"->"} <strong>3) Proses perbandingan</strong>.
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div
                  onDrop={handleTodayPriceListDrop}
                  onDragOver={handleTodayPriceListDragOver}
                  onDragLeave={handleTodayPriceListDragLeave}
                  className={`rounded-2xl border-2 border-dashed bg-white/90 px-4 py-5 text-center transition ${
                    isTodayPriceListDragOver ? "border-cyan-400 ring-2 ring-cyan-200" : "border-cyan-200"
                  }`}
                >
                  <input
                    ref={todayPriceListInputRef}
                    type="file"
                    accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                    onChange={handleTodayPriceListInputChange}
                    className="hidden"
                  />
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Price List Hari Ini</p>
                  <p className="mt-1 text-sm text-slate-700">
                    Drag & drop, atau{" "}
                    <button type="button" onClick={() => todayPriceListInputRef.current?.click()} className="font-semibold text-cyan-700 underline">
                      pilih file
                    </button>
                    .
                  </p>
                  {todayPriceListFile ? (
                    <p className="mt-2 text-xs font-medium text-slate-700">
                      {todayPriceListFile.name} ({Math.max(1, Math.round(todayPriceListFile.size / 1024))} KB)
                    </p>
                  ) : null}
                </div>
                <div
                  onDrop={handlePreviousPriceListDrop}
                  onDragOver={handlePreviousPriceListDragOver}
                  onDragLeave={handlePreviousPriceListDragLeave}
                  className={`rounded-2xl border-2 border-dashed bg-white/90 px-4 py-5 text-center transition ${
                    isPreviousPriceListDragOver ? "border-cyan-400 ring-2 ring-cyan-200" : "border-cyan-200"
                  }`}
                >
                  <input
                    ref={previousPriceListInputRef}
                    type="file"
                    accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                    onChange={handlePreviousPriceListInputChange}
                    className="hidden"
                  />
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">Price List Sebelumnya</p>
                  <p className="mt-1 text-sm text-slate-700">
                    Drag & drop, atau{" "}
                    <button type="button" onClick={() => previousPriceListInputRef.current?.click()} className="font-semibold text-cyan-700 underline">
                      pilih file
                    </button>
                    .
                  </p>
                  {previousPriceListFile ? (
                    <p className="mt-2 text-xs font-medium text-slate-700">
                      {previousPriceListFile.name} ({Math.max(1, Math.round(previousPriceListFile.size / 1024))} KB)
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 grid items-start gap-2 md:grid-cols-2 lg:grid-cols-[180px_240px_minmax(0,1fr)]">
                <label className="grid gap-1 self-start text-xs text-slate-600">
                  <span>Target Margin (%)</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={targetMargin}
                    onChange={(e) => handleChangeGlobalTargetMargin(Number(e.target.value || 0))}
                    className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                  />
                </label>
                <label className="grid gap-1 self-start text-xs text-slate-600">
                  <span>Preset Hitung Per Barang</span>
                  <select
                    value={priceComparePresetId}
                    onChange={(e) => setPriceComparePresetId(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                  >
                    <option value={PRICE_COMPARE_PRESET_AUTO_LAPTOP}>Auto: PRESET LAPTOP</option>
                    <option value={PRICE_COMPARE_PRESET_ACTIVE}>Preset Aktif di Kalkulator</option>
                    {presets.map((preset) => (
                      <option key={`compare-preset-${preset.id}`} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-slate-600 md:col-span-2 lg:col-span-1">
                  Preset terpakai:{" "}
                  <strong className="text-slate-900">{priceComparePresetResolved.label}</strong>
                  <br />
                  Tip: rekomendasi di tabel mengikuti <strong className="text-slate-900">Target Margin Global</strong>.
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunPriceCompare}
                  disabled={isPriceCompareLoading || !todayPriceListFile || !previousPriceListFile}
                  className="rounded-2xl border border-cyan-200 bg-cyan-100 px-3 py-2 text-sm font-medium text-cyan-800 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isPriceCompareLoading ? "Memproses..." : "Proses Perbandingan"}
                </button>
                <button
                  type="button"
                  onClick={handleExportPriceCompare}
                  disabled={isPriceCompareExporting || !priceCompareRowsWithCalc.length}
                  className="rounded-2xl border border-emerald-200 bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isPriceCompareExporting ? "Mengekspor..." : "Export Hasil Compare (.xlsx)"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPriceCompareRows([]);
                    setPriceCompareSummary(null);
                    setPriceCompareNotice("");
                    setPriceCompareRowPresetMap({});
                    setPriceCompareRowMarketplaceMap({});
                    setPriceCompareRowFinalPriceShopeeMap({});
                    setPriceCompareRowFinalPriceMallMap({});
                    setTodayPriceListFile(null);
                    setPreviousPriceListFile(null);
                    if (todayPriceListInputRef.current) todayPriceListInputRef.current.value = "";
                    if (previousPriceListInputRef.current) previousPriceListInputRef.current.value = "";
                  }}
                  className="rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-stone-100"
                >
                  Reset
                </button>
                <span className="text-xs text-slate-500">
                  Status warna: <span className="font-medium text-emerald-700">hijau</span> (hari ini lebih murah),{" "}
                  <span className="font-medium text-rose-700">merah</span> (sebelumnya lebih murah),{" "}
                  <span className="font-medium text-yellow-700">kuning</span> (tidak naik).
                </span>
              </div>
              <div className="mt-2 grid items-end gap-2 rounded-xl border border-stone-200 bg-white/90 p-2 md:grid-cols-[1.4fr_220px_180px_auto]">
                <label className="grid gap-1 text-xs text-slate-600">
                  <span>Cari Produk</span>
                  <input
                    value={priceCompareFilterQuery}
                    onChange={(e) => setPriceCompareFilterQuery(e.target.value)}
                    placeholder="Cari nama produk hari ini/sebelumnya..."
                    className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-600">
                  <span>Filter Status</span>
                  <select
                    value={priceCompareFilterStatus}
                    onChange={(e) => setPriceCompareFilterStatus(e.target.value as "semua" | PriceCompareStatus)}
                    className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                  >
                    <option value="semua">Semua Status</option>
                    <option value="today_cheaper">Hari Ini Lebih Murah</option>
                    <option value="previous_cheaper">Sebelumnya Lebih Murah</option>
                    <option value="same">Tidak Naik</option>
                    <option value="unmatched">Tidak Match</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs text-slate-600">
                  <span>Filter Match</span>
                  <select
                    value={priceCompareFilterMatch}
                    onChange={(e) => setPriceCompareFilterMatch(e.target.value as "semua" | "match" | "tidak_match")}
                    className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                  >
                    <option value="semua">Semua</option>
                    <option value="match">Match</option>
                    <option value="tidak_match">Tidak Match</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setPriceCompareFilterQuery("");
                    setPriceCompareFilterStatus("semua");
                    setPriceCompareFilterMatch("semua");
                  }}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-stone-100"
                >
                  Reset Filter
                </button>
              </div>
              {priceCompareNotice ? <p className="mt-2 text-xs text-slate-600">{priceCompareNotice}</p> : null}
              {priceCompareRowsWithCalc.length ? (
                <p className="mt-2 text-xs text-slate-600">
                  Menampilkan <strong>{filteredPriceCompareRowsWithCalc.length}</strong> dari{" "}
                  <strong>{priceCompareRowsWithCalc.length}</strong> baris hasil compare. Override manual Shopee/Mall:{" "}
                  <strong>{priceCompareRowsWithCalc.filter((item) => item.hasManualFinal).length}</strong>.
                </p>
              ) : null}
              {priceCompareSummary ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-xs text-slate-600">
                    Total Baris
                    <p className="text-base font-semibold text-slate-900">{priceCompareSummary.totalRows}</p>
                  </div>
                  <div className="rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-xs text-slate-600">
                    Match
                    <p className="text-base font-semibold text-slate-900">{priceCompareSummary.matchedRows}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs text-emerald-700">
                    Hari Ini Lebih Murah
                    <p className="text-base font-semibold text-emerald-800">{priceCompareSummary.todayCheaperCount}</p>
                  </div>
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700">
                    Sebelumnya Lebih Murah
                    <p className="text-base font-semibold text-rose-800">{priceCompareSummary.previousCheaperCount}</p>
                  </div>
                  <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-2.5 py-2 text-xs text-yellow-700">
                    Tidak Naik
                    <p className="text-base font-semibold text-yellow-800">{priceCompareSummary.samePriceCount}</p>
                  </div>
                </div>
              ) : null}
              {filteredPriceCompareRowsWithCalc.length ? (
                <div className="mt-3 max-h-[360px] overflow-auto rounded-2xl border border-stone-200 bg-white">
                  <table className="min-w-full text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-stone-100 text-slate-700">
                      <tr>
                        <th className="px-2.5 py-2 font-semibold">Produk (Hari Ini)</th>
                        <th className="px-2.5 py-2 font-semibold text-right">Harga Hari Ini</th>
                        <th className="px-2.5 py-2 font-semibold">Produk (Sebelumnya)</th>
                        <th className="px-2.5 py-2 font-semibold text-right">Harga Sebelumnya</th>
                        <th className="px-2.5 py-2 font-semibold text-right">Selisih</th>
                        <th className="px-2.5 py-2 font-semibold text-right">Rekom Tokopedia</th>
                        <th className="px-2.5 py-2 font-semibold text-right">Rekom Shopee</th>
                        <th className="px-2.5 py-2 font-semibold text-right">Rekom Mall</th>
                        <th className="px-2.5 py-2 font-semibold">Status</th>
                        <th className="px-2.5 py-2 font-semibold text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPriceCompareRowsWithCalc.map(({ row, calc, rowKey, presetId, marketplace, marketplaceLabel, targetMarginUsed, finalPriceShopee, finalPriceMall, finalPrice, sourceLabelShopee, sourceLabelMall }, index) => {
                        const statusClass =
                          row.status === "today_cheaper"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : row.status === "previous_cheaper"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : row.status === "same"
                                ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                                : "bg-stone-100 text-slate-600 border-stone-200";
                        const rowTintClass =
                          row.status === "today_cheaper"
                            ? "bg-emerald-50/40"
                            : row.status === "previous_cheaper"
                              ? "bg-rose-50/40"
                              : row.status === "same"
                                ? "bg-yellow-50/50"
                                : "";

                        return (
                          <tr key={`${row.todayRowNumber}-${index}`} className={`border-t border-stone-100 ${rowTintClass}`}>
                            <td className="px-2.5 py-2 align-top text-slate-800">
                              <p className="font-medium">{row.todayProductName}</p>
                              <p className="text-[11px] text-slate-500">Baris {row.todayRowNumber}</p>
                            </td>
                            <td className="px-2.5 py-2 text-right align-top tabular-nums text-slate-800">{rupiah(row.todayPrice)}</td>
                            <td className="px-2.5 py-2 align-top text-slate-700">{row.matched ? row.previousProductName : "-"}</td>
                            <td className="px-2.5 py-2 text-right align-top tabular-nums text-slate-800">
                              {row.matched && row.previousPrice ? rupiah(row.previousPrice) : "-"}
                            </td>
                            <td className="px-2.5 py-2 text-right align-top tabular-nums text-slate-800">
                              {row.matched && typeof row.difference === "number" ? rupiah(row.difference) : "-"}
                            </td>
                            <td className="px-2.5 py-2 text-right align-top tabular-nums text-slate-800">{rupiahOrDash(calc.rekomTokopedia)}</td>
                            <td className="px-2.5 py-2 text-right align-top tabular-nums text-slate-800">{rupiahOrDash(calc.rekomShopee)}</td>
                            <td className="px-2.5 py-2 text-right align-top tabular-nums text-slate-800">{rupiahOrDash(calc.rekomMall)}</td>
                            <td className="px-2.5 py-2 align-top">
                              <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${statusClass}`}>
                                {priceCompareStatusLabel[row.status]}
                              </span>
                            </td>
                            <td className="px-2.5 py-2 align-top text-right">
                              {row.matched && row.todayPrice ? (
                                <div className="grid justify-items-end gap-1">
                                  <select
                                    value={presetId}
                                    onChange={(e) =>
                                      setPriceCompareRowPresetMap((prev) => ({ ...prev, [rowKey]: e.target.value }))
                                    }
                                    className="w-[170px] rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] text-slate-700 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                                  >
                                    <option value={PRICE_COMPARE_PRESET_AUTO_LAPTOP}>Auto: PRESET LAPTOP</option>
                                    <option value={PRICE_COMPARE_PRESET_ACTIVE}>Preset Aktif</option>
                                    {presets.map((preset) => (
                                      <option key={`row-preset-${rowKey}-${preset.id}`} value={preset.id}>
                                        {preset.name}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    value={marketplace}
                                    onChange={(e) =>
                                      setPriceCompareRowMarketplaceMap((prev) => ({
                                        ...prev,
                                        [rowKey]: e.target.value as CompareCalcMarketplace
                                      }))
                                    }
                                    className="w-[170px] rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] text-slate-700 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                                  >
                                    <option value="shopee">Hitung Shopee</option>
                                    <option value="mall">Hitung Tokopedia Mall</option>
                                  </select>
                                  <p className="w-[170px] text-right text-[11px] text-slate-500">
                                    Target margin dipakai: <strong className="text-slate-700">{targetMarginUsed.toFixed(2)}%</strong>
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => handleCalculateRowToCalculator(row)}
                                    className="w-[170px] rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] font-semibold text-cyan-700 transition hover:bg-cyan-100"
                                  >
                                    Hitung di Kalkulator
                                  </button>
                                  <input
                                    type="number"
                                    min={0}
                                    value={priceCompareRowFinalPriceShopeeMap[rowKey] ?? ""}
                                    onChange={(e) =>
                                      setPriceCompareRowFinalPriceShopeeMap((prev) => ({
                                        ...prev,
                                        [rowKey]: e.target.value
                                      }))
                                    }
                                    placeholder="Harga final Shopee (opsional)"
                                    className="w-[170px] rounded-lg border border-orange-200 bg-white px-2 py-1 text-[11px] text-right text-slate-700 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                                  />
                                  <p className="w-[170px] text-right text-[11px] text-slate-500">
                                    {sourceLabelShopee}: <strong className="text-slate-700">{rupiahOrDash(finalPriceShopee)}</strong>
                                  </p>
                                  <input
                                    type="number"
                                    min={0}
                                    value={priceCompareRowFinalPriceMallMap[rowKey] ?? ""}
                                    onChange={(e) =>
                                      setPriceCompareRowFinalPriceMallMap((prev) => ({
                                        ...prev,
                                        [rowKey]: e.target.value
                                      }))
                                    }
                                    placeholder="Harga final Tokopedia Mall (opsional)"
                                    className="w-[170px] rounded-lg border border-sky-200 bg-white px-2 py-1 text-[11px] text-right text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                                  />
                                  <p className="w-[170px] text-right text-[11px] text-slate-500">
                                    {sourceLabelMall}: <strong className="text-slate-700">{rupiahOrDash(finalPriceMall)}</strong>
                                  </p>
                                  <p className="w-[170px] text-right text-[11px] text-slate-500">
                                    Dipakai untuk Kalkulator ({marketplaceLabel}): <strong className="text-slate-700">{rupiahOrDash(finalPrice)}</strong>
                                  </p>
                                  <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => useComparisonPrice(row.todayPrice, "modal")}
                                    className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-stone-100"
                                  >
                                    Ke Modal
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => useComparisonPrice(row.todayPrice, "harga_jual")}
                                    className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-stone-100"
                                  >
                                    Ke Harga Jual
                                  </button>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-dashed border-stone-300 bg-white/80 px-4 py-6 text-center text-sm text-slate-600">
                  {priceCompareRowsWithCalc.length
                    ? "Tidak ada data yang cocok dengan filter saat ini."
                    : (
                      <>
                        Hasil compare belum tersedia. Upload dua file lalu klik <strong>Proses Perbandingan</strong>.
                      </>
                    )}
                </div>
              )}
            </div>
            ) : null}
            {activeSection === "kalkulator-potongan" ? (
            <SelectInput label="Fee Tokopedia (%)" value={tokopediaFee} onChange={setTokopediaFee}>
              { ["4.75","6.25","7.5","7.75","8","9.5","10"].map((v)=> <option key={v} value={v}>{v}%</option>) }
            </SelectInput>
            ) : null}
            {activeSection === "kalkulator-potongan" ? (
            <SelectInput label="Fee Shopee (%)" value={shopeeFee} onChange={setShopeeFee}>
              { ["5.25","6.50","6.75","9","9.50","10"].map((v)=> <option key={v} value={v}>{v}%</option>) }
            </SelectInput>
            ) : null}
            {activeSection === "kalkulator-potongan" ? (
            <SelectInput label="Fee Tokopedia Mall (%)" value={mallFee} onChange={setMallFee}>
              { ["3","3.7","5.95","6.95","7.2","7.75","8.2","9.2","11.7","12.2"].map((v)=> <option key={v} value={v}>{v}%</option>) }
            </SelectInput>
            ) : null}
          </div>

          {activeSection === "kalkulator-potongan" ? (
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
          ) : null}
        </article>

        {activeSection === "kalkulator-potongan" ? (
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
            { key: "tokopedia", title: "Tokopedia", data: hasil.tokopedia, margin: hasil.marginTokopedia, pct: hasil.pctTokopedia },
            { key: "shopee", title: "Shopee", data: hasil.shopee, margin: hasil.marginShopee, pct: hasil.pctShopee },
            { key: "mall", title: "Tokopedia Mall", data: hasil.mall, margin: hasil.marginMall, pct: hasil.pctMall }
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
                <li className="flex justify-between gap-2"><span>Margin</span><strong className="tabular-nums text-slate-900">{`${rupiah(m.margin)} (${m.pct.toFixed(2)}%)`}</strong></li>
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
            <div className="flex justify-between gap-2"><span>Harga Rekomendasi Tokopedia</span><strong className="tabular-nums text-slate-900">{rupiahOrDash(hasil.rekomTokopedia)}</strong></div>
            <div className="flex justify-between gap-2"><span>Harga Rekomendasi Shopee</span><strong className="tabular-nums text-slate-900">{rupiahOrDash(hasil.rekomShopee)}</strong></div>
            <div className="flex justify-between gap-2"><span>Harga Rekomendasi Tokopedia Mall</span><strong className="tabular-nums text-slate-900">{rupiahOrDash(hasil.rekomMall)}</strong></div>
            <div className="flex justify-between gap-2 font-semibold">
              <span>Paling Menguntungkan</span>
              <strong className={hasil.best.margin >= 0 ? "tabular-nums text-slate-900" : "tabular-nums text-rose-600"}>{`${hasil.best.name} (${rupiah(hasil.best.margin)})`}</strong>
            </div>
          </div>
        </article>
        ) : null}
      </section>
          ) : null}

      {activeSection === "pembuatan-nota" ? (
      <section id="pembuatan-nota" className="animate-sweep-in">
        <article className="card-shell p-5">
          <div className="mb-3">
            <h2 className="text-base font-bold">Jendela Nota / Faktur / Penawaran Barang</h2>
          </div>

          <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1.5 text-sm text-slate-600">
                  <span>Jenis Dokumen</span>
                  <select
                    value={invoiceDocType}
                    onChange={(e) => {
                      setInvoiceDocType(e.target.value as InvoiceDocumentType);
                      setInvoiceNo("");
                      setInvoicePublicToken("");
                    }}
                    className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                  >
                    <option value="faktur">Faktur Penjualan</option>
                    <option value="penawaran">Penawaran Barang</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm text-slate-600">
                  <span>No {invoiceDocLabel} (otomatis saat cetak)</span>
                  <input
                    value={invoiceNo}
                    readOnly
                    placeholder={invoiceDocType === "faktur" ? "Akan dibuat otomatis: STCSO-YYYYMMDD-001" : "Akan dibuat otomatis: STCSPN-YYYYMMDD-001"}
                    className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-slate-800 outline-none"
                  />
                </label>
                <label className="grid gap-1.5 text-sm text-slate-600">
                  <span>Tanggal</span>
                  <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                </label>
                {invoiceDocType === "penawaran" ? (
                  <label className="grid gap-1.5 text-sm text-slate-600">
                    <span>Masa Berlaku Penawaran</span>
                    <input
                      type="date"
                      value={invoiceValidUntil}
                      onChange={(e) => setInvoiceValidUntil(e.target.value)}
                      className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                    />
                  </label>
                ) : null}
                <label className="grid gap-1.5 text-sm text-slate-600">
                  <span>Nama Pembeli</span>
                  <input value={invoiceBuyer} onChange={(e) => setInvoiceBuyer(e.target.value)} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                </label>
                {invoiceDocType === "penawaran" ? (
                  <label className="grid gap-1.5 text-sm text-slate-600">
                    <span>PIC Sales</span>
                    <input
                      value={invoiceSalesPic}
                      onChange={(e) => setInvoiceSalesPic(e.target.value)}
                      placeholder="Contoh: Budi - 0812xxxxxx"
                      className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                    />
                  </label>
                ) : null}
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
                  <p className="text-sm font-semibold text-slate-700">{invoiceDocType === "faktur" ? "Item Penjualan" : "Item Penawaran"}</p>
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
                <div className="mt-2 grid gap-1.5 text-sm text-slate-600 md:max-w-xs md:ml-auto">
                  <label className="grid gap-1">
                    <span>Diskon (Rp)</span>
                    <input
                      type="number"
                      min={0}
                      max={Math.max(0, Math.round(invoiceSubtotal))}
                      value={invoiceDiscountAmount}
                      onChange={(e) =>
                        setInvoiceDiscountAmount(
                          Math.min(Math.max(0, Number(e.target.value || 0)), Math.max(0, Math.round(invoiceSubtotal)))
                        )
                      }
                      className="rounded-xl border border-stone-200 px-2 py-2 text-right text-sm outline-none focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                    />
                  </label>
                </div>
                <div className="mt-2 grid gap-1 text-sm text-slate-700">
                  {invoiceTaxEnabled ? (
                    <>
                      {invoiceDiscountValue > 0 ? (
                        <>
                          <div className="flex justify-end font-medium text-slate-700">Subtotal Barang: {rupiah(invoiceSubtotal)}</div>
                          <div className="flex justify-end font-medium text-slate-700">Diskon: -{rupiah(invoiceDiscountValue)}</div>
                        </>
                      ) : null}
                      <div className="flex justify-end font-semibold text-slate-800">{invoiceSubtotalLabel}: {rupiah(invoiceDisplaySubtotal)}</div>
                      <div className="flex justify-end">PPN {invoiceTaxRate}%: {rupiah(invoiceTaxAmount)}</div>
                    </>
                  ) : (
                    <>
                      {invoiceDiscountValue > 0 ? (
                        <>
                          <div className="flex justify-end font-medium text-slate-700">Subtotal Barang: {rupiah(invoiceSubtotal)}</div>
                          <div className="flex justify-end font-medium text-slate-700">Diskon: -{rupiah(invoiceDiscountValue)}</div>
                        </>
                      ) : null}
                      <div className="flex justify-end font-semibold text-slate-800">
                        Subtotal: {rupiah(invoiceDiscountValue > 0 ? invoiceSubtotalAfterDiscount : invoiceSubtotal)}
                      </div>
                    </>
                  )}
                  <div className="flex justify-end font-bold text-slate-900">
                    Total: {rupiah(invoiceGrandTotal)}
                  </div>
                </div>
              </div>

              <label className="grid gap-1.5 text-sm text-slate-600">
                <span>Catatan</span>
                <textarea value={invoiceNotes} onChange={(e) => setInvoiceNotes(e.target.value)} rows={2} className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2.5 text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={invoiceIncludeSignAndStamp}
                    onChange={(e) => setInvoiceIncludeSignAndStamp(e.target.checked)}
                    className="h-4 w-4 accent-stone-700"
                  />
                  <span>Tampilkan TTD & Cap</span>
                </label>
                <label className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={invoiceTaxEnabled}
                    onChange={(e) => setInvoiceTaxEnabled(e.target.checked)}
                    className="h-4 w-4 accent-stone-700"
                  />
                  <span>Terapkan PPN 11%</span>
                </label>
                {invoiceTaxEnabled ? (
                  <label className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <span>Mode PPN</span>
                    <select
                      value={invoiceTaxMode}
                      onChange={(e) => setInvoiceTaxMode(e.target.value === "include" ? "include" : "exclude")}
                      className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-sm text-slate-700 outline-none focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                    >
                      <option value="exclude">Harga + PPN 11%</option>
                      <option value="include">Harga sudah include PPN</option>
                    </select>
                  </label>
                ) : null}
                <label className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={invoiceIncludeBankAccount}
                    onChange={(e) => setInvoiceIncludeBankAccount(e.target.checked)}
                    className="h-4 w-4 accent-stone-700"
                  />
                  <span>Tampilkan No Rekening</span>
                </label>
                {invoiceDocType === "faktur" ? (
                  <label className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={invoiceIncludeSuratJalan}
                      onChange={(e) => setInvoiceIncludeSuratJalan(e.target.checked)}
                      className="h-4 w-4 accent-stone-700"
                    />
                    <span>Cetak dengan Surat Jalan</span>
                  </label>
                ) : null}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={resetInvoiceWithConfirmation}
                    className="rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-stone-100"
                  >
                    Reset Dokumen
                  </button>
                  <button
                    type="button"
                    onClick={sendInvoiceToWhatsapp}
                    disabled={isInvoiceSaving || !canManageDocuments}
                    className="rounded-2xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
                  >
                    {isInvoiceSaving ? "Menyimpan..." : "Kirim WhatsApp"}
                  </button>
                  <button
                    type="button"
                    onClick={copyDocumentLink}
                    disabled={!invoicePublicToken}
                    className="rounded-2xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Salin Link Dokumen
                  </button>
                  <button
                    type="button"
                    onClick={printInvoice}
                    disabled={isInvoiceSaving || !canManageDocuments}
                    className="rounded-2xl border border-stone-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                  >
                    {isInvoiceSaving
                      ? "Menyimpan..."
                      : invoiceDocType === "faktur"
                        ? "Cetak Faktur"
                        : "Cetak Penawaran"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void saveInvoiceHistoryEdits();
                    }}
                    disabled={isInvoiceSaving || !canManageDocuments || !invoicePublicToken || !invoiceNo}
                    className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Simpan Perubahan
                  </button>
                </div>
              </div>
              {invoiceSaveNotice ? (
                <p className="text-xs text-slate-600">{invoiceSaveNotice}</p>
              ) : null}
              {invoicePublicToken ? (
                <p className="text-xs text-slate-600">
                  Link dokumen:{" "}
                  <a
                    href={`/dokumen/${invoicePublicToken}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-700 underline"
                  >
                    {`/dokumen/${invoicePublicToken}`}
                  </a>
                </p>
              ) : null}
              <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-700">Riwayat Dokumen Tersimpan</p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={exportInvoiceHistoryToExcel}
                      disabled={!filteredInvoiceHistory.length}
                      className="rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Export Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadInvoiceHistory()}
                      className="rounded-xl border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-stone-100"
                      disabled={invoiceHistoryLoading}
                    >
                      {invoiceHistoryLoading ? "Memuat..." : "Refresh"}
                    </button>
                  </div>
                </div>
                <div className="mb-2 grid gap-2 md:grid-cols-4">
                  <label className="grid gap-1 text-xs text-slate-600">
                    <span>Jenis</span>
                    <select
                      value={invoiceHistoryTypeFilter}
                      onChange={(e) => setInvoiceHistoryTypeFilter(e.target.value as "Semua" | InvoiceDocumentType)}
                      className="rounded-xl border border-stone-200 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                    >
                      <option value="Semua">Semua</option>
                      <option value="faktur">Faktur</option>
                      <option value="penawaran">Penawaran</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs text-slate-600">
                    <span>Dari Tanggal</span>
                    <input
                      type="date"
                      value={invoiceHistoryStartDate}
                      onChange={(e) => setInvoiceHistoryStartDate(e.target.value)}
                      className="rounded-xl border border-stone-200 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-600">
                    <span>Sampai Tanggal</span>
                    <input
                      type="date"
                      value={invoiceHistoryEndDate}
                      onChange={(e) => setInvoiceHistoryEndDate(e.target.value)}
                      className="rounded-xl border border-stone-200 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-600">
                    <span>Cari Pembeli</span>
                    <input
                      value={invoiceHistoryBuyerQuery}
                      onChange={(e) => setInvoiceHistoryBuyerQuery(e.target.value)}
                      placeholder="Nama pembeli"
                      className="rounded-xl border border-stone-200 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                    />
                  </label>
                </div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span>Total data: {invoiceHistoryRows.length}</span>
                  <span>Hasil filter: {filteredInvoiceHistory.length}</span>
                  <label className="flex items-center gap-1">
                    <span>Per Halaman</span>
                    <select
                      value={invoiceHistoryPageSize}
                      onChange={(e) => setInvoiceHistoryPageSize(Number(e.target.value) as 10 | 25 | 50)}
                      className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </label>
                </div>
                {invoiceHistoryNotice ? (
                  <p className="mb-2 rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-xs text-slate-600">
                    {invoiceHistoryNotice}
                  </p>
                ) : null}
                <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-stone-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="border-b border-stone-200 px-2 py-2">Tanggal</th>
                        <th className="border-b border-stone-200 px-2 py-2">Jenis</th>
                        <th className="border-b border-stone-200 px-2 py-2">No Dokumen</th>
                        <th className="border-b border-stone-200 px-2 py-2">Pembeli</th>
                        <th className="border-b border-stone-200 px-2 py-2 text-right">Subtotal</th>
                        <th className="border-b border-stone-200 px-2 py-2 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedInvoiceHistory.length ? (
                        paginatedInvoiceHistory.map((row) => (
                          <tr key={row.id} className="border-t border-stone-100">
                            <td className="px-2 py-2 text-slate-700">{row.invoiceDate}</td>
                            <td className="px-2 py-2">
                              <span className={row.documentType === "faktur" ? "rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700" : "rounded-lg border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700"}>
                                {row.documentType === "faktur" ? "Faktur" : "Penawaran"}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-slate-700">{row.documentNo}</td>
                            <td className="px-2 py-2 text-slate-700">{row.buyer || "-"}</td>
                            <td className="px-2 py-2 text-right text-slate-700">{rupiah(row.subtotal)}</td>
                            <td className="px-2 py-2">
                              <div className="flex justify-end gap-1.5">
                                <a
                                  href={`/dokumen/${row.publicToken}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-stone-100"
                                >
                                  Buka
                                </a>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void copyDocumentLinkByToken(row.publicToken);
                                  }}
                                  className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 transition hover:bg-sky-100"
                                >
                                  Salin Link
                                </button>
                                {canManageDocuments ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void loadInvoiceHistoryDocumentToForm(row.publicToken);
                                    }}
                                    disabled={invoiceHistoryEditingToken === row.publicToken}
                                    className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {invoiceHistoryEditingToken === row.publicToken ? "Memuat..." : "Edit"}
                                  </button>
                                ) : null}
                                {canManageDocuments ? (
                                  <button
                                    type="button"
                                    onClick={() => reprintHistoryDocument(row.publicToken)}
                                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100"
                                  >
                                    Cetak Ulang
                                  </button>
                                ) : null}
                                {authUser?.role === "admin" ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void deleteInvoiceHistoryRow(row);
                                    }}
                                    disabled={invoiceHistoryDeletingToken === row.publicToken}
                                    className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {invoiceHistoryDeletingToken === row.publicToken ? "Menghapus..." : "Hapus"}
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-2 py-6 text-center text-sm text-slate-500">
                            {invoiceHistoryLoading ? "Memuat riwayat dokumen..." : "Tidak ada data yang cocok dengan filter."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span>
                    Halaman {invoiceHistoryPage} dari {invoiceHistoryTotalPages}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setInvoiceHistoryPage((prev) => Math.max(1, prev - 1))}
                      disabled={invoiceHistoryPage <= 1}
                      className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Sebelumnya
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvoiceHistoryPage((prev) => Math.min(invoiceHistoryTotalPages, prev + 1))}
                      disabled={invoiceHistoryPage >= invoiceHistoryTotalPages}
                      className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Berikutnya
                    </button>
                  </div>
                </div>
              </div>
          </div>
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
              Akun role ini hanya bisa melihat hasil rekap.
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
              {recapDuplicateOrderNoRows.length ? (
                <span className="text-xs text-amber-700">
                  Peringatan: No pesanan ini sudah ada ({recapDuplicateOrderNoRows.length} data).
                </span>
              ) : null}
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
              onClick={() => {
                void addRecapRow();
              }}
              className="rounded-2xl border border-stone-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isRecapSaving ? "Menyimpan..." : "Simpan Rekap"}
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
                  setRecapFilterLaba("Semua");
                  setRecapFilterQuery("");
                }}
                className="rounded-xl border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-stone-100"
              >
                Reset Filter
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-6">
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
                <span>Laba</span>
                <select value={recapFilterLaba} onChange={(e) => setRecapFilterLaba(e.target.value as "Semua" | "rugi" | "tidak_rugi")} className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200">
                  <option value="Semua">Semua Laba</option>
                  <option value="rugi">Rugi (Minus)</option>
                  <option value="tidak_rugi">Tidak Rugi (&gt;= 0)</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-slate-600">
                <span>Cari Data</span>
                <input value={recapFilterQuery} onChange={(e) => setRecapFilterQuery(e.target.value)} placeholder="No pesanan / pelanggan / catatan / alasan / nominal cancel" className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
              </label>
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Rincian Laba Rugi Periode</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setRecapProfitLossPreset("1bulan")}
                  className={`rounded-xl border px-2.5 py-1 text-xs font-medium transition ${
                    recapProfitLossPreset === "1bulan"
                      ? "border-stone-700 bg-slate-900 text-white"
                      : "border-stone-300 bg-white text-slate-700 hover:bg-stone-100"
                  }`}
                >
                  1 Bulan
                </button>
                <button
                  type="button"
                  onClick={() => setRecapProfitLossPreset("3bulan")}
                  className={`rounded-xl border px-2.5 py-1 text-xs font-medium transition ${
                    recapProfitLossPreset === "3bulan"
                      ? "border-stone-700 bg-slate-900 text-white"
                      : "border-stone-300 bg-white text-slate-700 hover:bg-stone-100"
                  }`}
                >
                  3 Bulan
                </button>
                <button
                  type="button"
                  onClick={() => setRecapProfitLossPreset("1tahun")}
                  className={`rounded-xl border px-2.5 py-1 text-xs font-medium transition ${
                    recapProfitLossPreset === "1tahun"
                      ? "border-stone-700 bg-slate-900 text-white"
                      : "border-stone-300 bg-white text-slate-700 hover:bg-stone-100"
                  }`}
                >
                  1 Tahun
                </button>
                <button
                  type="button"
                  onClick={() => setRecapProfitLossPreset("custom")}
                  className={`rounded-xl border px-2.5 py-1 text-xs font-medium transition ${
                    recapProfitLossPreset === "custom"
                      ? "border-stone-700 bg-slate-900 text-white"
                      : "border-stone-300 bg-white text-slate-700 hover:bg-stone-100"
                  }`}
                >
                  Custom
                </button>
              </div>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <label className="grid gap-1 text-xs text-slate-600">
                <span>Dari Tanggal (Periode Laba Rugi)</span>
                <input
                  type="date"
                  value={recapProfitLossStartDate}
                  onChange={(e) => {
                    setRecapProfitLossPreset("custom");
                    setRecapProfitLossStartDate(e.target.value);
                  }}
                  className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                />
              </label>
              <label className="grid gap-1 text-xs text-slate-600">
                <span>Sampai Tanggal (Periode Laba Rugi)</span>
                <input
                  type="date"
                  value={recapProfitLossEndDate}
                  onChange={(e) => {
                    setRecapProfitLossPreset("custom");
                    setRecapProfitLossEndDate(e.target.value);
                  }}
                  className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                />
              </label>
            </div>
            {!isRecapProfitLossDateRangeValid ? (
              <p className="mt-2 text-xs text-rose-600">
                Rentang tanggal tidak valid. Tanggal akhir harus sama atau setelah tanggal awal.
              </p>
            ) : null}
            <div className="mt-2 grid gap-2 md:grid-cols-4">
              <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-sm">
                <p className="text-xs text-slate-500">Total Transaksi</p>
                <p className="font-semibold text-slate-900">{recapProfitLossSummary.transaksi}</p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-sm">
                <p className="text-xs text-slate-500">Omzet (Sukses)</p>
                <p className="font-semibold text-slate-900">{rupiah(recapProfitLossSummary.omzet)}</p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-sm">
                <p className="text-xs text-slate-500">Laba Kotor</p>
                <p className={recapProfitLossSummary.labaKotor >= 0 ? "font-semibold text-slate-900" : "font-semibold text-rose-600"}>
                  {rupiah(recapProfitLossSummary.labaKotor)}
                </p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-sm">
                <p className="text-xs text-slate-500">Laba Final (Status)</p>
                <p className={recapProfitLossSummary.labaFinal >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-rose-700"}>
                  {rupiah(recapProfitLossSummary.labaFinal)} ({recapProfitLossSummary.status === "laba" ? "Laba" : "Rugi"})
                </p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-sm">
                <p className="text-xs text-slate-500">Margin Final</p>
                <p className={recapProfitLossSummary.margin >= 0 ? "font-semibold text-slate-900" : "font-semibold text-rose-600"}>
                  {recapProfitLossSummary.margin.toFixed(2)}%
                </p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-sm">
                <p className="text-xs text-slate-500">Biaya Cancel</p>
                <p className="font-semibold text-rose-700">{rupiah(recapProfitLossSummary.totalBiayaCancel)}</p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-sm">
                <p className="text-xs text-slate-500">Cancel Rate</p>
                <p className="font-semibold text-rose-700">{recapProfitLossSummary.cancelRate.toFixed(1)}%</p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-sm">
                <p className="text-xs text-slate-500">Sukses / Cancel</p>
                <p className="font-semibold text-slate-900">
                  {recapProfitLossSummary.transaksiSukses} / {recapProfitLossSummary.transaksiCancel}
                </p>
              </div>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              {(Object.keys(recapProfitLossByMarketplace) as SalesRecapRow["marketplace"][]).map((name) => (
                <div key={`profit-loss-market-${name}`} className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2 text-sm">
                  <p className="text-xs font-semibold text-slate-700">{name}</p>
                  <p className="text-xs text-slate-500">{recapProfitLossByMarketplace[name].transaksi} transaksi</p>
                  <p className="text-xs text-slate-600">Omzet: <strong className="text-slate-900">{rupiah(recapProfitLossByMarketplace[name].omzet)}</strong></p>
                  <p className="text-xs text-slate-600">
                    Laba Final:{" "}
                    <strong className={recapProfitLossByMarketplace[name].labaFinal >= 0 ? "text-slate-900" : "text-rose-600"}>
                      {rupiah(recapProfitLossByMarketplace[name].labaFinal)}
                    </strong>
                  </p>
                </div>
              ))}
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

          <div className="hidden mt-3 grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
            {filteredRecapRows.length ? (
              filteredRecapRows.map((row) => {
                const laba = row.omzet - row.modal - row.ongkir;
                const labaFinalTransaksi = laba - row.nominalCancel;
                const detailOpen = openBiayaDetailRow?.id === row.id;
                const editOpen = isEditRecapOpenForRow(row.id);
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
                          {editOpen ? "Tutup Edit" : "Edit"}
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
                        <button type="button" onClick={() => deleteRecapRow(row)} className="whitespace-nowrap rounded-xl border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100">
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
                    {editOpen && editRecapDraft ? (
                      <div className="mt-2 animate-sweep-in rounded-2xl border border-sky-200 bg-sky-50/50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">Edit Data Rekap</p>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
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
                          {editRecapDuplicateOrderNoRows.length ? (
                            <p className="text-xs text-amber-700 md:col-span-2">
                              Peringatan: No pesanan ini sudah ada ({editRecapDuplicateOrderNoRows.length} data).
                            </p>
                          ) : null}
                          <label className="grid gap-1 text-xs text-slate-600">
                            <span>Pelanggan</span>
                            <input value={editRecapDraft.pelanggan} onChange={(e) => updateEditRecapField("pelanggan", e.target.value)} className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                          </label>
                          <label className="grid gap-1 text-xs text-slate-600">
                            <span>Omzet (Rp)</span>
                            <input type="number" min={0} value={editRecapDraft.omzet} readOnly className="w-full rounded-xl border border-stone-200 bg-stone-100 px-2.5 py-2 text-sm text-slate-800 outline-none" />
                          </label>
                          <label className="grid gap-1 text-xs text-slate-600">
                            <span>Modal (Rp)</span>
                            <input type="number" min={0} value={editRecapDraft.modal} readOnly className="w-full rounded-xl border border-stone-200 bg-stone-100 px-2.5 py-2 text-sm text-slate-800 outline-none" />
                          </label>
                        </div>
                        <div className="mt-2 rounded-2xl border border-stone-200 bg-white/90 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Item Barang</p>
                            <button type="button" onClick={addEditRecapOrderItem} className="rounded-xl border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-stone-100">
                              Tambah Barang
                            </button>
                          </div>
                          <div className="space-y-2">
                            {editRecapDraft.orderItems.map((item, index) => (
                              <div key={`edit-order-card-${index}`} className="grid gap-2 lg:grid-cols-[1.6fr_110px_130px_130px_auto]">
                                <input
                                  value={item.nama}
                                  onChange={(e) => updateEditRecapOrderItem(index, "nama", e.target.value)}
                                  placeholder="Nama barang"
                                  className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                                />
                                <input
                                  type="number"
                                  min={0}
                                  value={item.qty}
                                  onChange={(e) => updateEditRecapOrderItem(index, "qty", Number(e.target.value || 0))}
                                  className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-right text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                                />
                                <input
                                  type="number"
                                  min={0}
                                  value={item.hargaJual}
                                  onChange={(e) => updateEditRecapOrderItem(index, "hargaJual", Number(e.target.value || 0))}
                                  className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-right text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                                />
                                <input
                                  type="number"
                                  min={0}
                                  value={item.modal}
                                  onChange={(e) => updateEditRecapOrderItem(index, "modal", Number(e.target.value || 0))}
                                  className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-right text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeEditRecapOrderItem(index)}
                                  className="rounded-xl border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  disabled={editRecapDraft.orderItems.length <= 1}
                                >
                                  Hapus
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="mt-2 rounded-2xl border border-stone-200 bg-white/90 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Rincian Biaya</p>
                            <button type="button" onClick={addEditRecapBiayaDetail} className="rounded-xl border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-stone-100">
                              Tambah Biaya
                            </button>
                          </div>
                          <div className="space-y-2">
                            {editRecapDraft.biayaDetail.map((item, index) => (
                              <div key={`edit-biaya-card-${index}`} className="grid gap-2 lg:grid-cols-[1.4fr_140px_auto]">
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
                        <label className="mt-2 grid gap-1 text-xs text-slate-600">
                          <span>Catatan</span>
                          <input value={editRecapDraft.catatan} onChange={(e) => updateEditRecapField("catatan", e.target.value)} className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                        </label>
                        {editRecapNotice ? (
                          <p className="mt-2 text-xs text-slate-600">{editRecapNotice}</p>
                        ) : null}
                        <div className="mt-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditRecapDraft(null)}
                            className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-stone-100"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={saveEditRecap}
                            disabled={isEditRecapSaving}
                            className="rounded-xl border border-stone-900 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {isEditRecapSaving ? "Menyimpan..." : "Simpan Perubahan"}
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

          <div className="mt-3 overflow-x-auto rounded-2xl border border-stone-200 bg-white">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-stone-50 text-slate-700">
                <tr>
                  <th className="w-[100px] px-3 py-2 text-left">Tanggal</th>
                  <th className="w-[34%] px-3 py-2 text-left">Transaksi</th>
                  <th className="w-[26%] px-3 py-2 text-left">Keuangan</th>
                  <th className="px-3 py-2 text-left">Catatan</th>
                  <th className="w-[220px] px-3 py-2 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecapRows.length ? (
                  filteredRecapRows.map((row) => {
                    const laba = row.omzet - row.modal - row.ongkir;
                    const labaFinal = laba - row.nominalCancel;
                    const editOpen = isEditRecapOpenForRow(row.id);
                    return (
                      <Fragment key={row.id}>
                        <tr className={row.status === "cancel" ? "border-t border-stone-100 bg-rose-50/40" : "border-t border-stone-100"}>
                          <td className="px-3 py-2 align-top">
                            <p className="font-medium text-slate-900">{row.tanggal}</p>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <p className="font-medium text-slate-900">{row.marketplace}</p>
                            <p className="mt-0.5 break-all text-xs text-slate-600">No: {row.noPesanan || "-"}</p>
                            <p className="mt-0.5 break-all text-xs text-slate-600">Pelanggan: {row.pelanggan || "-"}</p>
                            <div className="mt-1">
                              <span className={row.status === "cancel" ? "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700" : "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700"}>
                                {row.status === "cancel" ? "Cancel" : "Sukses"}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="space-y-0.5 text-xs text-slate-600">
                              <p>Omzet: <strong className="text-slate-900">{rupiah(row.omzet)}</strong></p>
                              <p>Modal: <strong className="text-slate-900">{rupiah(row.modal)}</strong></p>
                              <p>Biaya: <strong className="text-slate-900">{rupiah(row.ongkir)}</strong></p>
                              <p>Laba Sukses: <strong className={laba >= 0 ? "text-slate-900" : "text-rose-600"}>{rupiah(laba)}</strong></p>
                              <p>Biaya Cancel: <strong className={row.nominalCancel > 0 ? "text-rose-700" : "text-slate-900"}>{rupiah(row.nominalCancel)}</strong></p>
                              <p>Laba Final: <strong className={labaFinal >= 0 ? "text-slate-900" : "text-rose-600"}>{rupiah(labaFinal)}</strong></p>
                            </div>
                          </td>
                          <td className="break-words px-3 py-2">
                            {row.catatan || "-"}
                            {row.status === "cancel" ? (
                              <div className="mt-1 space-y-0.5 text-xs text-rose-700">
                                <p>Alasan: {row.alasanCancel || "-"}</p>
                                <p>Biaya Cancel: {rupiah(row.nominalCancel)}</p>
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-center align-top">
                            <div className="flex flex-wrap items-center justify-center gap-1.5">
                              {canManageRecap ? (
                                <button type="button" onClick={() => openEditRecap(row)} className="whitespace-nowrap rounded-xl border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 transition hover:bg-sky-100">
                                  {editOpen ? "Tutup Edit" : "Edit"}
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
                                <button type="button" onClick={() => deleteRecapRow(row)} className="whitespace-nowrap rounded-xl border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100">
                                  Hapus
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        {isCancelDraftVisibleForRow(row.id) && row.status !== "cancel" ? (
                          <tr className="border-t border-stone-100 bg-rose-50/40">
                            <td className="px-3 py-3" colSpan={5}>
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
                        {editOpen && editRecapDraft ? (
                          <tr className="border-t border-stone-100 bg-sky-50/40">
                            <td className="px-3 py-3" colSpan={5}>
                              <div className="animate-sweep-in rounded-2xl border border-sky-200 bg-white p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">Edit Data Rekap</p>
                                <div className="mt-2 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
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
                                  {editRecapDuplicateOrderNoRows.length ? (
                                    <p className="text-xs text-amber-700 md:col-span-2 lg:col-span-3">
                                      Peringatan: No pesanan ini sudah ada ({editRecapDuplicateOrderNoRows.length} data).
                                    </p>
                                  ) : null}
                                  <label className="grid gap-1 text-xs text-slate-600">
                                    <span>Pelanggan</span>
                                    <input value={editRecapDraft.pelanggan} onChange={(e) => updateEditRecapField("pelanggan", e.target.value)} className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                                  </label>
                                  <label className="grid gap-1 text-xs text-slate-600">
                                    <span>Omzet (Rp)</span>
                                    <input type="number" min={0} value={editRecapDraft.omzet} readOnly className="w-full rounded-xl border border-stone-200 bg-stone-100 px-2.5 py-2 text-sm text-slate-800 outline-none" />
                                  </label>
                                  <label className="grid gap-1 text-xs text-slate-600">
                                    <span>Modal (Rp)</span>
                                    <input type="number" min={0} value={editRecapDraft.modal} readOnly className="w-full rounded-xl border border-stone-200 bg-stone-100 px-2.5 py-2 text-sm text-slate-800 outline-none" />
                                  </label>
                                </div>
                                <div className="mt-2 rounded-2xl border border-stone-200 bg-white/90 p-3">
                                  <div className="mb-2 flex items-center justify-between">
                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Item Barang</p>
                                    <button type="button" onClick={addEditRecapOrderItem} className="rounded-xl border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-stone-100">
                                      Tambah Barang
                                    </button>
                                  </div>
                                  <div className="space-y-2">
                                    {editRecapDraft.orderItems.map((item, index) => (
                                      <div key={`edit-order-table-${index}`} className="grid gap-2 lg:grid-cols-[1.6fr_110px_130px_130px_auto]">
                                        <input
                                          value={item.nama}
                                          onChange={(e) => updateEditRecapOrderItem(index, "nama", e.target.value)}
                                          placeholder="Nama barang"
                                          className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                                        />
                                        <input
                                          type="number"
                                          min={0}
                                          value={item.qty}
                                          onChange={(e) => updateEditRecapOrderItem(index, "qty", Number(e.target.value || 0))}
                                          className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-right text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                                        />
                                        <input
                                          type="number"
                                          min={0}
                                          value={item.hargaJual}
                                          onChange={(e) => updateEditRecapOrderItem(index, "hargaJual", Number(e.target.value || 0))}
                                          className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-right text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                                        />
                                        <input
                                          type="number"
                                          min={0}
                                          value={item.modal}
                                          onChange={(e) => updateEditRecapOrderItem(index, "modal", Number(e.target.value || 0))}
                                          className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-right text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => removeEditRecapOrderItem(index)}
                                          className="rounded-xl border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                          disabled={editRecapDraft.orderItems.length <= 1}
                                        >
                                          Hapus
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div className="mt-2 rounded-2xl border border-stone-200 bg-stone-50/80 p-3">
                                  <div className="mb-2 flex items-center justify-between">
                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Rincian Biaya</p>
                                    <button type="button" onClick={addEditRecapBiayaDetail} className="rounded-xl border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-stone-100">
                                      Tambah Biaya
                                    </button>
                                  </div>
                                  <div className="space-y-2">
                                    {editRecapDraft.biayaDetail.map((item, index) => (
                                      <div key={`edit-biaya-table-${index}`} className="grid gap-2 lg:grid-cols-[1.4fr_140px_auto]">
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
                                <label className="mt-2 grid gap-1 text-xs text-slate-600">
                                  <span>Catatan</span>
                                  <input value={editRecapDraft.catatan} onChange={(e) => updateEditRecapField("catatan", e.target.value)} className="w-full rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200" />
                                </label>
                                {editRecapNotice ? (
                                  <p className="mt-2 text-xs text-slate-600">{editRecapNotice}</p>
                                ) : null}
                                <div className="mt-2 flex items-center justify-end gap-2">
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
                                    disabled={isEditRecapSaving}
                                    className="rounded-xl border border-stone-900 bg-slate-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                                  >
                                    {isEditRecapSaving ? "Menyimpan..." : "Simpan Perubahan"}
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                        {openBiayaDetailRow?.id === row.id ? (
                          <tr className="border-t border-stone-100 bg-stone-50/60">
                            <td className="px-3 py-3" colSpan={5}>
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
                    <td className="px-3 py-4 text-center text-slate-500" colSpan={5}>
                      Belum ada data rekap.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

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





