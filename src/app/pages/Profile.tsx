import React, { useState } from "react";
import { useParams } from "react-router";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import {
  Calendar,
  MapPin,
  Mail,
  Shield,
  Users,
  BookOpen,
  Heart,
  MessageCircle,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";

interface ProfileData {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: "admin" | "parishioner";
  baptismDate?: string;
  memberSince: string;
  parishName: string;
  bio?: string;
  familyConnections?: string[];
  posts: number;
  followers: number;
  following: number;
}

const MOCK_PROFILES: Record<string, ProfileData> = {
  "1": {
    id: "1",
    name: "Father Michael O'Connor",
    email: "admin@parish.com",
    avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400",
    role: "admin",
    memberSince: "2010-01-15",
    parishName: "St. Mary's Catholic Church",
    bio: "Parish priest serving the St. Mary's community. Passionate about connecting our parish family and preserving our shared history.",
    posts: 156,
    followers: 342,
    following: 89,
  },
  "2": {
    id: "2",
    name: "Maria Rodriguez",
    email: "user@parish.com",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400",
    role: "parishioner",
    baptismDate: "1985-06-12",
    memberSince: "1985-06-12",
    parishName: "St. Mary's Catholic Church",
    bio: "Lifelong parishioner researching family history. Third generation at St. Mary's.",
    familyConnections: ["Rodriguez Family", "Martinez Family"],
    posts: 42,
    followers: 126,
    following: 98,
  },
};

interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  description: string;
  type: "baptism" | "confirmation" | "marriage" | "milestone";
}

const MOCK_TIMELINE: TimelineEvent[] = [
  {
    id: "1",
    date: "1985-06-12",
    title: "Baptism",
    description: "Baptized at St. Mary's Catholic Church by Father Thomas Walsh",
    type: "baptism",
  },
  {
    id: "2",
    date: "1993-05-15",
    title: "First Communion",
    description: "Received First Holy Communion",
    type: "milestone",
  },
  {
    id: "3",
    date: "1997-04-20",
    title: "Confirmation",
    description: "Confirmed in the Catholic faith",
    type: "confirmation",
  },
  {
    id: "4",
    date: "2008-09-06",
    title: "Marriage",
    description: "Married at St. Mary's Catholic Church",
    type: "marriage",
  },
];

const MOCK_USER_POSTS = [
  {
    id: "1",
    content: "What a beautiful Mass this morning! The choir was exceptional.",
    likes: 42,
    comments: 6,
    timestamp: "2 days ago",
  },
  {
    id: "2",
    content: "Grateful for 38 years of faith journey with this community.",
    likes: 58,
    comments: 12,
    timestamp: "1 week ago",
  },
];

export default function Profile() {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState("timeline");

  const profileData = MOCK_PROFILES[id || "2"];
  const isOwnProfile = currentUser?.id === id;

  if (!profileData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <p className="text-gray-600">Profile not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Profile Header */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              <Avatar className="h-32 w-32">
                <AvatarImage src={profileData.avatar} alt={profileData.name} />
                <AvatarFallback className="text-3xl">
                  {profileData.name[0]}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-semibold">
                    {profileData.name}
                  </h1>
                  {profileData.role === "admin" && (
                    <Badge variant="default" className="bg-purple-600">
                      <Shield className="h-3 w-3 mr-1" />
                      Admin
                    </Badge>
                  )}
                </div>

                <p className="text-gray-600 mb-4">{profileData.bio}</p>

                <div className="flex flex-wrap gap-4 mb-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    {profileData.email}
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {profileData.parishName}
                  </div>
                  {profileData.baptismDate && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Baptized {format(new Date(profileData.baptismDate), "MMM d, yyyy")}
                    </div>
                  )}
                </div>

                <div className="flex gap-6 mb-4">
                  <div className="text-center">
                    <div className="font-semibold text-lg">{profileData.posts}</div>
                    <div className="text-sm text-gray-600">Posts</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-lg">{profileData.followers}</div>
                    <div className="text-sm text-gray-600">Followers</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-lg">{profileData.following}</div>
                    <div className="text-sm text-gray-600">Following</div>
                  </div>
                </div>

                {!isOwnProfile && (
                  <div className="flex gap-2">
                    <Button>
                      <Users className="h-4 w-4 mr-2" />
                      Follow
                    </Button>
                    <Button variant="outline">
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Message
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Family Connections */}
            {profileData.familyConnections && (
              <div className="mt-6 pt-6 border-t">
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Family Connections
                </h3>
                <div className="flex flex-wrap gap-2">
                  {profileData.familyConnections.map((family, index) => (
                    <Badge key={index} variant="outline">
                      {family}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Profile Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="research">Research</TabsTrigger>
          </TabsList>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Faith Journey Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {MOCK_TIMELINE.map((event, index) => (
                    <div key={event.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-3 h-3 rounded-full bg-blue-600" />
                        {index < MOCK_TIMELINE.length - 1 && (
                          <div className="w-0.5 h-full bg-gray-300 mt-2" />
                        )}
                      </div>
                      <div className="flex-1 pb-6">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-medium">{event.title}</h4>
                          <span className="text-sm text-gray-500">
                            {format(new Date(event.date), "MMM d, yyyy")}
                          </span>
                        </div>
                        <p className="text-gray-600 text-sm">
                          {event.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Posts Tab */}
          <TabsContent value="posts" className="mt-6">
            <div className="space-y-4">
              {MOCK_USER_POSTS.map((post) => (
                <Card key={post.id}>
                  <CardContent className="pt-6">
                    <p className="text-gray-800 mb-4">{post.content}</p>
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Heart className="h-4 w-4" />
                        {post.likes}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="h-4 w-4" />
                        {post.comments}
                      </span>
                      <span>• {post.timestamp}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Research Tab */}
          <TabsContent value="research" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Genealogy Research</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <BookOpen className="h-5 w-5 text-blue-600" />
                      <div>
                        <h4 className="font-medium">Rodriguez Family Tree</h4>
                        <p className="text-sm text-gray-600">
                          Tracing family lineage from 1890s
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <BookOpen className="h-5 w-5 text-blue-600" />
                      <div>
                        <h4 className="font-medium">Parish Records Search</h4>
                        <p className="text-sm text-gray-600">
                          Baptismal records 1920-1950
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
