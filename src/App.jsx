import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import app from './firebase';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getDatabase, ref, set, onValue } from 'firebase/database';
import debounce from 'lodash.debounce';
import LoginPage from './LoginPage';

const App = () => {
  // --- Authentication States ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // --- Helper Tool States ---
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  // --- Clipboard States ---
  const [laptopClipboard, setLaptopClipboard] = useState('');
  const [phoneClipboard, setPhoneClipboard] = useState('');

  // --- Firebase States ---
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);

  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
  const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
  const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

  // --- Firebase Initialization and Authentication ---
  useEffect(() => {
    try {
      const authInstance = getAuth(app);
      const dbInstance = getDatabase(app);
      setAuth(authInstance);
      setDb(dbInstance);
      const unsubscribe = onAuthStateChanged(authInstance, (user) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthenticated(true);
        } else {
          setUserId(null);
          setIsAuthenticated(false);
        }
        setLoadingAuth(false);
      });
      return () => unsubscribe();
    } catch (error) {
      console.error("Firebase initialization failed:", error);
      setLoadingAuth(false);
    }
  }, []);

  // --- Clipboard Firebase Data Listener ---
  useEffect(() => {
    if (!db || !userId || !isAuthenticated) return;
    const clipboardPath = `artifacts/${appId}/users/${userId}/clipboard`;
    const clipboardRef = ref(db, clipboardPath);
    const unsubscribe = onValue(clipboardRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setLaptopClipboard(data.laptop || '');
        setPhoneClipboard(data.phone || '');
      } else {
        setLaptopClipboard('');
        setPhoneClipboard('');
      }
    }, (error) => {
      console.error("Error fetching clipboard data:", error);
    });
    return () => unsubscribe();
  }, [db, userId, appId, isAuthenticated]);

  const updateClipboardDebounced = useCallback(
    debounce((laptop, phone) => {
      if (db && userId && isAuthenticated) {
        const clipboardPath = `artifacts/${appId}/users/${userId}/clipboard`;
        set(ref(db, clipboardPath), { laptop, phone })
          .catch(error => console.error("Error writing clipboard data (debounced):", error));
      }
    }, 500),
    [db, userId, appId, isAuthenticated]
  );

  const saveClipboardNow = useCallback((laptop, phone) => {
    if (db && userId && isAuthenticated) {
      const clipboardPath = `artifacts/${appId}/users/${userId}/clipboard`;
      set(ref(db, clipboardPath), { laptop, phone })
        .catch(error => console.error("Error writing clipboard data (immediate):", error));
    }
  }, [db, userId, appId, isAuthenticated]);

  const handleLaptopChange = (e) => {
    const value = e.target.value;
    setLaptopClipboard(value);
    updateClipboardDebounced(value, phoneClipboard);
  };

  const handlePhoneChange = (e) => {
    const value = e.target.value;
    setPhoneClipboard(value);
    updateClipboardDebounced(laptopClipboard, value);
  };

  const handleCopyClipboardText = (textToCopy) => {
    const el = document.createElement('textarea');
    el.value = textToCopy;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand('copy');
      console.log('Text copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy text: ', err);
    } finally {
      document.body.removeChild(el);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (input.trim() === '') return;
    const userMessage = { text: input, sender: 'user' };
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setInput('');
    const typingIndicator = { text: 'Supa Bam Tool is typing...', sender: 'tool', id: 'typing' };
    setMessages((prevMessages) => [...prevMessages, typingIndicator]);
    let toolResponseText = "I'm not sure how to respond to that.";
    try {
      const apiUrl = `/api/ask`;
      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: input }] });
      const payload = { contents: chatHistory };
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: input })
      });
      const result = await response.json();
      if (result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
        toolResponseText = result.candidates[0].content.parts[0].text;
      } else {
        console.warn('Intelligent Tool API response structure unexpected:', result);
        toolResponseText = "I received an empty response from the intelligent tool. Please try again.";
      }
      setMessages((prevMessages) =>
        prevMessages
          .filter((msg) => msg.id !== 'typing')
          .concat({ text: toolResponseText, sender: 'tool' })
      );
    } catch (error) {
      console.error('Error fetching tool response:', error);
      setMessages((prevMessages) =>
        prevMessages
          .filter((msg) => msg.id !== 'typing')
          .concat({ text: "Oops! Something went wrong while connecting to the intelligent processing unit. Please try again.", sender: 'tool' })
      );
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const renderMessageContent = (messageText) => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = codeBlockRegex.exec(messageText)) !== null) {
      const [fullMatch, language, codeContent] = match;
      const preCodeText = messageText.substring(lastIndex, match.index);
      if (preCodeText) {
        preCodeText.split('\n').forEach((line, i) => {
          if (line.trim() !== '') {
            parts.push(<p key={`text-${lastIndex}-${i}`}>{line}</p>);
          }
        });
      }
      parts.push(
        <div key={`code-${match.index}`} className="relative my-2">
          <pre className="bg-gray-700 text-white p-3 rounded-md overflow-x-auto text-sm">
            <code className={`language-${language || 'plaintext'}`}>{codeContent}</code>
          </pre>
          <button
            onClick={() => handleCopyClipboardText(codeContent)}
            className="absolute top-2 right-2 bg-gray-600 hover:bg-gray-500 text-white text-xs px-2 py-1 rounded-md transition duration-200 ease-in-out"
            title="Copy code"
          >
            Copy
          </button>
        </div>
      );
      lastIndex = match.index + fullMatch.length;
    }
    const remainingText = messageText.substring(lastIndex);
    if (remainingText) {
      remainingText.split('\n').forEach((line, i) => {
        if (line.trim() !== '') {
          parts.push(<p key={`text-${lastIndex}-${i}`}>{line}</p>);
        }
      });
    }
    return parts;
  };

  const handleLogout = async () => {
    if (auth) {
      try {
        await signOut(auth);
      } catch (error) {
        console.error("Error logging out:", error);
      }
    }
  };

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-gray-300 text-lg">Lets goooooo!!</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 font-sans antialiased">
      <div className="flex flex-col md:flex-row w-full max-w-6xl mx-auto bg-gray-800 rounded-xl shadow-2xl overflow-hidden">
        
        {/*
          Clipboard Section: On small screens, it's at the top. On medium and larger screens,
          it's on the left.
        */}
        <div className="p-4 bg-gray-800 border-b md:border-b-0 md:border-r border-gray-700 md:w-1/2">
          <h3 className="text-lg font-semibold text-gray-200 mb-2">Laptop Clipboard</h3>
          <textarea
            rows="3"
            className="w-full p-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 ease-in-out resize-y bg-gray-700 text-gray-100"
            value={laptopClipboard}
            onChange={handleLaptopChange}
            placeholder="Type or paste text here..."
          />
          <div className="mt-2 flex space-x-2">
            <button
              onClick={() => handleCopyClipboardText(laptopClipboard)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 ease-in-out"
            >
              Copy
            </button>
            <button
              onClick={() => saveClipboardNow(laptopClipboard, phoneClipboard)}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition duration-200 ease-in-out"
            >
              Save
            </button>
            <button
              onClick={() => {
                setLaptopClipboard('');
                saveClipboardNow('', phoneClipboard);
              }}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition duration-200 ease-in-out"
            >
              Clear
            </button>
          </div>
          <h3 className="text-lg font-semibold text-gray-200 mt-4 mb-2">Gigi's Phone Clipboard</h3>
          <textarea
            rows="3"
            className="w-full p-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 ease-in-out resize-y bg-gray-700 text-gray-100"
            value={phoneClipboard}
            onChange={handlePhoneChange}
            placeholder="Type or paste text here..."
          />
          <div className="mt-2 flex space-x-2">
            <button
              onClick={() => handleCopyClipboardText(phoneClipboard)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 ease-in-out"
            >
              Copy
            </button>
            <button
              onClick={() => saveClipboardNow(laptopClipboard, phoneClipboard)}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition duration-200 ease-in-out"
            >
              Save
            </button>
            <button
              onClick={() => {
                setPhoneClipboard('');
                saveClipboardNow(laptopClipboard, '');
              }}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition duration-200 ease-in-out"
            >
              Clear
            </button>
          </div>
        </div>
        
        {/*
          AI Chat Section: On small screens, it's at the bottom. On medium and larger screens,
          it's on the right.
        */}
        <div className="flex flex-col md:w-1/2">
          <div className="bg-gradient-to-r from-blue-800 to-indigo-900 text-white p-4 text-center text-2xl font-semibold rounded-t-xl md:rounded-tr-xl md:rounded-tl-none shadow-md">
            Supa Bam Tool for Adine
            {userId && (
              <div className="text-sm mt-1 opacity-80">
                {/* Optional user info */}
              </div>
            )}
            <button
              onClick={handleLogout}
              className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md transition duration-200 ease-in-out"
            >
              Logout
            </button>
          </div>
          <div className="flex-1 p-4 overflow-y-auto h-96 custom-scrollbar bg-gray-700">
            {messages.length === 0 && (
              <div className="text-center text-gray-400 mt-10">
                {/* Chat welcome message */}
              </div>
            )}
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`flex mb-3 ${
                  msg.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[85%] p-3 rounded-lg shadow-sm ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-gray-600 text-gray-100 rounded-bl-none'
                  }`}
                >
                  {renderMessageContent(msg.text)}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-4 bg-gray-800 border-t border-gray-700 flex items-center rounded-b-xl md:rounded-bl-xl md:rounded-br-none">
            <textarea
              className="flex-1 p-3 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 ease-in-out resize-none h-12 overflow-hidden bg-gray-700 text-gray-100"
              placeholder=""
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = (e.target.scrollHeight) + 'px';
              }}
              onKeyPress={handleKeyPress}
              rows={1}
            ></textarea>
            <button
              onClick={handleSendMessage}
              className="ml-3 px-5 py-3 bg-blue-700 text-white rounded-full hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-200 ease-in-out shadow-lg transform hover:scale-105"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;