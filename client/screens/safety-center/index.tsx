import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Switch,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { fetchApi } from '@/utils/api';
import { confirmDialog, notifyError, notifySuccess } from '@/utils/notify';
import { startGuardHeartbeat, stopGuardHeartbeat } from '@/utils/guardHeartbeat';
import {
  checkDepartureReminds,
  syncDepartureRemind,
} from '@/utils/departureRemind';

interface Contact {
  id: string;
  name: string;
  phone: string;
  is_primary: boolean;
}

interface SafetyCenterData {
  contacts: Contact[];
  primary_contact: Contact | null;
  settings: {
    departure_remind_hours: number;
    remind_weather: boolean;
    remind_checklist: boolean;
    remind_route_risk: boolean;
    satellite_bound: boolean;
    satellite_device_id: string | null;
  };
  alerts: { level: 'info' | 'warn' | 'danger'; title: string; body: string }[];
  trip: { id: string; route_id: string; route_name: string; departure_at: string } | null;
  latest_sos: {
    id: string;
    status: string;
    message?: string;
    mode?: string;
    at?: string;
    contacts_notified: { name: string; phone: string }[];
  } | null;
  notify_mode?: string;
  satellite: { bound: boolean; device_id: string | null; note: string };
  profile: { verified: boolean; verified_label: string; safety_score: number };
}

export default function SafetyCenterScreen() {
  const insets = useSafeAreaInsets();
  const router = useSafeRouter();
  const [data, setData] = useState<SafetyCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [sosSending, setSosSending] = useState(false);
  const [sosDone, setSosDone] = useState(false);
  const [sosEnding, setSosEnding] = useState(false);
  const [deviceId, setDeviceId] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchApi<{ data: Partial<SafetyCenterData> }>('/api/v1/me/safety');
      const raw = res.data || {};
      const contacts = Array.isArray(raw.contacts)
        ? raw.contacts.map((c) => {
            const row = c as Contact & { ID?: string; Name?: string; Phone?: string; IsPrimary?: boolean };
            return {
              id: row.id || row.ID || '',
              name: row.name || row.Name || '',
              phone: row.phone || row.Phone || '',
              is_primary: !!(row.is_primary ?? row.IsPrimary),
            };
          }).filter((c) => c.id)
        : [];
      const settings = {
        departure_remind_hours: raw.settings?.departure_remind_hours ?? 12,
        remind_weather: raw.settings?.remind_weather ?? true,
        remind_checklist: raw.settings?.remind_checklist ?? true,
        remind_route_risk: raw.settings?.remind_route_risk ?? true,
        satellite_bound: raw.settings?.satellite_bound ?? raw.satellite?.bound ?? false,
        satellite_device_id:
          raw.settings?.satellite_device_id ?? raw.satellite?.device_id ?? null,
      };
      const next: SafetyCenterData = {
        contacts,
        primary_contact: raw.primary_contact || contacts.find((c) => c.is_primary) || contacts[0] || null,
        settings,
        alerts: Array.isArray(raw.alerts) ? raw.alerts : [],
        trip: raw.trip ?? null,
        latest_sos: raw.latest_sos ?? null,
        satellite: {
          bound: raw.satellite?.bound ?? settings.satellite_bound,
          device_id: raw.satellite?.device_id ?? settings.satellite_device_id,
          note:
            raw.satellite?.note ||
            '预留接口：可绑定北斗等卫星通信设备，无公网时发送短报文',
        },
        profile: {
          verified: raw.profile?.verified ?? false,
          verified_label: raw.profile?.verified_label || '',
          safety_score: raw.profile?.safety_score ?? 0,
        },
      };
      setData(next);
      setDeviceId(next.satellite.device_id || '');
      if (next.trip?.departure_at) {
        await syncDepartureRemind({
          tripId: next.trip.id,
          routeId: next.trip.route_id,
          routeName: next.trip.route_name || '',
          departureAt: next.trip.departure_at,
          hoursBefore: next.settings.departure_remind_hours,
          remindWeather: next.settings.remind_weather,
          remindChecklist: next.settings.remind_checklist,
          remindRouteRisk: next.settings.remind_route_risk,
        });
        await checkDepartureReminds();
      } else {
        await syncDepartureRemind(null);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const addContact = async () => {
    setSaving(true);
    try {
      await fetchApi('/api/v1/me/contacts', {
        method: 'POST',
        body: JSON.stringify({ name, phone }),
      });
      setName('');
      setPhone('');
      await load();
    } catch (e) {
      notifyError('无法添加', e instanceof Error ? e.message : '请检查姓名与手机号');
    } finally {
      setSaving(false);
    }
  };

  const removeContact = (id: string) => {
    confirmDialog('删除联系人', '确认删除该紧急联系人？', {
      confirmText: '删除',
      destructive: true,
      onConfirm: async () => {
        await fetchApi(`/api/v1/me/contacts/${id}`, { method: 'DELETE' });
        await load();
      },
    });
  };

  const setPrimary = async (id: string) => {
    await fetchApi(`/api/v1/me/contacts/${id}/primary`, { method: 'POST' });
    await load();
  };

  const patchSettings = async (patch: Record<string, unknown>) => {
    const res = await fetchApi<{ data: SafetyCenterData['settings'] }>(
      '/api/v1/me/safety/settings',
      { method: 'PATCH', body: JSON.stringify(patch) }
    );
    setData((prev) => {
      if (!prev) return prev;
      const settings = res.data;
      if (prev.trip?.departure_at) {
        void syncDepartureRemind({
          tripId: prev.trip.id,
          routeId: prev.trip.route_id,
          routeName: prev.trip.route_name || '',
          departureAt: prev.trip.departure_at,
          hoursBefore: settings.departure_remind_hours,
          remindWeather: settings.remind_weather,
          remindChecklist: settings.remind_checklist,
          remindRouteRisk: settings.remind_route_risk,
        });
      }
      return { ...prev, settings };
    });
  };

  const triggerSos = () => {
    if (!data?.contacts.length) {
      notifyError('无法求救', '请先添加至少一位紧急联系人');
      return;
    }
    // 行中：引导到守护页 SOS（统一入口）；无行程才用安全中心紧急记录
    if (data.trip?.id) {
      confirmDialog(
        '行中请走守护页 SOS',
        '检测到当前有行程。行中求救请在「行中守护」页发起，以便持续前台定位上报。危急请同时拨打 110。',
        {
          confirmText: '去守护页',
          cancelText: '取消',
          onConfirm: () =>
            router.push('/guard', {
              routeId: data.trip?.route_id || '',
              tripId: data.trip?.id,
            }),
        }
      );
      return;
    }
    confirmDialog(
      '无行程紧急求救',
      '当前无进行中行程。将记录一次紧急求救（演示：仅写日志，不真发短信/推送），并尽量开启前台上报。危急请同时拨打 110。',
      {
        confirmText: '确认求救',
        destructive: true,
        onConfirm: async () => {
          setSosSending(true);
          try {
            const { getBestPosition } = await import('@/utils/location');
            const pos = await getBestPosition();
            if (!pos) {
              notifyError(
                '无法获取定位',
                '请开启定位权限后重试；危急请直接拨打 110，勿依赖无坐标的求救记录'
              );
              return;
            }
            const res = await fetchApi<{
              data: {
                guard_session?: {
                  id: string;
                  started_at: string;
                  planned_duration_hours?: number;
                };
              };
            }>('/api/v1/me/sos', {
              method: 'POST',
              body: JSON.stringify({
                lat: pos.lat,
                lng: pos.lng,
                timestamp: pos.timestamp,
                message: '安全中心一键求救（无行程）',
                channel: 'all',
              }),
            });
            const gs = res.data?.guard_session;
            if (gs?.id) {
              startGuardHeartbeat({
                id: gs.id,
                started_at: gs.started_at,
                planned_duration_hours: gs.planned_duration_hours || 8,
              });
            }
            setSosDone(true);
            notifySuccess(
              '已记录求救',
              gs?.id
                ? '演示通知已记；前台将持续定位打卡。危急请拨打 110'
                : '演示模式下仅模拟通知；真机请立即联系紧急联系人或拨打 110'
            );
            await load();
          } catch (e) {
            notifyError('发送失败', e instanceof Error ? e.message : '请稍后重试或拨打 110');
          } finally {
            setSosSending(false);
          }
        },
      }
    );
  };

  const endSosReporting = () => {
    confirmDialog(
      '确认安全并结束上报',
      '将停止前台定位打卡，并把本次无行程 SOS 标记为已收口。若仍处危急请先拨打 110。',
      {
        confirmText: '确认安全',
        cancelText: '继续上报',
        onConfirm: async () => {
          setSosEnding(true);
          try {
            await fetchApi('/api/v1/guard/stop', {
              method: 'POST',
              body: JSON.stringify({ complete_trip: false, confirm_safe: true }),
            });
            stopGuardHeartbeat();
            setSosDone(false);
            notifySuccess('已确认安全', '紧急上报已结束');
            await load();
          } catch (e) {
            notifyError('收口失败', e instanceof Error ? e.message : '请稍后重试');
          } finally {
            setSosEnding(false);
          }
        },
      }
    );
  };

  const openChecklist = () => {
    if (data?.trip) {
      router.push('/checklist', { routeId: data.trip.route_id, tripId: data.trip.id });
    } else {
      confirmDialog('暂无行程', '请先在发现页选择路线并加入行程，再生成行前安全清单。', {
        confirmText: '去发现',
        cancelText: '取消',
        onConfirm: () => router.push('/(tabs)/'),
      });
    }
  };

  if (loading) {
    return (
      <Screen backgroundColor="#FDF8F0">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2D6A4F" size="large" />
          <Text className="text-sm text-muted mt-3">加载安全中心…</Text>
        </View>
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
        <View style={{ paddingTop: insets.top + 8 }} className="px-5 flex-1 justify-center items-center">
          <Text className="text-base font-semibold text-foreground mb-2">加载失败</Text>
          <Text className="text-sm text-muted mb-4 text-center">请检查网络后重试</Text>
          <TouchableOpacity
            onPress={() => void load()}
            className="px-5 py-3 rounded-2xl mb-3"
            style={{ backgroundColor: '#2D6A4F' }}
          >
            <Text className="text-white font-bold">重新加载</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Text className="text-sm font-semibold" style={{ color: '#2D6A4F' }}>
              返回
            </Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  const alertColor = (level: string) =>
    level === 'danger' ? '#C44536' : level === 'warn' ? '#B8860B' : '#2D6A4F';

  const sosOpen =
    sosDone ||
    (!!data.latest_sos &&
      data.latest_sos.status !== 'resolved' &&
      data.latest_sos.status !== 'closed');
  const sosNoTrip = sosOpen && !data.trip;
  const sosWithTrip = sosOpen && !!data.trip;

  return (
    <Screen safeAreaEdges={['left', 'right']} backgroundColor="#FDF8F0">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingTop: insets.top + 8 }} className="px-5 pb-3">
          <View className="flex-row items-center mb-4">
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={12}
              className="w-10 h-10 rounded-full items-center justify-center mr-2"
              style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}
            >
              <FontAwesome6 name="chevron-left" size={16} color="#2D6A4F" />
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-2xl font-bold text-foreground">安全中心</Text>
              <Text className="text-xs text-muted mt-0.5">行前配置 · 紧急联系人 · SOS</Text>
            </View>
          </View>

          {/* SOS */}
          <TouchableOpacity
            onPress={sosOpen ? undefined : triggerSos}
            disabled={sosSending || sosOpen}
            activeOpacity={sosOpen ? 1 : 0.85}
          >
            <LinearGradient
              colors={sosOpen ? ['#52B788', '#2D6A4F'] : ['#C44536', '#A33B2F']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                borderTopLeftRadius: 28,
                borderTopRightRadius: 10,
                borderBottomLeftRadius: sosOpen ? 0 : 10,
                borderBottomRightRadius: sosOpen ? 0 : 28,
                padding: 20,
                marginBottom: sosOpen ? 0 : 16,
              }}
            >
              <View className="flex-row items-center gap-3">
                <View
                  className="w-14 h-14 rounded-full items-center justify-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                >
                  {sosSending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <FontAwesome6 name="bell" size={22} color="#fff" />
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-white text-lg font-bold">
                    {sosOpen ? '紧急上报进行中' : 'SOS 一键求救'}
                  </Text>
                  <Text className="text-white/85 text-xs mt-1" style={{ lineHeight: 18 }}>
                    {sosOpen
                      ? data.latest_sos?.message ||
                        `已记录并向 ${data.latest_sos?.contacts_notified?.length ?? 0} 位联系人模拟通知（非真短信/推送）。`
                      : '二次确认后记录位置并模拟通知联系人；危急请直接拨打 110'}
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>
          {sosNoTrip ? (
            <View
              className="mb-4 px-3 pb-3 pt-2"
              style={{
                backgroundColor: 'rgba(45,106,79,0.08)',
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 28,
              }}
            >
              <Text className="text-xs text-muted mb-2 px-1" style={{ lineHeight: 17 }}>
                无行程 SOS 收口：结束上报并确认安全后，才会停止定位打卡。
              </Text>
              <TouchableOpacity
                onPress={endSosReporting}
                disabled={sosEnding}
                activeOpacity={0.85}
                className="py-3 rounded-2xl items-center"
                style={{ backgroundColor: '#2D6A4F' }}
              >
                {sosEnding ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-bold">结束上报 / 确认安全</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
          {sosWithTrip ? (
            <View
              className="mb-4 px-3 pb-3 pt-2"
              style={{
                backgroundColor: 'rgba(45,106,79,0.08)',
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 28,
              }}
            >
              <Text className="text-xs text-muted mb-2 px-1" style={{ lineHeight: 17 }}>
                行中 SOS 请在守护页结束上报，以便与行程状态一致。
              </Text>
              <TouchableOpacity
                onPress={() =>
                  router.push('/guard', {
                    routeId: data.trip?.route_id || '',
                    tripId: data.trip?.id,
                  })
                }
                activeOpacity={0.85}
                className="py-3 rounded-2xl items-center"
                style={{ backgroundColor: '#2D6A4F' }}
              >
                <Text className="text-white font-bold">去守护页收口</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Alerts */}
          {data.alerts.map((a) => (
            <View
              key={a.title}
              className="mb-3 px-4 py-3"
              style={{
                backgroundColor: `${alertColor(a.level)}14`,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 8,
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 16,
              }}
            >
              <Text className="text-sm font-bold mb-1" style={{ color: alertColor(a.level) }}>
                {a.title}
              </Text>
              <Text className="text-xs" style={{ color: '#3D3229', lineHeight: 18 }}>
                {a.body}
              </Text>
            </View>
          ))}

          {/* Quick links：行前配置 → 清单；行中守护从行程进入 */}
          <View className="flex-row gap-3 mb-4">
            <QuickBtn
              icon="list-check"
              label="行前清单"
              onPress={openChecklist}
            />
            <QuickBtn
              icon="shield-halved"
              label="行中守护"
              onPress={() =>
                router.push('/guard', {
                  routeId: data.trip?.route_id || '',
                  tripId: data.trip?.id,
                })
              }
            />
          </View>
          <Text className="text-[11px] text-muted mb-4" style={{ lineHeight: 16 }}>
            主路径：安全中心（行前联系人）→ 准备清单 → 行程页开启守护 → 示意跟线。
          </Text>

          {/* Contacts */}
          <Text className="text-lg font-bold text-foreground mb-2">紧急联系人</Text>
          <Text className="text-xs text-muted mb-3">可设置 1–5 位，支持默认优先联系人</Text>

          {data.contacts.map((c) => (
            <View
              key={c.id}
              className="bg-surface mb-2 px-4 py-3 flex-row items-center"
              style={{
                borderTopLeftRadius: 16,
                borderTopRightRadius: 8,
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 16,
              }}
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: c.is_primary ? 'rgba(45,106,79,0.15)' : '#F1EBE0' }}
              >
                <FontAwesome6 name="user" size={16} color={c.is_primary ? '#2D6A4F' : '#8B7D6B'} />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm font-bold text-foreground">{c.name}</Text>
                  {c.is_primary && (
                    <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(45,106,79,0.1)' }}>
                      <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>优先</Text>
                    </View>
                  )}
                </View>
                <Text className="text-xs text-muted mt-0.5">{c.phone}</Text>
              </View>
              {!c.is_primary && (
                <TouchableOpacity onPress={() => setPrimary(c.id)} className="mr-3">
                  <Text className="text-xs font-semibold" style={{ color: '#2D6A4F' }}>设为优先</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => removeContact(c.id)} hitSlop={8}>
                <FontAwesome6 name="trash" size={14} color="#C44536" />
              </TouchableOpacity>
            </View>
          ))}

          {data.contacts.length < 5 && (
            <View
              className="bg-surface p-4 mb-4"
              style={{
                borderTopLeftRadius: 20,
                borderTopRightRadius: 8,
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 20,
              }}
            >
              <Text className="text-sm font-semibold text-foreground mb-3">添加联系人</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="姓名"
                placeholderTextColor="#A89888"
                style={inputStyle}
              />
              <TextInput
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 11))}
                placeholder="手机号"
                placeholderTextColor="#A89888"
                keyboardType="phone-pad"
                style={[inputStyle, { marginTop: 8 }]}
              />
              <TouchableOpacity
                onPress={addContact}
                disabled={saving}
                className="mt-3 py-3 items-center rounded-2xl"
                style={{ backgroundColor: '#2D6A4F' }}
              >
                <Text className="text-white font-bold">{saving ? '保存中…' : '添加'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Auto reminders */}
          <Text className="text-lg font-bold text-foreground mb-2">自动安全提醒</Text>
          <View
            className="bg-surface p-4 mb-4"
            style={{
              borderTopLeftRadius: 20,
              borderTopRightRadius: 8,
              borderBottomLeftRadius: 8,
              borderBottomRightRadius: 20,
            }}
          >
            <Text className="text-sm text-muted mb-3">
              出发前 {data.settings.departure_remind_hours}{' '}
              小时：App 打开时每分钟检查并 Toast（锁屏/杀进程收不到；非系统推送）
            </Text>
            <View className="flex-row gap-2 mb-4">
              {[6, 12, 24].map((h) => (
                <TouchableOpacity
                  key={h}
                  onPress={() => patchSettings({ departure_remind_hours: h })}
                  className="px-3 py-2 rounded-full"
                  style={{
                    backgroundColor:
                      data.settings.departure_remind_hours === h
                        ? '#2D6A4F'
                        : 'rgba(45,106,79,0.08)',
                  }}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{
                      color: data.settings.departure_remind_hours === h ? '#fff' : '#2D6A4F',
                    }}
                  >
                    {h} 小时
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <SettingRow
              label="天气预报预警"
              value={data.settings.remind_weather}
              onChange={(v) => patchSettings({ remind_weather: v })}
            />
            <SettingRow
              label="装备清单检查"
              value={data.settings.remind_checklist}
              onChange={(v) => patchSettings({ remind_checklist: v })}
            />
            <SettingRow
              label="路线安全预警"
              value={data.settings.remind_route_risk}
              onChange={(v) => patchSettings({ remind_route_risk: v })}
            />
          </View>

          {/* Satellite */}
          <Text className="text-lg font-bold text-foreground mb-2">连接卫星设备</Text>
          <View
            className="bg-surface p-4 mb-2"
            style={{
              borderTopLeftRadius: 20,
              borderTopRightRadius: 8,
              borderBottomLeftRadius: 8,
              borderBottomRightRadius: 20,
            }}
          >
            <Text className="text-xs text-muted mb-3" style={{ lineHeight: 18 }}>
              {data.satellite.note}
            </Text>
            {data.satellite.bound ? (
              <View className="flex-row items-center justify-between">
                <Text className="text-sm font-semibold text-foreground">
                  已绑定 {data.satellite.device_id}
                </Text>
                <TouchableOpacity
                  onPress={async () => {
                    await fetchApi('/api/v1/me/satellite/unbind', { method: 'POST' });
                    await load();
                  }}
                >
                  <Text className="text-sm font-semibold" style={{ color: '#C44536' }}>解绑</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput
                  value={deviceId}
                  onChangeText={setDeviceId}
                  placeholder="输入北斗设备 ID（演示）"
                  placeholderTextColor="#A89888"
                  style={inputStyle}
                />
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      await fetchApi('/api/v1/me/satellite/bind', {
                        method: 'POST',
                        body: JSON.stringify({ device_id: deviceId }),
                      });
                      await load();
                    } catch {
                      notifyError('绑定失败', '请输入设备 ID');
                    }
                  }}
                  className="mt-3 py-3 items-center rounded-2xl"
                  style={{ backgroundColor: 'rgba(45,106,79,0.12)' }}
                >
                  <Text className="font-bold" style={{ color: '#2D6A4F' }}>预留绑定</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function QuickBtn({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-1 bg-surface py-4 items-center"
      style={{
        borderTopLeftRadius: 18,
        borderTopRightRadius: 8,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 18,
      }}
      activeOpacity={0.85}
    >
      <FontAwesome6 name={icon as 'list-check'} size={18} color="#2D6A4F" />
      <Text className="text-xs font-semibold text-foreground mt-2">{label}</Text>
    </TouchableOpacity>
  );
}

function SettingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between py-2.5">
      <Text className="text-sm text-foreground">{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#E8DFD3', true: '#52B788' }}
        thumbColor="#fff"
      />
    </View>
  );
}

const inputStyle = {
  backgroundColor: '#F1EBE0',
  borderRadius: 14,
  paddingHorizontal: 14,
  paddingVertical: Platform.OS === 'ios' ? 12 : 10,
  fontSize: 16,
  color: '#3D3229',
  ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
};
