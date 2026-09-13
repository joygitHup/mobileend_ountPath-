import { useState } from 'react';
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { PageHeader, Panel } from '@/components/PageChrome';
import { ImageUploadField } from '@/components/ImageUploadField';
import { routeMeta } from '@/theme/tokens';

type Ratings = {
  climb_intensity: number;
  terrain_difficulty: number;
  altitude_risk: number;
  signal_coverage: number;
  supply_access: number;
};

type RouteRow = Record<string, unknown> & {
  id: string;
  name?: string;
  status?: string;
  ratings?: Ratings;
};

type DetailForm = {
  terrain_type?: string;
  key_checkpoint?: string;
  decision_summary?: string;
  risk_level?: string;
  checkpoints?: { name: string; distance_km?: number; has_water?: boolean; has_signal?: boolean }[];
  risk_markers?: { id?: string; type?: string; label?: string; progress?: number; note?: string }[];
};

const diffLabel: Record<string, string> = {
  easy: '简单',
  moderate: '中等',
  hard: '困难',
  expert: '专家',
};

const statusLabel: Record<string, string> = {
  published: '已上架',
  draft: '草稿',
  archived: '已下架',
};

const defaultRatings: Ratings = {
  climb_intensity: 5,
  terrain_difficulty: 5,
  altitude_risk: 3,
  signal_coverage: 6,
  supply_access: 6,
};

export default function RoutesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RouteRow | null>(null);
  const [form] = Form.useForm();
  const [loadingDetail, setLoadingDetail] = useState(false);

  const list = useQuery({
    queryKey: ['admin-routes', q],
    queryFn: () => api<RouteRow[]>(`/api/v1/admin/routes${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  });

  const openEditor = async (row?: RouteRow) => {
    if (!row) {
      setEditing(null);
      form.resetFields();
      form.setFieldsValue({
        status: 'draft',
        difficulty: 'moderate',
        ratings: defaultRatings,
        detail: { risk_level: 'low', checkpoints: [], risk_markers: [] },
      });
      setOpen(true);
      return;
    }
    setEditing(row);
    setLoadingDetail(true);
    setOpen(true);
    try {
      const full = await api<{ route: RouteRow; detail: DetailForm | null }>(
        `/api/v1/admin/routes/${row.id}`,
      );
      const route = full.route || row;
      const detail = (full.detail || {}) as DetailForm;
      form.setFieldsValue({
        ...route,
        status: route.status || 'published',
        ratings: { ...defaultRatings, ...(route.ratings || {}) },
        tags: Array.isArray(route.tags) ? (route.tags as string[]).join(',') : '',
        detail: {
          terrain_type: detail.terrain_type || '',
          key_checkpoint: detail.key_checkpoint || '',
          decision_summary: detail.decision_summary || '',
          risk_level: detail.risk_level || 'low',
          checkpoints: detail.checkpoints || [],
          risk_markers: detail.risk_markers || [],
        },
      });
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载详情失败');
      form.setFieldsValue({
        ...row,
        status: row.status || 'published',
        ratings: { ...defaultRatings, ...(row.ratings || {}) },
      });
    } finally {
      setLoadingDetail(false);
    }
  };

  const save = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const ratings = (values.ratings || defaultRatings) as Ratings;
      const tagsRaw = String(values.tags || '');
      const tags = tagsRaw
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const detail = values.detail as DetailForm | undefined;
      const route: Record<string, unknown> = {
        ...(editing || {}),
        id: values.id || editing?.id,
        name: values.name,
        province: values.province,
        location: values.location,
        difficulty: values.difficulty,
        distance: values.distance,
        elevation_gain: values.elevation_gain,
        max_altitude: values.max_altitude,
        estimated_duration: values.estimated_duration,
        image_url: values.image_url,
        description: values.description,
        match_score: values.match_score,
        status: values.status || 'published',
        ratings,
        tags,
      };
      const body = { route, detail: detail || {} };
      if (editing?.id) {
        return api(`/api/v1/admin/routes/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      }
      return api('/api/v1/admin/routes', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      message.success('已保存');
      setOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['admin-routes'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/admin/routes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('已删除');
      qc.invalidateQueries({ queryKey: ['admin-routes'] });
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const full = await api<{ route: RouteRow; detail: unknown }>(`/api/v1/admin/routes/${id}`);
      const route = { ...(full.route || {}), status };
      return api(`/api/v1/admin/routes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ route }),
      });
    },
    onSuccess: () => {
      message.success('上下架已更新');
      qc.invalidateQueries({ queryKey: ['admin-routes'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title={routeMeta['/routes'].title}
        description="五维评分、封面上传、详情风险点与上下架"
        extra={
          <>
            <Input.Search placeholder="搜索名称/省份" allowClear onSearch={setQ} style={{ width: 220 }} />
            <Button type="primary" onClick={() => void openEditor()}>
              新建路线
            </Button>
          </>
        }
      />
      <Panel>
        <Table
          rowKey="id"
          loading={list.isLoading}
          dataSource={list.data || []}
          pagination={{ pageSize: 12, showSizeChanger: false }}
          scroll={{ x: 960 }}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 90 },
            { title: '名称', dataIndex: 'name' },
            { title: '省份', dataIndex: 'province', width: 90 },
            {
              title: '难度',
              dataIndex: 'difficulty',
              width: 90,
              render: (d: string) => diffLabel[d] || d,
            },
            { title: '里程', dataIndex: 'distance', width: 80 },
            {
              title: '状态',
              dataIndex: 'status',
              width: 100,
              render: (s: string) => {
                const st = s || 'published';
                return (
                  <Tag color={st === 'published' ? 'green' : st === 'draft' ? 'gold' : 'default'}>
                    {statusLabel[st] || st}
                  </Tag>
                );
              },
            },
            {
              title: '操作',
              width: 260,
              fixed: 'right',
              render: (_, row) => {
                const st = (row.status as string) || 'published';
                return (
                  <Space wrap>
                    <Button type="link" onClick={() => void openEditor(row)}>
                      编辑
                    </Button>
                    {st === 'published' ? (
                      <Button
                        type="link"
                        onClick={() => toggleStatus.mutate({ id: row.id, status: 'archived' })}
                      >
                        下架
                      </Button>
                    ) : (
                      <Button
                        type="link"
                        onClick={() => toggleStatus.mutate({ id: row.id, status: 'published' })}
                      >
                        上架
                      </Button>
                    )}
                    <Popconfirm title="确认删除该路线？" onConfirm={() => remove.mutate(row.id)}>
                      <Button type="link" danger>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                );
              },
            },
          ]}
        />
      </Panel>
      <Modal
        title={editing ? `编辑路线 · ${editing.id}` : '新建路线'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending || loadingDetail}
        width={860}
        destroyOnClose
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Tabs
            items={[
              {
                key: 'basic',
                label: '基础信息',
                children: (
                  <>
                    {!editing && (
                      <Form.Item name="id" label="ID（可空自动生成）">
                        <Input />
                      </Form.Item>
                    )}
                    <Form.Item name="name" label="名称" rules={[{ required: true, message: '请填写名称' }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="status" label="上架状态" initialValue="draft">
                      <Select
                        options={[
                          { value: 'published', label: '已上架（App 可见）' },
                          { value: 'draft', label: '草稿' },
                          { value: 'archived', label: '已下架' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="province" label="省份">
                      <Input />
                    </Form.Item>
                    <Form.Item name="location" label="地点描述">
                      <Input />
                    </Form.Item>
                    <Form.Item name="difficulty" label="难度" initialValue="moderate">
                      <Select
                        options={Object.entries(diffLabel).map(([value, label]) => ({ value, label }))}
                      />
                    </Form.Item>
                    <Space style={{ display: 'flex' }} size="middle">
                      <Form.Item name="distance" label="里程 km" style={{ flex: 1 }}>
                        <InputNumber style={{ width: '100%' }} min={0} />
                      </Form.Item>
                      <Form.Item name="elevation_gain" label="爬升 m" style={{ flex: 1 }}>
                        <InputNumber style={{ width: '100%' }} min={0} />
                      </Form.Item>
                      <Form.Item name="max_altitude" label="最高海拔" style={{ flex: 1 }}>
                        <InputNumber style={{ width: '100%' }} min={0} />
                      </Form.Item>
                    </Space>
                    <Form.Item name="estimated_duration" label="预计时长">
                      <Input placeholder="如 1-2天" />
                    </Form.Item>
                    <Form.Item name="match_score" label="契合度示意">
                      <InputNumber style={{ width: '100%' }} min={0} max={100} />
                    </Form.Item>
                    <Form.Item name="tags" label="标签（逗号分隔）">
                      <Input placeholder="古道,入门级" />
                    </Form.Item>
                    <Form.Item name="image_url" label="封面">
                      <ImageUploadField />
                    </Form.Item>
                    <Form.Item name="description" label="简介">
                      <Input.TextArea rows={3} />
                    </Form.Item>
                  </>
                ),
              },
              {
                key: 'ratings',
                label: '五维评分',
                children: (
                  <>
                    {(
                      [
                        ['climb_intensity', '爬升强度'],
                        ['terrain_difficulty', '路面难度'],
                        ['altitude_risk', '海拔风险'],
                        ['signal_coverage', '信号覆盖'],
                        ['supply_access', '补给可达'],
                      ] as const
                    ).map(([key, label]) => (
                      <Form.Item
                        key={key}
                        name={['ratings', key]}
                        label={`${label} (1-10)`}
                        rules={[{ required: true, message: `请填写${label}` }]}
                      >
                        <InputNumber style={{ width: '100%' }} min={1} max={10} />
                      </Form.Item>
                    ))}
                  </>
                ),
              },
              {
                key: 'detail',
                label: '详情扩充',
                children: (
                  <>
                    <Form.Item name={['detail', 'terrain_type']} label="地形类型">
                      <Input placeholder="石板古道 / 山林" />
                    </Form.Item>
                    <Form.Item name={['detail', 'key_checkpoint']} label="关键节点">
                      <Input />
                    </Form.Item>
                    <Form.Item name={['detail', 'decision_summary']} label="决策摘要">
                      <Input.TextArea rows={2} />
                    </Form.Item>
                    <Form.Item name={['detail', 'risk_level']} label="风险等级">
                      <Select
                        options={[
                          { value: 'low', label: '低' },
                          { value: 'medium', label: '中' },
                          { value: 'high', label: '高' },
                        ]}
                      />
                    </Form.Item>
                    <Form.List name={['detail', 'checkpoints']}>
                      {(fields, { add, remove }) => (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ marginBottom: 8, fontWeight: 600 }}>检查点</div>
                          {fields.map((field) => (
                            <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 8 }} wrap>
                              <Form.Item {...field} name={[field.name, 'name']} rules={[{ required: true }]}>
                                <Input placeholder="名称" style={{ width: 140 }} />
                              </Form.Item>
                              <Form.Item {...field} name={[field.name, 'distance_km']}>
                                <InputNumber placeholder="里程" />
                              </Form.Item>
                              <Form.Item {...field} name={[field.name, 'has_water']} valuePropName="checked">
                                <Switch checkedChildren="有水" unCheckedChildren="无水" />
                              </Form.Item>
                              <Form.Item {...field} name={[field.name, 'has_signal']} valuePropName="checked">
                                <Switch checkedChildren="有信号" unCheckedChildren="无信号" />
                              </Form.Item>
                              <Button type="link" danger onClick={() => remove(field.name)}>
                                删
                              </Button>
                            </Space>
                          ))}
                          <Button type="dashed" onClick={() => add({ has_water: true, has_signal: true })} block>
                            添加检查点
                          </Button>
                        </div>
                      )}
                    </Form.List>
                    <Form.List name={['detail', 'risk_markers']}>
                      {(fields, { add, remove }) => (
                        <div>
                          <div style={{ marginBottom: 8, fontWeight: 600 }}>风险标注</div>
                          {fields.map((field) => (
                            <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 8 }} wrap>
                              <Form.Item {...field} name={[field.name, 'label']} rules={[{ required: true }]}>
                                <Input placeholder="标签" style={{ width: 120 }} />
                              </Form.Item>
                              <Form.Item {...field} name={[field.name, 'type']}>
                                <Select
                                  style={{ width: 110 }}
                                  options={[
                                    { value: 'water', label: '水源' },
                                    { value: 'cliff', label: '悬崖' },
                                    { value: 'steep', label: '陡坡' },
                                    { value: 'no_signal', label: '无信号' },
                                  ]}
                                />
                              </Form.Item>
                              <Form.Item {...field} name={[field.name, 'progress']}>
                                <InputNumber min={0} max={1} step={0.05} placeholder="进度0-1" />
                              </Form.Item>
                              <Form.Item {...field} name={[field.name, 'note']}>
                                <Input placeholder="备注" style={{ width: 160 }} />
                              </Form.Item>
                              <Button type="link" danger onClick={() => remove(field.name)}>
                                删
                              </Button>
                            </Space>
                          ))}
                          <Button
                            type="dashed"
                            onClick={() =>
                              add({
                                id: `rm_${Date.now()}`,
                                type: 'water',
                                progress: 0.1,
                              })
                            }
                            block
                          >
                            添加风险点
                          </Button>
                        </div>
                      )}
                    </Form.List>
                  </>
                ),
              },
            ]}
          />
        </Form>
      </Modal>
    </div>
  );
}
