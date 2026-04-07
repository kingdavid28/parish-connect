import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent } from "../components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import { MessageCircle, Send, Loader, ArrowLeft, ImageIcon, X, Users, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

function safeTimeAgo(dateStr: string): string {
    try {
        const d = new Date(dateStr.includes('T') || dateStr.includes('Z') ? dateStr : dateStr + 'Z');
        return isNaN(d.getTime()) ? '' : formatDistanceToNow(d, { addSuffix: true });
    } catch { return ''; }
}

interface Conversation {
    id: string; name: string; avatar: string; role: string;
    last_message: string; last_message_at: string; unread_count: number;
}
interface GroupChat {
    id: string; name: string; avatar: string; member_count: number;
    last_message: string; last_message_at: string;
}
interface Msg {
    id: string; sender_id: string; content: string; image_url?: string;
    created_at: string; sender_name: string; sender_avatar: string;
}
interface UserItem { id: string; name: string; avatar: string; }

const API = '/parish-connect/api';
const getToken = () => localStorage.getItem('parish_token') || sessionStorage.getItem('parish_token');

export default function Messages() {
    const { user } = useAuth();
    const [tab, setTab] = useState("direct");

    // Direct messages state
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loadingConvs, setLoadingConvs] = useState(true);
    const [activeChat, setActiveChat] = useState<{ id: string; name: string; avatar: string } | null>(null);
    const [chatType, setChatType] = useState<'direct' | 'group'>('direct');

    // Group chats state
    const [groups, setGroups] = useState<GroupChat[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(true);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [groupName, setGroupName] = useState("");
    const [availableUsers, setAvailableUsers] = useState<UserItem[]>([]);
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

    // Chat state (shared)
    const [messages, setMessages] = useState<Msg[]>([]);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [newMessage, setNewMessage] = useState("");
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => { fetchConversations(); fetchGroups(); }, []);
    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const fetchConversations = async () => {
        try {
            setLoadingConvs(true);
            const res = await fetch(`${API}/messages`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
            const data = await res.json();
            if (data.success) setConversations(data.data || []);
        } catch { } finally { setLoadingConvs(false); }
    };

    const fetchGroups = async () => {
        try {
            setLoadingGroups(true);
            const res = await fetch(`${API}/groups`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
            const data = await res.json();
            if (data.success) setGroups(data.data || []);
        } catch { } finally { setLoadingGroups(false); }
    };

    const openDirectChat = async (conv: Conversation) => {
        setActiveChat({ id: conv.id, name: conv.name, avatar: conv.avatar });
        setChatType('direct');
        try {
            setLoadingMsgs(true);
            const res = await fetch(`${API}/messages/${conv.id}`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
            const data = await res.json();
            if (data.success) setMessages(data.data || []);
        } catch { toast.error('Failed to load messages'); }
        finally { setLoadingMsgs(false); }
    };

    const openGroupChat = async (group: GroupChat) => {
        setActiveChat({ id: group.id, name: group.name, avatar: group.avatar || '' });
        setChatType('group');
        try {
            setLoadingMsgs(true);
            const res = await fetch(`${API}/groups/${group.id}`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
            const data = await res.json();
            if (data.success) setMessages(data.data || []);
        } catch { toast.error('Failed to load messages'); }
        finally { setLoadingMsgs(false); }
    };

    const handleSend = async () => {
        if ((!newMessage.trim() && !selectedImage) || !activeChat) return;
        const endpoint = chatType === 'direct' ? `${API}/messages/${activeChat.id}` : `${API}/groups/${activeChat.id}`;
        try {
            const formData = new FormData();
            if (newMessage.trim()) formData.append('content', newMessage);
            if (selectedImage) formData.append('image', selectedImage);
            const res = await fetch(endpoint, {
                method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` }, body: formData,
            });
            const data = await res.json();
            if (data.success) {
                setMessages([...messages, { ...data.data, sender_name: user?.name || '', sender_avatar: user?.avatar || '' }]);
                setNewMessage(''); clearImage();
            } else toast.error(data.message || 'Failed to send');
        } catch { toast.error('Failed to send'); }
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { toast.error('Max 5MB.'); return; }
        setSelectedImage(file);
        const reader = new FileReader();
        reader.onload = (ev) => setImagePreview(ev.target?.result as string);
        reader.readAsDataURL(file);
    };
    const clearImage = () => { setSelectedImage(null); setImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; };

    const openCreateGroup = async () => {
        setShowCreateGroup(true);
        setGroupName(""); setSelectedMembers([]);
        try {
            const res = await fetch(`${API}/users`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
            const data = await res.json();
            if (data.success) setAvailableUsers((data.data || []).filter((u: UserItem) => u.id !== user?.id));
        } catch { setAvailableUsers([]); }
    };

    const handleCreateGroup = async () => {
        if (!groupName.trim()) { toast.error('Group name is required'); return; }
        try {
            const res = await fetch(`${API}/groups`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: groupName, memberIds: selectedMembers }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Group created!');
                setShowCreateGroup(false);
                fetchGroups();
            } else toast.error(data.message || 'Failed');
        } catch { toast.error('Failed to create group'); }
    };

    const toggleMember = (id: string) => {
        setSelectedMembers((prev) => prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]);
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-6 pb-20 md:pb-6">
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-600 p-2 rounded-lg"><MessageCircle className="h-6 w-6 text-white" /></div>
                    <div>
                        <h1 className="text-3xl font-semibold">Messages</h1>
                        <p className="text-gray-600">Direct messages and group chats</p>
                    </div>
                </div>
                <Button onClick={openCreateGroup} size="sm"><Plus className="h-4 w-4 mr-2" />New Group</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[500px]">
                {/* Sidebar */}
                <Card className={`md:col-span-1 ${activeChat ? 'hidden md:block' : ''}`}>
                    <Tabs value={tab} onValueChange={setTab}>
                        <TabsList className="w-full grid grid-cols-2 m-2" style={{ width: 'calc(100% - 16px)' }}>
                            <TabsTrigger value="direct">Direct</TabsTrigger>
                            <TabsTrigger value="groups">Groups</TabsTrigger>
                        </TabsList>

                        <TabsContent value="direct" className="mt-0">
                            {loadingConvs && <div className="flex justify-center py-8"><Loader className="h-5 w-5 animate-spin" /></div>}
                            {!loadingConvs && conversations.length === 0 && (
                                <div className="text-center py-8 px-4">
                                    <MessageCircle className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                    <p className="text-gray-500 text-sm">No conversations yet</p>
                                </div>
                            )}
                            {conversations.map((conv) => (
                                <button key={conv.id} onClick={() => openDirectChat(conv)}
                                    className={`w-full flex items-center gap-3 p-3 hover:bg-gray-50 border-b text-left ${activeChat?.id === conv.id && chatType === 'direct' ? 'bg-blue-50' : ''}`}>
                                    <Avatar className="h-10 w-10"><AvatarImage src={conv.avatar} /><AvatarFallback>{conv.name[0]}</AvatarFallback></Avatar>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium text-sm truncate">{conv.name}</span>
                                            {conv.unread_count > 0 && <Badge className="bg-blue-600 text-xs">{conv.unread_count}</Badge>}
                                        </div>
                                        <p className="text-xs text-gray-500 truncate">{conv.last_message}</p>
                                        {conv.last_message_at && <p className="text-xs text-gray-400">{safeTimeAgo(conv.last_message_at)}</p>}
                                    </div>
                                </button>
                            ))}
                        </TabsContent>

                        <TabsContent value="groups" className="mt-0">
                            {loadingGroups && <div className="flex justify-center py-8"><Loader className="h-5 w-5 animate-spin" /></div>}
                            {!loadingGroups && groups.length === 0 && (
                                <div className="text-center py-8 px-4">
                                    <Users className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                                    <p className="text-gray-500 text-sm">No group chats yet</p>
                                    <Button size="sm" variant="outline" className="mt-2" onClick={openCreateGroup}>Create one</Button>
                                </div>
                            )}
                            {groups.map((group) => (
                                <button key={group.id} onClick={() => openGroupChat(group)}
                                    className={`w-full flex items-center gap-3 p-3 hover:bg-gray-50 border-b text-left ${activeChat?.id === group.id && chatType === 'group' ? 'bg-blue-50' : ''}`}>
                                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                        <Users className="h-5 w-5 text-blue-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className="font-medium text-sm truncate block">{group.name}</span>
                                        <p className="text-xs text-gray-500 truncate">{group.last_message || 'No messages yet'}</p>
                                        <p className="text-xs text-gray-400">{group.member_count} members{group.last_message_at ? ` · ${safeTimeAgo(group.last_message_at)}` : ''}</p>
                                    </div>
                                </button>
                            ))}
                        </TabsContent>
                    </Tabs>
                </Card>

                {/* Chat Area */}
                <Card className={`md:col-span-2 flex flex-col ${!activeChat ? 'hidden md:flex' : ''}`}>
                    {!activeChat ? (
                        <CardContent className="flex-1 flex items-center justify-center">
                            <div className="text-center">
                                <MessageCircle className="h-16 w-16 text-gray-200 mx-auto mb-3" />
                                <p className="text-gray-400">Select a conversation</p>
                            </div>
                        </CardContent>
                    ) : (
                        <>
                            <div className="flex items-center gap-3 p-4 border-b">
                                <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setActiveChat(null)}>
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                                {chatType === 'group' ? (
                                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                                        <Users className="h-4 w-4 text-blue-600" />
                                    </div>
                                ) : (
                                    <Avatar className="h-8 w-8"><AvatarImage src={activeChat.avatar} /><AvatarFallback>{activeChat.name[0]}</AvatarFallback></Avatar>
                                )}
                                <span className="font-medium">{activeChat.name}</span>
                                {chatType === 'group' && <Badge variant="secondary" className="text-xs">Group</Badge>}
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[350px] max-h-[450px]">
                                {loadingMsgs && <div className="flex justify-center py-4"><Loader className="h-5 w-5 animate-spin" /></div>}
                                {!loadingMsgs && messages.length === 0 && <p className="text-center text-gray-400 text-sm py-8">No messages yet</p>}
                                {messages.map((msg) => (
                                    <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                                        {msg.sender_id !== user?.id && chatType === 'group' && (
                                            <Avatar className="h-6 w-6 mr-2 mt-1 flex-shrink-0">
                                                <AvatarImage src={msg.sender_avatar} /><AvatarFallback className="text-xs">{(msg.sender_name || '?')[0]}</AvatarFallback>
                                            </Avatar>
                                        )}
                                        <div className={`max-w-[75%] rounded-lg px-4 py-2 ${msg.sender_id === user?.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                                            {msg.sender_id !== user?.id && chatType === 'group' && (
                                                <p className={`text-xs font-medium mb-1 ${msg.sender_id === user?.id ? 'text-blue-200' : 'text-gray-500'}`}>{msg.sender_name}</p>
                                            )}
                                            {msg.image_url && <img src={msg.image_url} alt="" className="max-h-48 rounded mb-2 cursor-pointer" onClick={() => window.open(msg.image_url!, '_blank')} loading="lazy" />}
                                            {msg.content && <p className="text-sm">{msg.content}</p>}
                                            <p className={`text-xs mt-1 ${msg.sender_id === user?.id ? 'text-blue-200' : 'text-gray-400'}`}>{safeTimeAgo(msg.created_at)}</p>
                                        </div>
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            {imagePreview && (
                                <div className="px-4 pt-2">
                                    <div className="relative inline-block">
                                        <img src={imagePreview} alt="Preview" className="max-h-24 rounded" />
                                        <button onClick={clearImage} className="absolute -top-1 -right-1 bg-black/60 text-white rounded-full p-0.5"><X className="h-3 w-3" /></button>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-2 p-4 border-t items-center">
                                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleImageSelect} />
                                <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
                                    <ImageIcon className="h-5 w-5 text-gray-500" />
                                </Button>
                                <Input placeholder="Type a message..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} />
                                <Button onClick={handleSend}><Send className="h-4 w-4" /></Button>
                            </div>
                        </>
                    )}
                </Card>
            </div>

            {/* Create Group Dialog */}
            <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Create Group Chat</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Group Name</Label>
                            <Input placeholder="e.g. Youth Ministry" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Add Members ({selectedMembers.length} selected)</Label>
                            <div className="max-h-48 overflow-y-auto border rounded-lg">
                                {availableUsers.length === 0 && <p className="text-sm text-gray-400 p-3">No users available</p>}
                                {availableUsers.map((u) => (
                                    <button key={u.id} onClick={() => toggleMember(u.id)}
                                        className={`w-full flex items-center gap-3 p-2 hover:bg-gray-50 text-left ${selectedMembers.includes(u.id) ? 'bg-blue-50' : ''}`}>
                                        <Avatar className="h-8 w-8"><AvatarImage src={u.avatar} /><AvatarFallback>{u.name[0]}</AvatarFallback></Avatar>
                                        <span className="text-sm flex-1">{u.name}</span>
                                        {selectedMembers.includes(u.id) && <Badge className="bg-blue-600 text-xs">Added</Badge>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreateGroup(false)}>Cancel</Button>
                        <Button onClick={handleCreateGroup}>Create Group</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
