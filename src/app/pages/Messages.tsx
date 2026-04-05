import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent } from "../components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { MessageCircle, Send, Loader, ArrowLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

function safeTimeAgo(dateStr: string): string {
    try {
        const d = new Date(dateStr.includes('T') || dateStr.includes('Z') ? dateStr : dateStr + 'Z');
        if (isNaN(d.getTime())) return '';
        return formatDistanceToNow(d, { addSuffix: true });
    } catch { return ''; }
}

interface Conversation {
    id: string; name: string; avatar: string; role: string;
    last_message: string; last_message_at: string; unread_count: number;
}
interface Message {
    id: string; sender_id: string; receiver_id: string; content: string;
    is_read: number; created_at: string; sender_name: string; sender_avatar: string;
}

const API = '/parish-connect/api';
const getToken = () => localStorage.getItem('parish_token') || sessionStorage.getItem('parish_token');

export default function Messages() {
    const { user } = useAuth();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeChat, setActiveChat] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [newMessage, setNewMessage] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => { fetchConversations(); }, []);
    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const fetchConversations = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API}/messages`, {
                headers: { 'Authorization': `Bearer ${getToken()}` },
            });
            const data = await res.json();
            if (data.success) setConversations(data.data || []);
        } catch { toast.error('Failed to load conversations'); }
        finally { setLoading(false); }
    };

    const openChat = async (conv: Conversation) => {
        setActiveChat(conv);
        try {
            setLoadingMessages(true);
            const res = await fetch(`${API}/messages/${conv.id}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` },
            });
            const data = await res.json();
            if (data.success) setMessages(data.data || []);
            // Clear unread count locally
            setConversations(conversations.map((c) =>
                c.id === conv.id ? { ...c, unread_count: 0 } : c
            ));
        } catch { toast.error('Failed to load messages'); }
        finally { setLoadingMessages(false); }
    };

    const handleSend = async () => {
        if (!newMessage.trim() || !activeChat) return;
        try {
            const res = await fetch(`${API}/messages/${activeChat.id}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newMessage }),
            });
            const data = await res.json();
            if (data.success) {
                setMessages([...messages, {
                    ...data.data,
                    sender_name: user?.name || '',
                    sender_avatar: user?.avatar || '',
                }]);
                setNewMessage('');
                // Update conversation list
                setConversations(conversations.map((c) =>
                    c.id === activeChat.id ? { ...c, last_message: newMessage, last_message_at: new Date().toISOString() } : c
                ));
            } else toast.error(data.message || 'Failed to send');
        } catch { toast.error('Failed to send message'); }
    };

    const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

    return (
        <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="mb-6 flex items-center gap-3">
                <div className="bg-blue-600 p-2 rounded-lg">
                    <MessageCircle className="h-6 w-6 text-white" />
                </div>
                <div>
                    <h1 className="text-3xl font-semibold">Messages</h1>
                    <p className="text-gray-600">
                        {totalUnread > 0 ? `${totalUnread} unread message${totalUnread > 1 ? 's' : ''}` : 'Your conversations'}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[500px]">
                {/* Conversation List */}
                <Card className={`md:col-span-1 ${activeChat ? 'hidden md:block' : ''}`}>
                    <CardContent className="p-0">
                        {loading && (
                            <div className="flex justify-center py-12"><Loader className="h-6 w-6 animate-spin" /></div>
                        )}
                        {!loading && conversations.length === 0 && (
                            <div className="text-center py-12 px-4">
                                <MessageCircle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500 text-sm">No conversations yet</p>
                                <p className="text-gray-400 text-xs mt-1">Visit a member's profile to send a message</p>
                            </div>
                        )}
                        {conversations.map((conv) => (
                            <button
                                key={conv.id}
                                onClick={() => openChat(conv)}
                                className={`w-full flex items-center gap-3 p-4 hover:bg-gray-50 border-b text-left transition-colors ${activeChat?.id === conv.id ? 'bg-blue-50' : ''
                                    }`}
                            >
                                <Avatar className="h-10 w-10 flex-shrink-0">
                                    <AvatarImage src={conv.avatar} alt={conv.name} />
                                    <AvatarFallback>{conv.name[0]}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-sm truncate">{conv.name}</span>
                                        {conv.unread_count > 0 && (
                                            <Badge className="bg-blue-600 text-xs ml-2">{conv.unread_count}</Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 truncate">{conv.last_message}</p>
                                    <p className="text-xs text-gray-400">
                                        {safeTimeAgo(conv.last_message_at)}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </CardContent>
                </Card>

                {/* Chat Area */}
                <Card className={`md:col-span-2 flex flex-col ${!activeChat ? 'hidden md:flex' : ''}`}>
                    {!activeChat ? (
                        <CardContent className="flex-1 flex items-center justify-center">
                            <div className="text-center">
                                <MessageCircle className="h-16 w-16 text-gray-200 mx-auto mb-3" />
                                <p className="text-gray-400">Select a conversation to start messaging</p>
                            </div>
                        </CardContent>
                    ) : (
                        <>
                            {/* Chat Header */}
                            <div className="flex items-center gap-3 p-4 border-b">
                                <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setActiveChat(null)}>
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={activeChat.avatar} alt={activeChat.name} />
                                    <AvatarFallback>{activeChat.name[0]}</AvatarFallback>
                                </Avatar>
                                <span className="font-medium">{activeChat.name}</span>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[350px] max-h-[450px]">
                                {loadingMessages && (
                                    <div className="flex justify-center py-4"><Loader className="h-5 w-5 animate-spin" /></div>
                                )}
                                {!loadingMessages && messages.length === 0 && (
                                    <p className="text-center text-gray-400 text-sm py-8">No messages yet. Say hello!</p>
                                )}
                                {messages.map((msg) => (
                                    <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[75%] rounded-lg px-4 py-2 ${msg.sender_id === user?.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
                                            }`}>
                                            <p className="text-sm">{msg.content}</p>
                                            <p className={`text-xs mt-1 ${msg.sender_id === user?.id ? 'text-blue-200' : 'text-gray-400'}`}>
                                                {safeTimeAgo(msg.created_at)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <div className="flex gap-2 p-4 border-t">
                                <Input
                                    placeholder="Type a message..."
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                />
                                <Button onClick={handleSend}><Send className="h-4 w-4" /></Button>
                            </div>
                        </>
                    )}
                </Card>
            </div>
        </div>
    );
}
