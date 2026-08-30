# Expo App + Go（mobileback）

## 目录结构规范（严格遵循）

当前仓库是一个 monorepo（基于 pnpm 的 workspace）

- Expo 代码在 client 目录；**主后端为 `mobileback/`（Go :9092）**；种子数据在 `mobileback/seeds/`
- 本模板默认无 Tab Bar，可按需改造

├── client/                     # React Native 前端代码
│   ├── app/                    # Expo Router 路由目录（仅路由配置）
│   │   ├── _layout.tsx         # 根布局文件（必需，务必阅读）
│   │   └── index.tsx           # 首页
│   ├── screens/                # 页面实现目录（与 app/ 路由对应）
│   │   └── demo/               # 示例页面
│   │       └── index.tsx
│   ├── components/             # 可复用组件
│   │   └── Screen.tsx          # 页面容器组件（必用）
│   ├── hooks/                  # 自定义 Hooks
│   ├── contexts/               # React Context 代码
│   ├── utils/                  # 工具函数
│   ├── assets/                 # 静态资源
|   └── package.json            # Expo 应用 package.json
├── mobileback/                 # 【主后端】Go + Gin + SQLite（:9092）
├── mobilemange/                # 【运营管理台】Vite + React + Ant Design（:9093）
├── package.json
├── .cozeproj                   # 预置脚手架脚本（禁止修改；仍可能尝试启动已删除的 Express `server/`）
└── .coze                       # 配置文件（禁止修改）

## 样式方案

基于 tailwindcss 进行样式开发（底层基于 Uniwind）

写法示例：

```tsx
<View className="flex-1 bg-white dark:bg-gray-900 p-4"></View>
```

```tsx
<Text
  className="text-lg font-bold text-gray-900 dark:text-white"
  selectionColorClassName="accent-blue-500"
>
  Hello World
</Text>
```

Uniwind 官方文档：https://docs.uniwind.dev/llms.txt

## 如何进行静态校验（TSC + ESLint）

```bash
# 对 client（及管理台）进行校验
pnpm -w lint:all

# 对 client 目录进行校验
pnpm -w lint:client
```

## 如何修改主题模式（跟随系统、固定暗色、固定亮色）

默认为跟随系统，如果用户明确指定为“暗色”或“亮色”，需要修改 `client/components/ColorSchemeUpdater.tsx` 的 `DEFAULT_THEME` 变量为合适的值

## 如何定制主题 design tokens

当前项目的**设计系统**基于 tailwindcss 实现，核心入口文件为 `client/global.css`，如果需要定制主题，应该**阅读并修改 `client/global.css` 文件**

## 路由及 Tab Bar 实现规范

### 方案一：无 Tab Bar（Stack 导航）

适用于线性流程应用，采用简化的目录结构：

```
client/app/
├── _layout.tsx         # 根布局（Stack 导航配置）
├── index.tsx           # 应用入口
├── detail.tsx          # 详情页（通过 params 传递数据）
└── +not-found.tsx      # 404 页面
```

**根布局配置** `client/app/_layout.tsx`：

以下仅为代码片段供写法参考

```tsx
<Stack screenOptions={{ headerShown: false }}>
  <Stack.Screen name="index" />
  <Stack.Screen name="detail" />
</Stack>
```

**应用入口** `client/app/index.tsx`：
```tsx
export { default } from "@/screens/home";
```
> **禁止事项**：无 Tab Bar 场景下，不得创建 `(tabs)` 目录。

### 方案二：有 Tab Bar（Tabs 导航）

采用路由分组实现底部导航栏：
```
client/app/
├── _layout.tsx              # 根布局
├── (tabs)/
│   ├── _layout.tsx          # Tab 导航配置
│   ├── index.tsx            # 默认 Tab（必须存在）
│   ├── discover.tsx         # 发现页
│   └── profile.tsx          # 个人中心
├── detail.tsx               # Tab 外的独立页面（通过 params 传递数据）
└── +not-found.tsx
```
> **⚠️ [CRITICAL]**： `app/index.tsx` 优先级高于 `(tabs)/index.tsx`，会导致首页无 Tab Bar。**当有(tabs)/index.tsx时必须删除 `app/index.tsx`**。

**根布局配置** `client/app/_layout.tsx`：

以下仅为代码片段供写法参考

```tsx
<Stack screenOptions={{ headerShown: false }}>
  <Stack.Screen name="(tabs)" />
  <Stack.Screen name="detail" />
</Stack>
```

**应用入口** `client/app/(tabs)/index.tsx`：
```tsx
export { default } from "@/screens/home";
```

**Tab 布局配置** `client/app/(tabs)/_layout.tsx`：

```tsx
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { useCSSVariable } from 'uniwind';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const [background, muted, accent, border] = useCSSVariable([
    '--color-background',
    '--color-muted',
    '--color-accent',
    '--color-border',
  ]) as string[];

  let tabBarStyle = {
    backgroundColor: background,
    borderTopWidth: 1,
    borderTopColor: border,
  };

  // 用于修复 Web 上高度异常的问题（这个 if 逻辑必须添加）
  if (Platform.OS === 'web') {
    tabBarStyle = {
      ...tabBarStyle,
      height: 'auto',
    }
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: muted,
      }}
    >
      {/* name 必须与文件名完全一致 */}
      <Tabs.Screen
        name="index"
        options={{
          title: '首页',
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="house" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: '发现',
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="compass" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="user" size={20} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
```

**Tab 页面文件** `client/app/(tabs)/index.tsx`：
```tsx
export { default } from "@/screens/home";
```

### 注意事项

在改动 `client/app/_layout.tsx` 前，必须先阅读该文件，再进行修改操作

以下是需要保留的重要逻辑

- 保留 global.css 引入（tailwindcss 生效的关键）
- 保留 Provider 的使用

## 依赖管理与模块导入规范

### 依赖安装
**禁止**使用 `npm` 或 `yarn`，按目录区分安装命令：

| 目录 | 安装命令 | 说明 |
|------|----------|------|
| `client/` | `npx expo install <package>` | Expo 会自动选择与 SDK 兼容的版本 |
| `mobilemange/` | `pnpm add <package> --filter mobilemange` | 运营管理台 |

```bash
# client 目录（Expo 项目）
cd client && npx expo install expo-camera expo-image-picker
```

**网络问题处理**：`npx expo install` 可能因网络原因失败，失败时重试 2 次，仍失败则改用 `pnpm add` 安装

## Expo 开发规范

### 路径别名

Expo 配置了 `@/` 路径别名指向 `client/` 目录：

```tsx
// 正确
import { Screen } from '@/components/Screen';

// 避免相对路径
import { Screen } from '../../../components/Screen';
```

## 本地开发

`coze dev`：脚手架仍可能尝试启动已删除的 Express `server/`（`.cozeproj` 禁止修改）。**推荐**本地组合：先 `cd mobileback && make run`（:9092），再起 client / `pnpm --filter expo-app start`。

### 可落地后端 mobileback（Go）**【主后端】**

路径：仓库根目录 `mobileback/`。默认端口 **9092**，SQLite 本地库，种子在 `mobileback/seeds/*.json`。

```bash
export PATH="$HOME/.local/go/bin:$PATH"   # 若已安装 Go
cd mobileback
make seed           # 从 seeds/*.json 写入 data/mountpath.db
make run            # 或 ./bin/api
```

Client 默认指向 mobileback（`client/.env.development` / EAS development）：

```bash
EXPO_PUBLIC_BACKEND_BASE_URL=http://127.0.0.1:9092
```

`pnpm dev` 会走脚手架并可能因缺少 `server/` 报错；日常请直接起 mobileback + Expo。

演示登录验证码：`1234`。详见 [mobileback/README.md](mobileback/README.md)。

### 运营管理台 mobilemange（Vite）

路径：仓库根目录 `mobilemange/`。开发端口 **9093**，对接 mobileback `/api/v1/admin/*`。

```bash
pnpm install                          # 根目录安装 workspace（含 mobilemange）
pnpm dev:admin                        # http://127.0.0.1:9093
```

演示管理员：手机号 `13800000000`，验证码 `1234`（需 `cd mobileback && make seed`，用户 `role=admin`）。

详见 [mobilemange/README.md](mobilemange/README.md)、[mobilemange/docs/ARCHITECTURE.md](mobilemange/docs/ARCHITECTURE.md)。

### 后端端口（勿混）

| 服务 | 端口 | 状态 |
|------|------|------|
| **mobileback**（Go） | **9092** | **主后端**（JWT + SQLite） |
| **mobilemange**（Vite） | **9093** | **运营管理台** |
| Expo | 5000 | 前端 |

端到端冒烟（需 mobileback 已启动）：

```bash
cd mobileback && make e2e
```

## 山途 App 项目信息

### 项目概述
山途（MountPath）——面向徒步爱好者的智能决策与安全保障平台。基于 Expo + React Native + Go（mobileback）的跨平台 App，适配 iOS / Android / 鸿蒙。

### 技术栈
- 前端：Expo SDK 54 + React Native + Expo Router + Uniwind (Tailwind v4)
- 主后端：Go（`mobileback/`，:9092）；种子 JSON 在 `mobileback/seeds/`
- 样式：Tailwind CSS v4 + Uniwind，自然有机风主题（森林绿/大地色系）
- 图标：FontAwesome6
- 动画：react-native-reanimated

### 路由结构（Tabs 模式）
```
app/
├── _layout.tsx              # 根布局（Stack 包裹 Tabs）
├── (tabs)/
│   ├── _layout.tsx          # 底部 Tab Bar（首页/行程/社区/我的）
│   ├── index.tsx            # 首页 → screens/home
│   ├── trip.tsx             # 行程 → screens/trip
│   ├── community.tsx        # 社区 → screens/community
│   └── profile.tsx          # 我的 → screens/profile
├── route-detail.tsx         # 路线详情 → screens/route-detail
├── checklist.tsx            # 智能准备清单 → screens/checklist
└── guard.tsx                # 实时守护 → screens/guard
```

### 后端 API（/api/v1）
- `GET /routes` - 路线列表（含五维评分、匹配度）
- `GET /routes/:id` - 路线详情
- `GET /checklist/:routeId` - 智能准备清单
- `GET /community/posts` - 社区帖子
- `GET /community/leaders` - 认证领队
- `POST /guard/start` - 开始守护
- `POST /guard/sos` - SOS 求救
- `POST /guard/checkin` - 位置上报

### 预览方式
- 推荐：`mobileback` `:9092` + `EXPO_PUBLIC_BACKEND_BASE_URL=http://127.0.0.1:9092`
- 种子：直接编辑 `mobileback/seeds/*.json`，再 `make seed`
- 冒烟：`cd mobileback && make e2e`
- 注意：`.cozeproj` 仍可能查找已删除的 Express `server/`；请以 mobileback 为准

### 主题定制
- Design tokens 入口：`client/global.css`
- 主色：森林绿（#2D6A4F）、苔藓绿（#52B788）
- 辅色：大地棕（#8B6914）、琥珀黄（#B8860B）
- 风险色：警示红（#C44536，与 `client/global.css` `--danger` / `--fire` 一致）
