import React, { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Trophy, Star, Zap, Medal, Loader, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const API = "/parish-connect/api";
const getToken = () =>
    localStorage.getItem("parish_token") || sessionStorage.getItem("parish_token");

interface BadgeDef {
    slug: string;
    name: string;
    description: string;
    icon: string;
    earned: boolean;
    earned_at: string | null;
}

interface Transaction {
    action: string;
    points: number;
    created_at: string;
}

interface MyRewards {
    total_points: number;
    rank: number;
    badges: BadgeDef[];
    transactions: Transaction[];
}

interface LeaderEntry {
    id: string;
    name: string;
    avatar?: string;
    role: string;
    total_points: number;
    badge_count: number;
}

const ACTION_LABELS: Record<string, string> = {
    post_created: "Published a post",
    comment_added: "Left a comment",
    like_received: "Received a like",
    kudos_received: "Received praise",
    kudos_sent: "Gave praise",
    follow_received: "Gained a follower",
    daily_login: "Daily login",
};

const ACTION_ICONS: Record<string, string> = {
    post_created: "✍️",
    comment_added: "💬",
    like_received: "❤️",
    kudos_received: "💛",
    kudos_sent: "💛",
    follow_received: "🤝",
    daily_login: "☀️",
};

export default function Rewards() {
    const { user } = useAuth();
    const [myRewards, setMyRewards] = useState<MyRewards | null>(null);
    const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingBoard, setLoadingBoard] = useState(false);
    const [tab, setTab] = useState("overview");

    useEffect(() => {
        fetchMyRewards();
    }, []);

    useEffect(() => {
        if (tab === "leaderboard" && leaderboard.length === 0) fetchLeaderboard();
    }, [tab]);

    const fetchMyRewards = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API}/rewards`, {
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            const data = await res.json();
            if (data.success) setMyRewards(data.data);
        } catch {
            toast.error("Failed to load rewards");
        } finally {
            setLoading(false);
        }
    };

    const fetchLeaderboard = async () => {
        try {
            setLoadingBoard(true);
            const res = await fetch(`${API}/rewards/leaderboard`, {
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            const data = await res.json();
            if (data.success) setLeaderboard(data.data);
        } catch {
            toast.error("Failed to load leaderboard");
        } finally {
            setLoadingBoard(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <Loader className="h-6 w-6 animate-spin" />
            </div>
        );
    }

    const earnedBadges = myRewards?.badges.filter((b) => b.earned) ?? [];
    const lockedBadges = myRewards?.badges.filter((b) => !b.earned) ?? [];

    return (
        <div className="max-w-3xl mx-auto px-4 py-6 pb-24 md:pb-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="bg-yellow-500 p-2 rounded-lg">
                    <Trophy className="h-6 w-6 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-semibold">Rewards</h1>
                    <p className="text-sm text-gray-500">Earn GBless Points by engaging with your parish community</p>
                </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-5 text-center">
                        <Star className="h-6 w-6 text-yellow-500 mx-auto mb-1" />
                        <p className="text-2xl font-bold">{myRewards?.total_points ?? 0}</p>
                        <p className="text-xs text-gray-500">GBless Points</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-5 text-center">
                        <TrendingUp className="h-6 w-6 text-blue-500 mx-auto mb-1" />
                        <p className="text-2xl font-bold">#{myRewards?.rank ?? "—"}</p>
                        <p className="text-xs text-gray-500">Parish Rank</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-5 text-center">
                        <Medal className="h-6 w-6 text-purple-500 mx-auto mb-1" />
                        <p className="text-2xl font-bold">{earnedBadges.length}</p>
                        <p className="text-xs text-gray-500">Badges Earned</p>
                    </CardContent>
                </Card>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="badges">Badges</TabsTrigger>
                    <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
                </TabsList>

                {/* Overview — recent activity */}
                <TabsContent value="overview" className="mt-4 space-y-3">
                    <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">How to earn GBless Points</h2>
                    <div className="grid grid-cols-2 gap-3">
                        {Object.entries(ACTION_LABELS).filter(([a]) => !['kudos_sent'].includes(a)).map(([action, label]) => (
                            <div key={action} className="flex items-center gap-2 bg-gray-50 rounded-lg p-3 text-sm">
                                <span className="text-lg">{ACTION_ICONS[action]}</span>
                                <div>
                                    <p className="font-medium">{label}</p>
                                    <p className="text-xs text-gray-400">+{({ post_created: 10, comment_added: 5, like_received: 2, kudos_received: 15, follow_received: 3, daily_login: 5 } as Record<string, number>)[action]} GBless</p>
                                </div>
                            </div>
                        ))}
                        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-100 rounded-lg p-3 text-sm">
                            <span className="text-lg">💛</span>
                            <div>
                                <p className="font-medium">Give praise</p>
                                <p className="text-xs text-gray-400">−15 GBless from you, +15 to them</p>
                            </div>
                        </div>
                    </div>

                    <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide pt-2">Recent activity</h2>
                    {(myRewards?.transactions ?? []).length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-6">No activity yet. Start engaging!</p>
                    )}
                    <div className="space-y-2">
                        {(myRewards?.transactions ?? []).map((tx, i) => (
                            <div key={i} className="flex items-center justify-between bg-white border rounded-lg px-4 py-3">
                                <div className="flex items-center gap-3">
                                    <span className="text-lg">{ACTION_ICONS[tx.action] ?? "⚡"}</span>
                                    <div>
                                        <p className="text-sm font-medium">{ACTION_LABELS[tx.action] ?? tx.action}</p>
                                        <p className="text-xs text-gray-400">
                                            {formatDistanceToNow(new Date(tx.created_at + "Z"), { addSuffix: true })}
                                        </p>
                                    </div>
                                </div>
                                <span className={`text-sm font-semibold ${tx.points >= 0 ? "text-green-600" : "text-red-500"}`}>
                                    {tx.points >= 0 ? "+" : ""}{tx.points} GBless
                                </span>
                            </div>
                        ))}
                    </div>
                </TabsContent>

                {/* Badges */}
                <TabsContent value="badges" className="mt-4 space-y-4">
                    {earnedBadges.length > 0 && (
                        <>
                            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Earned</h2>
                            <div className="grid grid-cols-2 gap-3">
                                {earnedBadges.map((b) => (
                                    <div key={b.slug} className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                                        <span className="text-3xl">{b.icon}</span>
                                        <div>
                                            <p className="font-semibold text-sm">{b.name}</p>
                                            <p className="text-xs text-gray-500">{b.description}</p>
                                            {b.earned_at && (
                                                <p className="text-xs text-yellow-600 mt-1">
                                                    {formatDistanceToNow(new Date(b.earned_at + "Z"), { addSuffix: true })}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                    {lockedBadges.length > 0 && (
                        <>
                            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Locked</h2>
                            <div className="grid grid-cols-2 gap-3">
                                {lockedBadges.map((b) => (
                                    <div key={b.slug} className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl p-4 opacity-60">
                                        <span className="text-3xl grayscale">{b.icon}</span>
                                        <div>
                                            <p className="font-semibold text-sm text-gray-500">{b.name}</p>
                                            <p className="text-xs text-gray-400">{b.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </TabsContent>

                {/* Leaderboard */}
                <TabsContent value="leaderboard" className="mt-4">
                    {loadingBoard && (
                        <div className="flex justify-center py-12">
                            <Loader className="h-6 w-6 animate-spin" />
                        </div>
                    )}
                    <div className="space-y-2">
                        {leaderboard.map((entry, i) => {
                            const isMe = entry.id === user?.id;
                            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
                            return (
                                <Link to={`/profile/${entry.id}`} key={entry.id}>
                                    <div className={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors hover:bg-gray-50 ${isMe ? "bg-blue-50 border-blue-200" : "bg-white"}`}>
                                        <span className="w-6 text-center text-sm font-bold text-gray-400">
                                            {medal ?? `${i + 1}`}
                                        </span>
                                        <Avatar className="h-9 w-9">
                                            <AvatarImage src={entry.avatar} alt={entry.name} />
                                            <AvatarFallback>{entry.name[0]}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">
                                                {entry.name} {isMe && <span className="text-blue-500 text-xs">(you)</span>}
                                            </p>
                                            <p className="text-xs text-gray-400">{entry.badge_count} badge{entry.badge_count !== 1 ? "s" : ""}</p>
                                        </div>
                                        <div className="flex items-center gap-1 text-yellow-600 font-semibold text-sm">
                                            <Zap className="h-3.5 w-3.5" />
                                            {entry.total_points} GBless
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
