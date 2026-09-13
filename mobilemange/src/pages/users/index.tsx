import { Button, Form, Input, InputNumber, Modal, Select, Switch, Table, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader, Panel } from '@/components/PageChrome';
import { routeMeta } from '@/theme/tokens';

type User = {
  id: string;
  phone: string;
  name: string;
  verified: boolean;
  verified_label: string;
  level: number;
  safety_score: number;
  role: string;
  banned: boolean;
};

const roleLabel: Record<string, string> = {
  user: '普通用户',
  ops: '运营',
  admin: '管理员',
};

export default function UsersPage() {
  const { user: me } = useAuth();
  const isAdmin = me?.role === 'admin';
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<User | null>(null);
  const [form] = Form.useForm();

  const list = useQuery({
    queryKey: ['admin-users', q],
    queryFn: () => api<User[]>(`/api/v1/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  });

  const save = useMutation({
    mutationFn: (values: Partial<User>) => {
      const body = { ...values };
      if (!isAdmin) delete body.role;
      return api(`/api/v1/admin/users/${editing!.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      message.success('已更新');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title={routeMeta['/users'].title}
        description={
          isAdmin
            ? routeMeta['/users'].desc
            : `${routeMeta['/users'].desc}（角色变更仅管理员）`
        }
        extra={
          <Input.Search placeholder="手机号/昵称" allowClear onSearch={setQ} style={{ width: 240 }} />
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
            { title: '昵称', dataIndex: 'name' },
            { title: '手机', dataIndex: 'phone', width: 130 },
            {
              title: '角色',
              dataIndex: 'role',
              width: 100,
              render: (r: string) => roleLabel[r] || r,
            },
            { title: '等级', dataIndex: 'level', width: 70 },
            { title: '安全分', dataIndex: 'safety_score', width: 80 },
            {
              title: '实名',
              dataIndex: 'verified',
              width: 70,
              render: (v: boolean) => (v ? '是' : '否'),
            },
            {
              title: '封禁',
              dataIndex: 'banned',
              width: 70,
              render: (v: boolean) => (v ? '是' : '否'),
            },
            {
              title: '操作',
              width: 100,
              render: (_, row) => (
                <Button
                  type="link"
                  onClick={() => {
                    setEditing(row);
                    form.setFieldsValue(row);
                  }}
                >
                  编辑
                </Button>
              ),
            },
          ]}
        />
      </Panel>
      <Modal
        title={`编辑用户 · ${editing?.phone || ''}`}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        confirmLoading={save.isPending}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={(v) => save.mutate(v)}>
          <Form.Item name="name" label="昵称">
            <Input />
          </Form.Item>
          {isAdmin ? (
            <Form.Item name="role" label="角色">
              <Select
                options={[
                  { value: 'user', label: '普通用户' },
                  { value: 'ops', label: '运营' },
                  { value: 'admin', label: '管理员' },
                ]}
              />
            </Form.Item>
          ) : (
            <Form.Item label="角色">
              <Input value={roleLabel[editing?.role || ''] || editing?.role} disabled />
            </Form.Item>
          )}
          <Form.Item name="level" label="等级">
            <InputNumber style={{ width: '100%' }} min={1} max={20} />
          </Form.Item>
          <Form.Item name="safety_score" label="安全分">
            <InputNumber style={{ width: '100%' }} min={0} max={100} />
          </Form.Item>
          <Form.Item name="verified" label="实名" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="verified_label" label="实名标签">
            <Input />
          </Form.Item>
          <Form.Item name="banned" label="封禁" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
