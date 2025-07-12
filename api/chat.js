export default async function handler(req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Only POST allowed' });
    }
  
    try {
      const { prompt } = req.body;
  
      if (!prompt || typeof prompt !== 'string') {
        console.error('❌ Invalid prompt:', prompt);
        return res.status(400).json({ error: 'Invalid prompt' });
      }
  
      if (!process.env.OPENAI_API_KEY) {
        console.error('❌ Missing OPENAI_API_KEY');
        return res.status(500).json({ error: 'Missing OpenAI API Key in env' });
      }
  
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: prompt },
          ],
        }),
      });
  
      const data = await response.json();
  
      if (!response.ok) {
        console.error('❌ OpenAI API Error:', data);
        return res.status(500).json({ error: data });
      }
  
      res.status(200).json(data);
    } catch (err) {
      console.error('❌ Server Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  }
  