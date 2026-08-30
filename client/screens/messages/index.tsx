import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useNotifications } from '@/contexts/NotificationContext';
import { fetchApi } from '@/utils/api';

interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  actor_name: string;
  post_id: string;
  comment_id: string;
  read: boolean;
  created_at: string;
}

type MsgTab = 'all' | 'comment' | 'like' | 'companion';

const TABS: { key: MsgTab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'comment', label: '评论' },
  { key: 'like', label: '点赞' },
  { key: 'companion', label: '约伴' },
];

function tabOf(type: string): MsgTab {
  if (type === 'post_like' || type === 'comment_like') return 'like';
  if (type === 'companion_join' || type === 'companion_comment') return 'companion';
  if (
    type === 'comment_reply' ||
    type === 'post_comment' ||
    type === 'question_leader_reply'
  ) {
    return 'comment';
  }
  return 'comment';
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Math.max(0, Date.now() - d.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function typeLabel(type: string): string {
  switch (type) {
    case 'post_like':
      return '赞了帖子';
    case 'comment_like':
      return '赞了评论';
    case 'companion_join':
      return '约伴报名';
    case 'companion_comment':
      return '约伴留言';
    case 'question_leader_reply':
      return '领队回复';
    case 'comment_reply':
      return '回复';
    case 'post_comment':
      return '评论';
    default:
      return '通知';
  }
}

function notifIcon(type: string): { name: string; color: string; bg: string } {
  switch (type) {
    case 'post_like':
    case 'comment_like':
      return { name: 'heart', color: '#C44536', bg: 'rgba(196,69,54,0.12)' };
    case 'companion_join':
    case 'companion_comment':
      return { name: 'user-plus', color: '#2D6A4F', bg: 'rgba(82,183,136,0.16)' };
    case 'question_leader_reply':
      return { name: 'certificate', color: '#B8860B', bg: 'rgba(233,196,106,0.22)' };
    case 'comment_reply':
      return { name: 'reply', color: '#2D6A4F', bg: 'rgba(45,106,79,0.12)' };
    case 'post_comment':
      return { name: 'comment', color: '#2D6A4F', bg: 'rgba(45,106,79,0.12)' };
    default:
      return { name: 'bell', color: '#2D6A4F', bg: 'rgba(45,106,79,0.12)' };
  }
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const { refreshUnread, clearUnreadLocal } = useNotifications();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<MsgTab>('all');

  const load = useCallback(async (soft?: boolean) => {
    if (!soft) setLoading(true);
    try {
      const res = await fetchApi<{ data: AppNotification[] }>('/api/v1/me/notifications');
      setItems(Array.isArray(res.data) ? res.data : []);
      await refreshUnread();
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshUnread]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openItem = async (n: AppNotification) => {
    if (!n.read) {
      try {
        await fetchApi(`/api/v1/me/notifications/${n.id}/read`, { method: 'POST' });
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
        await refreshUnread();
      } catch {
        // ignore
      }
    }
    if (n.post_id) {
      router.push('/post-detail', { id: n.post_id });
    }
  };

  const markAll = async () => {
    try {
      await fetchApi('/api/v1/me/notifications/read-all', { method: 'POST' });
      setItems((prev) => prev.map((x) => ({ ...x, read: true })));
      clearUnreadLocal();
    } catch {
      // ignore
    }
  };

  const filtered = useMemo(() => {
    if (tab === 'all') return items;
    return items.filter((x) => tabOf(x.type) === tab);
  }, [items, tab]);

  const unread = items.filter((x) => !x.read).length;
  const unreadByTab = useMemo(() => {
    const c = { all: 0, comment: 0, like: 0, companion: 0 };
    for (const x of items) {
      if (x.read) continue;
      c.all += 1;
      c[tabOf(x.type)] += 1;
    }
    return c;
  }, [items]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/profile');
  };

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
      {/* Header：标题绝对居中，避免中间层挡住左右按钮点击 */}
      <View className="px-3 pb-2" style={{ paddingTop: insets.top + 6 }}>
        <View className="h-11 justify-center">
          <View
            pointerEvents="none"
            className="absolute left-0 right-0 items-center"
          >
            <Text className="text-[17px] font-bold text-foreground tracking-wide">消息</Text>
          </View>
          <View className="flex-row items-center justify-between" style={{ zIndex: 2 }}>
            <TouchableOpacity
              onPress={goBack}
              className="w-10 h-10 items-center justify-center rounded-full"
              style={{ backgroundColor: 'rgba(61,50,41,0.05)' }}
              activeOpacity={0.7}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="返回"
            >
              <FontAwesome6 name="chevron-left" size={16} color="#3D3229" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={markAll}
              disabled={unread === 0}
              className="px-3 h-10 items-center justify-center rounded-full"
              style={{
                backgroundColor: unread > 0 ? 'rgba(45,106,79,0.1)' : 'transparent',
              }}
              hitSlop={4}
            >
              <Text
                className="text-xs font-semibold"
                style={{ color: unread > 0 ? '#2D6A4F' : '#C4B8A8' }}
              >
                全部已读
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Tabs — segmented bar */}
      <View className="px-4 pt-1 pb-3">
        <View
          className="flex-row p-1"
          style={{
            backgroundColor: 'rgba(61,50,41,0.06)',
            borderRadius: 14,
          }}
        >
          {TABS.map((t) => {
            const active = tab === t.key;
            const u = unreadByTab[t.key];
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTab(t.key)}
                className="flex-1 items-center justify-center py-2.5"
                style={{
                  borderRadius: 11,
                  backgroundColor: active ? '#FFFFFF' : 'transparent',
                  shadowColor: active ? '#3D3229' : 'transparent',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: active ? 0.08 : 0,
                  shadowRadius: 3,
                  elevation: active ? 2 : 0,
                }}
                activeOpacity={0.85}
              >
                <View className="flex-row items-center gap-1.5">
                  <Text
                    className="text-[13px]"
                    style={{
                      fontWeight: active ? '700' : '500',
                      color: active ? '#2D6A4F' : '#8B7D6B',
                    }}
                  >
                    {t.label}
                  </Text>
                  {u > 0 ? (
                    <View
                      className="min-w-[16px] h-4 px-1 rounded-full items-center justify-center"
                      style={{ backgroundColor: '#C44536' }}
                    >
                      <Text className="text-white text-[9px] font-bold leading-none">
                        {u > 99 ? '99+' : u}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2D6A4F" />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: insets.bottom + 28, paddingTop: 2 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load(true);
              }}
              tintColor="#2D6A4F"
            />
          }
        >
          {filtered.length === 0 ? (
            <View className="py-24 items-center px-10">
              <View
                className="w-16 h-16 items-center justify-center mb-4"
                style={{
                  backgroundColor: 'rgba(45,106,79,0.08)',
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 10,
                  borderBottomLeftRadius: 10,
                  borderBottomRightRadius: 24,
                }}
              >
                <FontAwesome6 name="bell" size={24} color="#A89888" />
              </View>
              <Text className="text-base font-semibold text-foreground text-center">
                {tab === 'all' ? '还没有消息' : '该分类暂无消息'}
              </Text>
              <Text className="text-sm text-muted mt-2 text-center leading-5">
                {tab === 'all'
                  ? '评论、点赞与约伴报名会在这里出现'
                  : '换个分类看看，或下拉刷新'}
              </Text>
            </View>
          ) : (
            <View
              className="mx-4 bg-surface overflow-hidden"
              style={{
                borderTopLeftRadius: 24,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 24,
                shadowColor: '#3D3229',
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.06,
                shadowRadius: 10,
                elevation: 2,
              }}
            >
              {filtered.map((n, idx) => {
                const icon = notifIcon(n.type);
                const last = idx === filtered.length - 1;
                return (
                  <TouchableOpacity
                    key={n.id}
                    onPress={() => openItem(n)}
                    activeOpacity={0.75}
                    className="flex-row items-start px-4 py-3.5"
                    style={{
                      backgroundColor: n.read ? 'transparent' : 'rgba(45,106,79,0.045)',
                      borderBottomWidth: last ? 0 : 1,
                      borderBottomColor: '#F1EBE0',
                    }}
                  >
                    {!n.read ? (
                      <View
                        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
                        style={{ backgroundColor: '#2D6A4F' }}
                      />
                    ) : null}

                    <View
                      className="w-11 h-11 rounded-full items-center justify-center mr-3"
                      style={{ backgroundColor: icon.bg }}
                    >
                      <FontAwesome6
                        name={icon.name as 'heart'}
                        solid={icon.name === 'heart'}
                        size={15}
                        color={icon.color}
                      />
                    </View>

                    <View className="flex-1 pr-1">
                      <View className="flex-row items-center justify-between gap-2">
                        <Text
                          className="text-[15px] font-bold text-foreground flex-1"
                          numberOfLines={1}
                        >
                          {n.actor_name || n.title}
                        </Text>
                        <Text className="text-[11px]" style={{ color: '#A89888' }}>
                          {formatTime(n.created_at)}
                        </Text>
                      </View>

                      <View className="flex-row items-center mt-1 gap-1.5">
                        <View
                          className="px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: icon.bg }}
                        >
                          <Text
                            className="text-[10px] font-semibold"
                            style={{ color: icon.color }}
                          >
                            {typeLabel(n.type)}
                          </Text>
                        </View>
                        {!n.read ? (
                          <View
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: '#C44536' }}
                          />
                        ) : null}
                      </View>

                      <Text
                        className="text-[13px] mt-1.5 leading-[18px]"
                        style={{ color: n.read ? '#8B7D6B' : '#3D3229' }}
                        numberOfLines={2}
                      >
                        {n.body || n.title}
                      </Text>
                    </View>

                    <View className="pt-1 pl-1">
                      <FontAwesome6 name="chevron-right" size={11} color="#C4B8A8" />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {filtered.length > 0 && unread > 0 && tab === 'all' ? (
            <Text className="text-center text-[11px] mt-4" style={{ color: '#A89888' }}>
              还有 {unread} 条未读
            </Text>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}
