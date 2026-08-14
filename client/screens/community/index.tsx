import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';

interface Post {
  id: string;
  type: 'guide' | 'review' | 'question';
  title: string;
  content: string;
  author: {
    name: string;
    avatar_url: string;
    level: number;
    is_certified_leader: boolean;
  };
  image_urls: string[];
  likes: number;
  comments: number;
  created_at: string;
  tags: string[];
  is_paid: boolean;
  price: number;
}

const typeConfig = {
  guide: { label: '攻略', color: '#2D6A4F', bg: 'rgba(45,106,79,0.08)' },
  review: { label: '体验', color: '#D4A276', bg: 'rgba(212,162,118,0.12)' },
  question: { label: '求助', color: '#E9C46A', bg: 'rgba(233,196,106,0.12)' },
};

const filters = [
  { label: '全部', value: 'all' },
  { label: '攻略', value: 'guide' },
  { label: '体验', value: 'review' },
  { label: '求助', value: 'question' },
];

function PostCard({ post }: { post: Post }) {
  const config = typeConfig[post.type];

  return (
    <View
      className="bg-surface rounded-3xl mb-4 overflow-hidden"
      style={{
        borderTopLeftRadius: 32,
        borderTopRightRadius: 8,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 32,
        shadowColor: '#3D3229',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
      }}
    >
      {post.image_urls.length > 0 && (
        <Image
          source={{ uri: post.image_urls[0] }}
          style={{ width: '100%', height: 180 }}
          contentFit="cover"
        />
      )}
      <View className="p-4">
        {/* Author */}
        <View className="flex-row items-center mb-3">
          <Image
            source={{ uri: post.author.avatar_url }}
            style={{ width: 36, height: 36, borderRadius: 18 }}
            contentFit="cover"
          />
          <View className="ml-2.5 flex-1">
            <View className="flex-row items-center gap-1.5">
              <Text className="text-sm font-semibold text-foreground">{post.author.name}</Text>
              {post.author.is_certified_leader && (
                <View className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}>
                  <Text className="text-xs font-medium" style={{ color: '#2D6A4F' }}>认证领队</Text>
                </View>
              )}
            </View>
            <Text className="text-xs text-muted">Lv.{post.author.level}</Text>
          </View>
          <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: config.bg }}>
            <Text className="text-xs font-medium" style={{ color: config.color }}>{config.label}</Text>
          </View>
        </View>

        {/* Content */}
        <Text className="text-base font-bold text-foreground mb-2">{post.title}</Text>
        <Text className="text-sm text-muted leading-5" numberOfLines={2}>{post.content}</Text>

        {/* Tags */}
        {post.tags.length > 0 && (
          <View className="flex-row flex-wrap gap-2 mt-3">
            {post.tags.map((tag) => (
              <Text key={tag} className="text-xs" style={{ color: '#2D6A4F' }}>#{tag}</Text>
            ))}
          </View>
        )}

        {/* Footer */}
        <View className="flex-row items-center justify-between mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: '#F1EBE0' }}>
          <View className="flex-row items-center gap-4">
            <View className="flex-row items-center gap-1">
              <FontAwesome6 name="heart" size={13} color="#C44536" />
              <Text className="text-xs text-muted">{post.likes}</Text>
            </View>
            <View className="flex-row items-center gap-1">
              <FontAwesome6 name="comment" size={13} color="#8B7D6B" />
              <Text className="text-xs text-muted">{post.comments}</Text>
            </View>
          </View>
          {post.is_paid && (
            <View className="px-3 py-1 rounded-full" style={{ backgroundColor: 'rgba(233,196,106,0.15)' }}>
              <Text className="text-xs font-bold" style={{ color: '#D4A276' }}>¥{post.price}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          setLoading(true);
          const path = activeFilter === 'all' ? '/api/v1/community/posts' : `/api/v1/community/posts?type=${activeFilter}`;
          const res = await fetchApi<{ data: Post[] }>(path);
          setPosts(res.data);
        } catch {
          setPosts([]);
        } finally {
          setLoading(false);
        }
      })();
    }, [activeFilter])
  );

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + 16 }} className="px-5 pb-4">
          <Text className="text-2xl font-bold text-foreground">社区</Text>
          <Text className="text-sm text-muted mt-1">真实路线攻略与经验分享</Text>
        </View>

        {/* Filters */}
        <View className="px-5 mb-4">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
            {filters.map((f) => (
              <TouchableOpacity
                key={f.value}
                onPress={() => setActiveFilter(f.value)}
                className="px-4 py-2 rounded-full mr-2"
                style={{
                  backgroundColor: activeFilter === f.value ? '#2D6A4F' : 'rgba(45,106,79,0.08)',
                }}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: activeFilter === f.value ? '#fff' : '#2D6A4F' }}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Posts */}
        <View className="px-5">
          {loading ? (
            <View className="py-20 items-center">
              <ActivityIndicator size="large" color="#2D6A4F" />
            </View>
          ) : (
            posts.map((post) => <PostCard key={post.id} post={post} />)
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

async function fetchApi<T>(path: string): Promise<T> {
  const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
