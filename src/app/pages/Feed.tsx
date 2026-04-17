import React, { useState, useEffect, useRef } from "react";
import { useAuth, Permission } from "../context/AuthContext";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "../components/ui/alert-dialog";
import {
  Heart, MessageCircle, Share2, Calendar, Cake, Church, BookOpen,
  Trash2, Loader, Send, X, ImageIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  author_name: string;
  author_avatar: string;
}

interface Post {
  id: string;
  user_id: string;
  author_name: string;
  author_avatar: string;
  author_role: string;
  content: string;
  type: string;
  created_at: string;
  likes: number;
  comments: number;
  is_liked: boolean;
  is_approved: boolean;
  image_url?: string;
}

const API_BASE_URL = '/parish-connect/api';
const getToken = () => localStorage.getItem('parish_token') || sessionStorage.getItem('parish_token');

export default function Feed() {
  const { user, hasPermission } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [newPostContent, setNewPostContent] = useState("");
  const [postType, setPostType] = useState<string>("community");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Comments state
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentsData, setCommentsData] = useState<Record<string, Comment[]>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [loadingComments, setLoadingComments] = useState<Record<string, boolean>>({});

  useEffect(() => { fetchPosts(1); }, []);

  const fetchPosts = async (p = 1) => {
    try {
      if (p === 1) setLoading(true);
      else setLoadingMore(true);
      const response = await fetch(`${API_BASE_URL}/posts?page=${p}&limit=20`, {
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });
      const data = await response.json();
      if (data.success) {
        const incoming = data.data || [];
        setPosts(prev => p === 1 ? incoming : [...prev, ...incoming]);
        setHasMore(incoming.length === 20);
        setPage(p);
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
      toast.error('Failed to load posts');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const canDeleteAnyPost = hasPermission(Permission.DELETE_ANY_POST);
  const canDeletePost = (post: Post) => {
    if (post.user_id === user?.id) return true;
    if (user?.role === "superadmin") return true;
    if (canDeleteAnyPost && post.author_role !== "superadmin") return true;
    return false;
  };

  const handleLike = async (postId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/posts/${postId}/like`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });
      const data = await response.json();
      if (data.success) {
        setPosts(posts.map((p) => p.id === postId ? {
          ...p, likes: data.liked ? p.likes + 1 : Math.max(0, p.likes - 1), is_liked: data.liked,
        } : p));
      }
    } catch { toast.error('Failed to like post'); }
  };

  const handleCreatePost = async () => {
    if (!newPostContent.trim()) return;
    try {
      const formData = new FormData();
      formData.append('content', newPostContent);
      formData.append('type', postType);
      if (selectedImage) formData.append('image', selectedImage);

      const response = await fetch(`${API_BASE_URL}/posts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: formData,
      });
      const data = await response.json();
      if (data.success) {
        setNewPostContent('');
        setPostType('community');
        setSelectedImage(null);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        toast.success('Post created!');
        fetchPosts(1);
      } else toast.error(data.message || 'Failed to create post');
    } catch { toast.error('Failed to create post'); }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Image too large. Max 5MB.'); return; }
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      toast.error('Invalid image type. Use JPG, PNG, GIF, or WebP.'); return;
    }
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeletePost = async (postId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/posts/${postId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });
      const data = await response.json();
      if (data.success) {
        setPosts(posts.filter((p) => p.id !== postId));
        toast.success('Post deleted!');
      } else toast.error(data.message || 'Failed to delete post');
    } catch { toast.error('Failed to delete post'); }
  };

  const toggleComments = async (postId: string) => {
    const isExpanded = expandedComments[postId];
    setExpandedComments({ ...expandedComments, [postId]: !isExpanded });
    if (!isExpanded && !commentsData[postId]) {
      await fetchComments(postId);
    }
  };

  const fetchComments = async (postId: string) => {
    try {
      setLoadingComments({ ...loadingComments, [postId]: true });
      const response = await fetch(`${API_BASE_URL}/posts/${postId}/comments`, {
        headers: { 'Authorization': `Bearer ${getToken()}` },
      });
      const data = await response.json();
      if (data.success) setCommentsData({ ...commentsData, [postId]: data.data || [] });
    } catch { toast.error('Failed to load comments'); }
    finally { setLoadingComments({ ...loadingComments, [postId]: false }); }
  };

  const handleAddComment = async (postId: string) => {
    const content = commentInputs[postId]?.trim();
    if (!content) return;
    try {
      const response = await fetch(`${API_BASE_URL}/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await response.json();
      if (data.success) {
        setCommentsData({
          ...commentsData,
          [postId]: [...(commentsData[postId] || []), data.data],
        });
        setCommentInputs({ ...commentInputs, [postId]: '' });
        setPosts(posts.map((p) => p.id === postId ? { ...p, comments: p.comments + 1 } : p));
      } else toast.error(data.message || 'Failed to add comment');
    } catch { toast.error('Failed to add comment'); }
  };

  const getPostIcon = (type: string) => {
    switch (type) {
      case "baptism_anniversary": return <Cake className="h-4 w-4" />;
      case "parish_event": return <Calendar className="h-4 w-4" />;
      case "research": return <BookOpen className="h-4 w-4" />;
      default: return <Church className="h-4 w-4" />;
    }
  };

  const getPostTypeLabel = (type: string) => {
    switch (type) {
      case "baptism_anniversary": return "Baptism Anniversary";
      case "parish_event": return "Parish Event";
      case "research": return "Genealogy Research";
      default: return "Community";
    }
  };

  const filteredPosts = activeTab === "all" ? posts : posts.filter((p) => p.type === activeTab);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24 md:pb-6">
      {/* Create Post */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-start space-x-4">
            <Avatar>
              <AvatarImage src={user?.avatar} alt={user?.name} />
              <AvatarFallback>{user?.name[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <Textarea
                placeholder="Share with your parish community..."
                value={newPostContent}
                onChange={(e) => setNewPostContent(e.target.value)}
                className="mb-3 min-h-[100px]"
              />
              {/* Image Preview */}
              {imagePreview && (
                <div className="relative mb-3 inline-block">
                  <img src={imagePreview} alt="Preview" className="max-h-48 rounded-lg object-cover" />
                  <button onClick={clearImage} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 hover:bg-black/80">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={handleImageSelect} />
              <div className="flex justify-between items-center">
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <ImageIcon className="h-4 w-4 mr-2" />
                    Photo
                  </Button>
                  <Button
                    variant={postType === "parish_event" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPostType(postType === "parish_event" ? "community" : "parish_event")}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Event
                  </Button>
                  <Button
                    variant={postType === "research" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPostType(postType === "research" ? "community" : "research")}
                  >
                    <BookOpen className="h-4 w-4 mr-2" />
                    Research
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  {postType !== "community" && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      {getPostIcon(postType)}
                      {getPostTypeLabel(postType)}
                      <X className="h-3 w-3 ml-1 cursor-pointer" onClick={() => setPostType("community")} />
                    </Badge>
                  )}
                  <Button onClick={handleCreatePost}>Post</Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feed Filters */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="community">Community</TabsTrigger>
          <TabsTrigger value="parish_event">Events</TabsTrigger>
          <TabsTrigger value="baptism_anniversary">Baptisms</TabsTrigger>
          <TabsTrigger value="research">Research</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading && (
        <div className="flex justify-center items-center py-12">
          <Loader className="h-6 w-6 animate-spin" />
        </div>
      )}

      {/* Posts */}
      <div className="space-y-4">
        {!loading && filteredPosts.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-500">No posts yet. Be the first to share!</p>
            </CardContent>
          </Card>
        )}
        {filteredPosts.map((post) => (
          <Card key={post.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <Avatar>
                    <AvatarImage src={post.author_avatar} alt={post.author_name} loading="lazy" />
                    <AvatarFallback>{post.author_name?.[0] ?? '?'}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{post.author_name}</p>
                    <p className="text-sm text-gray-500">
                      {formatDistanceToNow(new Date(post.created_at + 'Z'), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="flex items-center gap-1">
                  {getPostIcon(post.type)}
                  {getPostTypeLabel(post.type)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-gray-800 mb-4 whitespace-pre-wrap">{post.content}</p>

              {/* Post Image */}
              {post.image_url && (
                <div className="mb-4 rounded-lg overflow-hidden bg-gray-100">
                  <img
                    src={post.image_url}
                    alt="Post image"
                    className="w-full object-contain max-h-[500px]"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="flex items-center space-x-4">
                  <Button variant="ghost" size="sm" onClick={() => handleLike(post.id)}
                    className={post.is_liked ? "text-red-500" : ""}>
                    <Heart className={`h-5 w-5 mr-2 ${post.is_liked ? "fill-current" : ""}`} />
                    {post.likes}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => toggleComments(post.id)}>
                    <MessageCircle className={`h-5 w-5 mr-2 ${expandedComments[post.id] ? "fill-current text-blue-500" : ""}`} />
                    {post.comments}
                  </Button>
                </div>
                <Button variant="ghost" size="sm" onClick={async () => {
                  const shareUrl = `${window.location.origin}/parish-connect`;
                  const shareText = `${post.author_name}: ${post.content.slice(0, 100)}${post.content.length > 100 ? '...' : ''}`;
                  if (navigator.share) {
                    try {
                      await navigator.share({ title: 'Parish Connect', text: shareText, url: shareUrl });
                    } catch { /* user cancelled */ }
                  } else {
                    await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
                    toast.success('Post link copied!');
                  }
                }}>
                  <Share2 className="h-5 w-5" />
                </Button>
              </div>

              {/* Comments Section */}
              {expandedComments[post.id] && (
                <div className="mt-4 pt-4 border-t space-y-3">
                  {loadingComments[post.id] && (
                    <div className="flex justify-center py-2">
                      <Loader className="h-4 w-4 animate-spin" />
                    </div>
                  )}
                  {(commentsData[post.id] || []).map((comment) => (
                    <div key={comment.id} className="flex items-start space-x-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={comment.author_avatar} alt={comment.author_name} loading="lazy" />
                        <AvatarFallback className="text-xs">{comment.author_name?.[0] ?? '?'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">{comment.author_name}</span>
                          <span className="text-xs text-gray-400">
                            {formatDistanceToNow(new Date(comment.created_at + 'Z'), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700">{comment.content}</p>
                      </div>
                    </div>
                  ))}
                  {/* Add Comment */}
                  <div className="flex items-center space-x-2 pt-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.avatar} alt={user?.name} />
                      <AvatarFallback className="text-xs">{user?.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 flex gap-2">
                      <Input
                        placeholder="Write a comment..."
                        value={commentInputs[post.id] || ''}
                        onChange={(e) => setCommentInputs({ ...commentInputs, [post.id]: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddComment(post.id)}
                        className="text-sm"
                      />
                      <Button size="sm" variant="ghost" onClick={() => handleAddComment(post.id)}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Delete Button */}
              {canDeletePost(post) && (
                <div className="mt-4">
                  <AlertDialog>
                    <AlertDialogTrigger>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="h-4 w-4 mr-2" />Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure you want to delete this post?</AlertDialogTitle>
                        <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeletePost(post.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Load more */}
      {!loading && hasMore && activeTab === "all" && (
        <div className="flex justify-center mt-6">
          <Button variant="outline" onClick={() => fetchPosts(page + 1)} disabled={loadingMore}>
            {loadingMore ? <Loader className="h-4 w-4 animate-spin mr-2" /> : null}
            {loadingMore ? "Loading..." : "Load more posts"}
          </Button>
        </div>
      )}
    </div>
  );
}
