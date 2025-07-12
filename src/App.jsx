import React, { useEffect, useState } from 'react';
import { database } from './firebase';
import { ref, set, onValue } from 'firebase/database';
import debounce from 'lodash.debounce';

export default function App() {
  const [laptopClipboard, setLaptopClipboard] = useState('');
  const [phoneClipboard, setPhoneClipboard] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const clipboardRef = ref(database, 'clipboard');
    onValue(clipboardRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setLaptopClipboard(data.laptop || '');
        setPhoneClipboard(data.phone || '');
      }
    });
  }, []);

  const updateClipboard = debounce((laptop, phone) => {
    set(ref(database, 'clipboard'), { laptop, phone });
  }, 0);

  const saveClipboardNow = (laptop, phone) => {
    set(ref(database, 'clipboard'), { laptop, phone });
  };

  const handleLaptopChange = (e) => {
    const value = e.target.value;
    setLaptopClipboard(value);
    updateClipboard(value, phoneClipboard);
  };

  const handlePhoneChange = (e) => {
    const value = e.target.value;
    setPhoneClipboard(value);
    updateClipboard(laptopClipboard, value);
  };

  const manualSave = () => {
    saveClipboardNow(laptopClipboard, phoneClipboard);
  };

  const askAI = async () => {
    if (!aiPrompt.trim()) return;
    setIsLoading(true);
    setAiResponse('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt }),
      });

      const data = await res.json();
      const message = data.choices?.[0]?.message?.content || '⚠️ No response from AI.';
      setAiResponse(message);
    } catch (err) {
      setAiResponse('❌ Failed to contact DeepSeek.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif', maxWidth: 600, margin: 'auto' }}>
      <h2>Laptop Clipboard</h2>
      <textarea
        rows="10"
        style={{ width: '100%' }}
        value={laptopClipboard}
        onChange={handleLaptopChange}
      />
      <div style={{ marginTop: '0.5rem' }}>
        <button onClick={() => navigator.clipboard.writeText(laptopClipboard)}>Copy</button>
        <button onClick={manualSave}>Save</button>
        <button
          onClick={() => {
            setLaptopClipboard('');
            saveClipboardNow('', phoneClipboard);
          }}
          style={{ marginLeft: '1rem', backgroundColor: '#dc3545' }}
        >
          🧹 Clear
        </button>
      </div>

      <h2 style={{ marginTop: '2rem' }}>Gigi's Phone Clipboard</h2>
      <textarea
        rows="10"
        style={{ width: '100%' }}
        value={phoneClipboard}
        onChange={handlePhoneChange}
      />
      <div style={{ marginTop: '0.5rem' }}>
        <button onClick={() => navigator.clipboard.writeText(phoneClipboard)}>Copy</button>
        <button onClick={manualSave}>Save</button>
        <button
          onClick={() => {
            setPhoneClipboard('');
            saveClipboardNow(laptopClipboard, '');
          }}
          style={{ marginLeft: '1rem', backgroundColor: '#dc3545' }}
        >
          🧹 Clear
        </button>
      </div>

      {/* 👇 DeepSeek AI Integration */}
      <div style={{ marginTop: '3rem', padding: '1rem', backgroundColor: '#f3f3f3', borderRadius: '8px' }}>
        <h3>🤖 Ask DeepSeek (Hugging Face)</h3>
        <textarea
          rows="3"
          placeholder="Type your question here..."
          style={{ width: '100%' }}
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
        />
        <button onClick={askAI} style={{ marginTop: '0.5rem' }}>
          {isLoading ? 'Thinking...' : 'Ask AI'}
        </button>

        {aiResponse && (
          <div
            style={{
              marginTop: '1rem',
              whiteSpace: 'pre-wrap',
              background: '#fff',
              padding: '1rem',
              borderRadius: '6px',
              border: '1px solid #ccc',
            }}
          >
            <strong>AI Response:</strong>
            <p>{aiResponse}</p>
          </div>
        )}
      </div>
    </div>
  );
}
