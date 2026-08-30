export const brand = {
  primary: '#2D6A4F',
  primaryDark: '#1B4332',
  moss: '#52B788',
  earth: '#8B6914',
  amber: '#E9C46A',
  amberDeep: '#B8860B',
  danger: '#C44536',
  bg: '#FDF8F0',
  bgMuted: '#F1EBE0',
  text: '#3D3229',
  textMuted: '#8B7D6B',
  border: '#E5DCCF',
  white: '#FFFFFF',
} as const;

export const antdTheme = {
  token: {
    colorPrimary: brand.primary,
    colorSuccess: brand.moss,
    colorWarning: brand.amberDeep,
    colorError: brand.danger,
    colorInfo: brand.primary,
    borderRadius: 10,
    fontFamily:
      '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif',
    colorBgLayout: brand.bg,
    colorBgContainer: brand.white,
    colorText: brand.text,
    colorTextSecondary: brand.textMuted,
    colorBorder: brand.border,
    colorBorderSecondary: '#EDE6DB',
    controlHeight: 36,
  },
  components: {
    Layout: {
      siderBg: brand.primaryDark,
      headerBg: brand.white,
      bodyBg: brand.bg,
      triggerBg: brand.primary,
    },
    Menu: {
      darkItemBg: brand.primaryDark,
      darkSubMenuItemBg: '#16382A',
      darkItemSelectedBg: brand.primary,
      darkItemHoverBg: 'rgba(82, 183, 136, 0.18)',
      itemBorderRadius: 8,
      itemMarginInline: 10,
      itemHeight: 42,
    },
    Card: {
      borderRadiusLG: 14,
      paddingLG: 20,
    },
    Table: {
      headerBg: '#F7F2E9',
      headerColor: brand.text,
      rowHoverBg: '#F3F8F4',
      borderColor: brand.border,
    },
    Button: {
      primaryShadow: '0 4px 12px rgba(45, 106, 79, 0.22)',
      borderRadius: 10,
    },
    Input: {
      borderRadius: 10,
    },
    Select: {
      borderRadius: 10,
    },
    Modal: {
      borderRadiusLG: 14,
    },
    Tabs: {
      inkBarColor: brand.primary,
      itemSelectedColor: brand.primary,
    },
  },
};

export const routeMeta: Record<string, { title: string; desc: string }> = {
  '/': { title: '运营概览', desc: '内容、行程与安全态势一览' },
  '/routes': { title: '路线管理', desc: '维护 App 发现页与详情目录' },
  '/tracks': { title: '轨迹管理', desc: '官方轨迹包与社区轨迹审核' },
  '/checklists': { title: '清单模板', desc: '按难度配置智能准备清单' },
  '/leaders': { title: '认证领队', desc: '社区领队卡片与资质信息' },
  '/tools': { title: '工具箱', desc: '海拔仪、指南针等工具条目' },
  '/community': { title: '社区审核', desc: '帖子隐藏、删除与付费标记' },
  '/users': { title: '用户治理', desc: '实名、等级、角色与封禁' },
  '/safety': { title: '安全运营台', desc: '守护会话与 SOS 处置' },
  '/system': { title: '系统与合规', desc: '法律文案、营地信号与审计' },
};
