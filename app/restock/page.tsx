"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Warehouse = { id: string; name: string };
type Product = {
  id: string;
  sku: string | null;
  name: string;
  harga_modal: number;
  harga_jual: number;
  sku_normalized: string;
  name_normalized: string;
};
type Stock = { id: string; warehouse_id: string; product_id: string; qty: number };
type SalesRecord = {
  id: string;
  period_label: string;
  product_id: string | null;
  product_name: string;
  normalized_name: string;
  qty_terjual: number;
  omzet: number;
};

type BootstrapResponse = {
  ok: boolean;
  error?: string;
  data?: {
    warehouses: Warehouse[];
    products: Product[];
    stocks: Stock[];
    salesRecords: SalesRecord[];
  };
};

type PreviewRow = {
  sku: string;
  name: string;
  harga_modal: number;
  harga_jual: number;
  qty: number;
};

type SalesPreviewRow = {
  product_name: string;
  qty_terjual: number;
  omzet: number;
};
type ParseIssue = {
  rowNumber: number;
  message: string;
};

type RestockRow = {
  productId: string;
  sku: string;
  name: string;
  status: "Kosong" | "Stok Rendah";
  baseQty: number;
  sold: number;
  priority: "Tinggi" | "Sedang" | "Rendah" | "Tidak ada penjualan tercatat";
  otherStocks: Record<string, number>;
  otherTotal: number;
  harga_modal: number;
  harga_jual: number;
};
type IncomingRecommendation = {
  name: string;
  qty: number;
  price: number;
  stockNow: number;
  sold: number;
  targetStock: number;
  tambahan: number;
  matched: boolean;
};

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? value : 0
  );
}

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function normalizeSku(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

function parseNumber(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\./g, "").replace(/,/g, ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

export default function RestockPage() {
  const [loading, setLoading] = useState(true);
  const [bootstrap, setBootstrap] = useState<BootstrapResponse["data"] | null>(null);
  const [notice, setNotice] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [threshold, setThreshold] = useState(5);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [newWarehouseName, setNewWarehouseName] = useState("");
  const [salesBuffer, setSalesBuffer] = useState(1.5);
  const [stockPreview, setStockPreview] = useState<PreviewRow[]>([]);
  const [stockFileName, setStockFileName] = useState("");
  const [stockParseError, setStockParseError] = useState("");
  const [stockParseIssues, setStockParseIssues] = useState<ParseIssue[]>([]);
  const [salesPreview, setSalesPreview] = useState<SalesPreviewRow[]>([]);
  const [salesFileName, setSalesFileName] = useState("");
  const [salesParseError, setSalesParseError] = useState("");
  const [salesParseIssues, setSalesParseIssues] = useState<ParseIssue[]>([]);
  const [replaceSalesPeriod, setReplaceSalesPeriod] = useState(true);
  const [incomingPreview, setIncomingPreview] = useState<Array<{ name: string; qty: number; price: number }>>([]);
  const [incomingText, setIncomingText] = useState("");
  const [incomingSupplier, setIncomingSupplier] = useState("");
  const [incomingDate, setIncomingDate] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/restock");
        const payload = (await response.json()) as BootstrapResponse;
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Gagal memuat data restock.");
        setBootstrap(payload.data ?? null);
        setSelectedWarehouseId(payload.data?.warehouses?.[0]?.id ?? "");
        setSelectedPeriod(payload.data?.salesRecords?.[0]?.period_label ?? "");
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Gagal memuat data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const periods = useMemo(() => {
    const values = new Set((bootstrap?.salesRecords ?? []).map((row) => row.period_label));
    return Array.from(values).sort((a, b) => b.localeCompare(a));
  }, [bootstrap?.salesRecords]);

  const dashboard = useMemo(() => {
    if (!bootstrap || !selectedWarehouseId) return [] as RestockRow[];
    const baseWarehouse = bootstrap.warehouses.find((warehouse) => warehouse.id === selectedWarehouseId);
    if (!baseWarehouse) return [] as RestockRow[];

    const otherWarehouses = bootstrap.warehouses.filter((warehouse) => warehouse.id !== selectedWarehouseId);
    const stockByProduct = new Map<string, Record<string, number>>();
    for (const stock of bootstrap.stocks) {
      const bucket = stockByProduct.get(stock.product_id) ?? {};
      bucket[stock.warehouse_id] = Number(stock.qty) || 0;
      stockByProduct.set(stock.product_id, bucket);
    }
    const salesByProduct = new Map<string, SalesRecord>();
    for (const sale of bootstrap.salesRecords) {
      if (selectedPeriod && sale.period_label !== selectedPeriod) continue;
      const key = sale.product_id || sale.normalized_name;
      const existing = salesByProduct.get(key);
      if (!existing || sale.qty_terjual > existing.qty_terjual) salesByProduct.set(key, sale);
    }

    const rows: RestockRow[] = [];
    for (const product of bootstrap.products) {
      const byWarehouse = stockByProduct.get(product.id) ?? {};
      const baseQty = Number(byWarehouse[selectedWarehouseId] ?? 0);
      const otherStocks = Object.fromEntries(otherWarehouses.map((warehouse) => [warehouse.name, Number(byWarehouse[warehouse.id] ?? 0)]));
      const otherTotal = Object.values(otherStocks).reduce((acc, value) => acc + value, 0);
      if (baseQty >= threshold) continue;

      const sale = salesByProduct.get(product.id) ?? salesByProduct.get(product.name_normalized);
      const sold = Number(sale?.qty_terjual ?? 0);
      const priority =
        sold === 0 ? "Tidak ada penjualan tercatat" : sold >= 10 ? "Tinggi" : sold >= 3 ? "Sedang" : "Rendah";

      rows.push({
        productId: product.id,
        sku: product.sku || "-",
        name: product.name,
        status: baseQty <= 0 ? "Kosong" : "Stok Rendah",
        baseQty,
        sold,
        priority,
        otherStocks,
        otherTotal,
        harga_modal: Number(product.harga_modal) || 0,
        harga_jual: Number(product.harga_jual) || 0
      });
    }

    return rows.sort((a, b) => b.sold - a.sold || (a.status === "Kosong" ? -1 : 1));
  }, [bootstrap, selectedPeriod, selectedWarehouseId, threshold]);

  const warehouseColumns = bootstrap?.warehouses.filter((warehouse) => warehouse.id !== selectedWarehouseId) ?? [];

  const exportRows = useMemo(
    () =>
      dashboard.map((row, index) => ({
        no: index + 1,
        sku: row.sku,
        nama_produk: row.name,
        status: row.status,
        stok_gudang_basis: row.baseQty,
        terjual: row.sold,
        prioritas: row.priority,
        total_gudang_lain: row.otherTotal,
        harga_modal: row.harga_modal,
        harga_jual: row.harga_jual,
        ...Object.fromEntries(warehouseColumns.map((warehouse) => [warehouse.name, row.otherStocks[warehouse.name] ?? 0]))
      })),
    [dashboard, warehouseColumns]
  );

  const incomingRecommendations = useMemo(() => {
    if (!bootstrap || !selectedWarehouseId) return [] as IncomingRecommendation[];
    const stockByKey = new Map<string, number>();
    for (const stock of bootstrap.stocks) {
      const product = bootstrap.products.find((item) => item.id === stock.product_id);
      if (!product) continue;
      const key = product.name_normalized;
      stockByKey.set(key, (stockByKey.get(key) ?? 0) + (Number(stock.qty) || 0));
    }
    const salesByName = new Map<string, number>();
    for (const sale of bootstrap.salesRecords) {
      if (selectedPeriod && sale.period_label !== selectedPeriod) continue;
      salesByName.set(sale.normalized_name, (salesByName.get(sale.normalized_name) ?? 0) + (Number(sale.qty_terjual) || 0));
    }
    return incomingPreview.map((item) => {
      const key = normalizeKey(item.name);
      const stockNow = stockByKey.get(key) ?? 0;
      const sold = salesByName.get(key) ?? 0;
      const targetStock = Math.ceil(sold * Math.max(0, salesBuffer));
      const tambahan = Math.max(0, targetStock - (stockNow + item.qty));
      const matched = bootstrap.products.some((product) => product.name_normalized === key);
      return { name: item.name, qty: item.qty, price: item.price, stockNow, sold, targetStock, tambahan, matched };
    });
  }, [bootstrap, incomingPreview, salesBuffer, selectedPeriod, selectedWarehouseId]);

  function downloadWorkbook(filename: string, sheetName: string, rows: Record<string, unknown>[]) {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filename);
  }

  function handleExportDashboard(format: "xlsx" | "csv") {
    if (!exportRows.length) {
      setNotice("Belum ada data untuk diekspor.");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const safeWarehouse = (bootstrap?.warehouses.find((warehouse) => warehouse.id === selectedWarehouseId)?.name || "gudang")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "");

    if (format === "csv") {
      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `Hasil-Restock-${safeWarehouse}-${stamp}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }

    downloadWorkbook(`Hasil-Restock-${safeWarehouse}-${stamp}.xlsx`, "Restock", exportRows);
  }

  async function handleWarehouseCreate() {
    if (!newWarehouseName.trim()) return;
    setNotice("Menyimpan gudang...");
    const response = await fetch("/api/restock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add_warehouse", name: newWarehouseName })
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      setNotice(payload.error || "Gagal menambah gudang.");
      return;
    }
    setNewWarehouseName("");
    setNotice("Gudang berhasil ditambahkan.");
    location.reload();
  }

  async function handleStockFile(file: File | null) {
    if (!file) return;
    setStockFileName(file.name);
    setStockParseError("");
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) as unknown[][];
      if (!rows.length) throw new Error("File stok kosong.");
      const header = (rows[0] ?? []).map((cell) => normalizeKey(cell));
      const expected = ["SKU", "Nama Produk", "Harga Modal", "Harga Jual", "Qty"];
      if (!expected.every((col) => header.includes(normalizeKey(col)))) {
        throw new Error(`Header harus: ${expected.join(" | ")}`);
      }
      const issues: ParseIssue[] = [];
      const data = rows.slice(1).flatMap((row, index) => {
        const rowNumber = index + 2;
        const sku = String(row[header.indexOf("SKU")] ?? "").trim();
        const name = String(row[header.indexOf("NAMA PRODUK")] ?? "").trim();
        const hargaModalRaw = row[header.indexOf("HARGA MODAL")];
        const hargaJualRaw = row[header.indexOf("HARGA JUAL")];
        const qtyRaw = row[header.indexOf("QTY")];
        if (!name) {
          issues.push({ rowNumber, message: "Nama produk kosong." });
          return [];
        }
        const qty = parseNumber(qtyRaw);
        if (qtyRaw !== "" && !Number.isFinite(qty)) {
          issues.push({ rowNumber, message: "Qty tidak valid." });
        }
        return [{
          sku,
          name,
          harga_modal: parseNumber(hargaModalRaw),
          harga_jual: parseNumber(hargaJualRaw),
          qty: Math.round(qty)
        }];
      });
      setStockPreview(data);
      setStockParseIssues(issues);
      setStockParseError(issues.length ? `Ada ${issues.length} baris stok bermasalah.` : "");
    } catch (error) {
      setStockParseError(error instanceof Error ? error.message : "Gagal parse file stok.");
      setStockPreview([]);
      setStockParseIssues([]);
    }
  }

  async function handleUploadStock() {
    if (!selectedWarehouseId) {
      setNotice("Pilih gudang tujuan terlebih dahulu.");
      return;
    }
    if (!stockPreview.length) return;
    const response = await fetch("/api/restock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upload_stock", warehouseId: selectedWarehouseId, rows: stockPreview })
    });
    const payload = await response.json();
    setNotice(response.ok && payload.ok ? "Upload stok berhasil." : payload.error || "Upload stok gagal.");
    if (response.ok && payload.ok) location.reload();
  }

  async function handleSalesFile(file: File | null) {
    if (!file) return;
    setSalesFileName(file.name);
    setSalesParseError("");
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }) as unknown[][];
      if (!rows.length) throw new Error("File penjualan kosong.");
      const header = (rows[0] ?? []).map((cell) => normalizeKey(cell));
      const expected = ["Nama Produk", "Qty Terjual", "Omzet"];
      if (!expected.every((col) => header.includes(normalizeKey(col)))) {
        throw new Error(`Header harus: ${expected.join(" | ")}`);
      }
      const issues: ParseIssue[] = [];
      const data = rows.slice(1).flatMap((row, index) => {
        const rowNumber = index + 2;
        const name = String(row[header.indexOf("NAMA PRODUK")] ?? "").trim();
        const qtyTerjualRaw = row[header.indexOf("QTY TERJUAL")];
        const omzetRaw = row[header.indexOf("OMZET")];
        if (!name) {
          issues.push({ rowNumber, message: "Nama produk kosong." });
          return [];
        }
        const qtyTerjual = parseNumber(qtyTerjualRaw);
        if (qtyTerjualRaw !== "" && !Number.isFinite(qtyTerjual)) {
          issues.push({ rowNumber, message: "Qty terjual tidak valid." });
        }
        return [{
          product_name: name,
          qty_terjual: Math.round(qtyTerjual),
          omzet: parseNumber(omzetRaw)
        }];
      });
      setSalesPreview(data);
      setSalesParseIssues(issues);
      setSalesParseError(issues.length ? `Ada ${issues.length} baris penjualan bermasalah.` : "");
    } catch (error) {
      setSalesParseError(error instanceof Error ? error.message : "Gagal parse file penjualan.");
      setSalesPreview([]);
      setSalesParseIssues([]);
    }
  }

  async function handleUploadSales() {
    if (!selectedPeriod.trim()) {
      setNotice("Pilih periode terlebih dahulu.");
      return;
    }
    if (!salesPreview.length) return;
    const response = await fetch("/api/restock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upload_sales", periodLabel: selectedPeriod, replaceExisting: replaceSalesPeriod, rows: salesPreview })
    });
    const payload = await response.json();
    setNotice(response.ok && payload.ok ? "Upload penjualan berhasil." : payload.error || "Upload penjualan gagal.");
    if (response.ok && payload.ok) location.reload();
  }

  async function handleIncomingParse() {
    const rows = incomingText.split(/\r?\n/).map((line) => line.split("\t").map((item) => item.trim())).filter((row) => row.some(Boolean));
    let supplier = "";
    let date = "";
    const items: Array<{ name: string; qty: number; price: number }> = [];
    for (const row of rows) {
      const joined = row.join(" ");
      const dateMatch = joined.match(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/);
      if (dateMatch) date = dateMatch[0];
      if (row.length >= 3) {
        const qty = parseNumber(row[1]);
        const price = parseNumber(row[2]);
        if (row[0] && Number.isFinite(qty) && qty > 0) {
          items.push({ name: row[0], qty: Math.round(qty), price });
          continue;
        }
      }
      if (!supplier && row[0]) {
        supplier = row[0];
      } else if (!supplier) {
        supplier = row.join(" ").trim();
      }
    }
    setIncomingSupplier(supplier);
    setIncomingDate(date);
    setIncomingPreview(items);
  }

  return (
    <main className="mx-auto my-6 w-[94vw] max-w-[1280px] animate-fade-up">
      <div className="card-shell p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Restock Toolkit</p>
            <h1 className="text-2xl font-bold text-slate-900">Kontrol Stok & Restock</h1>
            <p className="text-sm text-slate-600">Upload stok dan penjualan manual, lalu lihat produk yang perlu restock dari gudang basis.</p>
          </div>
          <a href="/" className="rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">Kembali ke Dashboard</a>
        </div>
        {notice ? <p className="mb-3 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700">{notice}</p> : null}
        {loading ? <p className="text-sm text-slate-600">Memuat data...</p> : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-3xl border border-stone-200 bg-white p-4">
            <h2 className="font-bold text-slate-900">Manajemen Gudang</h2>
            <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
              <input value={newWarehouseName} onChange={(e) => setNewWarehouseName(e.target.value)} placeholder="Nama gudang baru" className="rounded-2xl border border-stone-200 px-3 py-2" />
              <button onClick={handleWarehouseCreate} className="rounded-2xl bg-slate-900 px-3 py-2 text-white">Tambah Gudang</button>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <label className="grid gap-1 text-sm text-slate-600">
                <span>Gudang Basis</span>
                <select value={selectedWarehouseId} onChange={(e) => setSelectedWarehouseId(e.target.value)} className="rounded-2xl border border-stone-200 px-3 py-2">
                  {(bootstrap?.warehouses ?? []).map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm text-slate-600">
                <span>Threshold</span>
                <input type="number" min={0} value={threshold} onChange={(e) => setThreshold(Number(e.target.value || 0))} className="rounded-2xl border border-stone-200 px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm text-slate-600">
                <span>Periode Penjualan</span>
                <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} className="rounded-2xl border border-stone-200 px-3 py-2">
                  <option value="">Semua</option>
                  {periods.map((period) => <option key={period} value={period}>{period}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-4">
            <h2 className="font-bold text-slate-900">Upload Stok per Gudang</h2>
            <div className="mt-3 grid gap-2">
              <input type="file" accept=".xlsx" onChange={(e) => void handleStockFile(e.target.files?.[0] ?? null)} />
              {stockFileName ? <p className="text-xs text-slate-500">{stockFileName}</p> : null}
              {stockParseError ? <p className="text-sm text-rose-600">{stockParseError}</p> : null}
              {stockParseIssues.length ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <p className="font-semibold">Baris bermasalah</p>
                  <ul className="mt-1 space-y-1">
                    {stockParseIssues.map((issue) => (
                      <li key={`stock-issue-${issue.rowNumber}`}>Baris {issue.rowNumber}: {issue.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="max-h-44 overflow-auto rounded-2xl border border-stone-200">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50"><tr><th className="px-2 py-1 text-left">SKU</th><th className="px-2 py-1 text-left">Nama</th><th className="px-2 py-1 text-right">Qty</th></tr></thead>
                  <tbody>{stockPreview.slice(0, 5).map((row, idx) => (<tr key={idx} className="border-t"><td className="px-2 py-1">{row.sku || "-"}</td><td className="px-2 py-1">{row.name}</td><td className="px-2 py-1 text-right">{row.qty}</td></tr>))}</tbody>
                </table>
              </div>
              <button onClick={handleUploadStock} className="rounded-2xl bg-emerald-600 px-3 py-2 text-white">Konfirmasi Upload Stok</button>
            </div>
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-4">
            <h2 className="font-bold text-slate-900">Upload Data Penjualan</h2>
            <div className="mt-3 grid gap-2 md:grid-cols-[1fr_180px]">
              <input value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} placeholder="Periode, mis. Juni 2026" className="rounded-2xl border border-stone-200 px-3 py-2" />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={replaceSalesPeriod} onChange={(e) => setReplaceSalesPeriod(e.target.checked)} />
                Replace periode
              </label>
            </div>
            <div className="mt-2 grid gap-2">
              <input type="file" accept=".xlsx" onChange={(e) => void handleSalesFile(e.target.files?.[0] ?? null)} />
              {salesFileName ? <p className="text-xs text-slate-500">{salesFileName}</p> : null}
              {salesParseError ? <p className="text-sm text-rose-600">{salesParseError}</p> : null}
              {salesParseIssues.length ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <p className="font-semibold">Baris bermasalah</p>
                  <ul className="mt-1 space-y-1">
                    {salesParseIssues.map((issue) => (
                      <li key={`sales-issue-${issue.rowNumber}`}>Baris {issue.rowNumber}: {issue.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="max-h-44 overflow-auto rounded-2xl border border-stone-200">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50"><tr><th className="px-2 py-1 text-left">Produk</th><th className="px-2 py-1 text-right">Qty</th><th className="px-2 py-1 text-right">Omzet</th></tr></thead>
                  <tbody>{salesPreview.slice(0, 5).map((row, idx) => (<tr key={idx} className="border-t"><td className="px-2 py-1">{row.product_name}</td><td className="px-2 py-1 text-right">{row.qty_terjual}</td><td className="px-2 py-1 text-right">{rupiah(row.omzet)}</td></tr>))}</tbody>
                </table>
              </div>
              <button onClick={handleUploadSales} className="rounded-2xl bg-slate-900 px-3 py-2 text-white">Konfirmasi Upload Penjualan</button>
            </div>
          </section>

          <section className="rounded-3xl border border-stone-200 bg-white p-4">
            <h2 className="font-bold text-slate-900">Cek Barang Datang</h2>
            <div className="mt-3 grid gap-2 md:grid-cols-[1fr_180px]">
              <textarea value={incomingText} onChange={(e) => setIncomingText(e.target.value)} rows={7} className="w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm" placeholder="Paste data tab-separated..." />
              <div className="grid gap-2">
                <label className="grid gap-1 text-sm text-slate-600">
                  <span>Gudang Tujuan</span>
                  <select value={selectedWarehouseId} onChange={(e) => setSelectedWarehouseId(e.target.value)} className="rounded-2xl border border-stone-200 px-3 py-2">
                    {(bootstrap?.warehouses ?? []).map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm text-slate-600">
                  <span>Buffer Multiplier</span>
                  <input type="number" step="0.1" min={1} value={salesBuffer} onChange={(e) => setSalesBuffer(Number(e.target.value || 1.5))} className="rounded-2xl border border-stone-200 px-3 py-2" />
                </label>
                <button onClick={() => void handleIncomingParse()} className="rounded-2xl bg-slate-900 px-3 py-2 text-white">Parse Data</button>
              </div>
            </div>
            {(incomingSupplier || incomingDate) ? <p className="mt-2 text-sm text-slate-600">Supplier: <strong>{incomingSupplier || "-"}</strong> | Tanggal: <strong>{incomingDate || "-"}</strong></p> : null}
            <div className="mt-2 max-h-44 overflow-auto rounded-2xl border border-stone-200">
              <table className="w-full text-sm">
                <thead className="bg-stone-50"><tr><th className="px-2 py-1 text-left">Nama</th><th className="px-2 py-1 text-right">Qty</th><th className="px-2 py-1 text-right">Harga</th></tr></thead>
                <tbody>{incomingPreview.map((row, idx) => (<tr key={idx} className="border-t"><td className="px-2 py-1">{row.name}</td><td className="px-2 py-1 text-right">{row.qty}</td><td className="px-2 py-1 text-right">{rupiah(row.price)}</td></tr>))}</tbody>
              </table>
            </div>
            {incomingRecommendations.length ? (
              <div className="mt-3 overflow-auto rounded-2xl border border-stone-200">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50">
                    <tr>
                      <th className="px-2 py-1 text-left">Nama</th>
                      <th className="px-2 py-1 text-right">Stok Sekarang</th>
                      <th className="px-2 py-1 text-right">Terjual</th>
                      <th className="px-2 py-1 text-right">Target Stok</th>
                      <th className="px-2 py-1 text-right">Rekom Tambahan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incomingRecommendations.map((row, idx) => (
                      <tr key={`${row.name}-${idx}`} className="border-t">
                        <td className="px-2 py-1">
                          {row.name}
                          {!row.matched ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">Belum match</span> : null}
                        </td>
                        <td className="px-2 py-1 text-right">{row.stockNow}</td>
                        <td className="px-2 py-1 text-right">{row.sold}</td>
                        <td className="px-2 py-1 text-right">{row.targetStock}</td>
                        <td className="px-2 py-1 text-right font-semibold">{row.tambahan}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>

        <section className="mt-4 rounded-3xl border border-stone-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900">Dashboard Restock</h2>
              <p className="text-sm text-slate-600">Produk yang kosong atau stoknya di bawah threshold.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => handleExportDashboard("xlsx")} className="rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                Export XLSX
              </button>
              <button type="button" onClick={() => handleExportDashboard("csv")} className="rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                Export CSV
              </button>
              <p className="text-sm text-slate-600">Hasil: <strong>{dashboard.length}</strong> produk</p>
            </div>
          </div>
          <div className="mt-3 overflow-auto rounded-2xl border border-stone-200">
            <table className="w-full text-sm">
              <thead className="bg-stone-50">
                <tr>
                  <th className="px-2 py-2 text-left">No</th>
                  <th className="px-2 py-2 text-left">SKU</th>
                  <th className="px-2 py-2 text-left">Nama Produk</th>
                  <th className="px-2 py-2 text-left">Status</th>
                  <th className="px-2 py-2 text-right">Stok Basis</th>
                  <th className="px-2 py-2 text-right">Terjual</th>
                  <th className="px-2 py-2 text-left">Prioritas</th>
                  {warehouseColumns.map((warehouse) => <th key={warehouse.id} className="px-2 py-2 text-right">{warehouse.name}</th>)}
                  <th className="px-2 py-2 text-right">Total Gudang Lain</th>
                  <th className="px-2 py-2 text-right">Harga Modal</th>
                  <th className="px-2 py-2 text-right">Harga Jual</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.map((row, index) => (
                  <tr key={row.productId} className="border-t">
                    <td className="px-2 py-2">{index + 1}</td>
                    <td className="px-2 py-2">{row.sku}</td>
                    <td className="px-2 py-2">{row.name}</td>
                    <td className="px-2 py-2">{row.status}</td>
                    <td className="px-2 py-2 text-right">{row.baseQty}</td>
                    <td className="px-2 py-2 text-right">{row.sold}</td>
                    <td className="px-2 py-2">{row.priority}</td>
                    {warehouseColumns.map((warehouse) => <td key={warehouse.id} className="px-2 py-2 text-right">{row.otherStocks[warehouse.name] ?? 0}</td>)}
                    <td className="px-2 py-2 text-right">{row.otherTotal}</td>
                    <td className="px-2 py-2 text-right">{rupiah(row.harga_modal)}</td>
                    <td className="px-2 py-2 text-right">{rupiah(row.harga_jual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
