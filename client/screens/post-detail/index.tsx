import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { useAuth } from '@/contexts/AuthContext';
import { useSeasonTheme } from '@/contexts/SeasonThemeContext';
import { fetchApi } from '@/utils/api';
import { confirmDialog, notifyError, notifyInfo, notifySuccess } from '@/utils/notify';
import { JoinTripModal } from '@/components/JoinTripModal';

type DisplayType = 'guide' | 'condition' | 'question' | 'review' | 'companion';

const COVER_MAX = 3;

function CoverImages({
  urls,
  height = 200,
}: {
  urls: string[];
  height?: number;
}) {
  const covers = (urls || []).filter(Boolean).slice(0, COVER_MAX);
  if (covers.length === 0) return null;

  if (covers.length === 1) {
    return (
      <Image
        source={{ uri: covers[0] }}
        style={{ width: '100%', height }}
        contentFit="cover"
      />
    );
  }

  return (
    <View className="flex-row" style={{ height }}>
      {covers.map((uri, i) => (
        <Image
          key={`${uri}-${i}`}
          source={{ uri }}
          style={{ flex: 1, height, marginLeft: i === 0 ? 0 : 2 }}
          contentFit="cover"
        />
      ))}
    </View>
  );
}

interface PostDetail {
  id: string;
  title: string;
  content: string;
  display_type: DisplayType;
  type_label: string;
  route_id: string | null;
  route_name: string | null;
  decision_summary: string;
  freshness_label: string;
  is_stale: boolean;
  trust_label: string;
  has_leader_reply: boolean;
  answered: boolean;
  likes: number;
  liked_by_me?: boolean;
  comments: number;
  image_urls: string[];
  is_paid: boolean;
  price: number;
  tags: string[];
  created_at: string;
  interest_count?: number;
  joined_by_me?: boolean;
  is_owner?: boolean;
  companion_meta?: {
    departure_label?: string;
    seats?: number;
    pace?: string;
  };
  author?: {
    name: string;
    avatar_url: string;
    level: number;
    is_certified_leader: boolean;
  };
}

interface CommentNode {
  id: string;
  post_id: string;
  user_id?: string;
  parent_id: string | null;
  content: string;
  author?: {
    name: string;
    avatar_url: string;
    level: number;
    is_certified_leader: boolean;
  };
  created_at: string;
  likes: number;
  liked_by_me?: boolean;
  replies?: CommentNode[];
}

const typeStyle: Record<DisplayType, { color: string; bg: string }> = {
  guide: { color: '#2D6A4F', bg: 'rgba(45,106,79,0.08)' },
  condition: { color: '#C44536', bg: 'rgba(196,69,54,0.1)' },
  question: { color: '#B8860B', bg: 'rgba(233,196,106,0.18)' },
  review: { color: '#8B6914', bg: 'rgba(212,162,118,0.15)' },
  companion: { color: '#2D6A4F', bg: 'rgba(82,183,136,0.16)' },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const FALLBACK_AVATAR =
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80';

function safeAuthor(author?: {
  name?: string;
  avatar_url?: string;
  level?: number;
  is_certified_leader?: boolean;
} | null) {
  return {
    name: author?.name || '山途旅人',
    avatar_url: author?.avatar_url || FALLBACK_AVATAR,
    level: author?.level ?? 1,
    is_certified_leader: !!author?.is_certified_leader,
  };
}

function isOwnComment(
  comment: CommentNode,
  me: { id?: string; name?: string } | null | undefined
) {
  if (!me) return false;
  if (comment.user_id && me.id && comment.user_id === me.id) return true;
  if (!comment.user_id && me.name && comment.author?.name === me.name) return true;
  return false;
}

function CommentItem({
  comment,
  isReply,
  onReply,
  canReply,
  onToggleLike,
}: {
  comment: CommentNode;
  isReply?: boolean;
  onReply: (c: CommentNode) => void;
  canReply: boolean;
  onToggleLike: (c: CommentNode) => void;
}) {
  const author = safeAuthor(comment.author);
  const liked = !!comment.liked_by_me;
  return (
    <View className={isReply ? 'ml-10 mt-3' : 'mt-4'}>
      <View className="flex-row items-start">
        <Image
          source={{ uri: author.avatar_url }}
          style={{
            width: isReply ? 28 : 36,
            height: isReply ? 28 : 36,
            borderRadius: isReply ? 14 : 18,
          }}
          contentFit="cover"
        />
        <View className="ml-2.5 flex-1">
          <View className="flex-row items-center gap-1.5 flex-wrap">
            <Text className="text-sm font-semibold text-foreground">{author.name}</Text>
            {author.is_certified_leader ? (
              <View className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}>
                <Text className="text-xs font-medium" style={{ color: '#2D6A4F' }}>
                  认证领队
                </Text>
              </View>
            ) : (
              <Text className="text-xs text-muted">Lv.{author.level}</Text>
            )}
            <Text className="text-xs text-muted">{formatTime(comment.created_at)}</Text>
          </View>
          <View className="flex-row items-end mt-1.5 gap-2">
            <Text className="flex-1 text-sm text-foreground" style={{ lineHeight: 21 }}>
              {comment.content}
            </Text>
            <TouchableOpacity
              onPress={() => onToggleLike(comment)}
              className="flex-row items-center gap-1 pb-0.5"
              activeOpacity={0.7}
              hitSlop={6}
            >
              <FontAwesome6
                name="heart"
                solid={liked}
                size={12}
                color={liked ? '#C44536' : '#8B7D6B'}
              />
              <Text className="text-xs" style={{ color: liked ? '#C44536' : '#8B7D6B' }}>
                {comment.likes ?? 0}
              </Text>
            </TouchableOpacity>
          </View>
          {!isReply && canReply ? (
            <TouchableOpacity
              onPress={() => onReply(comment)}
              className="mt-2 self-start flex-row items-center gap-1"
              activeOpacity={0.7}
            >
              <FontAwesome6 name="reply" size={11} color="#8B7D6B" />
              <Text className="text-xs text-muted">回复</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      {comment.replies?.map((r) => (
        <CommentItem
          key={r.id}
          comment={r}
          isReply
          onReply={onReply}
          canReply={false}
          onToggleLike={onToggleLike}
        />
      ))}
    </View>
  );
}

export default function PostDetailScreen() {
  const insets = useSafeAreaInsets();
  const { palette } = useSeasonTheme();
  const router = useSafeRouter();
  const { user } = useAuth();
  const { id } = useSafeSearchParams<{ id: string }>();
  const inputRef = useRef<TextInput>(null);

  const [post, setPost] = useState<PostDetail | null>(null);
  const [comments, setComments] = useState<CommentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<CommentNode | null>(null);
  const [sending, setSending] = useState(false);
  const [likingPost, setLikingPost] = useState(false);
  const [joining, setJoining] = useState(false);
  const [markingAnswered, setMarkingAnswered] = useState(false);
  const [joinTripOpen, setJoinTripOpen] = useState(false);
  const [joinRouteId, setJoinRouteId] = useState<string | null>(null);
  const [joinRouteName, setJoinRouteName] = useState<string | null>(null);

  const patchCommentLike = (list: CommentNode[], id: string, liked: boolean, likes: number): CommentNode[] =>
    list.map((c) => {
      if (c.id === id) return { ...c, liked_by_me: liked, likes };
      if (c.replies?.length) {
        return { ...c, replies: patchCommentLike(c.replies, id, liked, likes) };
      }
      return c;
    });

  const togglePostLike = async () => {
    if (!id || !post || likingPost) return;
    setLikingPost(true);
    const prevLiked = !!post.liked_by_me;
    const prevLikes = post.likes ?? 0;
    setPost({
      ...post,
      liked_by_me: !prevLiked,
      likes: Math.max(0, prevLikes + (prevLiked ? -1 : 1)),
    });
    try {
      const res = await fetchApi<{ data: { liked: boolean; likes: number } }>(
        `/api/v1/community/posts/${id}/like`,
        { method: 'POST' }
      );
      setPost((p) =>
        p
          ? { ...p, liked_by_me: res.data.liked, likes: res.data.likes }
          : p
      );
    } catch (e) {
      setPost((p) => (p ? { ...p, liked_by_me: prevLiked, likes: prevLikes } : p));
      notifyError('点赞失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setLikingPost(false);
    }
  };

  const toggleCommentLike = async (c: CommentNode) => {
    const prevLiked = !!c.liked_by_me;
    const prevLikes = c.likes ?? 0;
    setComments((list) =>
      patchCommentLike(list, c.id, !prevLiked, Math.max(0, prevLikes + (prevLiked ? -1 : 1)))
    );
    try {
      const res = await fetchApi<{ data: { liked: boolean; likes: number } }>(
        `/api/v1/community/comments/${c.id}/like`,
        { method: 'POST' }
      );
      setComments((list) => patchCommentLike(list, c.id, res.data.liked, res.data.likes));
    } catch (e) {
      setComments((list) => patchCommentLike(list, c.id, prevLiked, prevLikes));
      notifyError('点赞失败', e instanceof Error ? e.message : '请稍后重试');
    }
  };

  const joinCompanion = async () => {
    if (!id || !post || joining || post.joined_by_me || post.is_owner) return;
    setJoining(true);
    try {
      const res = await fetchApi<{
        data: {
          joined: boolean;
          already?: boolean;
          interest_count: number;
          companion_meta?: PostDetail['companion_meta'];
          route_id?: string;
          route_name?: string;
        };
      }>(`/api/v1/community/posts/${id}/join`, {
        method: 'POST',
        body: JSON.stringify({ note: '想加入，节奏合适可私聊' }),
      });
      setPost((prev) =>
        prev
          ? {
              ...prev,
              joined_by_me: true,
              interest_count: res.data.interest_count,
              companion_meta: res.data.companion_meta || prev.companion_meta,
            }
          : prev
      );
      const routeId = res.data.route_id || post.route_id;
      const routeName = res.data.route_name || post.route_name || post.title;
      if (routeId) {
        setJoinRouteId(routeId);
        setJoinRouteName(routeName);
        confirmDialog(
          res.data.already ? '已报名' : '已发送加入意向',
          '楼主会收到站内信。座位已更新。是否将该路线加入自己的行程，继续清单与守护？',
          {
            confirmText: '加入我的行程',
            cancelText: '稍后',
            onConfirm: () => setJoinTripOpen(true),
          }
        );
      } else {
        notifySuccess(
          res.data.already ? '已报名' : '已发送加入意向',
          '楼主会在消息中收到通知；该约伴未关联路线，请自行到发现页选线'
        );
      }
    } catch (e) {
      notifyError('报名失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setJoining(false);
    }
  };

  const markAnswered = async () => {
    if (!id || !post || markingAnswered || post.answered) return;
    setMarkingAnswered(true);
    try {
      const res = await fetchApi<{ data: PostDetail }>(
        `/api/v1/community/posts/${id}/answered`,
        { method: 'POST' }
      );
      setPost(res.data);
      notifySuccess('已标记', '求助已标记为已解答');
    } catch (e) {
      notifyError('操作失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setMarkingAnswered(false);
    }
  };

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [postRes, commentsRes] = await Promise.all([
        fetchApi<{ data: PostDetail }>(`/api/v1/community/posts/${id}`),
        fetchApi<{ data: CommentNode[] }>(`/api/v1/community/posts/${id}/comments`),
      ]);
      setPost(postRes.data);
      setComments(Array.isArray(commentsRes.data) ? commentsRes.data : []);
    } catch {
      setPost(null);
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const startReply = (c: CommentNode) => {
    if (isOwnComment(c, user)) {
      notifyInfo('提示', '不能回复自己的评论');
      return;
    }
    setReplyTo(c);
    inputRef.current?.focus();
  };

  const cancelReply = () => setReplyTo(null);

  const submit = async () => {
    if (!id || !draft.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetchApi<{
        data?: CommentNode;
        tree?: CommentNode[];
        comments_count?: number;
      }>(`/api/v1/community/posts/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          content: draft.trim(),
          parent_id: replyTo?.id ?? null,
        }),
      });
      const tree = Array.isArray(res.tree) ? res.tree : null;
      if (tree) {
        setComments(tree);
      } else {
        const commentsRes = await fetchApi<{ data: CommentNode[] }>(
          `/api/v1/community/posts/${id}/comments`
        );
        setComments(Array.isArray(commentsRes.data) ? commentsRes.data : []);
      }
      setPost((prev) =>
        prev
          ? {
              ...prev,
              comments:
                typeof res.comments_count === 'number'
                  ? res.comments_count
                  : prev.comments + 1,
            }
          : prev
      );
      setDraft('');
      setReplyTo(null);
    } catch (e) {
      notifyError('发送失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setSending(false);
    }
  };

  const style = post
    ? typeStyle[post.display_type] ?? typeStyle.guide
    : typeStyle.guide;
  const postAuthor = safeAuthor(post?.author);
  const replyAuthor = safeAuthor(replyTo?.author);

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View
          className="flex-row items-center px-4 pb-3"
          style={{ paddingTop: insets.top + 8, borderBottomWidth: 1, borderBottomColor: '#F1EBE0' }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 items-center justify-center"
            activeOpacity={0.7}
          >
            <FontAwesome6 name="chevron-left" size={18} color="#3D3229" />
          </TouchableOpacity>
          <Text className="flex-1 text-center text-base font-bold text-foreground">帖子详情</Text>
          <View className="w-10" />
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#2D6A4F" />
            <Text className="text-muted text-sm mt-3">加载中…</Text>
          </View>
        ) : !post ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-muted text-sm mb-3">帖子不存在或加载失败</Text>
            <TouchableOpacity onPress={load}>
              <Text style={{ color: '#2D6A4F', fontWeight: '600' }}>重试</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <CoverImages urls={post.image_urls || []} height={200} />

              <View className="px-5 pt-4">
                <View className="flex-row items-center mb-3">
                  <Image
                    source={{ uri: postAuthor.avatar_url }}
                    style={{ width: 40, height: 40, borderRadius: 20 }}
                    contentFit="cover"
                  />
                  <View className="ml-3 flex-1">
                    <View className="flex-row items-center gap-1.5 flex-wrap">
                      <Text className="text-sm font-semibold text-foreground">{postAuthor.name}</Text>
                      <View
                        className="px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
                      >
                        <Text className="text-xs font-medium" style={{ color: '#2D6A4F' }}>
                          {post.trust_label}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-xs text-muted mt-0.5">
                      {post.freshness_label}
                      {post.is_stale ? ' · 信息可能过时' : ''}
                    </Text>
                  </View>
                  <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: style.bg }}>
                    <Text className="text-xs font-semibold" style={{ color: style.color }}>
                      {post.type_label}
                    </Text>
                  </View>
                </View>

                <Text className="text-xl font-bold text-foreground mb-2" style={{ lineHeight: 28 }}>
                  {post.title}
                </Text>
                <Text className="text-sm mb-3" style={{ color: '#2D6A4F', lineHeight: 22 }}>
                  {post.decision_summary}
                </Text>
                <Text className="text-sm text-foreground mb-4" style={{ lineHeight: 24 }}>
                  {post.content}
                </Text>

                {(post.image_urls || []).length > COVER_MAX ? (
                  <View className="mb-4">
                    {(post.image_urls || []).slice(COVER_MAX).map((uri, i) => (
                      <Image
                        key={`more-${i}`}
                        source={{ uri }}
                        style={{
                          width: '100%',
                          height: 200,
                          marginBottom: i < (post.image_urls.length - COVER_MAX - 1) ? 8 : 0,
                          borderRadius: 12,
                        }}
                        contentFit="cover"
                      />
                    ))}
                  </View>
                ) : null}

                <View className="flex-row items-center flex-wrap gap-2 mb-4">
                  {post.route_id && post.route_name ? (
                    <TouchableOpacity
                      onPress={() => router.push('/route-detail', { id: post.route_id })}
                      className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
                      style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
                      activeOpacity={0.8}
                    >
                      <FontAwesome6 name="mountain" size={12} color="#2D6A4F" />
                      <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
                        {post.route_name}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {post.tags?.slice(0, 4).map((tag) => (
                    <View
                      key={tag}
                      className="px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: 'rgba(61,50,41,0.06)' }}
                    >
                      <Text className="text-xs text-muted">#{tag}</Text>
                    </View>
                  ))}
                </View>

                <View
                  className="flex-row items-center gap-4 pb-4 mb-2"
                  style={{ borderBottomWidth: 1, borderBottomColor: '#F1EBE0' }}
                >
                  <TouchableOpacity
                    onPress={togglePostLike}
                    disabled={likingPost}
                    className="flex-row items-center gap-1.5"
                    activeOpacity={0.75}
                    hitSlop={8}
                  >
                    <FontAwesome6
                      name="heart"
                      solid={!!post.liked_by_me}
                      size={14}
                      color={post.liked_by_me ? '#C44536' : '#8B7D6B'}
                    />
                    <Text
                      className="text-xs font-semibold"
                      style={{ color: post.liked_by_me ? '#C44536' : '#8B7D6B' }}
                    >
                      {post.likes ?? 0}
                    </Text>
                  </TouchableOpacity>
                  <View className="flex-row items-center gap-1.5">
                    <FontAwesome6 name="comment" size={13} color="#8B7D6B" />
                    <Text className="text-xs text-muted">{post.comments} 条评论</Text>
                  </View>
                  {post.display_type === 'question' ? (
                    <Text
                      className="text-xs font-semibold"
                      style={{ color: post.has_leader_reply ? '#2D6A4F' : '#C44536' }}
                    >
                      {post.has_leader_reply ? '领队已答' : post.answered ? '已有回复' : '待解答'}
                    </Text>
                  ) : null}
                </View>

                {post.display_type === 'companion' ? (
                  <View
                    className="mb-4 p-3.5 flex-row items-center justify-between"
                    style={{
                      backgroundColor: 'rgba(82,183,136,0.12)',
                      borderRadius: 14,
                    }}
                  >
                    <View className="flex-1 pr-3">
                      <Text className="text-sm font-bold" style={{ color: '#2D6A4F' }}>
                        {post.companion_meta?.departure_label || '约伴中'}
                        {post.companion_meta?.seats != null
                          ? ` · 空位 ${post.companion_meta.seats}`
                          : ''}
                      </Text>
                      <Text className="text-xs text-muted mt-1">
                        已有 {post.interest_count ?? 0} 人想加入
                      </Text>
                    </View>
                    {!post.is_owner ? (
                      <TouchableOpacity
                        onPress={joinCompanion}
                        disabled={joining || !!post.joined_by_me}
                        className="px-3.5 py-2 rounded-full"
                        style={{
                          backgroundColor: post.joined_by_me ? 'rgba(45,106,79,0.2)' : '#2D6A4F',
                        }}
                      >
                        <Text className="text-xs font-bold text-white">
                          {post.joined_by_me ? '已报名' : joining ? '提交中…' : '+1 想加入'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
                        我发起的
                      </Text>
                    )}
                  </View>
                ) : null}

                {post.display_type === 'question' && post.is_owner && !post.answered ? (
                  <TouchableOpacity
                    onPress={markAnswered}
                    disabled={markingAnswered}
                    className="mb-4 py-2.5 items-center rounded-xl"
                    style={{ backgroundColor: 'rgba(184,134,11,0.15)' }}
                  >
                    <Text className="text-xs font-bold" style={{ color: '#8B6914' }}>
                      {markingAnswered ? '处理中…' : '标记为已解答'}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <Text className="text-base font-bold text-foreground mt-2 mb-1">
                  评论 {comments.length > 0 ? `(${post.comments})` : ''}
                </Text>
                {comments.length === 0 ? (
                  <View className="py-10 items-center">
                    <Text className="text-sm text-muted">还没有评论，来写第一条吧</Text>
                  </View>
                ) : (
                  comments.map((c) => (
                    <CommentItem
                      key={c.id}
                      comment={c}
                      onReply={startReply}
                      canReply={!isOwnComment(c, user)}
                      onToggleLike={toggleCommentLike}
                    />
                  ))
                )}
              </View>
            </ScrollView>

            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: '#F1EBE0',
                backgroundColor: palette.background,
                paddingBottom: Math.max(insets.bottom, 10),
                paddingHorizontal: 16,
                paddingTop: 10,
              }}
            >
              {replyTo ? (
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-xs text-muted flex-1" numberOfLines={1}>
                    回复 {replyAuthor.name}：{replyTo.content}
                  </Text>
                  <TouchableOpacity onPress={cancelReply} hitSlop={8}>
                    <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
                      取消
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <View className="flex-row items-end gap-2">
                <TextInput
                  ref={inputRef}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={replyTo ? `回复 ${replyAuthor.name}…` : '写评论…'}
                  placeholderTextColor="#A89888"
                  multiline
                  maxLength={500}
                  style={{
                    flex: 1,
                    minHeight: 40,
                    maxHeight: 100,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 20,
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#E8DFD0',
                    fontSize: 14,
                    color: '#3D3229',
                    lineHeight: 20,
                  }}
                />
                <TouchableOpacity
                  onPress={submit}
                  disabled={!draft.trim() || sending}
                  className="px-4 py-2.5 rounded-full"
                  style={{
                    backgroundColor: draft.trim() && !sending ? '#2D6A4F' : 'rgba(45,106,79,0.35)',
                  }}
                  activeOpacity={0.85}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text className="text-sm font-semibold text-white">发送</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
      {joinRouteId || post?.route_id ? (
        <JoinTripModal
          visible={joinTripOpen}
          routeId={joinRouteId || post?.route_id || null}
          routeName={joinRouteName || post?.route_name || post?.title}
          onClose={() => setJoinTripOpen(false)}
        />
      ) : null}
    </Screen>
  );
}
