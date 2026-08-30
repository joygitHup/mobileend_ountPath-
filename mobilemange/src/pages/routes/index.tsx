import { useState } from 'react';
import {
  Button, Form, Input, InputNumber, Modal, Space, Table, message, Select,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { PageHeader, Panel } from '@/components/PageChrome';
import { routeMeta } from '@/theme/tokens';

type RouteRow = Record<string, unknown> & { id: string; name?: string };

export default function RoutesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RouteRow | null>(null);
  const [form] = Form.useForm();

  const list = useQuery({
    queryKey: ['admin-routes', q],
    queryFn: () => api<RouteRow[]>(`/api/v1/admin/routes${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  });

  const save = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const route = {
        id: values.id || editing?.id,
        name: values.name,
        province: values.province,
        location: values.location,
        difficulty: values.difficulty,
        distance: values.distance,
        elevation_gain: values.elevation_gain,
        estimated_duration: values.estimated_duration,
        image_url: values.image_url,
        description: values.description,
        match_score: values.match_score,
        ratings: editing?.ratings || {
          climb_intensity: 5, terrain_difficulty: 5, altitude_risk: 3,
          signal_coverage: 6, supply_access: 6,
        },
      };
      if (editing?.id) {
        return api(`/api/v1/admin/routes/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ route }),
        });
      }
      return api('/api/v1/admin/routes', {
        method: 'POST',
        body: JSON.stringify({ route }),
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

  return (
    <div>
      <PageHeader
        title={routeMeta['/routes'].title}
        description={routeMeta['/routes'].desc}
        extra={
          <>
            <Input.Search placeholder="搜索名称/省份" allowClear onSearch={setQ} style={{ width: 220 }} />
            <Button type="primary" onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}>
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
          columns={[
            { title: 'ID', dataIndex: 'id', width: 100 },
            { title: '名称', dataIndex: 'name' },
            { title: '省份', dataIndex: 'province', width: 100 },
            { title: '难度', dataIndex: 'difficulty', width: 100 },
            { title: '里程(km)', dataIndex: 'distance', width: 100 },
            { title: '匹配度', dataIndex: 'match_score', width: 90 },
            {
              title: '操作',
              width: 160,
              render: (_, row) => (
                <Space>
                  <Button type="link" onClick={() => {
                    setEditing(row);
                    form.setFieldsValue(row);
                    setOpen(true);
                  }}>编辑</Button>
                  <Button type="link" danger onClick={() => remove.mutate(row.id)}>删除</Button>
                </Space>
              ),
            },
          ]}
        />
      </Panel>
      <Modal
        title={editing ? '编辑路线' : '新建路线'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          {!editing && <Form.Item name="id" label="ID（可空自动生成）"><Input /></Form.Item>}
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="province" label="省份"><Input /></Form.Item>
          <Form.Item name="location" label="地点描述"><Input /></Form.Item>
          <Form.Item name="difficulty" label="难度" initialValue="moderate">
            <Select options={[
              { value: 'easy', label: 'easy' },
              { value: 'moderate', label: 'moderate' },
              { value: 'hard', label: 'hard' },
              { value: 'expert', label: 'expert' },
            ]} />
          </Form.Item>
          <Form.Item name="distance" label="里程 km"><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="elevation_gain" label="爬升 m"><InputNumber style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="estimated_duration" label="预计时长"><Input /></Form.Item>
          <Form.Item name="match_score" label="匹配度"><InputNumber style={{ width: '100%' }} min={0} max={100} /></Form.Item>
          <Form.Item name="image_url" label="封面 URL"><Input /></Form.Item>
          <Form.Item name="description" label="简介"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
