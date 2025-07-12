import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app'; // Make sure this import is here
import app from './firebase'; // Your Firebase app instance
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth'; // Added signOut
import { getDatabase, ref, set, onValue } from 'firebase/database';
import debounce from 'lodash.debounce';
import LoginPage from './LoginPage'; // Import the new LoginPage component

// Main App component for the chatbot with integrated clipboard
const App = () => {
  // --- Authentication States ---
  const [isAuthenticated, setIsAuthenticated] = useState(false); // Tracks if a user is logged in
  const [loadingAuth, setLoadingAuth] = useState(true); // To show a loading indicator during auth check

  // --- Chatbot States ---
  const [messages, setMessages] = useState([]); // Stores chat messages
  const [input, setInput] = useState(''); // Current chat input value
  const messagesEndRef = useRef(null); // Ref for auto-scrolling chat

  // --- Clipboard States ---
  const [laptopClipboard, setLaptopClipboard] = useState(''); // Content for laptop clipboard
  const [phoneClipboard, setPhoneClipboard] = useState(''); // Content for phone clipboard

  // --- Firebase States ---
  const [db, setDb] = useState(null); // Firebase Realtime Database instance
  const [auth, setAuth] = useState(null); // Firebase Auth instance
  const [userId, setUserId] = useState(null); // Current user ID
  // isAuthReady is no longer strictly needed as isAuthenticated covers the main app logic

  // Global variables provided by the Canvas environment
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
          // User is signed in.
          setUserId(user.uid);
          setIsAuthenticated(true);
        } else {
          // No user is signed in.
          setUserId(null);
          setIsAuthenticated(false);
        }
        setLoadingAuth(false); // Auth check complete
      });

      return () => unsubscribe(); // Cleanup the listener
    } catch (error) {
      console.error("Firebase initialization failed:", error);
      setLoadingAuth(false); // Stop loading even if there's an error
    }
  }, []);

  // --- Clipboard Firebase Data Listener ---
  useEffect(() => {
    // Only fetch clipboard data if authenticated and Firebase instances are ready
    if (!db || !userId || !isAuthenticated) return;

    const clipboardPath = `artifacts/${appId}/users/${userId}/clipboard`;
    const clipboardRef = ref(db, clipboardPath);

    const unsubscribe = onValue(clipboardRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setLaptopClipboard(data.laptop || '');
        setPhoneClipboard(data.phone || '');
      } else {
        // If no data, initialize with empty strings
        setLaptopClipboard('');
        setPhoneClipboard('');
      }
    }, (error) => {
      console.error("Error fetching clipboard data:", error);
    });

    return () => unsubscribe(); // Cleanup listener on unmount
  }, [db, userId, appId, isAuthenticated]); // Re-run if db, userId, or isAuthenticated changes

  // Debounced function to update clipboard in Firebase
  const updateClipboardDebounced = useCallback(
    debounce((laptop, phone) => {
      if (db && userId && isAuthenticated) { // Only save if authenticated
        const clipboardPath = `artifacts/${appId}/users/${userId}/clipboard`;
        set(ref(db, clipboardPath), { laptop, phone })
          .catch(error => console.error("Error writing clipboard data (debounced):", error));
      }
    }, 500), // Debounce by 500ms
    [db, userId, appId, isAuthenticated]
  );

  // Immediate save function for clipboard (e.g., on manual save button click)
  const saveClipboardNow = useCallback((laptop, phone) => {
    if (db && userId && isAuthenticated) { // Only save if authenticated
      const clipboardPath = `artifacts/${appId}/users/${userId}/clipboard`;
      set(ref(db, clipboardPath), { laptop, phone })
        .catch(error => console.error("Error writing clipboard data (immediate):", error));
    }
  }, [db, userId, appId, isAuthenticated]);

  // --- Clipboard Handlers ---
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
    el.style.left = '-9999px'; // Move out of screen
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand('copy');
      console.log('Text copied to clipboard!');
      // TODO: Add a small visual feedback (e.g., "Copied!") next to the button
    } catch (err) {
      console.error('Failed to copy text: ', err);
    } finally {
      document.body.removeChild(el);
    }
  };

  // --- Chatbot Functions ---
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Effect to scroll to bottom whenever messages update.
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  /**
   * Handles sending a message.
   * Adds the user's message to the chat and then simulates a bot response.
   */
  const handleSendMessage = async () => {
    if (input.trim() === '') return; // Don't send empty messages

    const userMessage = { text: input, sender: 'user' };
    // Add user message to the chat
    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setInput(''); // Clear the input field

    // Simulate a typing indicator while waiting for a response
    const typingIndicator = { text: 'Bam Bot is typing...', sender: 'bot', id: 'typing' };
    setMessages((prevMessages) => [...prevMessages, typingIndicator]);

    let botResponseText = "I'm not sure how to respond to that."; // Default fallback

    try {
      // Gemini API Integration Example
      // The API key will be provided by the Canvas environment
      const apiKey = "AIzaSyDCVbaHWAiInuahgACa9oRddPDA9YbTZyE"; // Leave this as an empty string; Canvas will inject the key at runtime
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: input }] });
      const payload = { contents: chatHistory };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
        result.candidates[0].content && result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0) {
        botResponseText = result.candidates[0].content.parts[0].text;
      } else {
        console.warn('Gemini API response structure unexpected:', result);
        botResponseText = "I received an empty response from the AI. Please try again.";
      }

      // Remove the typing indicator and add the actual bot response
      setMessages((prevMessages) =>
        prevMessages
          .filter((msg) => msg.id !== 'typing') // Remove typing indicator
          .concat({ text: botResponseText, sender: 'bot' }) // Add bot's actual response
      );
    } catch (error) {
      console.error('Error fetching bot response:', error);
      setMessages((prevMessages) =>
        prevMessages
          .filter((msg) => msg.id !== 'typing')
          .concat({ text: "Oops! Something went wrong while connecting to the AI. Please try again.", sender: 'bot' })
      );
    }
  };

  // Handles key presses in the input field, specifically for 'Enter' to send messages.
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { // Allow Shift+Enter for new line
      e.preventDefault(); // Prevent default Enter behavior (new line)
      handleSendMessage();
    }
  };

  // Helper function to render message content, handling code blocks
  const renderMessageContent = (messageText) => {
    // Regex to find code blocks (lines starting with ``` followed by optional language)
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(messageText)) !== null) {
      const [fullMatch, language, codeContent] = match;
      const preCodeText = messageText.substring(lastIndex, match.index);

      if (preCodeText) {
        // Split preCodeText by newlines to render as paragraphs
        preCodeText.split('\n').forEach((line, i) => {
          if (line.trim() !== '') {
            parts.push(<p key={`text-${lastIndex}-${i}`}>{line}</p>);
          }
        });
      }

      parts.push(
        <div key={`code-${match.index}`} className="relative my-2">
          <pre className="bg-gray-700 text-white p-3 rounded-md overflow-x-auto text-sm"> {/* Darker code block background */}
            <code className={`language-${language || 'plaintext'}`}>{codeContent}</code>
          </pre>
          <button
            onClick={() => handleCopyClipboardText(codeContent)} // Use the unified copy function
            className="absolute top-2 right-2 bg-gray-600 hover:bg-gray-500 text-white text-xs px-2 py-1 rounded-md transition duration-200 ease-in-out" // Adjusted hover color
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
      // Split remainingText by newlines to render as paragraphs
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
        // setIsAuthenticated will be set to false by onAuthStateChanged listener
      } catch (error) {
        console.error("Error logging out:", error);
      }
    }
  };

  // --- Conditional Rendering ---
  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center"> {/* Darker background */}
        <p className="text-gray-300 text-lg">Lets goooooo!!</p> {/* Lighter text */}
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // If authenticated, render the main app
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 font-sans antialiased"> {/* Darker background */}
      <div className="flex flex-col w-full max-w-xl mx-auto bg-gray-800 rounded-xl shadow-2xl overflow-hidden"> {/* Darker main container */}
        {/* Chat Header */}
        <div className="bg-gradient-to-r from-blue-800 to-indigo-900 text-white p-4 text-center text-2xl font-semibold rounded-t-xl shadow-md"> {/* Darker gradient */}
          Supa Bam Bot for Adine
          {userId && (
            <div className="text-sm mt-1 opacity-80">
              
            </div>
          )}
          <button
            onClick={handleLogout}
            className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md transition duration-200 ease-in-out" // Slightly darker red
          >
            Logout
          </button>
        </div>

        {/* Clipboard Section */}
        <div className="p-4 bg-gray-800 border-b border-gray-700"> {/* Darker background and border */}
          <h3 className="text-lg font-semibold text-gray-200 mb-2">Laptop Clipboard</h3> {/* Lighter text */}
          <textarea
            rows="3"
            className="w-full p-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 ease-in-out resize-y bg-gray-700 text-gray-100" // Darker input, lighter text
            value={laptopClipboard}
            onChange={handleLaptopChange}
            placeholder="Type or paste text here..."
          />
          <div className="mt-2 flex space-x-2">
            <button
              onClick={() => handleCopyClipboardText(laptopClipboard)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 ease-in-out" // Darker blue
            >
              Copy
            </button>
            <button
              onClick={() => saveClipboardNow(laptopClipboard, phoneClipboard)}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition duration-200 ease-in-out" // Darker green
            >
              Save
            </button>
            <button
              onClick={() => {
                setLaptopClipboard('');
                saveClipboardNow('', phoneClipboard);
              }}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition duration-200 ease-in-out" // Darker red
            >
              Clear
            </button>
          </div>

          <h3 className="text-lg font-semibold text-gray-200 mt-4 mb-2">Gigi's Phone Clipboard</h3> {/* Lighter text */}
          <textarea
            rows="3"
            className="w-full p-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 ease-in-out resize-y bg-gray-700 text-gray-100" // Darker input, lighter text
            value={phoneClipboard}
            onChange={handlePhoneChange}
            placeholder="Type or paste text here..."
          />
          <div className="mt-2 flex space-x-2">
            <button
              onClick={() => handleCopyClipboardText(phoneClipboard)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 ease-in-out" // Darker blue
            >
              Copy
            </button>
            <button
              onClick={() => saveClipboardNow(laptopClipboard, phoneClipboard)}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition duration-200 ease-in-out" // Darker green
            >
              Save
            </button>
            <button
              onClick={() => {
                setPhoneClipboard('');
                saveClipboardNow(laptopClipboard, '');
              }}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition duration-200 ease-in-out" // Darker red
            >
              Clear
            </button>
          </div>
        </div>

        {/* Chat Messages Area */}
        <div className="flex-1 p-4 overflow-y-auto h-96 custom-scrollbar bg-gray-700"> {/* Darker chat background */}
          {messages.length === 0 && (
            <div className="text-center text-gray-400 mt-10"> {/* Lighter gray text */}
             
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
                    ? 'bg-blue-600 text-white rounded-br-none' // Darker blue user messages
                    : 'bg-gray-600 text-gray-100 rounded-bl-none' // Darker gray bot messages, lighter text
                }`}
              >
                {renderMessageContent(msg.text)}
              </div>
            </div>
          ))}
          {/* Invisible element to scroll to */}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input Area */}
        <div className="p-4 bg-gray-800 border-t border-gray-700 flex items-center rounded-b-xl"> {/* Darker input area background and border */}
          <textarea
            className="flex-1 p-3 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 ease-in-out resize-none h-12 overflow-hidden bg-gray-700 text-gray-100" // Darker input, lighter text
            placeholder=""
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto'; // Reset height
              e.target.style.height = (e.target.scrollHeight) + 'px'; // Set to scroll height
            }}
            onKeyPress={handleKeyPress}
            rows={1}
          ></textarea>
          <button
            onClick={handleSendMessage}
            className="ml-3 px-5 py-3 bg-blue-700 text-white rounded-full hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-200 ease-in-out shadow-lg transform hover:scale-105" // Darker send button
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;