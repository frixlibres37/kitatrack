export default async function handler(req, res) {
  // allow only POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body;

    // basic validation
    if (!body.customer_name || !body.plan) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 👉 TODO: connect to Supabase later
    console.log("New Order:", body);

    return res.status(200).json({
      success: true,
      message: "Order received",
    });

  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      details: err.message,
    });
  }
}
