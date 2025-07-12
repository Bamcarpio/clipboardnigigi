export default async function handler(req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Only POST allowed' });
    }
  
    const { prompt } = req.body;
  
    try {
      const response = await fetch(
        'https://api-inference.huggingface.co/models/deepseek-ai/deepseek-coder-6.7b-instruct',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          },
          body: JSON.stringify({ inputs: prompt }),
        }
      );
  
      const data = await response.json();
  
      if (data.error) {
        return res.status(500).json({ error: data.error });
      }
  
      const message = data[0]?.generated_text || '⚠️ No response';
      res.status(200).json({ choices: [{ message: { content: message } }] });
    } catch (error) {
      res.status(500).json({ error: 'Server error' });
    }
  }
  