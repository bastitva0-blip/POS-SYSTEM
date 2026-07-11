import express from "express";
import cors from "cors";
import { generateBillLinks } from "../src/services/free-bill-sender.service";
import { createClient } from "@supabase/supabase-js";
import { decryptPII } from "../src/utils/encryption";

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.post("/api/bill/send-free", async (req, res) => {
  const { invoiceId, overridePhone, overrideEmail } = req.body as {
    invoiceId: string;
    overridePhone?: string;
    overrideEmail?: string;
  };

  if (!invoiceId) {
    return res.status(400).json({ error: "invoiceId is required" });
  }

  try {
    const billData = await fetchBillData(invoiceId);
    if (!billData) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    if (overridePhone) billData.customerPhone = overridePhone;
    if (overrideEmail) billData.customerEmail = overrideEmail;

    const links = await generateBillLinks(billData);

    await supabase
      .from("invoices")
      .update({
        pdf_url: links.pdfUrl,
        pdf_generated_at: new Date().toISOString(),
      })
      .eq("invoice_number", billData.invoiceNumber);

    return res.json({ success: true, data: links });
  } catch (err: any) {
    console.error("[BillRoute] Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

async function fetchBillData(invoiceId: string) {
  const { data, error } = await supabase
    .from("invoices")
    .select(`
      invoice_number, subtotal, discount_amount,
      cgst_amount, sgst_amount, service_charge, total_amount, issued_at,
      orders (
        id, order_number,
        tables ( display_name, table_number ),
        payments ( payment_method )
      ),
      restaurants (
        name, logo_url, address, gstin, phone, currency_code
      ),
      customers (
        name,
        phone_encrypted, phone_country_code,
        email_encrypted,
        opt_in_whatsapp, opt_in_email
      )
    `)
    .eq("id", invoiceId)
    .single();

  if (error || !data) return null;

  const { data: orderItems } = await supabase
    .from("order_items")
    .select(`
      quantity, unit_price, line_total,
      menu_items ( name ),
      order_item_modifiers ( modifier_name )
    `)
    .eq("order_id", (data.orders as any).id)
    .neq("status", "CANCELLED");

  const r = data.restaurants as any;
  const o = data.orders as any;
  const c = data.customers as any;

  const phone = c?.phone_encrypted
    ? `${c.phone_country_code}${decryptPII(Buffer.from(c.phone_encrypted))}`
    : undefined;
  const email = c?.email_encrypted
    ? decryptPII(Buffer.from(c.email_encrypted))
    : undefined;

  return {
    invoiceNumber: data.invoice_number,
    restaurantName: r?.name ?? "",
    restaurantAddress: r?.address ?? "",
    restaurantPhone: r?.phone,
    restaurantGstin: r?.gstin,
    restaurantLogoUrl: r?.logo_url,
    tableName: o?.tables?.display_name ?? o?.tables?.table_number,
    customerName: c?.name,
    orderNumber: o?.order_number,
    lineItems: (orderItems ?? []).map((i: any) => ({
      name: i.menu_items?.name ?? "Item",
      quantity: i.quantity,
      unitPrice: i.unit_price,
      modifiers: (i.order_item_modifiers ?? []).map((m: any) => m.modifier_name),
      lineTotal: i.line_total,
    })),
    subtotal: data.subtotal,
    discountAmount: data.discount_amount ?? 0,
    cgstAmount: data.cgst_amount ?? 0,
    sgstAmount: data.sgst_amount ?? 0,
    serviceCharge: data.service_charge ?? 0,
    totalAmount: data.total_amount,
    paymentMethod: o?.payments?.[0]?.payment_method ?? "CASH",
    paidAt: data.issued_at,
    currencyCode: r?.currency_code ?? "INR",
    customerPhone: c?.opt_in_whatsapp ? phone : undefined,
    customerEmail: c?.opt_in_email ? email : undefined,
  };
}

export default app;
