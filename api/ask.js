export default async function handler(req, res) {
  // 💡 NEW: The front-end now sends a 'contents' array, not a 'prompt' string.
  const { contents } = req.body;

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + process.env.GEMINI_API_KEY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // 💡 NEW: Send the 'contents' array directly to the Gemini API.
      body: JSON.stringify({
        contents: contents
      })
    });

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error("API Proxy Error:", error);
    res.status(500).json({ error: "Failed to fetch response." });
  }
}