export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-admin-pin");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ADMIN_PANEL_PIN = process.env.ADMIN_PANEL_PIN || "0715";

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      ok: false,
      error: "Missing server environment variables."
    });
  }

  const pin = req.headers["x-admin-pin"];
  if (pin !== ADMIN_PANEL_PIN) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized admin request."
    });
  }

  async function sb(path, options = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(options.headers || {})
      }
    });

    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      throw new Error(
        typeof data === "object" && data?.message
          ? data.message
          : typeof data === "object" && data?.error
          ? data.error
          : `Supabase request failed (${response.status})`
      );
    }

    return data;
  }

  function clean(value) {
    return String(value ?? "").trim();
  }

  function calcAmount(plan, period) {
    const pricing = {
      basic: { trial: 0, daily: 15, monthly: 299, lifetime: 1999 },
      business: { daily: 25, monthly: 499, lifetime: 3499 },
      pro: { daily: 40, monthly: 799, lifetime: 5499 }
    };

    return pricing?.[plan]?.[period] ?? null;
  }

  function calcExpiry(period) {
    const d = new Date();

    if (period === "trial") {
      d.setDate(d.getDate() + 7);
      return d.toISOString();
    }
    if (period === "daily") {
      d.setDate(d.getDate() + 1);
      return d.toISOString();
    }
    if (period === "monthly") {
      d.setMonth(d.getMonth() + 1);
      return d.toISOString();
    }
    if (period === "lifetime") {
      return null;
    }

    return null;
  }

  function generateLicenseKey() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const groups = [4, 4, 4, 4];
    return groups
      .map((len) =>
        Array.from(
          { length: len },
          () => chars[Math.floor(Math.random() * chars.length)]
        ).join("")
      )
      .join("-");
  }

  async function getOrderById(id) {
    const rows = await sb(`orders?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }

  async function createLicenseFromOrder(order) {
    const customer_name = clean(order.customer_name || order.name);
    const customer_email = clean(order.customer_email || order.email);
    const customer_phone = clean(order.customer_phone || order.phone);
    const plan = clean(order.plan).toLowerCase();
    const period = clean(order.period).toLowerCase();
    const payment_method = clean(order.payment_method || "GCash");
    const reference_number = clean(order.reference_number);
    const notes = clean(order.notes);
    const amount =
      order.amount !== undefined && order.amount !== null && order.amount !== ""
        ? String(order.amount)
        : String(calcAmount(plan, period) ?? "");

    const validPlans = ["basic", "business", "pro", "custom"];
    const validPeriods = ["trial", "daily", "monthly", "lifetime"];

    if (!customer_name || !customer_email || !plan || !period) {
      throw new Error("Order is missing required fields for license creation.");
    }

    if (!validPlans.includes(plan) || !validPeriods.includes(period)) {
      throw new Error("Invalid plan or period in order.");
    }

    if (period === "trial" && plan !== "basic") {
      throw new Error("Trial is only allowed for Basic plan.");
    }

    const expires_at = calcExpiry(period);
    const license_key = generateLicenseKey();

    const insertedLicenses = await sb("licenses", {
      method: "POST",
      body: JSON.stringify([
        {
          customer_name,
          customer_email,
          customer_phone,
          plan,
          period,
          amount,
          payment_method,
          notes,
          license_key,
          status: "active",
          activated_at: new Date().toISOString(),
          expires_at
        }
      ])
    });

    const license = insertedLicenses?.[0] || null;

    if (!license) {
      throw new Error("Failed to create license.");
    }

    await sb("payments", {
      method: "POST",
      body: JSON.stringify([
        {
          license_id: license.id,
          amount,
          method: payment_method,
          reference_number,
          verified: true,
          verified_at: new Date().toISOString()
        }
      ])
    });

    await sb(`orders?id=eq.${encodeURIComponent(order.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" })
    });

    return license;
  }

  try {
    if (req.method === "GET") {
      const mode = req.query.mode || "dashboard";

      if (mode === "dashboard") {
        const [licenses, orders, payments] = await Promise.all([
          sb("licenses?select=*&order=created_at.desc"),
          sb("orders?select=*&order=created_at.desc"),
          sb("payments?select=*&order=created_at.desc")
        ]);

        return res.status(200).json({
          ok: true,
          dashboard: {
            licenses: licenses || [],
            orders: orders || [],
            payments: payments || []
          }
        });
      }

      if (mode === "licenses") {
        const licenses = await sb("licenses?select=*&order=created_at.desc");
        return res.status(200).json({ ok: true, licenses: licenses || [] });
      }

      if (mode === "orders") {
        const orders = await sb("orders?select=*&order=created_at.desc");
        return res.status(200).json({ ok: true, orders: orders || [] });
      }

      if (mode === "payments") {
        const payments = await sb("payments?select=*&order=created_at.desc");
        return res.status(200).json({ ok: true, payments: payments || [] });
      }

      return res.status(400).json({
        ok: false,
        error: "Invalid GET mode."
      });
    }

    if (req.method === "POST") {
      const action = req.body?.action;

      if (action === "create_license") {
        const customer_name = clean(req.body.customer_name);
        const customer_email = clean(req.body.customer_email);
        const customer_phone = clean(req.body.customer_phone);
        const plan = clean(req.body.plan).toLowerCase();
        const period = clean(req.body.period).toLowerCase();
        const payment_method = clean(req.body.payment_method || "Cash");
        const notes = clean(req.body.notes);
        const amount =
          req.body.amount !== undefined && req.body.amount !== null && req.body.amount !== ""
            ? String(req.body.amount)
            : String(calcAmount(plan, period) ?? "");

        const validPlans = ["basic", "business", "pro", "custom"];
        const validPeriods = ["trial", "daily", "monthly", "lifetime"];

        if (!customer_name || !customer_email || !plan || !period) {
          return res.status(400).json({
            ok: false,
            error: "Missing required fields."
          });
        }

        if (!validPlans.includes(plan) || !validPeriods.includes(period)) {
          return res.status(400).json({
            ok: false,
            error: "Invalid plan or period."
          });
        }

        if (period === "trial" && plan !== "basic") {
          return res.status(400).json({
            ok: false,
            error: "Trial is only allowed for Basic plan."
          });
        }

        const expires_at = calcExpiry(period);
        const license_key = generateLicenseKey();

        const inserted = await sb("licenses", {
          method: "POST",
          body: JSON.stringify([
            {
              customer_name,
              customer_email,
              customer_phone,
              plan,
              period,
              amount,
              payment_method,
              notes,
              license_key,
              status: "active",
              activated_at: new Date().toISOString(),
              expires_at
            }
          ])
        });

        return res.status(200).json({
          ok: true,
          license: inserted?.[0] || null
        });
      }

      if (action === "verify_order") {
        const id = clean(req.body.id);

        if (!id) {
          return res.status(400).json({
            ok: false,
            error: "Missing order id."
          });
        }

        const order = await getOrderById(id);

        if (!order) {
          return res.status(404).json({
            ok: false,
            error: "Order not found."
          });
        }

        if (String(order.status || "").toLowerCase() !== "pending") {
          return res.status(400).json({
            ok: false,
            error: "Only pending orders can be verified."
          });
        }

        const license = await createLicenseFromOrder(order);

        return res.status(200).json({
          ok: true,
          order_id: id,
          license
        });
      }

      if (action === "reject_order") {
        const id = clean(req.body.id);

        if (!id) {
          return res.status(400).json({
            ok: false,
            error: "Missing order id."
          });
        }

        const updated = await sb(`orders?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "rejected" })
        });

        return res.status(200).json({
          ok: true,
          order: updated?.[0] || null
        });
      }

      if (action === "update_order_status") {
        const id = clean(req.body.id);
        const status = clean(req.body.status);

        if (!id || !status) {
          return res.status(400).json({
            ok: false,
            error: "Missing order id or status."
          });
        }

        const updated = await sb(`orders?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status })
        });

        return res.status(200).json({
          ok: true,
          order: updated?.[0] || null
        });
      }

      if (action === "record_payment") {
        const license_id = clean(req.body.license_id);
        const amount = clean(req.body.amount);
        const method = clean(req.body.method);
        const reference_number = clean(req.body.reference_number);

        if (!license_id || !amount || !method) {
          return res.status(400).json({
            ok: false,
            error: "Missing payment fields."
          });
        }

        const inserted = await sb("payments", {
          method: "POST",
          body: JSON.stringify([
            {
              license_id,
              amount,
              method,
              reference_number,
              verified: true,
              verified_at: new Date().toISOString()
            }
          ])
        });

        return res.status(200).json({
          ok: true,
          payment: inserted?.[0] || null
        });
      }

      return res.status(400).json({
        ok: false,
        error: "Invalid action."
      });
    }

    return res.status(405).json({
      ok: false,
      error: "Method not allowed."
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Server error."
    });
  }
}
