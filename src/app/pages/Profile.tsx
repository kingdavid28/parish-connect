import React, { useState, useEffect } from "react";
import { useParams } from "react-router";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import {
  Calendar, Mail, Shield, Users, BookOpen, Heart, MessageCircle, Loader, Send, Crown, UserCheck, UserPlus,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface ProfileData {
  id: string; name: string; email: string; avatar?: string; role: string;
  created_at?: string; bio?: string; member_since?: string;
}
interface Message {
  id: string; sender_id: string; receiver_id: string; content: string;
  is_read: number; created_at: string; sender_name: string; sender_avatar: string;
}

const API = '/parish-connect/api';
const getToken = () => localStorage.getItem('parish_token') || sessionStorage.getItem('parish_token');

export default function Profile() {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("timeline");
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [showMessages, setShowMessages] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);

  const profileId = id || currentUser?.id;
  const isOwnProfile = currentUser?.id === profileId;

  useEffect(() => {
    if (!profileId) return;
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API}/users/${profileId}`, {
          headers: { 'Authorization': `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setProfileData(data.data || data);
      } catch { toast.error('Failed to load profile'); }
      finally { setLoading(false); }
    };
    const fetchFollowStatus = async () => {
      try {
        const res = await fetch(`${API}/follows/${profileId}/status`, {
          headers: { 'Authorization': `Bearer ${getToken()}` },
        });
        const data = await res.json();
        if (data.success) {
          setIsFollowing(data.data.is_following);
          setFollowerCount(data.data.followers);
          setFollowingCount(data.data.following);
        }
      } catch { /* ignore */ }
    };
    fetchProfile();
    fetchFollowStatus();
  }, [profileId]);

  const handleToggleFollow = async () => {
    try {
      const res = await fetch(`${API}/follows/${profileId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        setIsFollowing(data.following);
        setFollowerCount((c) => data.following ? c + 1 : Math.max(0, c - 1));
        toast.success(data.following ? 'Following!' : 'Unfollowed');
      }
    } catch { toast.error('Failed to update follow'); }
  };

  const openMessages = async () => {
    setShowMessages(true);
    await fetchMessages();
  };

  const fetchMessages = async () => {
    try {
      setLoadingMessages(true);
      const res = await fetch(`${API}/messages/${profileId}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setMessages(data.data || []);
    } catch { toast.error('Failed to load messages'); }
    finally { setLoadingMessages(false); }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    try {
      const res = await fetch(`${API}/messages/${profileId}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMessage }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages([...messages, { ...data.data, sender_name: currentUser?.name || '', sender_avatar: currentUser?.avatar || '' }]);
        setNewMessage('');
      } else toast.error(data.message || 'Failed to send');
    } catch { toast.error('Failed to send message'); }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "superadmin": return <Badge className="bg-purple-600"><Crown className="h-3 w-3 mr-1" />Super Admin</Badge>;
      case "admin": return <Badge className="bg-blue-600"><Shield className="h-3 w-3 mr-1" />Admin</Badge>;
      default: return null;
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader className="h-8 w-8 animate-spin" />
    </div>
  );

  if (!profileData) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Card className="max-w-md"><CardContent className="p-6 text-center"><p className="text-gray-600">Profile not found</p></CardContent></Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              <Avatar className="h-32 w-32">
                <AvatarImage src={profileData.avatar || ""} alt={profileData.name} />
                <AvatarFallback className="text-3xl">{profileData.name?.charAt(0) || "?"}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-semibold">{profileData.name}</h1>
                  {getRoleBadge(profileData.role)}
                </div>
                <p className="text-gray-600 mb-4">{profileData.bio || "No bio yet"}</p>

                <div className="flex flex-wrap gap-4 mb-2 text-sm text-gray-600">
                  <div className="flex items-center gap-1"><Mail className="h-4 w-4" />{profileData.email}</div>
                  {(profileData.member_since || profileData.created_at) && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Member since {format(new Date(profileData.member_since || profileData.created_at!), "MMM d, yyyy")}
                    </div>
                  )}
                </div>

                <div className="flex gap-4 mb-4 text-sm">
                  <span><span className="font-semibold">{followerCount}</span> followers</span>
                  <span><span className="font-semibold">{followingCount}</span> following</span>
                </div>

                {!isOwnProfile && (
                  <div className="flex gap-2">
                    <Button
                      variant={isFollowing ? "outline" : "default"}
                      onClick={handleToggleFollow}
                    >
                      {isFollowing ? <><UserCheck className="h-4 w-4 mr-2" />Following</> : <><UserPlus className="h-4 w-4 mr-2" />Follow</>}
                    </Button>
                    <Button variant="outline" onClick={openMessages}>
                      <MessageCircle className="h-4 w-4 mr-2" />Message
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="research">Research</TabsTrigger>
          </TabsList>
          <TabsContent value="timeline" className="mt-6">
            <Card><CardHeader><CardTitle>Faith Journey Timeline</CardTitle></CardHeader>
              <CardContent><div className="text-center py-12"><BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" /><p className="text-gray-600">Timeline data coming soon</p></div></CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="posts" className="mt-6">
            <Card><CardContent className="py-12 text-center"><Heart className="h-12 w-12 text-gray-400 mx-auto mb-4" /><p className="text-gray-600">User posts will appear here</p></CardContent></Card>
          </TabsContent>
          <TabsContent value="research" className="mt-6">
            <Card><CardContent className="py-12 text-center"><BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" /><p className="text-gray-600">Family research tree coming soon</p></CardContent></Card>
          </TabsContent>
        </Tabs>

        {/* Message Dialog */}
        <Dialog open={showMessages} onOpenChange={setShowMessages}>
          <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={profileData.avatar || ""} alt={profileData.name} />
                  <AvatarFallback>{profileData.name[0]}</AvatarFallback>
                </Avatar>
                {profileData.name}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto space-y-3 py-4 min-h-[300px] max-h-[400px]">
              {loadingMessages && <div className="flex justify-center py-4"><Loader className="h-5 w-5 animate-spin" /></div>}
              {!loadingMessages && messages.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-8">No messages yet. Say hello!</p>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender_id === currentUser?.id ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-lg px-4 py-2 ${msg.sender_id === currentUser?.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
                    }`}>
                    <p className="text-sm">{msg.content}</p>
                    <p className={`text-xs mt-1 ${msg.sender_id === currentUser?.id ? 'text-blue-200' : 'text-gray-400'}`}>
                      {formatDistanceToNow(new Date(msg.created_at + 'Z'), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2 border-t">
              <Input
                placeholder="Type a message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              />
              <Button onClick={handleSendMessage} size="sm"><Send className="h-4 w-4" /></Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
