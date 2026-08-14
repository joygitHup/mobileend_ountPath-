export interface CommunityPost {
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
  route_id: string | null;
  image_urls: string[];
  likes: number;
  comments: number;
  created_at: string;
  tags: string[];
  is_paid: boolean;
  price: number;
}

export interface LeaderProfile {
  id: string;
  name: string;
  avatar_url: string;
  certifications: string[];
  stats: {
    total_trips: number;
    total_people: number;
    accident_rate: number;
    avg_rating: number;
  };
  ratings: {
    communication: number;
    emergency: number;
    professionalism: number;
    overall: number;
  };
  specialties: string[];
  bio: string;
}

export const communityPosts: CommunityPost[] = [
  {
    id: 'p1',
    type: 'guide',
    title: '徽杭古道两天一夜详细攻略（附装备清单）',
    content: '上周末刚走完徽杭古道，全程15公里，分享我的详细行程安排和装备清单。第一天从鱼川村出发...',
    author: {
      name: '山野行者',
      avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
      level: 8,
      is_certified_leader: true,
    },
    route_id: 'r1',
    image_urls: [
      'https://images.unsplash.com/photo-1551632811-561732d1e306?w=600&q=80',
      'https://images.unsplash.com/photo-1501555088652-021faa106b9b?w=600&q=80',
    ],
    likes: 234,
    comments: 45,
    created_at: '2024-01-15T10:00:00Z',
    tags: ['徽杭古道', '攻略', '入门'],
    is_paid: false,
    price: 0,
  },
  {
    id: 'p2',
    type: 'review',
    title: '武功山金顶日出，值得凌晨3点起床',
    content: '第二次来武功山了，这次终于看到了金顶日出。云海翻涌，太阳从云层中缓缓升起...',
    author: {
      name: '云端漫步',
      avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80',
      level: 5,
      is_certified_leader: false,
    },
    route_id: 'r2',
    image_urls: [
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&q=80',
    ],
    likes: 189,
    comments: 32,
    created_at: '2024-01-12T08:00:00Z',
    tags: ['武功山', '日出', '云海'],
    is_paid: false,
    price: 0,
  },
  {
    id: 'p3',
    type: 'question',
    title: '新手第一次走虎跳峡，求经验和建议',
    content: '计划下个月去走虎跳峡高路，但看到难度评级比较高，有点紧张。有没有走过的前辈给点建议？',
    author: {
      name: '小林同学',
      avatar_url: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&q=80',
      level: 2,
      is_certified_leader: false,
    },
    route_id: 'r3',
    image_urls: [],
    likes: 56,
    comments: 28,
    created_at: '2024-01-18T14:00:00Z',
    tags: ['虎跳峡', '新手', '求助'],
    is_paid: false,
    price: 0,
  },
  {
    id: 'p4',
    type: 'guide',
    title: '船底顶穿越完整指南——广东户外毕业考',
    content: '船底顶被称为广东户外毕业考，不是没有原因的。乱石坡、密林、溪谷，每一段都是考验...',
    author: {
      name: '阿峰领队',
      avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&q=80',
      level: 10,
      is_certified_leader: true,
    },
    route_id: 'r5',
    image_urls: [
      'https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=600&q=80',
    ],
    likes: 312,
    comments: 67,
    created_at: '2024-01-10T09:00:00Z',
    tags: ['船底顶', '专家级', '攻略'],
    is_paid: true,
    price: 3,
  },
  {
    id: 'p5',
    type: 'review',
    title: '紫金山绿道亲子徒步，孩子玩得很开心',
    content: '带5岁的儿子走了紫金山绿道，全程铺装路面很平坦，8公里走了3个小时，沿途有很多休息点...',
    author: {
      name: '阳光妈妈',
      avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&q=80',
      level: 3,
      is_certified_leader: false,
    },
    route_id: 'r4',
    image_urls: [
      'https://images.unsplash.com/photo-1501555088652-021faa106b9b?w=600&q=80',
    ],
    likes: 145,
    comments: 22,
    created_at: '2024-01-20T11:00:00Z',
    tags: ['紫金山', '亲子', '入门'],
    is_paid: false,
    price: 0,
  },
];

export const leaders: LeaderProfile[] = [
  {
    id: 'l1',
    name: '阿峰领队',
    avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&q=80',
    certifications: ['中国登山协会户外指导员', 'WFR野外第一反应人', '红十字会急救证'],
    stats: {
      total_trips: 156,
      total_people: 1200,
      accident_rate: 0,
      avg_rating: 4.9,
    },
    ratings: {
      communication: 4.8,
      emergency: 5.0,
      professionalism: 4.9,
      overall: 4.9,
    },
    specialties: ['高海拔', '长线穿越', '新人培训'],
    bio: '3年全职户外领队，走过贡格转山、乌孙古道、狼塔C线。安全是我的第一原则。',
  },
  {
    id: 'l2',
    name: '山野行者',
    avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&q=80',
    certifications: ['中国登山协会户外指导员', 'LNT无痕山林讲师'],
    stats: {
      total_trips: 89,
      total_people: 650,
      accident_rate: 0.5,
      avg_rating: 4.7,
    },
    ratings: {
      communication: 4.9,
      emergency: 4.5,
      professionalism: 4.7,
      overall: 4.7,
    },
    specialties: ['古道文化', '入门级', '亲子户外'],
    bio: '热爱历史与户外的结合，擅长在行走中讲述山川故事。',
  },
];

export const userProfile = {
  id: 'u1',
  name: '徒步爱好者',
  avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&q=80',
  level: 5,
  total_distance_km: 128,
  total_trips: 12,
  total_elevation_gain: 5600,
  safety_score: 85,
  badges: [
    { id: 'b1', name: '初出茅庐', description: '完成第一次徒步', icon: '🌱', earned: true },
    { id: 'b2', name: '十里之行', description: '单次徒步超过10公里', icon: '👣', earned: true },
    { id: 'b3', name: '云海猎人', description: '在海拔2000m以上看日出', icon: '🌅', earned: true },
    { id: 'b4', name: '雨战勇士', description: '在雨天完成徒步', icon: '🌧️', earned: true },
    { id: 'b5', name: '千里之行', description: '累计徒步100公里', icon: '🏔️', earned: true },
    { id: 'b6', name: '夜行达人', description: '完成一次夜间徒步', icon: '🌙', earned: false },
    { id: 'b7', name: '雪山征服者', description: '登顶海拔4000m以上', icon: '❄️', earned: false },
    { id: 'b8', name: '安全达人', description: '安全学分达到100', icon: '🛡️', earned: false },
  ],
  completed_routes: [
    { route_id: 'r1', completed_at: '2024-01-15', duration_hours: 8 },
    { route_id: 'r4', completed_at: '2024-01-08', duration_hours: 3 },
  ],
};
