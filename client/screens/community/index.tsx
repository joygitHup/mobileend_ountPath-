import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import {
  PHONE_FRAME_BREAKPOINT,
  PHONE_WIDTH,
} from '@/components/MobileShell';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { useNotifications } from '@/contexts/NotificationContext';
import { fetchApi } from '@/utils/api';
import { confirmDialog, notifyError, notifyInfo, notifySuccess } from '@/utils/notify';
import { uploadMediaMany } from '@/utils/upload';

type DisplayType = 'guide' | 'condition' | 'question' | 'review' | 'companion';

const MAX_IMAGES = 9;
const COVER_MAX = 3;

/** 封面：按 1/2/3 张动态排布，最多展示三张 */
function CoverImages({
  urls,
  height = 140,
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

  if (covers.length === 2) {
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

interface BoardPost {
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

interface LeaderCard {
  id: string;
  name: string;
  avatar_url: string;
  specialties: string[];
  stats: {
    total_trips: number;
    accident_rate: number;
    avg_rating: number;
  };
  highlight: string;
  bio: string;
}

interface CommunityBoard {
  intro: string;
  trip_route_id: string | null;
  trip_route_name: string | null;
  trip_id?: string | null;
  focus_route_id?: string | null;
  focus_route_name?: string | null;
  companions?: BoardPost[];
  companions_total?: number;
  conditions: BoardPost[];
  leaders: LeaderCard[];
  trip_related: BoardPost[];
  guides: BoardPost[];
  open_questions: BoardPost[];
  hot_tags?: string[];
  search_hints?: string[];
}

function normalizeBoard(raw: Partial<CommunityBoard> | null | undefined): CommunityBoard | null {
  if (!raw) return null;
  return {
    intro: raw.intro || '精选路况、约伴与可信经验',
    trip_route_id: raw.trip_route_id ?? null,
    trip_route_name: raw.trip_route_name ?? null,
    trip_id: raw.trip_id ?? null,
    focus_route_id: raw.focus_route_id ?? null,
    focus_route_name: raw.focus_route_name ?? null,
    companions: raw.companions ?? [],
    companions_total: raw.companions_total ?? (raw.companions?.length ?? 0),
    conditions: raw.conditions ?? [],
    leaders: raw.leaders ?? [],
    trip_related: raw.trip_related ?? [],
    guides: raw.guides ?? [],
    open_questions: raw.open_questions ?? [],
    hot_tags: raw.hot_tags ?? [],
    search_hints: raw.search_hints ?? [],
  };
}

const typeStyle: Record<DisplayType, { color: string; bg: string }> = {
  guide: { color: '#2D6A4F', bg: 'rgba(45,106,79,0.08)' },
  condition: { color: '#C44536', bg: 'rgba(196,69,54,0.1)' },
  question: { color: '#B8860B', bg: 'rgba(233,196,106,0.18)' },
  review: { color: '#8B6914', bg: 'rgba(212,162,118,0.15)' },
  companion: { color: '#2D6A4F', bg: 'rgba(82,183,136,0.16)' },
};

function SectionHeader({
  title,
  subtitle,
  accent = '#2D6A4F',
}: {
  title: string;
  subtitle?: string;
  accent?: string;
}) {
  return (
    <View className="mb-3">
      <View className="flex-row items-center gap-2 mb-1">
        <View style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: accent }} />
        <Text className="text-lg font-bold text-foreground">{title}</Text>
      </View>
      {subtitle ? (
        <Text className="text-xs text-muted ml-3" style={{ lineHeight: 18 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function PostCard({
  post,
  onOpenRoute,
  onOpenPost,
  onToggleLike,
}: {
  post: BoardPost;
  onOpenRoute: (routeId: string) => void;
  onOpenPost: (postId: string) => void;
  onToggleLike?: (post: BoardPost) => void;
}) {
  const style = typeStyle[post.display_type] ?? typeStyle.guide;
  const author = {
    name: post.author?.name || '山途旅人',
    avatar_url:
      post.author?.avatar_url ||
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80',
  };
  const liked = !!post.liked_by_me;

  return (
    <TouchableOpacity
      onPress={() => onOpenPost(post.id)}
      activeOpacity={0.88}
      className="bg-surface mb-3 overflow-hidden"
      style={{
        borderTopLeftRadius: 28,
        borderTopRightRadius: 10,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 28,
        shadowColor: '#3D3229',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.07,
        shadowRadius: 10,
        elevation: 2,
        borderWidth: post.display_type === 'condition' ? 1 : 0,
        borderColor: post.display_type === 'condition' ? 'rgba(196,69,54,0.18)' : 'transparent',
      }}
    >
      <CoverImages urls={post.image_urls || []} height={140} />

      <View className="p-4">
        <View className="flex-row items-center mb-2.5">
          <Image
            source={{ uri: author.avatar_url }}
            style={{ width: 34, height: 34, borderRadius: 17 }}
            contentFit="cover"
          />
          <View className="ml-2.5 flex-1">
            <View className="flex-row items-center gap-1.5 flex-wrap">
              <Text className="text-sm font-semibold text-foreground">{author.name}</Text>
              <View className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}>
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

        <Text className="text-base font-bold text-foreground mb-1.5">{post.title}</Text>
        <Text className="text-sm mb-2" style={{ color: '#2D6A4F', lineHeight: 20 }}>
          {post.decision_summary}
        </Text>
        <Text className="text-sm text-muted" numberOfLines={2} style={{ lineHeight: 20 }}>
          {post.content}
        </Text>

        <View className="flex-row items-center justify-between mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: '#F1EBE0' }}>
          <View className="flex-row items-center gap-3 flex-1">
            {post.route_id && post.route_name ? (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  onOpenRoute(post.route_id!);
                }}
                className="flex-row items-center gap-1 px-2.5 py-1 rounded-full"
                style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
                activeOpacity={0.8}
              >
                <FontAwesome6 name="mountain" size={11} color="#2D6A4F" />
                <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }} numberOfLines={1}>
                  {post.route_name}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text className="text-xs text-muted">未绑定路线</Text>
            )}
          </View>

          <View className="flex-row items-center gap-3">
            {post.display_type === 'companion' && (
              <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
                {post.companion_meta?.departure_label || '约伴中'}
                {post.companion_meta?.seats != null ? ` · 空位${post.companion_meta.seats}` : ''}
              </Text>
            )}
            {post.display_type === 'question' && (
              <Text
                className="text-xs font-semibold"
                style={{ color: post.has_leader_reply ? '#2D6A4F' : '#C44536' }}
              >
                {post.has_leader_reply ? '领队已答' : post.answered ? '已有回复' : '待解答'}
              </Text>
            )}
            {post.is_paid && (
              <Text className="text-xs font-bold" style={{ color: '#D4A276' }}>
                ¥{post.price}
              </Text>
            )}
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation?.();
                onToggleLike?.(post);
              }}
              className="flex-row items-center gap-1"
              hitSlop={8}
              activeOpacity={0.75}
            >
              <FontAwesome6
                name="heart"
                solid={liked}
                size={12}
                color={liked ? '#C44536' : '#8B7D6B'}
              />
              <Text className="text-xs" style={{ color: liked ? '#C44536' : '#8B7D6B' }}>
                {post.likes ?? 0}
              </Text>
            </TouchableOpacity>
            <View className="flex-row items-center gap-1">
              <FontAwesome6 name="comment" size={12} color="#8B7D6B" />
              <Text className="text-xs text-muted">{post.comments}</Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

type PublishType = 'companion' | 'question' | 'guide' | 'review';

const PUBLISH_TYPES: { key: PublishType; label: string; hint: string }[] = [
  { key: 'companion', label: '约伴', hint: '找同行，须绑定路线' },
  { key: 'question', label: '求助', hint: '提问求建议' },
  { key: 'guide', label: '攻略', hint: '可执行经验' },
  { key: 'review', label: '路况/体验', hint: '近期核实或完赛分享' },
];

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const router = useSafeRouter();
  const { markCommunitySeen } = useNotifications();
  const params = useSafeSearchParams<{
    routeId?: string;
    tripId?: string;
    intent?: string;
  }>();
  /** Web 宽屏预览：Modal 会脱离 MobileShell，需手动对齐手机画幅 */
  const phoneFramed = Platform.OS === 'web' && winW >= PHONE_FRAME_BREAKPOINT;
  const sheetWidth = phoneFramed ? PHONE_WIDTH : winW;
  const sheetMaxHeight = phoneFramed
    ? Math.min(Math.max(winH - 40, 640), 860) * 0.92
    : Math.min(winH * 0.92, winH - insets.top - 8);
  const [board, setBoard] = useState<CommunityBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'curated' | 'condition' | 'guide' | 'question' | 'companion'>(
    'curated'
  );
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeType, setComposeType] = useState<PublishType>('question');
  const [composeTypeLocked, setComposeTypeLocked] = useState(false);
  const [composeTitle, setComposeTitle] = useState('');
  const [composeNote, setComposeNote] = useState('');
  const [composeDeparture, setComposeDeparture] = useState('');
  const [composeRouteId, setComposeRouteId] = useState<string | null>(null);
  const [composeImages, setComposeImages] = useState<string[]>([]);
  const [routeOptions, setRouteOptions] = useState<{ id: string; name: string }[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchPosts, setSearchPosts] = useState<BoardPost[] | null>(null);
  const focusRouteId = params.routeId || board?.focus_route_id || board?.trip_route_id || null;
  const focusTripId = params.tripId || board?.trip_id || null;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const q = params.routeId ? `?route_id=${encodeURIComponent(params.routeId)}` : '';
      const res = await fetchApi<{ data: CommunityBoard }>(`/api/v1/community/board${q}`);
      setBoard(normalizeBoard(res.data));
    } catch {
      setBoard(null);
    } finally {
      setLoading(false);
    }
  }, [params.routeId]);

  const loadRoutes = useCallback(async () => {
    try {
      const res = await fetchApi<{ data: { id: string; name: string }[] }>('/api/v1/routes');
      setRouteOptions((res.data || []).map((r) => ({ id: r.id, name: r.name })));
    } catch {
      setRouteOptions([]);
    }
  }, []);

  const patchPostLike = useCallback((list: BoardPost[] | undefined, id: string, liked: boolean, likes: number) => {
    if (!list) return list;
    return list.map((p) => (p.id === id ? { ...p, liked_by_me: liked, likes } : p));
  }, []);

  const applyLikeToBoard = useCallback(
    (id: string, liked: boolean, likes: number) => {
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          conditions: patchPostLike(prev.conditions, id, liked, likes) || [],
          guides: patchPostLike(prev.guides, id, liked, likes) || [],
          open_questions: patchPostLike(prev.open_questions, id, liked, likes) || [],
          trip_related: patchPostLike(prev.trip_related, id, liked, likes) || [],
          companions: patchPostLike(prev.companions, id, liked, likes),
        };
      });
      setSearchPosts((prev) => (prev ? patchPostLike(prev, id, liked, likes) || [] : prev));
    },
    [patchPostLike]
  );

  const togglePostLike = useCallback(
    async (post: BoardPost) => {
      const prevLiked = !!post.liked_by_me;
      const prevLikes = post.likes ?? 0;
      applyLikeToBoard(post.id, !prevLiked, Math.max(0, prevLikes + (prevLiked ? -1 : 1)));
      try {
        const res = await fetchApi<{ data: { liked: boolean; likes: number } }>(
          `/api/v1/community/posts/${post.id}/like`,
          { method: 'POST' }
        );
        applyLikeToBoard(post.id, res.data.liked, res.data.likes);
      } catch (e) {
        applyLikeToBoard(post.id, prevLiked, prevLikes);
        notifyError('点赞失败', e instanceof Error ? e.message : '请稍后重试');
      }
    },
    [applyLikeToBoard]
  );

  useFocusEffect(
    useCallback(() => {
      load();
      void markCommunitySeen();
    }, [load, markCommunitySeen])
  );

  const openCompose = useCallback(
    (opts?: { type?: PublishType; lockType?: boolean; routeId?: string | null }) => {
      const fromCompanion = opts?.lockType && opts?.type === 'companion';
      const type = opts?.type || (fromCompanion ? 'companion' : 'question');
      setComposeType(type);
      setComposeTypeLocked(!!opts?.lockType);
      setComposeTitle('');
      setComposeNote('');
      setComposeDeparture('');
      setComposeImages([]);
      setComposeRouteId(opts?.routeId ?? focusRouteId ?? null);
      setComposeOpen(true);
      loadRoutes();
    },
    [focusRouteId, loadRoutes]
  );

  useEffect(() => {
    if (params.intent === 'companion') {
      setTab('companion');
      openCompose({
        type: 'companion',
        lockType: true,
        routeId: params.routeId || null,
      });
    }
    // 仅在从行程/路线带 intent 进入时打开一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.intent, params.routeId, params.tripId]);

  const runSearch = useCallback(async (raw: string, typeFilter?: string) => {
    const q = raw.trim();
    if (!q) {
      setSearchPosts(null);
      setSearchActive(false);
      return;
    }
    setSearchActive(true);
    setSearching(true);
    try {
      const typeQ =
        typeFilter && typeFilter !== 'all'
          ? `&type=${encodeURIComponent(typeFilter)}`
          : tab !== 'curated'
            ? `&type=${encodeURIComponent(tab)}`
            : '';
      const res = await fetchApi<{ data: { posts: BoardPost[]; total: number } }>(
        `/api/v1/community/search?q=${encodeURIComponent(q)}${typeQ}`
      );
      setSearchPosts(res.data.posts || []);
    } catch {
      setSearchPosts([]);
    } finally {
      setSearching(false);
    }
  }, [tab]);

  useEffect(() => {
    if (!searchActive) return;
    const t = setTimeout(() => {
      runSearch(searchText);
    }, 280);
    return () => clearTimeout(t);
  }, [searchText, searchActive, runSearch]);

  const openRoute = (routeId: string) => {
    router.push('/route-detail', { id: routeId });
  };

  const openPost = (postId: string) => {
    router.push('/post-detail', { id: postId });
  };

  const applyHint = (hint: string) => {
    setSearchText(hint);
    setSearchActive(true);
    runSearch(hint);
  };

  const clearSearch = () => {
    setSearchText('');
    setSearchPosts(null);
    setSearchActive(false);
  };

  const pickImages = async () => {
    const remain = MAX_IMAGES - composeImages.length;
    if (remain <= 0) {
      notifyInfo('已达上限', `最多上传 ${MAX_IMAGES} 张图片`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      notifyError('需要相册权限', '请允许访问相册后再上传图片');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remain,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    const next = result.assets.map((a) => a.uri).filter(Boolean);
    setComposeImages((prev) => [...prev, ...next].slice(0, MAX_IMAGES));
  };

  const removeImage = (index: number) => {
    setComposeImages((prev) => prev.filter((_, i) => i !== index));
  };

  const publishPost = async () => {
    if (publishing) return;
    const routeId = composeRouteId || focusRouteId;
    if (composeType === 'companion' && !routeId) {
      notifyError('无法发布', '约伴必须选择或绑定一条路线');
      return;
    }
    if (composeType !== 'companion' && !composeNote.trim()) {
      notifyError('无法发布', '请填写发布内容');
      return;
    }
    setPublishing(true);
    try {
      let imageUrls: string[] = [];
      if (composeImages.length > 0) {
        try {
          imageUrls = await uploadMediaMany(composeImages);
        } catch (upErr) {
          notifyError(
            '图片上传失败',
            upErr instanceof Error ? upErr.message : '请检查网络后重试'
          );
          setPublishing(false);
          return;
        }
      }
      const res = await fetchApi<{ data: BoardPost; board: CommunityBoard }>(
        '/api/v1/community/posts',
        {
          method: 'POST',
          body: JSON.stringify({
            type: composeType,
            route_id: routeId || undefined,
            trip_id: composeType === 'companion' ? focusTripId || undefined : undefined,
            title: composeTitle.trim() || undefined,
            content: composeNote.trim() || undefined,
            departure_label: composeDeparture.trim() || undefined,
            as_condition: composeType === 'review',
            image_urls: imageUrls,
          }),
        }
      );
      if (res.board) setBoard(normalizeBoard(res.board));
      else void load();
      setComposeOpen(false);
      setComposeNote('');
      setComposeTitle('');
      setComposeDeparture('');
      setComposeImages([]);
      if (composeType === 'companion') setTab('companion');
      else if (composeType === 'question') setTab('question');
      else if (composeType === 'guide') setTab('guide');
      else setTab('condition');
      const typeLabel = PUBLISH_TYPES.find((t) => t.key === composeType)?.label || '内容';
      confirmDialog('发布成功', `已发布为「${typeLabel}」`, {
        confirmText: '查看帖子',
        cancelText: '好的',
        onConfirm: () => openPost(res.data.id),
      });
    } catch (e) {
      notifyError('发布失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setPublishing(false);
    }
  };

  const tabs = [
    { key: 'curated' as const, label: '精选' },
    { key: 'companion' as const, label: '约伴' },
    { key: 'condition' as const, label: '路况' },
    { key: 'guide' as const, label: '攻略' },
    { key: 'question' as const, label: '求助' },
  ];

  const companions = board?.companions || [];
  const focusName = board?.focus_route_name || board?.trip_route_name;

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingTop: insets.top + 16 }} className="px-5 pb-3">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="text-2xl font-bold text-foreground">社区</Text>
              <Text className="text-sm text-muted mt-1" style={{ lineHeight: 20 }}>
                {board?.intro || '精选路况、约伴与可信经验'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() =>
                openCompose({
                  type: 'question',
                  lockType: false,
                  routeId: focusRouteId,
                })
              }
              className="px-3 py-2 rounded-full"
              style={{ backgroundColor: '#2D6A4F' }}
            >
              <Text className="text-xs font-bold text-white">发布</Text>
            </TouchableOpacity>
          </View>
          {focusName ? (
            <View
              className="mt-3 px-3 py-2 rounded-2xl flex-row items-center gap-2"
              style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
            >
              <FontAwesome6 name="link" size={12} color="#2D6A4F" />
              <Text className="text-xs flex-1" style={{ color: '#2D6A4F', lineHeight: 17 }}>
                当前关联线路：{focusName}
                {focusTripId ? '（已绑行程）' : ''}
              </Text>
            </View>
          ) : null}

          {/* 搜索 */}
          <View
            className="mt-3 flex-row items-center px-3 py-2.5"
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: searchActive ? 'rgba(45,106,79,0.35)' : 'rgba(61,50,41,0.08)',
            }}
          >
            <FontAwesome6 name="magnifying-glass" size={14} color="#8B7D6B" />
            <TextInput
              value={searchText}
              onChangeText={(t) => {
                setSearchText(t);
                if (t.trim()) setSearchActive(true);
              }}
              onFocus={() => setSearchActive(true)}
              placeholder={
                board?.search_hints?.[0]
                  ? `试试搜「${board.search_hints[0]}」`
                  : '搜索路线、约伴、路况、攻略…'
              }
              placeholderTextColor="#A89888"
              returnKeyType="search"
              onSubmitEditing={() => runSearch(searchText)}
              className="flex-1 mx-2.5 text-sm text-foreground"
              style={{ paddingVertical: 2 }}
            />
            {searchText || searchActive ? (
              <TouchableOpacity onPress={clearSearch} hitSlop={8}>
                <FontAwesome6 name="xmark" size={14} color="#8B7D6B" />
              </TouchableOpacity>
            ) : null}
          </View>

          {!searchActive || !searchText.trim() ? (
            <View className="flex-row flex-wrap gap-1.5 mt-2.5">
              {(board?.hot_tags?.length ? board.hot_tags : board?.search_hints || [])
                .slice(0, 8)
                .map((hint) => (
                  <TouchableOpacity
                    key={hint}
                    onPress={() => applyHint(hint)}
                    className="px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: 'rgba(61,50,41,0.05)' }}
                  >
                    <Text className="text-xs" style={{ color: '#6B5E52' }}>
                      {hint}
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>
          ) : null}
        </View>

        {searchActive && searchText.trim() ? (
          <View className="px-5 mb-2">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-sm font-bold text-foreground">
                搜索结果
                {searchPosts ? ` · ${searchPosts.length}` : ''}
              </Text>
              <TouchableOpacity onPress={clearSearch}>
                <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>
                  返回浏览
                </Text>
              </TouchableOpacity>
            </View>
            {searching ? (
              <View className="py-12 items-center">
                <ActivityIndicator color="#2D6A4F" />
              </View>
            ) : !searchPosts || searchPosts.length === 0 ? (
              <View className="py-12 items-center">
                <Text className="text-sm text-muted mb-2">没有找到相关内容</Text>
                <Text className="text-xs text-muted">试试路线名、约伴、路况、新手等关键词</Text>
              </View>
            ) : (
              searchPosts.map((p) => (
                <PostCard key={`s-${p.id}`} post={p} onOpenRoute={openRoute} onOpenPost={openPost} onToggleLike={togglePostLike} />
              ))
            )}
          </View>
        ) : (
          <>
        <View className="px-5 mb-4">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {tabs.map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTab(t.key)}
                className="px-4 py-2 rounded-full mr-2"
                style={{
                  backgroundColor: tab === t.key ? '#2D6A4F' : 'rgba(45,106,79,0.08)',
                }}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: tab === t.key ? '#fff' : '#2D6A4F' }}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View className="px-5">
          {loading ? (
            <View className="py-20 items-center">
              <ActivityIndicator size="large" color="#2D6A4F" />
              <Text className="text-muted text-sm mt-3">整理可信内容…</Text>
            </View>
          ) : !board ? (
            <View className="py-16 items-center">
              <Text className="text-muted text-sm">暂时无法加载社区</Text>
              <TouchableOpacity onPress={load} className="mt-3">
                <Text style={{ color: '#2D6A4F', fontWeight: '600' }}>重试</Text>
              </TouchableOpacity>
            </View>
          ) : tab === 'companion' ? (
            <>
              <SectionHeader
                title="约伴同行"
                subtitle={
                  focusName
                    ? `「${focusName}」的约伴帖；行程发起会绑定 trip，评论区接洽`
                    : '约伴帖绑定路线；从行程发起可同步行程信息'
                }
                accent="#52B788"
              />
              {companions.length === 0 ? (
                <View className="py-10 items-center">
                  <Text className="text-sm text-muted mb-3">这条路线暂无约伴</Text>
                  <TouchableOpacity
                    onPress={() =>
                      openCompose({
                        type: 'companion',
                        lockType: false,
                        routeId: focusRouteId,
                      })
                    }
                    className="px-4 py-2.5 rounded-full"
                    style={{ backgroundColor: '#2D6A4F' }}
                  >
                    <Text className="text-xs font-bold text-white">发布约伴意向</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                companions.map((p) => (
                  <PostCard key={p.id} post={p} onOpenRoute={openRoute} onOpenPost={openPost} onToggleLike={togglePostLike} />
                ))
              )}
            </>
          ) : tab === 'condition' ? (
            <>
              <SectionHeader title="本周路况" subtitle="近两周绑定路线的核实信息，优先看时效" accent="#C44536" />
              {board.conditions.map((p) => (
                <PostCard key={p.id} post={p} onOpenRoute={openRoute} onOpenPost={openPost} onToggleLike={togglePostLike} />
              ))}
            </>
          ) : tab === 'guide' ? (
            <>
              <SectionHeader title="可执行攻略" subtitle="优先认证领队与完赛经验，可对照清单" />
              {board.guides.map((p) => (
                <PostCard key={p.id} post={p} onOpenRoute={openRoute} onOpenPost={openPost} onToggleLike={togglePostLike} />
              ))}
            </>
          ) : tab === 'question' ? (
            <>
              <SectionHeader title="求助与答疑" subtitle="优先展示有认证领队回复的问题" accent="#B8860B" />
              {board.open_questions.map((p) => (
                <PostCard key={p.id} post={p} onOpenRoute={openRoute} onOpenPost={openPost} onToggleLike={togglePostLike} />
              ))}
            </>
          ) : (
            <>
              <SectionHeader title="近期路况核实" subtitle="先看时效，再决定能不能走" accent="#C44536" />
              {board.conditions.slice(0, 2).map((p) => (
                <PostCard key={`c-${p.id}`} post={p} onOpenRoute={openRoute} onOpenPost={openPost} onToggleLike={togglePostLike} />
              ))}

              {companions.length > 0 ? (
                <>
                  <SectionHeader
                    title="约伴同行"
                    subtitle={
                      focusName
                        ? `与「${focusName}」相关的约伴（共 ${board.companions_total ?? companions.length}）`
                        : '绑定路线的同行意向'
                    }
                    accent="#52B788"
                  />
                  {companions.slice(0, 2).map((p) => (
                    <PostCard key={`cp-${p.id}`} post={p} onOpenRoute={openRoute} onOpenPost={openPost} onToggleLike={togglePostLike} />
                  ))}
                </>
              ) : null}

              <SectionHeader title="认证领队" subtitle="沟通 / 应急 / 专业评分可对照" />
              <View className="mb-4">
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {board.leaders.map((leader) => (
                  <View
                    key={leader.id}
                    className="bg-surface mr-3 p-4"
                    style={{
                      width: 220,
                      borderTopLeftRadius: 22,
                      borderTopRightRadius: 8,
                      borderBottomLeftRadius: 8,
                      borderBottomRightRadius: 22,
                    }}
                  >
                    <View className="flex-row items-center mb-2">
                      <Image
                        source={{ uri: leader.avatar_url }}
                        style={{ width: 40, height: 40, borderRadius: 20 }}
                      />
                      <View className="ml-2 flex-1">
                        <Text className="text-sm font-bold text-foreground">{leader.name}</Text>
                        <Text className="text-xs text-muted" numberOfLines={1}>
                          {leader.highlight}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-xs text-muted mb-2" numberOfLines={2}>
                      {leader.bio}
                    </Text>
                    <View className="flex-row flex-wrap gap-1.5">
                      {leader.specialties.slice(0, 3).map((s) => (
                        <View
                          key={s}
                          className="px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: 'rgba(45,106,79,0.08)' }}
                        >
                          <Text className="text-xs" style={{ color: '#2D6A4F' }}>
                            {s}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <View className="flex-row items-center gap-3 mt-3">
                      <Text className="text-xs text-muted">评分 {leader?.stats?.avg_rating?? '暂无数据'}</Text>
                      <Text className="text-xs text-muted">
                        事故率 {leader?.stats?.accident_rate?? '0'}%
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
              </View>

              {board.trip_related.length > 0 && (
                <>
                  <SectionHeader
                    title="与你行程相关"
                    subtitle={
                      board.trip_route_name
                        ? `当前行程「${board.trip_route_name}」的攻略与路况`
                        : '绑定当前行程的内容'
                    }
                  />
                  {board.trip_related.map((p) => (
                    <PostCard key={`t-${p.id}`} post={p} onOpenRoute={openRoute} onOpenPost={openPost} onToggleLike={togglePostLike} />
                  ))}
                </>
              )}

              <SectionHeader title="精选攻略" subtitle="可执行、绑路线，少看热闹多看决策" />
              {board.guides.slice(0, 2).map((p) => (
                <PostCard key={`g-${p.id}`} post={p} onOpenRoute={openRoute} onOpenPost={openPost} onToggleLike={togglePostLike} />
              ))}

              <SectionHeader title="待关注求助" subtitle="有领队回复的优先展示" accent="#B8860B" />
              {board.open_questions.map((p) => (
                <PostCard key={`q-${p.id}`} post={p} onOpenRoute={openRoute} onOpenPost={openPost} onToggleLike={togglePostLike} />
              ))}

              <View
                className="mt-1 mb-2 p-4"
                style={{
                  backgroundColor: 'rgba(45,106,79,0.06)',
                  borderTopLeftRadius: 18,
                  borderTopRightRadius: 8,
                  borderBottomLeftRadius: 8,
                  borderBottomRightRadius: 18,
                }}
              >
                <Text className="text-sm font-semibold text-foreground mb-1">行程如何关联约伴</Text>
                <Text className="text-xs text-muted" style={{ lineHeight: 18 }}>
                  行程/路线详情点「约伴」→ 进入社区并绑定该路线（含 trip）→ 发布约伴帖 →
                  他人在评论接洽。约伴是社区内容的一种，始终挂在路线下。
                </Text>
              </View>
            </>
          )}
        </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={composeOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setComposeOpen(false)}
        statusBarTranslucent
      >
        <View
          className="flex-1"
          style={{
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: phoneFramed ? 'center' : 'stretch',
            justifyContent: 'flex-end',
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭发布"
            onPress={() => setComposeOpen(false)}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
            style={{
              width: sheetWidth,
              maxHeight: sheetMaxHeight,
              alignSelf: phoneFramed ? 'center' : 'stretch',
            }}
          >
            <View
              className="bg-background overflow-hidden"
              style={{
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                maxHeight: sheetMaxHeight,
                height: undefined,
                paddingBottom: Math.max(insets.bottom, 12),
                ...(phoneFramed
                  ? {
                      borderBottomLeftRadius: 28,
                      borderBottomRightRadius: 28,
                      marginBottom: Math.max(
                        (winH - Math.min(Math.max(winH - 40, 640), 860)) / 2,
                        20
                      ),
                    }
                  : null),
              }}
            >
              {/* 拖拽指示条 + 标题 */}
              <View className="items-center pt-2.5 pb-1">
                <View
                  style={{
                    width: 36,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: 'rgba(61,50,41,0.18)',
                  }}
                />
              </View>
              <View className="flex-row items-center justify-between px-5 pb-2">
                <Text className="text-lg font-bold text-foreground">
                  {composeTypeLocked ? '发布约伴' : '发布到社区'}
                </Text>
                <TouchableOpacity
                  onPress={() => setComposeOpen(false)}
                  hitSlop={10}
                  className="w-9 h-9 rounded-full items-center justify-center"
                  style={{ backgroundColor: 'rgba(61,50,41,0.06)' }}
                >
                  <FontAwesome6 name="xmark" size={16} color="#8B7D6B" />
                </TouchableOpacity>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bounces={false}
                nestedScrollEnabled
                style={{ flexShrink: 1 }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}
              >
                {composeTypeLocked ? (
                  <Text className="text-xs text-muted mb-3" style={{ lineHeight: 18 }}>
                    从行程约伴进入，类型已固定为「约伴」
                    {focusName ? `，绑定「${focusName}」` : ''}
                    {focusTripId ? '（含行程）' : ''}。
                  </Text>
                ) : (
                  <>
                    <Text className="text-xs font-semibold text-foreground mb-1.5">发布类型</Text>
                    <View className="flex-row flex-wrap gap-2 mb-3">
                      {PUBLISH_TYPES.map((t) => {
                        const active = composeType === t.key;
                        return (
                          <TouchableOpacity
                            key={t.key}
                            onPress={() => {
                              setComposeType(t.key);
                              if (t.key === 'companion') loadRoutes();
                            }}
                            className="px-3 py-2 rounded-full"
                            style={{
                              backgroundColor: active ? '#2D6A4F' : 'rgba(61,50,41,0.06)',
                            }}
                          >
                            <Text
                              className="text-xs font-semibold"
                              style={{ color: active ? '#fff' : '#6B5E52' }}
                            >
                              {t.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text className="text-xs text-muted mb-3" style={{ lineHeight: 17 }}>
                      {PUBLISH_TYPES.find((t) => t.key === composeType)?.hint}
                    </Text>
                  </>
                )}

                {(composeType === 'companion' || !!composeRouteId || routeOptions.length > 0) && (
                  <>
                    <Text className="text-xs font-semibold text-foreground mb-1.5">
                      关联路线{composeType === 'companion' ? '（必选）' : '（可选）'}
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      nestedScrollEnabled
                      style={{ maxHeight: 44, marginBottom: 12 }}
                      contentContainerStyle={{ alignItems: 'center', paddingRight: 8 }}
                    >
                      {composeType !== 'companion' ? (
                        <TouchableOpacity
                          onPress={() => setComposeRouteId(null)}
                          className="px-3 py-2 rounded-full mr-2"
                          style={{
                            backgroundColor: !composeRouteId ? '#2D6A4F' : 'rgba(61,50,41,0.06)',
                          }}
                        >
                          <Text
                            className="text-xs font-semibold"
                            style={{ color: !composeRouteId ? '#fff' : '#6B5E52' }}
                          >
                            不绑路线
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      {(routeOptions.length
                        ? routeOptions
                        : focusRouteId && focusName
                          ? [{ id: focusRouteId, name: focusName }]
                          : []
                      ).map((r) => {
                        const active = composeRouteId === r.id;
                        return (
                          <TouchableOpacity
                            key={r.id}
                            onPress={() => setComposeRouteId(r.id)}
                            className="px-3 py-2 rounded-full mr-2"
                            style={{
                              backgroundColor: active ? '#2D6A4F' : 'rgba(61,50,41,0.06)',
                              maxWidth: sheetWidth * 0.55,
                            }}
                          >
                            <Text
                              className="text-xs font-semibold"
                              style={{ color: active ? '#fff' : '#6B5E52' }}
                              numberOfLines={1}
                            >
                              {r.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </>
                )}

                <Text className="text-xs font-semibold text-foreground mb-1.5">标题（可选）</Text>
                <TextInput
                  value={composeTitle}
                  onChangeText={setComposeTitle}
                  placeholder="不填则自动生成"
                  placeholderTextColor="#A89888"
                  className="px-3 py-2.5 mb-3 text-foreground"
                  style={[
                    inputFieldStyle,
                    Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
                  ]}
                />

                {composeType === 'companion' ? (
                  <>
                    <Text className="text-xs font-semibold text-foreground mb-1.5">出发意向</Text>
                    <TextInput
                      value={composeDeparture}
                      onChangeText={setComposeDeparture}
                      placeholder="如：本周六 / 明早 7:00"
                      placeholderTextColor="#A89888"
                      className="px-3 py-2.5 mb-3 text-foreground"
                      style={[
                        inputFieldStyle,
                        Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
                      ]}
                    />
                  </>
                ) : null}

                <Text className="text-xs font-semibold text-foreground mb-1.5">
                  {composeType === 'companion' ? '补充说明' : '内容'}
                </Text>
                <TextInput
                  value={composeNote}
                  onChangeText={setComposeNote}
                  placeholder={
                    composeType === 'companion'
                      ? '节奏、人数、经验要求等'
                      : composeType === 'question'
                        ? '描述你的问题与已有信息'
                        : composeType === 'guide'
                          ? '行程节点、装备与注意点'
                          : '近期路况或完赛体验'
                  }
                  placeholderTextColor="#A89888"
                  multiline
                  className="px-3 py-2.5 mb-3 text-foreground"
                  style={[
                    inputFieldStyle,
                    {
                      minHeight: 100,
                      maxHeight: 160,
                      textAlignVertical: 'top',
                    },
                    Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
                  ]}
                />

                <View className="flex-row items-center justify-between mb-1.5">
                  <Text className="text-xs font-semibold text-foreground">
                    图片（封面最多展示 3 张）
                  </Text>
                  <Text className="text-xs text-muted">
                    {composeImages.length}/{MAX_IMAGES}
                  </Text>
                </View>
                {composeImages.length > 0 ? (
                  <View className="mb-2 overflow-hidden" style={{ borderRadius: 12 }}>
                    <CoverImages urls={composeImages} height={96} />
                  </View>
                ) : null}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  nestedScrollEnabled
                  contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
                  style={{ marginBottom: 4 }}
                >
                  {composeImages.map((uri, index) => (
                    <View key={`${uri}-${index}`} className="relative">
                      <Image
                        source={{ uri }}
                        style={{ width: 72, height: 72, borderRadius: 10 }}
                        contentFit="cover"
                      />
                      {index < COVER_MAX ? (
                        <View
                          className="absolute left-1 top-1 px-1 rounded"
                          style={{ backgroundColor: 'rgba(45,106,79,0.85)' }}
                        >
                          <Text className="text-xs font-bold text-white">封面</Text>
                        </View>
                      ) : null}
                      <TouchableOpacity
                        onPress={() => removeImage(index)}
                        className="absolute right-1 top-1 w-5 h-5 rounded-full items-center justify-center"
                        style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
                        hitSlop={6}
                      >
                        <FontAwesome6 name="xmark" size={10} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {composeImages.length < MAX_IMAGES ? (
                    <TouchableOpacity
                      onPress={pickImages}
                      className="items-center justify-center"
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 10,
                        backgroundColor: 'rgba(61,50,41,0.05)',
                        borderWidth: 1,
                        borderColor: 'rgba(61,50,41,0.12)',
                        borderStyle: 'dashed',
                      }}
                    >
                      <FontAwesome6 name="plus" size={16} color="#8B7D6B" />
                      <Text className="text-xs text-muted mt-1">添加</Text>
                    </TouchableOpacity>
                  ) : null}
                </ScrollView>
              </ScrollView>

              {/* 发布按钮固定在底部，不被键盘/滚动挤走 */}
              <View className="px-5 pt-2">
                <TouchableOpacity
                  onPress={publishPost}
                  disabled={
                    publishing ||
                    (composeType === 'companion' && !(composeRouteId || focusRouteId)) ||
                    (composeType !== 'companion' && !composeNote.trim())
                  }
                  className="py-3.5 rounded-2xl items-center"
                  style={{
                    backgroundColor:
                      publishing ||
                      (composeType === 'companion' && !(composeRouteId || focusRouteId)) ||
                      (composeType !== 'companion' && !composeNote.trim())
                        ? 'rgba(45,106,79,0.35)'
                        : '#2D6A4F',
                  }}
                >
                  {publishing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white font-bold text-sm">
                      发布
                      {PUBLISH_TYPES.find((t) => t.key === composeType)?.label || ''}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </Screen>
  );
}

/** 16px 避免 iOS 聚焦时页面缩放 */
const inputFieldStyle = {
  fontSize: 16,
  lineHeight: 22,
  backgroundColor: 'rgba(61,50,41,0.05)',
  borderRadius: 12,
} as const;
