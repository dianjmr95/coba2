"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

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

type SectionId = "kalkulator-potongan" | "pembuatan-nota";

type InvoiceItem = {
  id: string;
  nama: string;
  qty: number;
  harga: number;
};

const PRESET_STORAGE_KEY = "marketplace-potongan-presets-v1";
const INVOICE_COUNTER_STORAGE_KEY = "starcomp-invoice-counter-v1";

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
    <div className="flex items-center justify-between gap-2 rounded-2xl border border-stone-200 bg-white/95 px-3 py-2.5 transition hover:border-stone-300 hover:shadow-sm">
      <span className="block text-sm text-slate-800">
        {title}
        <small className="mt-0.5 block text-xs text-slate-500">{subtitle}</small>
      </span>
      {children}
    </div>
  );
}

export default function Page() {
  const [harga, setHarga] = useState(100000);
  const [modal, setModal] = useState(65000);
  const [targetMargin, setTargetMargin] = useState(20);

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
  const importPresetRef = useRef<HTMLInputElement | null>(null);
  const [showInvoiceWindow, setShowInvoiceWindow] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("kalkulator-potongan");
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

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PresetItem[];
      if (Array.isArray(parsed)) setPresets(parsed);
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

  function handleSavePreset() {
    const name = presetName.trim();
    if (!name) return;

    const item: PresetItem = {
      id: `${Date.now()}`,
      name,
      data: currentPresetData
    };

    setPresets((prev) => [item, ...prev]);
    setPresetName("");
    setSelectedPresetId(item.id);
    setPresetNotice("Preset berhasil disimpan.");
  }

  function handleLoadPreset() {
    const found = presets.find((p) => p.id === selectedPresetId);
    if (!found) return;
    applyPreset(found.data);
    setPresetNotice(`Preset "${found.name}" diterapkan.`);
  }

  function handleDeletePreset() {
    if (!selectedPresetId) return;
    setPresets((prev) => prev.filter((p) => p.id !== selectedPresetId));
    setSelectedPresetId("");
    setPresetNotice("Preset berhasil dihapus.");
  }

  function handleUpdatePreset() {
    if (!selectedPresetId) return;
    const nextName = presetName.trim();
    setPresets((prev) =>
      prev.map((p) =>
        p.id === selectedPresetId
          ? {
              ...p,
              name: nextName || p.name,
              data: currentPresetData
            }
          : p
      )
    );
    setPresetNotice("Preset berhasil diperbarui.");
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
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
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

        setPresets((prev) => [...valid, ...prev]);
        setPresetNotice(`${valid.length} preset berhasil diimport.`);
      } catch {
        setPresetNotice("Import gagal. Pastikan file JSON preset valid.");
      } finally {
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

  return (
    <main className="animate-fade-up mx-auto my-8 w-[94vw] max-w-[1280px]">
      <header className="mb-4 rounded-2xl border border-stone-200 bg-white/85 px-4 py-3 text-center shadow-sm backdrop-blur-md">
        <h1 className="text-lg font-semibold tracking-tight text-slate-800 md:text-2xl">
          Sistem Pembantu Penjualan Marketplace
        </h1>
      </header>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="card-shell h-fit p-3 lg:sticky lg:top-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Menu</p>
          <nav className="grid gap-2 text-sm">
            <button
              type="button"
              onClick={() => setActiveSection("kalkulator-potongan")}
              className={`rounded-xl border px-3 py-2 font-medium transition ${
                activeSection === "kalkulator-potongan"
                  ? "border-stone-700 bg-slate-900 text-white"
                  : "border-stone-200 bg-stone-50 text-slate-700 hover:bg-stone-100"
              }`}
            >
              Kalkulator Potongan
            </button>
            <button
              type="button"
              onClick={() => setActiveSection("pembuatan-nota")}
              className={`rounded-xl border px-3 py-2 font-medium transition ${
                activeSection === "pembuatan-nota"
                  ? "border-stone-700 bg-slate-900 text-white"
                  : "border-stone-200 bg-stone-50 text-slate-700 hover:bg-stone-100"
              }`}
            >
              Pembuatan Nota/Faktur
            </button>
          </nav>
        </aside>

        <div className="space-y-5">
          {activeSection === "kalkulator-potongan" ? (
          <section id="kalkulator-potongan" className="grid gap-4 lg:grid-cols-[1.05fr_1fr]">
        <article className="card-shell p-5">
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold">
            <span className="h-2 w-2 rounded-full bg-stone-500" /> Data Produk & Fee
          </h2>

          <div className="mb-4 rounded-2xl border border-stone-200 bg-stone-50/85 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Preset Potongan</p>
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Nama preset (contoh: Mode Shopee Aman)"
                className="w-full rounded-2xl border border-stone-200 bg-white/90 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200"
              />
              <button
                type="button"
                onClick={handleSavePreset}
                className="rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-stone-100"
              >
                Simpan
              </button>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto_auto]">
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
                className="rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-stone-100"
              >
                Pakai
              </button>
              <button
                type="button"
                onClick={handleDeletePreset}
                className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
              >
                Hapus
              </button>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-[auto_auto_1fr]">
              <button
                type="button"
                onClick={handleUpdatePreset}
                className="rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-stone-100"
              >
                Update
              </button>
              <button
                type="button"
                onClick={handleExportPresets}
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
                  className="hidden"
                />
              </label>
            </div>
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
            <div className="grid gap-2 rounded-2xl border border-stone-200 bg-stone-50/85 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Tokopedia</h3>
              <ToggleRow title="Gratis Ongkir Tokopedia" subtitle="4% (maks Rp 40.000)">
                <input type="checkbox" checked={tokopediaGratisOngkir} onChange={(e) => setTokopediaGratisOngkir(e.target.checked)} className="h-4 w-4 accent-stone-700" />
              </ToggleRow>
              <ToggleRow title="Komisi Afiliasi Tokopedia" subtitle="Opsional, isi persen sesuai kebutuhan">
                <div className="flex items-center gap-2">
                  <input type="number" value={tokopediaAfiliasiPct} min={0} step={0.1} onChange={(e) => setTokopediaAfiliasiPct(Number(e.target.value || 0))} className="w-16 rounded-xl border border-stone-200 px-2 py-1 text-right text-sm" />
                  <span className="text-xs text-slate-500">%</span>
                  <input type="checkbox" checked={tokopediaAfiliasiAktif} onChange={(e) => setTokopediaAfiliasiAktif(e.target.checked)} className="h-4 w-4 accent-stone-700" />
                </div>
              </ToggleRow>
            </div>

            <div className="grid gap-2 rounded-2xl border border-stone-200 bg-stone-50/85 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Shopee</h3>
              <ToggleRow title="Gratis Ongkir Shopee" subtitle="Pilih kategori dan persentase">
                <select value={shopeeGratisOngkir} onChange={(e) => setShopeeGratisOngkir(e.target.value as ShopeeOngkirMode)} className="w-[220px] rounded-xl border border-stone-200 px-2 py-1 text-sm outline-none transition focus:border-stone-300 focus:ring-2 focus:ring-stone-200">
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
                <div className="flex items-center gap-2">
                  <input type="number" value={shopeeAfiliasiPct} min={0} step={0.1} onChange={(e) => setShopeeAfiliasiPct(Number(e.target.value || 0))} className="w-16 rounded-xl border border-stone-200 px-2 py-1 text-right text-sm" />
                  <span className="text-xs text-slate-500">%</span>
                  <input type="checkbox" checked={shopeeAfiliasiAktif} onChange={(e) => setShopeeAfiliasiAktif(e.target.checked)} className="h-4 w-4 accent-stone-700" />
                </div>
              </ToggleRow>
            </div>

            <div className="grid gap-2 rounded-2xl border border-stone-200 bg-stone-50/85 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-600">Tokopedia Mall</h3>
              <ToggleRow title="Biaya Jasa Tokopedia Mall" subtitle="1.8% (maks Rp 50.000)">
                <input type="checkbox" checked={mallBiayaJasa} onChange={(e) => setMallBiayaJasa(e.target.checked)} className="h-4 w-4 accent-stone-700" />
              </ToggleRow>
              <ToggleRow title="Gratis Ongkir Tokopedia Mall" subtitle="4% (maks Rp 40.000)">
                <input type="checkbox" checked={mallGratisOngkir} onChange={(e) => setMallGratisOngkir(e.target.checked)} className="h-4 w-4 accent-stone-700" />
              </ToggleRow>
              <ToggleRow title="Komisi Afiliasi Tokopedia Mall" subtitle="Opsional, isi persen sesuai kebutuhan">
                <div className="flex items-center gap-2">
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
            <h2 className="text-base font-bold">Hasil Simulasi</h2>
            <p className="text-sm text-slate-600">
              Biaya proses semua marketplace: <strong>Rp 1.250</strong>
            </p>
          </div>

          {[
            { key: "tokopedia", title: "Tokopedia", data: hasil.tokopedia },
            { key: "shopee", title: "Shopee", data: hasil.shopee },
            { key: "mall", title: "Tokopedia Mall", data: hasil.mall }
          ].map((m) => (
            <section key={m.key} className="mb-2 rounded-2xl border border-stone-200 bg-stone-50/80 p-3 transition hover:border-stone-300 hover:shadow-sm">
              <h3 className="mb-2 text-sm font-bold">{m.title}</h3>
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
      <section id="pembuatan-nota">
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
                      <div key={item.id} className="grid gap-2 rounded-xl border border-stone-200 bg-white p-2 md:grid-cols-[1.6fr_90px_130px_130px_auto]">
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
        </div>
      </div>
    </main>
  );
}
