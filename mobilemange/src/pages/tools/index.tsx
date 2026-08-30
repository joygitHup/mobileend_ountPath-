import { Button, Form, Input, Modal, Space, Switch, Table, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { PageHeader, Panel } from '@/components/PageChrome';
import { routeMeta } from '@/theme/tokens';

type Tool = {
  id: string;
  name?: string;
  icon?: string;
  description?: string;
  offline?: boolean;
  offline_note?: string;
  category?: string;
};

export default function ToolsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tool | null>(null);
  const [form] = Form.useForm();

  const list = useQuery({
    queryKey: ['admin-tools'],
    queryFn: () => api<Tool[]>('/api/v1/admin/tools'),
  });

  const save = useMutation({
    mutationFn: async (values: Tool) => {
      const body = { ...editing, ...values, id: editing?.id || values.id };
      if (editing?.id) {
        return api(`/api/v1/admin/tools/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      }
      return api('/api/v1/admin/tools', { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: () => {
      message.success('已保存');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['admin-tools'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/admin/tools/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('已删除');
      qc.invalidateQueries({ queryKey: ['admin-tools'] });
    },
  });

  return (
    <div>
      <PageHeader
        title={routeMeta['/tools'].title}
        description={routeMeta['/tools'].desc}
        extra={
          <Button type="primary" onClick={() => { setEditing(null); form.resetFields(); setOpen(true); }}>
            新建工具
          </Button>
        }
      />
      <Panel>
      <Table
        rowKey="id"
        loading={list.isLoading}
        dataSource={list.data || []}
        pagination={{ pageSize: 12, showSizeChanger: false }}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 120 },
          { title: '名称', dataIndex: 'name' },
          { title: '分类', dataIndex: 'category', width: 100 },
          {
            title: '离线',
            dataIndex: 'offline',
            width: 80,
            render: (v: boolean) => (v ? '是' : '否'),
          },
          { title: '说明', dataIndex: 'description', ellipsis: true },
          {
            title: '操作',
            width: 160,
            render: (_, row) => (
              <Space>
                <Button type="link" onClick={() => { setEditing(row); form.setFieldsValue(row); setOpen(true); }}>
                  编辑
                </Button>
                <Button type="link" danger onClick={() => remove.mutate(row.id)}>删除</Button>
              </Space>
            ),
          },
        ]}
      />
      </Panel>
      <Modal
        title={editing ? '编辑工具' : '新建工具'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)} initialValues={{ offline: true }}>
          {!editing && <Form.Item name="id" label="ID（可空）"><Input /></Form.Item>}
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="icon" label="图标名"><Input placeholder="mountain" /></Form.Item>
          <Form.Item name="category" label="分类"><Input placeholder="field / map" /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="offline" label="离线可用" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="offline_note" label="离线说明"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
