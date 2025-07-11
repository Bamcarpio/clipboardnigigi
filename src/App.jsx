import React, { useEffect, useState } from 'react';
import { database } from './firebase';
import { ref, set, onValue } from 'firebase/database';
import debounce from 'lodash.debounce';

export default function App() {
  const [laptopClipboard, setLaptopClipboard] = useState('');
  const [phoneClipboard, setPhoneClipboard] = useState('');

  // Load initial data
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

  // Debounced sync on input
  const updateClipboard = debounce((laptop, phone) => {
    set(ref(database, 'clipboard'), { laptop, phone });
  }, 500);

  // Instant sync (for Clear buttons)
  const saveClipboardNow = (laptop, phone) => {
    set(ref(database, 'clipboard'), { laptop, phone });
  };

  // Input handlers
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
        <button onClick={manualSave}> Save</button>
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

      <h2 style={{ marginTop: '2rem' }}>📱 Gigi's Phone Clipboard</h2>
      <textarea
        rows="10"
        style={{ width: '100%' }}
        value={phoneClipboard}
        onChange={handlePhoneChange}
      />
      <div style={{ marginTop: '0.5rem' }}>
        <button onClick={() => navigator.clipboard.writeText(phoneClipboard)}> Copy</button>
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
    </div>
  );
}
