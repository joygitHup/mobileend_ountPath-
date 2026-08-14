export interface RouteItem {
  id: string;
  name: string;
  location: string;
  province: string;
  distance: number;
  elevation_gain: number;
  max_altitude: number;
  estimated_duration: string;
  difficulty: 'easy' | 'moderate' | 'hard' | 'expert';
  difficulty_stars: number;
  best_season: string[];
  image_url: string;
  real_photo_url: string;
  description: string;
  ratings: {
    climb_intensity: number;
    terrain_difficulty: number;
    altitude_risk: number;
    signal_coverage: number;
    supply_access: number;
  };
  match_score: number;
  completion_rate: number;
  turnaround_rate: number;
  monthly_stats: { month: string; completion: number; incidents: number }[];
  tags: string[];
  checkpoints: { name: string; distance_km: number; has_water: boolean; has_signal: boolean }[];
}

export const routes: RouteItem[] = [
  {
    id: 'r1',
    name: '徽杭古道',
    location: '安徽绩溪 — 浙江临安',
    province: '安徽',
    distance: 15,
    elevation_gain: 800,
    max_altitude: 1050,
    estimated_duration: '1-2天',
    difficulty: 'moderate',
    difficulty_stars: 3,
    best_season: ['春', '秋'],
    image_url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800&q=80',
    real_photo_url: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800&q=80',
    description: '中国十大徒步线路之一，始建于唐代，是古时联系徽州与杭州的重要纽带。全程石板路，沿途古村落、关隘、瀑布交替出现。',
    ratings: {
      climb_intensity: 5,
      terrain_difficulty: 4,
      altitude_risk: 2,
      signal_coverage: 7,
      supply_access: 8,
    },
    match_score: 82,
    completion_rate: 91,
    turnaround_rate: 6,
    monthly_stats: [
      { month: '3月', completion: 85, incidents: 0 },
      { month: '4月', completion: 92, incidents: 0 },
      { month: '5月', completion: 95, incidents: 1 },
      { month: '10月', completion: 94, incidents: 0 },
      { month: '11月', completion: 88, incidents: 1 },
    ],
    tags: ['古道', '入门级', '历史文化', '春秋推荐'],
    checkpoints: [
      { name: '鱼川村', distance_km: 0, has_water: true, has_signal: true },
      { name: '岩口亭', distance_km: 4, has_water: true, has_signal: true },
      { name: '蓝天凹', distance_km: 8, has_water: true, has_signal: false },
      { name: '永来村', distance_km: 12, has_water: true, has_signal: true },
      { name: '浙川村', distance_km: 15, has_water: true, has_signal: true },
    ],
  },
  {
    id: 'r2',
    name: '武功山穿越',
    location: '江西萍乡',
    province: '江西',
    distance: 22,
    elevation_gain: 1400,
    max_altitude: 1918,
    estimated_duration: '2天',
    difficulty: 'hard',
    difficulty_stars: 4,
    best_season: ['春', '夏', '秋'],
    image_url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
    real_photo_url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
    description: '以高山草甸和云海日出闻名，十万亩高山草甸绵延起伏。金顶海拔1918米，是华中地区最高峰之一。',
    ratings: {
      climb_intensity: 7,
      terrain_difficulty: 6,
      altitude_risk: 4,
      signal_coverage: 4,
      supply_access: 5,
    },
    match_score: 65,
    completion_rate: 82,
    turnaround_rate: 14,
    monthly_stats: [
      { month: '5月', completion: 80, incidents: 2 },
      { month: '6月', completion: 78, incidents: 3 },
      { month: '9月', completion: 88, incidents: 1 },
      { month: '10月', completion: 90, incidents: 0 },
    ],
    tags: ['高山草甸', '云海', '进阶', '露营'],
    checkpoints: [
      { name: '龙山村', distance_km: 0, has_water: true, has_signal: true },
      { name: '发云界', distance_km: 8, has_water: true, has_signal: false },
      { name: '金顶', distance_km: 14, has_water: true, has_signal: false },
      { name: '吊马桩', distance_km: 18, has_water: true, has_signal: true },
      { name: '景区大门', distance_km: 22, has_water: true, has_signal: true },
    ],
  },
  {
    id: 'r3',
    name: '虎跳峡高路',
    location: '云南香格里拉',
    province: '云南',
    distance: 16,
    elevation_gain: 1100,
    max_altitude: 2670,
    estimated_duration: '1-2天',
    difficulty: 'hard',
    difficulty_stars: 4,
    best_season: ['春', '秋'],
    image_url: 'https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?w=800&q=80',
    real_photo_url: 'https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?w=800&q=80',
    description: '世界最深峡谷之一，高路徒步路线沿哈巴雪山山腰行进，俯瞰金沙江奔腾而下，对面是玉龙十三峰。',
    ratings: {
      climb_intensity: 8,
      terrain_difficulty: 7,
      altitude_risk: 5,
      signal_coverage: 3,
      supply_access: 4,
    },
    match_score: 48,
    completion_rate: 76,
    turnaround_rate: 20,
    monthly_stats: [
      { month: '4月', completion: 82, incidents: 1 },
      { month: '5月', completion: 78, incidents: 2 },
      { month: '10月', completion: 85, incidents: 1 },
      { month: '11月', completion: 80, incidents: 2 },
    ],
    tags: ['峡谷', '高海拔', '进阶', '壮美'],
    checkpoints: [
      { name: '桥头', distance_km: 0, has_water: true, has_signal: true },
      { name: '纳西雅阁', distance_km: 5, has_water: true, has_signal: false },
      { name: '28拐', distance_km: 7, has_water: false, has_signal: false },
      { name: 'Halfway客栈', distance_km: 10, has_water: true, has_signal: false },
      { name: '中虎跳', distance_km: 16, has_water: true, has_signal: true },
    ],
  },
  {
    id: 'r4',
    name: '南京紫金山绿道',
    location: '江苏南京',
    province: '江苏',
    distance: 8,
    elevation_gain: 200,
    max_altitude: 448,
    estimated_duration: '半天',
    difficulty: 'easy',
    difficulty_stars: 1,
    best_season: ['春', '夏', '秋', '冬'],
    image_url: 'https://images.unsplash.com/photo-1501555088652-021faa106b9b?w=800&q=80',
    real_photo_url: 'https://images.unsplash.com/photo-1501555088652-021faa106b9b?w=800&q=80',
    description: '城市中的森林氧吧，全程铺装路面，适合亲子和新手。沿途有中山陵、明孝陵等历史遗迹，四季景色各异。',
    ratings: {
      climb_intensity: 2,
      terrain_difficulty: 1,
      altitude_risk: 1,
      signal_coverage: 10,
      supply_access: 10,
    },
    match_score: 95,
    completion_rate: 99,
    turnaround_rate: 1,
    monthly_stats: [
      { month: '3月', completion: 99, incidents: 0 },
      { month: '6月', completion: 98, incidents: 0 },
      { month: '9月', completion: 99, incidents: 0 },
      { month: '12月', completion: 97, incidents: 0 },
    ],
    tags: ['入门级', '亲子', '城市', '四季皆宜'],
    checkpoints: [
      { name: '太平门', distance_km: 0, has_water: true, has_signal: true },
      { name: '紫金山天文台', distance_km: 3, has_water: true, has_signal: true },
      { name: '头陀岭', distance_km: 5, has_water: true, has_signal: true },
      { name: '体育公园', distance_km: 8, has_water: true, has_signal: true },
    ],
  },
  {
    id: 'r5',
    name: '船底顶穿越',
    location: '广东韶关',
    province: '广东',
    distance: 18,
    elevation_gain: 1200,
    max_altitude: 1586,
    estimated_duration: '2天',
    difficulty: 'expert',
    difficulty_stars: 5,
    best_season: ['秋', '冬'],
    image_url: 'https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=800&q=80',
    real_photo_url: 'https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=800&q=80',
    description: '广东第一高峰，被称为"广东户外毕业考"。涵盖溪谷、密林、草甸、乱石坡等多种地形，对体能和意志力要求极高。',
    ratings: {
      climb_intensity: 9,
      terrain_difficulty: 9,
      altitude_risk: 3,
      signal_coverage: 2,
      supply_access: 2,
    },
    match_score: 30,
    completion_rate: 65,
    turnaround_rate: 28,
    monthly_stats: [
      { month: '10月', completion: 72, incidents: 3 },
      { month: '11月', completion: 70, incidents: 4 },
      { month: '12月', completion: 68, incidents: 5 },
    ],
    tags: ['专家级', '乱石坡', '广东毕业考', '高风险'],
    checkpoints: [
      { name: '罗坑镇', distance_km: 0, has_water: true, has_signal: true },
      { name: '乱石坡底', distance_km: 6, has_water: false, has_signal: false },
      { name: '船底顶', distance_km: 10, has_water: false, has_signal: false },
      { name: '望顶营地', distance_km: 14, has_water: true, has_signal: false },
      { name: '联和村', distance_km: 18, has_water: true, has_signal: true },
    ],
  },
  {
    id: 'r6',
    name: '雨崩徒步',
    location: '云南德钦',
    province: '云南',
    distance: 30,
    elevation_gain: 1800,
    max_altitude: 3900,
    estimated_duration: '3-4天',
    difficulty: 'hard',
    difficulty_stars: 4,
    best_season: ['秋', '冬'],
    image_url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80',
    real_photo_url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80',
    description: '梅里雪山脚下的世外桃源，需翻越南宗垭口方能抵达。冰川、瀑布、藏族村落，被誉为"地球上最后一片世外桃源"。',
    ratings: {
      climb_intensity: 7,
      terrain_difficulty: 6,
      altitude_risk: 6,
      signal_coverage: 2,
      supply_access: 3,
    },
    match_score: 55,
    completion_rate: 78,
    turnaround_rate: 18,
    monthly_stats: [
      { month: '10月', completion: 85, incidents: 1 },
      { month: '11月', completion: 80, incidents: 2 },
      { month: '12月', completion: 75, incidents: 3 },
    ],
    tags: ['雪山', '高海拔', '藏族文化', '秘境'],
    checkpoints: [
      { name: '西当温泉', distance_km: 0, has_water: true, has_signal: true },
      { name: '南宗垭口', distance_km: 6, has_water: false, has_signal: false },
      { name: '上雨崩', distance_km: 10, has_water: true, has_signal: false },
      { name: '冰湖', distance_km: 18, has_water: true, has_signal: false },
      { name: '神瀑', distance_km: 24, has_water: true, has_signal: false },
      { name: '尼龙大峡谷', distance_km: 30, has_water: true, has_signal: true },
    ],
  },
];
