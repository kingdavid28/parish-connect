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
  Calendar, Mail, Shield, BookOpen, Heart, MessageCircle, Loader, Send, Crown,
  UserCheck, UserPlus, Church, Cake, Star, Zap,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { KudosButton } from "../components/KudosButton";

interface ProfileData {
  id: string; name: string; email: string; avatar?: string; role: string;
  created_at?: string; bio?: string; member_since?: string;
}
interface Message {
  id: string; sender_id: string; receiver_id: string; content: string;
  image_url?: string; is_read: number; created_at: string; sender_name: string; sender_avatar: string;
}
interface SacramentRecord {
  id: string; name: string; birthday: string; parents_name: string;
  baptized_by: string; canonical_book: string; baptismal_date: string;
  godparents_name: string; confirmed_by: string; confirmbook_no: string;
  confirmed_date: string; confirm_sponsor: string;
}
interface Post {
  id: string; content: string; type: string; created_at: string;
  likes: number; comments: number; is_liked: boolean;
  author_name: string; author_avatar: string; image_url?: string;
}
interface UserRewards {
  total_points: number;
  rank: number;
  badges: { slug: string; name: string; icon: string; earned: boolean }[];
}

const API = '/parish-connect/api';
const getToken = () => localStorage.getItem('parish_token') || sessionStorage.getItem('parish_token');

function safeTimeAgo(d: string): string {
  try {
    const date = new Date(d.includes('T') || d.includes('Z') ? d : d + 'Z');
    return isNaN(date.getTime()) ? '' : formatDistanceToNow(date, { addSuffix: true });
  } catch { return ''; }
}

export default function Profile() {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("timeline");

  // Follow state
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  // Message state
  const [showMessages, setShowMessages] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Timeline state (sacramental record)
  const [sacramentRecord, setSacramentRecord] = useState<SacramentRecord | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Posts state
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  // Rewards state
  const [userRewards, setUserRewards] = useState<UserRewards | null>(null);

  const profileId = id || currentUser?.id;
  const isOwnProfile = currentUser?.id === profileId;

  useEffect(() => {
    if (!profileId) return;
    fetchProfile();
    fetchFollowStatus();
    fetchUserRewards();
  }, [profileId]);

  useEffect(() => {
    if (activeTab === 'timeline' && profileData && !sacramentRecord && !loadingTimeline) fetchTimeline();
    if (activeTab === 'posts' && profileData && userPosts.length === 0 && !loadingPosts) fetchUserPosts();
  }, [activeTab, profileData]);

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

  const fetchTimeline = async () => {
    if (!profileData?.name) return;
    try {
      setLoadingTimeline(true);
      const res = await fetch(`${API}/sacraments?search=${encodeURIComponent(profileData.name)}&limit=1`, {
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success && data.data?.items?.length > 0) {
        setSacramentRecord(data.data.items[0]);
      }
    } catch { /* ignore */ }
    finally { setLoadingTimeline(false); }
  };

  const fetchUserPosts = async () => {
    try {
      setLoadingPosts(true);
      const res = await fetch(`${API}/posts`, {
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        // Filter posts by this user
        const filtered = (data.data || []).filter((p: Post) => {
          const postAuthor = p.author_name?.toLowerCase().trim();
          const profileName = profileData?.name?.toLowerCase().trim();
          return postAuthor === profileName;
        });
        setUserPosts(filtered);
      }
    } catch { /* ignore */ }
    finally { setLoadingPosts(false); }
  };

  const fetchUserRewards = async () => {
    try {
      const res = await fetch(`${API}/rewards/${profileId}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (data.success) setUserRewards(data.data);
    } catch { /* ignore */ }
  };

  const handleToggleFollow = async () => {
    try {
      const res = await fetch(`${API}/follows/${profileId}`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` },
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

  const getPostIcon = (type: string) => {
    switch (type) {
      case "baptism_anniversary": return <Cake className="h-4 w-4" />;
      case "parish_event": return <Calendar className="h-4 w-4" />;
      case "research": return <BookOpen className="h-4 w-4" />;
      default: return <Church className="h-4 w-4" />;
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
      <div className="max-w-5xl mx-auto px-4 py-6 pb-24 md:pb-6">
        {/* Profile Header */}
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
                    <Button variant={isFollowing ? "outline" : "default"} onClick={handleToggleFollow}>
                      {isFollowing ? <><UserCheck className="h-4 w-4 mr-2" />Following</> : <><UserPlus className="h-4 w-4 mr-2" />Follow</>}
                    </Button>
                    <Button variant="outline" onClick={openMessages}>
                      <MessageCircle className="h-4 w-4 mr-2" />Message
                    </Button>
                    <KudosButton receiverId={profileId!} receiverName={profileData.name} />
                  </div>
                )}
                {/* Points & badges summary */}
                {userRewards && (
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className="flex items-center gap-1 text-sm text-yellow-600 font-medium">
                      <Zap className="h-4 w-4" />{userRewards.total_points} GBless
                    </span>
                    <span className="text-sm text-gray-400">Rank #{userRewards.rank}</span>
                    <div className="flex gap-1">
                      {userRewards.badges.filter(b => b.earned).map(b => (
                        <span key={b.slug} title={b.name} className="text-lg">{b.icon}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="research">Research</TabsTrigger>
          </TabsList>

          {/* Timeline Tab - Sacramental Record */}
          <TabsContent value="timeline" className="mt-6">
            {loadingTimeline && (
              <div className="flex justify-center py-12"><Loader className="h-6 w-6 animate-spin" /></div>
            )}
            {!loadingTimeline && sacramentRecord && (
              <div className="space-y-4">
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Cake className="h-5 w-5" />Baptism</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div><span className="text-gray-500">Baptismal Date</span><p className="font-medium">{sacramentRecord.baptismal_date || 'N/A'}</p></div>
                      <div><span className="text-gray-500">Baptized By</span><p className="font-medium">{sacramentRecord.baptized_by || 'N/A'}</p></div>
                      <div><span className="text-gray-500">Godparents</span><p className="font-medium">{sacramentRecord.godparents_name || 'N/A'}</p></div>
                      <div><span className="text-gray-500">Canonical Book</span><p className="font-medium">{sacramentRecord.canonical_book || 'N/A'}</p></div>
                      <div><span className="text-gray-500">Birthday</span><p className="font-medium">{sacramentRecord.birthday || 'N/A'}</p></div>
                      <div><span className="text-gray-500">Parents</span><p className="font-medium">{sacramentRecord.parents_name || 'N/A'}</p></div>
                    </div>
                  </CardContent>
                </Card>
                {sacramentRecord.confirmed_by && (
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Confirmation</CardTitle></CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div><span className="text-gray-500">Confirmed Date</span><p className="font-medium">{sacramentRecord.confirmed_date || 'N/A'}</p></div>
                        <div><span className="text-gray-500">Confirmed By</span><p className="font-medium">{sacramentRecord.confirmed_by}</p></div>
                        <div><span className="text-gray-500">Sponsor</span><p className="font-medium">{sacramentRecord.confirm_sponsor || 'N/A'}</p></div>
                        <div><span className="text-gray-500">Book No.</span><p className="font-medium">{sacramentRecord.confirmbook_no || 'N/A'}</p></div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                <Card className="bg-amber-50 border-amber-200">
                  <CardContent className="pt-6">
                    <p className="text-sm text-amber-700">This record is for reference only. For legal and official purposes, please visit the parish office.</p>
                  </CardContent>
                </Card>
              </div>
            )}
            {!loadingTimeline && !sacramentRecord && (
              <Card><CardContent className="py-12 text-center">
                <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No sacramental record found</p>
                <p className="text-sm text-gray-500 mt-1">Your name may not match the parish records exactly</p>
              </CardContent></Card>
            )}
          </TabsContent>

          {/* Posts Tab */}
          <TabsContent value="posts" className="mt-6 space-y-4">
            {loadingPosts && (
              <div className="flex justify-center py-12"><Loader className="h-6 w-6 animate-spin" /></div>
            )}
            {!loadingPosts && userPosts.length === 0 && (
              <Card><CardContent className="py-12 text-center">
                <Heart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No posts yet</p>
              </CardContent></Card>
            )}
            {userPosts.map((post) => (
              <Card key={post.id}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                      {getPostIcon(post.type)}
                      {post.type === 'parish_event' ? 'Event' : post.type === 'research' ? 'Research' : post.type === 'baptism_anniversary' ? 'Baptism' : 'Community'}
                    </Badge>
                    <span className="text-xs text-gray-400">{safeTimeAgo(post.created_at)}</span>
                  </div>
                  <p className="text-gray-800 whitespace-pre-wrap">{post.content}</p>
                  {post.image_url && (
                    <div className="mt-3 rounded-lg overflow-hidden bg-gray-50">
                      <img src={post.image_url} alt="Post image" className="w-full object-contain max-h-[500px]" loading="lazy" />
                    </div>
                  )}
                  <div className="flex items-center gap-4 mt-4 pt-3 border-t text-sm text-gray-500">
                    <span className="flex items-center gap-1"><Heart className="h-4 w-4" />{post.likes}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="h-4 w-4" />{post.comments}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* Research Tab */}
          <TabsContent value="research" className="mt-6">
            <Card><CardContent className="py-12 text-center">
              <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Family research tree coming soon</p>
              <p className="text-sm text-gray-500 mt-1">Genealogical data and connections</p>
            </CardContent></Card>
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
                  <div className={`max-w-[75%] rounded-lg px-4 py-2 ${msg.sender_id === currentUser?.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                    <p className="text-sm">{msg.content}</p>
                    <p className={`text-xs mt-1 ${msg.sender_id === currentUser?.id ? 'text-blue-200' : 'text-gray-400'}`}>
                      {safeTimeAgo(msg.created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2 border-t">
              <Input placeholder="Type a message..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} />
              <Button onClick={handleSendMessage} size="sm"><Send className="h-4 w-4" /></Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
