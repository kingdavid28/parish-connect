import React, { useState } from "react";
import { useAuth, Permission } from "../context/AuthContext";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../components/ui/alert-dialog";
import {
  Heart,
  MessageCircle,
  Share2,
  Calendar,
  Cake,
  Church,
  BookOpen,
  Users,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface Post {
  id: string;
  author: {
    id: string;
    name: string;
    avatar: string;
  };
  content: string;
  type: "community" | "baptism_anniversary" | "parish_event" | "research";
  timestamp: Date;
  likes: number;
  comments: number;
  isLiked?: boolean;
  metadata?: {
    eventDate?: string;
    location?: string;
    baptismYear?: number;
  };
}

const MOCK_POSTS: Post[] = [
  {
    id: "1",
    author: {
      id: "3",
      name: "John Sullivan",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400",
    },
    content: "Celebrating 38 years since my baptism at St. Mary's! Grateful for this faith community that has shaped my journey. 🙏",
    type: "baptism_anniversary",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    likes: 24,
    comments: 8,
    metadata: {
      baptismYear: 1986,
    },
  },
  {
    id: "2",
    author: {
      id: "1",
      name: "Father Michael O'Connor",
      avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400",
    },
    content: "Reminder: Parish Spring Festival is this Saturday! Join us for food, music, and fellowship. All families welcome. See you there!",
    type: "parish_event",
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
    likes: 56,
    comments: 12,
    metadata: {
      eventDate: "April 5, 2026",
      location: "Parish Hall",
    },
  },
  {
    id: "3",
    author: {
      id: "4",
      name: "Sarah Chen",
      avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400",
    },
    content: "I'm researching my family's connection to St. Mary's. My great-grandmother Maria Chen was baptized here in 1920. Does anyone have records or stories from that era? Would love to collaborate!",
    type: "research",
    timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000),
    likes: 18,
    comments: 15,
  },
  {
    id: "4",
    author: {
      id: "2",
      name: "Maria Rodriguez",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400",
    },
    content: "What a beautiful Mass this morning! The choir was exceptional. Feeling blessed to be part of this community.",
    type: "community",
    timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
    likes: 42,
    comments: 6,
  },
];

export default function Feed() {
  const { user, hasPermission } = useAuth();
  const [posts, setPosts] = useState<Post[]>(MOCK_POSTS);
  const [newPostContent, setNewPostContent] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [postToDelete, setPostToDelete] = useState<string | null>(null);

  // Check if user can delete any post (admin/superadmin) or only their own
  const canDeleteAnyPost = hasPermission(Permission.DELETE_ANY_POST);

  const canDeletePost = (post: Post) => {
    return post.author.id === user?.id || canDeleteAnyPost;
  };

  const handleLike = (postId: string) => {
    setPosts(
      posts.map((post) =>
        post.id === postId
          ? {
              ...post,
              likes: post.isLiked ? post.likes - 1 : post.likes + 1,
              isLiked: !post.isLiked,
            }
          : post
      )
    );
  };

  const handleCreatePost = () => {
    if (!newPostContent.trim()) return;

    const newPost: Post = {
      id: Date.now().toString(),
      author: {
        id: user!.id,
        name: user!.name,
        avatar: user!.avatar || "",
      },
      content: newPostContent,
      type: "community",
      timestamp: new Date(),
      likes: 0,
      comments: 0,
    };

    setPosts([newPost, ...posts]);
    setNewPostContent("");
  };

  const handleDeletePost = (postId: string) => {
    setPosts(posts.filter((post) => post.id !== postId));
    toast.success("Post deleted successfully!");
  };

  const getPostIcon = (type: Post["type"]) => {
    switch (type) {
      case "baptism_anniversary":
        return <Cake className="h-4 w-4" />;
      case "parish_event":
        return <Calendar className="h-4 w-4" />;
      case "research":
        return <BookOpen className="h-4 w-4" />;
      default:
        return <Church className="h-4 w-4" />;
    }
  };

  const getPostTypeLabel = (type: Post["type"]) => {
    switch (type) {
      case "baptism_anniversary":
        return "Baptism Anniversary";
      case "parish_event":
        return "Parish Event";
      case "research":
        return "Genealogy Research";
      default:
        return "Community";
    }
  };

  const filteredPosts =
    activeTab === "all"
      ? posts
      : posts.filter((post) => post.type === activeTab);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
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
                <div className="flex justify-between items-center">
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm">
                      <Calendar className="h-4 w-4 mr-2" />
                      Event
                    </Button>
                    <Button variant="outline" size="sm">
                      <BookOpen className="h-4 w-4 mr-2" />
                      Research
                    </Button>
                  </div>
                  <Button onClick={handleCreatePost}>Post</Button>
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

        {/* Posts */}
        <div className="space-y-4">
          {filteredPosts.map((post) => (
            <Card key={post.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <Avatar>
                      <AvatarImage
                        src={post.author.avatar}
                        alt={post.author.name}
                      />
                      <AvatarFallback>{post.author.name[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{post.author.name}</p>
                      <p className="text-sm text-gray-500">
                        {formatDistanceToNow(post.timestamp, {
                          addSuffix: true,
                        })}
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
                <p className="text-gray-800 mb-4 whitespace-pre-wrap">
                  {post.content}
                </p>

                {/* Metadata */}
                {post.metadata && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                    {post.metadata.eventDate && (
                      <div className="flex items-center text-sm text-blue-900">
                        <Calendar className="h-4 w-4 mr-2" />
                        <span>
                          {post.metadata.eventDate} • {post.metadata.location}
                        </span>
                      </div>
                    )}
                    {post.metadata.baptismYear && (
                      <div className="flex items-center text-sm text-blue-900">
                        <Cake className="h-4 w-4 mr-2" />
                        <span>Baptized in {post.metadata.baptismYear}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex items-center space-x-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleLike(post.id)}
                      className={post.isLiked ? "text-red-500" : ""}
                    >
                      <Heart
                        className={`h-5 w-5 mr-2 ${
                          post.isLiked ? "fill-current" : ""
                        }`}
                      />
                      {post.likes}
                    </Button>
                    <Button variant="ghost" size="sm">
                      <MessageCircle className="h-5 w-5 mr-2" />
                      {post.comments}
                    </Button>
                  </div>
                  <Button variant="ghost" size="sm">
                    <Share2 className="h-5 w-5" />
                  </Button>
                </div>

                {/* Delete Button */}
                {canDeletePost(post) && (
                  <div className="mt-4">
                    <AlertDialog>
                      <AlertDialogTrigger>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Are you sure you want to delete this post?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently
                            delete the post.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeletePost(post.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
    </div>
  );
}