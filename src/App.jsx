import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import app from './firebase';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { getDatabase, ref, set, onValue, push, remove } from 'firebase/database';
import debounce from 'lodash.debounce';
import LoginPage from './LoginPage';

// New TypingIndicator component
const TypingIndicator = () => (
    <div className="flex space-x-1 justify-center items-center bg-gray-600 text-gray-100 p-3 rounded-lg shadow-sm rounded-bl-none w-fit">
        <span className="dot animate-bounce" style={{ animationDelay: '0s' }}>.</span>
        <span className="dot animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
        <span className="dot animate-bounce" style={{ animationDelay: '0.4s' }}>.</span>
    </div>
);

const App = () => {
    // --- Page State ---
    const [currentPage, setCurrentPage] = useState('clipboard');

    // --- Authentication States ---
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loadingAuth, setLoadingAuth] = useState(true);

    // --- Helper Tool States ---
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);
    const [isTyping, setIsTyping] = useState(false);
    const [loadingChat, setLoadingChat] = useState(false);

    // --- New Conversation States ---
    const [activeConversationId, setActiveConversationId] = useState(null);
    const [allConversations, setAllConversations] = useState([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // --- Clipboard States ---
    const [laptopClipboard, setLaptopClipboard] = useState('');
    const [phoneClipboard, setPhoneClipboard] = useState('');

    // --- Firebase States ---
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

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

    // --- Conversation Data Listener (only active on the chat page) ---
    useEffect(() => {
        if (!db || !userId || !isAuthenticated || currentPage !== 'chat') return;

        setLoadingChat(true);

        const conversationsRef = ref(db, `artifacts/${appId}/users/${userId}/conversations`);
        const convUnsubscribe = onValue(conversationsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const conversationsList = Object.keys(data).map(key => ({
                    id: key,
                    ...data[key]
                })).sort((a, b) => b.createdAt - a.createdAt);
                
                setAllConversations(conversationsList);
                
                if (!activeConversationId && conversationsList.length > 0) {
                    setActiveConversationId(conversationsList[0].id);
                } else if (activeConversationId && !conversationsList.find(conv => conv.id === activeConversationId)) {
                    setActiveConversationId(conversationsList.length > 0 ? conversationsList[0].id : null);
                }
            } else {
                setAllConversations([]);
                setActiveConversationId(null);
            }
        }, (error) => {
            console.error("Error fetching all conversations:", error);
        });

        let messageUnsubscribe = () => {};
        if (activeConversationId) {
            const messagesRef = ref(db, `artifacts/${appId}/users/${userId}/conversations/${activeConversationId}/messages`);
            messageUnsubscribe = onValue(messagesRef, (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    const messagesArray = Object.values(data);
                    setMessages(messagesArray.filter(msg => msg.id !== 'typing'));
                } else {
                    setMessages([]);
                }
                setLoadingChat(false);
            }, (error) => {
                console.error("Error fetching messages:", error);
                setLoadingChat(false);
            });
        } else {
            setLoadingChat(false);
            setMessages([]);
        }

        return () => {
            convUnsubscribe();
            messageUnsubscribe();
        };
    }, [db, userId, appId, isAuthenticated, currentPage, activeConversationId]);

    // --- Clipboard Handlers ---
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

    // --- Corrected Copy function with removed alerts ---
    const handleCopyClipboardText = async (textToCopy) => {
        if (!textToCopy) {
            console.warn("Attempted to copy empty text.");
            return;
        }
        
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(textToCopy);
                console.log('Text copied to clipboard!'); 
            } catch (err) {
                console.error('Failed to copy text using Clipboard API: ', err);
                fallbackCopyTextToClipboard(textToCopy);
            }
        } else {
            fallbackCopyTextToClipboard(textToCopy);
        }
    };

    const fallbackCopyTextToClipboard = (textToCopy) => {
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
            console.error('Failed to copy text with fallback: ', err);
        } finally {
            document.body.removeChild(el);
        }
    };

    // --- Chat Tool Functions ---
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    const createNewConversation = () => {
        if (activeConversationId && messages.length === 0) {
            setIsSidebarOpen(false);
            return;
        }
        if (db && userId) {
            setLoadingChat(true);
            const newChatRef = push(ref(db, `artifacts/${appId}/users/${userId}/conversations`));
            set(newChatRef, {
                title: 'New Chat',
                createdAt: Date.now()
            }).then(() => {
                setActiveConversationId(newChatRef.key);
                setIsSidebarOpen(false);
            }).catch(error => {
                console.error("Error creating new conversation:", error);
                setLoadingChat(false);
            });
        }
    };

    const deleteConversation = (conversationId) => {
        if (db && userId && window.confirm("Are you sure you want to delete this conversation?")) {
            const chatRef = ref(db, `artifacts/${appId}/users/${userId}/conversations/${conversationId}`);
            remove(chatRef)
                .then(() => {
                    console.log("Conversation deleted successfully.");
                }).catch(error => {
                    console.error("Error deleting conversation:", error);
                });
        }
    };

    const loadConversation = (conversationId) => {
        if (activeConversationId === conversationId) {
            console.log("Conversation is already active. Skipping reload.");
            return;
        }
        setActiveConversationId(conversationId);
        setIsSidebarOpen(false);
        setLoadingChat(true);
    };

    const handleSendMessage = async () => {
        if (input.trim() === '' || !activeConversationId) return;

        const userMessage = { text: input, sender: 'user', timestamp: Date.now() };
        
        const typingIndicatorMessage = { text: '', sender: 'tool', id: 'typing' };
        setMessages((prevMessages) => [...prevMessages, userMessage, typingIndicatorMessage]);
        setInput('');
        setIsTyping(true);

        const messagesRef = ref(db, `artifacts/${appId}/users/${userId}/conversations/${activeConversationId}/messages`);
        const userMessageRef = push(messagesRef);
        set(userMessageRef, userMessage).catch(error => console.error("Error saving user message:", error));

        try {
            const apiUrl = `/api/ask`;
            const chatHistory = messages.concat(userMessage)
                .map(msg => ({
                    role: msg.sender === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.text }]
                }));
            
            const payload = { contents: chatHistory };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            
            const toolResponseText = result.candidates && result.candidates.length > 0 &&
                                    result.candidates[0].content && result.candidates[0].content.parts &&
                                    result.candidates[0].content.parts.length > 0
                                    ? result.candidates[0].content.parts[0].text
                                    : "I received an empty response from the intelligent tool. Please try again.";

            const toolMessage = { text: toolResponseText, sender: 'tool', timestamp: Date.now() };

            const toolMessageRef = push(messagesRef);
            set(toolMessageRef, toolMessage).catch(error => console.error("Error saving tool message:", error));

        } catch (error) {
            console.error('Error fetching tool response:', error);
            const errorMessage = { text: "Oops! Something went wrong...", sender: 'tool', timestamp: Date.now() };
            const errorMessageRef = push(messagesRef);
            set(errorMessageRef, errorMessage).catch(error => console.error("Error saving error message:", error));
        } finally {
            setIsTyping(false);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    // --- REWRITTEN renderMarkdown function for correct Markdown parsing ---
    const renderMarkdown = (markdownText) => {
        const elements = [];
        const lines = markdownText.split('\n');
        let inCodeBlock = false;
        let codeContent = '';
        let listItems = [];

        const flushListItems = () => {
            if (listItems.length > 0) {
                elements.push(<ul key={elements.length} className="list-disc list-inside space-y-1 my-2 ml-4">{listItems}</ul>);
                listItems = [];
            }
        };

        const renderInlineMarkdown = (text) => {
            let formattedText = text;
            formattedText = formattedText.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
            formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            formattedText = formattedText.replace(/`([^`]+)`/g, '<span class="bg-gray-700 rounded px-1 text-sm">$1</span>');
            formattedText = formattedText.replace(/_([^_]+)_/g, '<em>$1</em>');
            return formattedText;
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.trim().startsWith('```')) {
                flushListItems();
                if (inCodeBlock) {
                    elements.push(
                        <div key={`code-block-${i}`} className="relative my-2">
                            <pre className="bg-gray-700 text-white p-3 rounded-md overflow-x-auto text-sm">
                                <code className="break-words">{codeContent}</code>
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
                    codeContent = '';
                    inCodeBlock = false;
                } else {
                    inCodeBlock = true;
                }
                continue;
            }

            if (inCodeBlock) {
                codeContent += line + '\n';
                continue;
            }

            if (line.startsWith('### ')) {
                flushListItems();
                elements.push(<h3 key={`h3-${i}`} className="text-xl font-semibold text-white my-2">{line.substring(4)}</h3>);
                continue;
            }
            if (line.startsWith('## ')) {
                flushListItems();
                elements.push(<h2 key={`h2-${i}`} className="text-2xl font-bold text-white my-3">{line.substring(3)}</h2>);
                continue;
            }
            if (line.startsWith('* ') || line.startsWith('- ')) {
                let currentLine = i;
                while (currentLine < lines.length && (lines[currentLine].startsWith('* ') || lines[currentLine].startsWith('- '))) {
                    const listItemContent = lines[currentLine].substring(2);
                    listItems.push(<li key={`li-${currentLine}`} dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(listItemContent) }} />);
                    currentLine++;
                }
                elements.push(<ul key={`ul-${i}`} className="list-disc list-inside space-y-1 my-2 ml-4">{listItems}</ul>);
                i = currentLine - 1;
                continue;
            }
            if (line.trim() !== '') {
                flushListItems();
                elements.push(<p key={`p-${i}`} className="text-gray-100 my-2" dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(line) }} />);
            }
        }
        
        flushListItems();

        return elements;
    };
    
    const renderMessageContent = (messageText) => {
        if (!messageText) return null;
        return renderMarkdown(messageText);
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
        <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 font-sans antialiased">
            {currentPage === 'clipboard' ? (
                <div className="flex flex-col w-full max-w-xl mx-auto bg-gray-800 rounded-xl shadow-2xl overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-800 to-indigo-900 text-white p-4 text-center text-2xl font-semibold rounded-t-xl shadow-md">
                        Supa Bam Tool for Adine
                        <button
                            onClick={handleLogout}
                            className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md transition duration-200 ease-in-out"
                        >
                            Logout
                        </button>
                    </div>

                    <div className="p-4 bg-gray-800 border-b border-gray-700">
                        <h3 className="text-lg font-semibold text-gray-200 mb-2">Laptop Clipboard</h3>
                        <textarea
                            rows="3"
                            className="w-full p-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 ease-in-out resize-y bg-gray-700 text-gray-100"
                            value={laptopClipboard}
                            onChange={handleLaptopChange}
                            placeholder=""
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
                            placeholder=""
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
                    <div className="p-4 bg-gray-800 text-center">
                        <button
                            onClick={() => setCurrentPage('chat')}
                            className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition duration-200 ease-in-out"
                        >
                            Tool
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col md:flex-row w-full h-screen bg-gray-800 rounded-xl shadow-2xl overflow-hidden">
                    <div className={`md:flex flex-col p-4 bg-gray-700 md:w-1/5 flex-shrink-0 border-r border-gray-600 ${isSidebarOpen ? 'flex' : 'hidden'} overflow-y-auto custom-scrollbar`}>
                        <h3 className="text-lg font-semibold text-gray-200 mb-4">Conversations</h3>
                        <button
                            onClick={createNewConversation}
                            className="w-full px-4 py-2 mb-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-200 ease-in-out"
                        >
                            + New Chat
                        </button>
                        <div className="flex-1">
                            {allConversations.map(conv => (
                                <div
                                    key={conv.id}
                                    className={`flex justify-between items-center p-3 mb-2 rounded-md cursor-pointer transition duration-200 ease-in-out ${activeConversationId === conv.id ? 'bg-blue-500' : 'bg-gray-800 hover:bg-gray-700'}`}
                                    onClick={() => loadConversation(conv.id)}
                                >
                                    <span className={`flex-1 truncate ${activeConversationId === conv.id ? 'text-white' : 'text-gray-200'}`}>{conv.title || 'Untitled'}</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteConversation(conv.id);
                                        }}
                                        className="ml-2 text-red-400 hover:text-red-500"
                                        title="Delete Conversation"
                                    >
                                        <svg xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col flex-grow">
                        <div className="bg-gradient-to-r from-blue-800 to-indigo-900 text-white p-4 text-center text-2xl font-semibold rounded-t-xl md:rounded-tr-xl md:rounded-tl-none shadow-md">
                            <div className="flex justify-between items-center">
                                <button
                                    onClick={() => setCurrentPage('clipboard')}
                                    className="px-3 py-1 bg-indigo-700 hover:bg-indigo-800 text-white text-sm rounded-md transition duration-200 ease-in-out"
                                >
                                    Clipboard
                                </button>
                                <span className="flex-1 text-center">Supa Bam Tool for Adine</span>
                                <button
                                    onClick={handleLogout}
                                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md transition duration-200 ease-in-out"
                                >
                                    Logout
                                </button>
                            </div>
                        </div>

                        <button
                            className="md:hidden p-2 bg-gray-700 text-gray-200 border-b border-gray-600 w-full"
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        >
                            {isSidebarOpen ? 'Hide Conversations' : 'Show Conversations'}
                        </button>
                            
                        <div className="flex-grow p-4 overflow-y-auto custom-scrollbar bg-gray-700">
                            {loadingChat ? (
                                <div className="flex justify-center items-center h-full">
                                    <p className="text-gray-400">Loading conversation...</p>
                                </div>
                            ) : (
                                <>
                                    {messages.length === 0 && !isTyping && (
                                        <div className="text-center text-gray-400 mt-10">
                                            I love you, Love! You can do it!!
                                        </div>
                                    )}
                                    {messages.map((msg, index) => (
                                        <div
                                            key={msg.id || index}
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
                                    {isTyping && (
                                        <div className="flex mb-3 justify-start">
                                            <TypingIndicator />
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </>
                            )}
                        </div>
                        <div className="p-4 bg-gray-800 border-t border-gray-700 flex items-center rounded-b-xl md:rounded-bl-none md:rounded-br-xl">
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
            )}
        </div>
    );
};

export default App;