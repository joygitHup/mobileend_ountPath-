import { Button, Switch, Table, Tag, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { PageHeader, Panel } from '@/components/PageChrome';
import { routeMeta } from '@/theme/tokens';

type Post = {
  id: string;
  title?: string;
  type?: string;
  hidden?: boolean;
  is_paid?: boolean;
  price?: number;
  user_id?: string;
  created_at?: string;
};

export default function CommunityPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['admin-posts'],
    queryFn: () => api<Post[]>('/api/v1/admin/posts'),
  });

  const patch = useMutation({
    mutationFn: ({ id, ...body }: { id: string; hidden?: boolean; is_paid?: boolean }) =>
      api(`/api/v1/admin/posts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      message.success('已更新');
      qc.invalidateQueries({ queryKey: ['admin-posts'] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/admin/posts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('已删除');
      qc.invalidateQueries({ queryKey: ['admin-posts'] });
    },
  });

  return (
    <div>
      <PageHeader title={routeMeta['/community'].title} description={routeMeta['/community'].desc} />
      <Panel>
        <Table
          rowKey="id"
          loading={list.isLoading}
          dataSource={list.data || []}
          pagination={{ pageSize: 12, showSizeChanger: false }}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 110 },
            { title: '标题', dataIndex: 'title', ellipsis: true },
            {
              title: '类型',
              dataIndex: 'type',
              width: 100,
              render: (t: string) => <Tag color="green">{t}</Tag>,
            },
            {
              title: '隐藏',
              dataIndex: 'hidden',
              width: 90,
              render: (v: boolean, row) => (
                <Switch checked={!!v} onChange={(c) => patch.mutate({ id: row.id, hidden: c })} />
              ),
            },
            {
              title: '付费',
              dataIndex: 'is_paid',
              width: 90,
              render: (v: boolean, row) => (
                <Switch checked={!!v} onChange={(c) => patch.mutate({ id: row.id, is_paid: c })} />
              ),
            },
            { title: '作者', dataIndex: 'user_id', width: 100 },
            {
              title: '操作',
              width: 100,
              render: (_, row) => (
                <Button type="link" danger onClick={() => remove.mutate(row.id)}>删除</Button>
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}
