export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        success: false,
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Vercel"
      });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    const customer_name = String(body.customer_name || "").trim();
    const customer_email = String(body.customer_email || "").trim();
    const customer_phone = String(body.customer_phone || "").trim();
    const plan = String(body.plan || "").trim().toLowerCase();
    const period = String(body.period || "").trim().toLowerCase();
    const amount = body.amount !== undefined && body.amount !== null ? String(body.amount).trim() : "";
    const payment_method = String(body.payment_method || "").trim();
    const reference_number = String(body.reference_number || "").trim();
    const notes = String(body.notes || "").trim();
    const screenshot_data = body.screenshot_data || null;

    const validPlans = ["basic", "business", "pro", "custom"];
    const validPeriods = ["daily", "monthly", "lifetime", "trial"];

    if (!customer_name) {
      return res.status(400).json({
        success: false,
        error: "Customer name is required"
      });
    }

    if (!customer_email) {
      return res.status(400).json({
        success: false,
        error: "Customer email is required"
      });
    }

    if (!validPlans.includes(plan)) {
      return res.status(400).json({
        success: false,
        error: "Invalid plan"
      });
    }

    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        success: false,
        error: "Invalid period"
      });
    }

    if (period === "trial" && plan !== "basic") {
      return res.status(400).json({
        success: false,
        error: "Trial is only allowed for Basic plan"
      });
    }

    const pricing = {
      basic: {
        daily: "15",
        monthly: "299",
        lifetime: "1999",
        trial: "0"
      },
      business: {
        daily: "25",
        monthly: "499",
        lifetime: "3499"
      },
      pro: {
        daily: "40",
        monthly: "799",
        lifetime: "5499"
      },
      custom: {
        daily: "0",
        monthly: "0",
        lifetime: "0",
        trial: "0"
      }
    };

    const finalAmount = amount || pricing[plan]?.[period] || "0";

    const orderPayload = {
      customer_name,
      customer_email,
      customer_phone: customer_phone || null,
      plan,
      period,
      amount: finalAmount,
      payment_method: payment_method || null,
      reference_number: reference_number || null,
      screenshot_data,
      status: "pending",
      notes: notes || null,
      created_at: new Date().toISOString()
    };

    const response = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(orderPayload)
    });

    const text = await response.text();
    let data;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: "Failed to save order to Supabase",
        details: data
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order submitted successfully",
      order: Array.isArray(data) ? data[0] : data
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Server error",
      details: error.message
    });
  }
}
