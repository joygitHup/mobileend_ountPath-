import { Button, Popconfirm, Switch, Table, Tabs, Tag, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  answered?: boolean;
  user_id?: string;
  created_at?: string;
};

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
  payload?: { content?: string; text?: string; body?: string };
};

type CompanionRow = {
  post_id: string;
  post_title: string;
  post_owner: string;
  user_id: string;
  user_name: string;
  phone: string;
  note: string;
  created_at: string;
  route_id?: string;
  route_name?: string;
};

const typeLabel: Record<string, string> = {
  guide: '攻略',
  condition: '路况',
  question: '答疑',
  review: '评价',
  companion: '约伴',
};

export default function CommunityPage() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const wantUnanswered = params.get('filter') === 'unanswered';
  const [tab, setTab] = useState(params.get('tab') || 'posts');

  const list = useQuery({
    queryKey: ['admin-posts'],
    queryFn: () => api<Post[]>('/api/v1/admin/posts'),
  });
  const comments = useQuery({
    queryKey: ['admin-comments'],
    queryFn: () => api<CommentRow[]>('/api/v1/admin/comments'),
    enabled: tab === 'comments',
  });
  const companions = useQuery({
    queryKey: ['admin-companions'],
    queryFn: () => api<CompanionRow[]>('/api/v1/admin/companion-interests'),
    enabled: tab === 'companion',
  });

  const posts = useMemo(() => {
    const rows = list.data || [];
    if (!wantUnanswered) return rows;
    return rows.filter((p) => p.type === 'question' && !p.answered && !p.hidden);
  }, [list.data, wantUnanswered]);

  const patch = useMutation({
    mutationFn: (body: {
      id: string;
      hidden?: boolean;
      is_paid?: boolean;
      answered?: boolean;
    }) => {
      const { id, ...rest } = body;
      return api(`/api/v1/admin/posts/${id}`, { method: 'PATCH', body: JSON.stringify(rest) });
    },
    onSuccess: () => {
      message.success('已更新');
      qc.invalidateQueries({ queryKey: ['admin-posts'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/v1/admin/posts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('已删除');
      qc.invalidateQueries({ queryKey: ['admin-posts'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const removeComment = useMutation({
    mutationFn: (id: string) => api(`/api/v1/admin/comments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('评论已删除');
      qc.invalidateQueries({ queryKey: ['admin-comments'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title={routeMeta['/community'].title}
        description={
          wantUnanswered
            ? '当前筛选：未答疑问题帖'
            : routeMeta['/community'].desc
        }
      />
      <Panel>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'posts',
              label: `帖子 (${posts.length})`,
              children: (
                <Table
                  rowKey="id"
                  loading={list.isLoading}
                  dataSource={posts}
                  pagination={{ pageSize: 12, showSizeChanger: false }}
                  scroll={{ x: 960 }}
                  columns={[
                    { title: 'ID', dataIndex: 'id', width: 110 },
                    { title: '标题', dataIndex: 'title', ellipsis: true },
                    {
                      title: '类型',
                      dataIndex: 'type',
                      width: 90,
                      render: (t: string) => (
                        <Tag color="green">{typeLabel[t] || t}</Tag>
                      ),
                    },
                    {
                      title: '隐藏',
                      dataIndex: 'hidden',
                      width: 80,
                      render: (v: boolean, row) => (
                        <Switch
                          checked={!!v}
                          onChange={(c) => patch.mutate({ id: row.id, hidden: c })}
                        />
                      ),
                    },
                    {
                      title: '付费',
                      dataIndex: 'is_paid',
                      width: 80,
                      render: (v: boolean, row) => (
                        <Switch
                          checked={!!v}
                          onChange={(c) => patch.mutate({ id: row.id, is_paid: c })}
                        />
                      ),
                    },
                    {
                      title: '已答疑',
                      dataIndex: 'answered',
                      width: 90,
                      render: (v: boolean, row) =>
                        row.type === 'question' ? (
                          <Switch
                            checked={!!v}
                            onChange={(c) => patch.mutate({ id: row.id, answered: c })}
                          />
                        ) : (
                          '—'
                        ),
                    },
                    { title: '作者', dataIndex: 'user_id', width: 100 },
                    {
                      title: '操作',
                      width: 100,
                      render: (_, row) => (
                        <Popconfirm
                          title="确认删除该帖？相关评论与约伴报名将一并删除"
                          onConfirm={() => remove.mutate(row.id)}
                        >
                          <Button type="link" danger>
                            删除
                          </Button>
                        </Popconfirm>
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'comments',
              label: '评论',
              children: (
                <Table
                  rowKey="id"
                  loading={comments.isLoading}
                  dataSource={comments.data || []}
                  pagination={{ pageSize: 12 }}
                  columns={[
                    { title: 'ID', dataIndex: 'id', width: 110 },
                    { title: '帖子', dataIndex: 'post_id', width: 120 },
                    { title: '用户', dataIndex: 'user_id', width: 100 },
                    {
                      title: '内容',
                      render: (_, row) =>
                        row.payload?.content ||
                        row.payload?.text ||
                        row.payload?.body ||
                        JSON.stringify(row.payload || {}),
                    },
                    {
                      title: '时间',
                      dataIndex: 'created_at',
                      width: 170,
                      render: (v: string) => (v ? new Date(v).toLocaleString() : '—'),
                    },
                    {
                      title: '操作',
                      width: 90,
                      render: (_, row) => (
                        <Popconfirm
                          title="确认删除该评论？"
                          onConfirm={() => removeComment.mutate(row.id)}
                        >
                          <Button type="link" danger>
                            删除
                          </Button>
                        </Popconfirm>
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              key: 'companion',
              label: '约伴报名',
              children: (
                <Table
                  rowKey={(r) => `${r.post_id}:${r.user_id}:${r.created_at}`}
                  loading={companions.isLoading}
                  dataSource={companions.data || []}
                  pagination={{ pageSize: 12 }}
                  columns={[
                    { title: '约伴帖', dataIndex: 'post_title', ellipsis: true },
                    { title: '楼主', dataIndex: 'post_owner', width: 100 },
                    { title: '报名者', dataIndex: 'user_name', width: 100 },
                    { title: '手机', dataIndex: 'phone', width: 130 },
                    {
                      title: '路线',
                      width: 140,
                      render: (_, row) => row.route_name || row.route_id || '—',
                    },
                    { title: '留言', dataIndex: 'note', ellipsis: true },
                    {
                      title: '时间',
                      dataIndex: 'created_at',
                      width: 170,
                      render: (v: string) => (v ? new Date(v).toLocaleString() : '—'),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}
