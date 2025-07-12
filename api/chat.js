export default async function handler(req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Only POST allowed' });
    }
  
    const { prompt } = req.body;
  
    try {
      const response = await fetch('https://api-inference.huggingface.co/models/deepseek-ai/deepseek-coder-6.7b-instruct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        },
        body: JSON.stringify({
          inputs: prompt,
        }),
      });
  
      const data = await response.json();
  
      if (data.error) {
        console.error('❌ DeepSeek API Error:', data);
        return res.status(500).json({ error: data.error });
      }
  
      const generatedText = data[0]?.generated_text || '⚠️ No response';
      res.status(200).json({ choices: [{ message: { content: generatedText } }] });
  
    } catch (err) {
      console.error('❌ Server error:', err);
      res.status(500).json({ error: err.message });
    }
  }
  