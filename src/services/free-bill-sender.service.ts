// =============================================================================
// FREE BILL SENDER — pdf-lib version (no Puppeteer, works on Vercel)
// src/services/free-bill-sender.service.ts
// =============================================================================

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LineItem {
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers: string[];
  lineTotal: number;
}

export interface BillData {
  invoiceNumber: string;
  restaurantName: string;
  restaurantAddress: string;
  restaurantPhone?: string;
  restaurantGstin?: string;
  tableName?: string;
  customerName?: string;
  orderNumber: number;
  lineItems: LineItem[];
  subtotal: number;
  discountAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  serviceCharge: number;
  totalAmount: number;
  paymentMethod: string;
  paidAt: string;
  currencyCode: string;
  customerPhone?: string;
  customerEmail?: string;
}

export interface BillLinks {
  whatsappUrl: string | null;
  gmailUrl: string | null;
  mailtoUrl: string | null;
  pdfUrl: string;
  previewText: string;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt(amount: number, currency = "INR"): string {
  // Formats the number with proper Indian locale grouping commas (e.g., 1,50,000.00)
  const formattedNumber = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  // Safely prepend 'Rs.' for INR to avoid WinAnsi PDF encoding crashes
  if (currency === "INR") {
    return `Rs. ${formattedNumber}`;
  }

  return `${currency} ${formattedNumber}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── PDF Generation ───────────────────────────────────────────────────────────

async function generatePDF(bill: BillData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([380, 600 + bill.lineItems.length * 20]);
  const { width, height } = page.getSize();

  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const black = rgb(0, 0, 0);
  const gray = rgb(0.4, 0.4, 0.4);
  const lightGray = rgb(0.85, 0.85, 0.85);

  let y = height - 30;
  const left = 24;
  const right = width - 24;

  // ── Header ──
  page.drawText(bill.restaurantName.toUpperCase(), {
    x: left, y,
    size: 16, font: fontBold, color: black,
  });
  y -= 18;

  page.drawText(bill.restaurantAddress, {
    x: left, y, size: 8, font, color: gray,
  });
  y -= 12;

  if (bill.restaurantPhone) {
    page.drawText(`Ph: ${bill.restaurantPhone}`, {
      x: left, y, size: 8, font, color: gray,
    });
    y -= 12;
  }

  if (bill.restaurantGstin) {
    page.drawText(`GSTIN: ${bill.restaurantGstin}`, {
      x: left, y, size: 8, font, color: gray,
    });
    y -= 12;
  }

  y -= 6;
  // Divider
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: lightGray });
  y -= 14;

  // ── Invoice Meta ──
  page.drawText(`Invoice: #${bill.invoiceNumber}`, { x: left, y, size: 9, font: fontBold, color: black });
  page.drawText(fmtDate(bill.paidAt), { x: right - 100, y, size: 9, font, color: gray });
  y -= 14;

  page.drawText(`Order: #${bill.orderNumber}`, { x: left, y, size: 9, font, color: gray });
  if (bill.tableName) {
    page.drawText(`Table: ${bill.tableName}`, { x: right - 100, y, size: 9, font, color: gray });
  }
  y -= 14;

  if (bill.customerName) {
    page.drawText(`Customer: ${bill.customerName}`, { x: left, y, size: 9, font, color: gray });
    y -= 14;
  }

  y -= 4;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: lightGray });
  y -= 14;

  // ── Column Headers ──
  page.drawText("Item", { x: left, y, size: 9, font: fontBold, color: black });
  page.drawText("Qty", { x: 220, y, size: 9, font: fontBold, color: black });
  page.drawText("Price", { x: 260, y, size: 9, font: fontBold, color: black });
  page.drawText("Total", { x: right - 36, y, size: 9, font: fontBold, color: black });
  y -= 10;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: lightGray });
  y -= 14;

  // ── Line Items ──
  for (const item of bill.lineItems) {
    page.drawText(item.name.substring(0, 28), { x: left, y, size: 9, font, color: black });
    page.drawText(String(item.quantity), { x: 220, y, size: 9, font, color: black });
    page.drawText(fmt(item.unitPrice, bill.currencyCode), { x: 252, y, size: 9, font, color: black });
    page.drawText(fmt(item.lineTotal, bill.currencyCode), { x: right - 48, y, size: 9, font, color: black });
    y -= 13;

    for (const mod of item.modifiers) {
      page.drawText(`  + ${mod}`, { x: left, y, size: 7, font, color: gray });
      y -= 11;
    }
  }

  y -= 4;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: lightGray });
  y -= 14;

  // ── Totals ──
  const addRow = (label: string, value: string, bold = false) => {
    page.drawText(label, { x: left + 140, y, size: 9, font: bold ? fontBold : font, color: bold ? black : gray });
    page.drawText(value, { x: right - 60, y, size: 9, font: bold ? fontBold : font, color: bold ? black : gray });
    y -= 13;
  };

  addRow("Subtotal", fmt(bill.subtotal, bill.currencyCode));
  if (bill.discountAmount > 0) addRow("Discount", `-${fmt(bill.discountAmount, bill.currencyCode)}`);
  if (bill.cgstAmount > 0) addRow("CGST", fmt(bill.cgstAmount, bill.currencyCode));
  if (bill.sgstAmount > 0) addRow("SGST", fmt(bill.sgstAmount, bill.currencyCode));
  if (bill.serviceCharge > 0) addRow("Service Charge", fmt(bill.serviceCharge, bill.currencyCode));

  y -= 2;
  page.drawLine({ start: { x: left + 140, y }, end: { x: right, y }, thickness: 0.5, color: lightGray });
  y -= 14;
  addRow("TOTAL", fmt(bill.totalAmount, bill.currencyCode), true);

  y -= 4;
  page.drawText(`Paid via ${bill.paymentMethod}`, { x: left + 140, y, size: 8, font, color: gray });

  y -= 20;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.5, color: lightGray });
  y -= 14;

  // ── Footer ──
  page.drawText("Thank you for dining with us!", {
    x: width / 2 - 70, y, size: 9, font: fontBold, color: black,
  });

  return await doc.save();
}

// ─── Upload PDF to Supabase Storage ──────────────────────────────────────────

async function uploadPDF(pdfBytes: Uint8Array, invoiceNumber: string): Promise<string> {
  const fileName = `bills/${invoiceNumber}-${Date.now()}.pdf`;

  const { error } = await supabase.storage
    .from("bills")
    .upload(fileName, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data } = await supabase.storage
    .from("bills")
    .createSignedUrl(fileName, 60 * 60 * 24 * 7); // 7-day link

  if (!data?.signedUrl) throw new Error("Could not generate signed URL");

  return data.signedUrl;
}

// ─── Build WhatsApp / Gmail URLs ─────────────────────────────────────────────

function buildWhatsAppUrl(bill: BillData, pdfUrl: string): string | null {
  if (!bill.customerPhone) return null;

  const phone = bill.customerPhone.replace(/\D/g, "");
  const msg =
    `Hi ${bill.customerName ?? "there"}, thank you for dining at ${bill.restaurantName}! 🙏\n\n` +
    `Your bill for Order #${bill.orderNumber}:\n` +
    `*Total: ${fmt(bill.totalAmount, bill.currencyCode)}*\n` +
    `Payment: ${bill.paymentMethod}\n\n` +
    `Download your invoice: ${pdfUrl}\n\n` +
    `We hope to see you again soon!`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

function buildGmailUrl(bill: BillData, pdfUrl: string): string | null {
  if (!bill.customerEmail) return null;

  const subject = `Your bill from ${bill.restaurantName} — Order #${bill.orderNumber}`;
  const body =
    `Dear ${bill.customerName ?? "Guest"},\n\n` +
    `Thank you for dining with us at ${bill.restaurantName}.\n\n` +
    `Order #${bill.orderNumber} | ${fmtDate(bill.paidAt)}\n` +
    `Total: ${fmt(bill.totalAmount, bill.currencyCode)} (${bill.paymentMethod})\n\n` +
    `Download your invoice: ${pdfUrl}\n\n` +
    `We look forward to serving you again!\n\n` +
    `Warm regards,\n${bill.restaurantName}`;

  return (
    `https://mail.google.com/mail/?view=cm&fs=1` +
    `&to=${encodeURIComponent(bill.customerEmail)}` +
    `&su=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`
  );
}

function buildMailtoUrl(bill: BillData, pdfUrl: string): string | null {
  if (!bill.customerEmail) return null;

  const subject = `Your bill from ${bill.restaurantName} — Order #${bill.orderNumber}`;
  const body =
    `Dear ${bill.customerName ?? "Guest"},\n\n` +
    `Thank you for dining with us.\n` +
    `Total: ${fmt(bill.totalAmount, bill.currencyCode)}\n\n` +
    `Invoice: ${pdfUrl}`;

  return `mailto:${bill.customerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function generateBillLinks(bill: BillData): Promise<BillLinks> {
  const pdfBytes = await generatePDF(bill);
  const pdfUrl = await uploadPDF(pdfBytes, bill.invoiceNumber);

  return {
    whatsappUrl: buildWhatsAppUrl(bill, pdfUrl),
    gmailUrl: buildGmailUrl(bill, pdfUrl),
    mailtoUrl: buildMailtoUrl(bill, pdfUrl),
    pdfUrl,
    previewText:
      `Hi ${bill.customerName ?? "there"}, your bill from ${bill.restaurantName} ` +
      `is ${fmt(bill.totalAmount, bill.currencyCode)}. Invoice: ${pdfUrl}`,
  };
}
