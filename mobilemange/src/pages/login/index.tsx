import { useState } from 'react';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { brand } from '@/theme/tokens';
import { ApiError } from '@/api/client';

export default function LoginPage() {
  const { user, login, ready } = useAuth();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  if (!ready) return null;
  if (user) return <Navigate to="/" replace />;

  const demoDefaults =
    import.meta.env.DEV
      ? { phone: '13800000000', code: '1234' }
      : { phone: '', code: '' };

  return (
    <div className="login-page">
      <aside className="login-visual">
        <div className="login-visual__ridge" aria-hidden />
        <h1 className="login-visual__brand">山途</h1>
        <p className="login-visual__tag">
          面向徒步运营的内容与安全中枢——配置路线、守护社区，让每一次出发更安心。
        </p>
      </aside>
      <section className="login-panel">
        <Card className="login-card" bordered={false}>
          <span className="login-card__eyebrow">运营管理平台</span>
          <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 4, color: brand.primary }}>
            欢迎回来
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 28 }}>
            仅 ops / admin 可进入
            {import.meta.env.DEV ? (
              <>
                {' '}
                · 演示验证码 <Typography.Text code>1234</Typography.Text>
              </>
            ) : null}
          </Typography.Paragraph>
          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            initialValues={demoDefaults}
            onFinish={async (values) => {
              setLoading(true);
              try {
                await login(values.phone, values.code);
                message.success('登录成功');
              } catch (e) {
                message.error(e instanceof ApiError ? e.message : '登录失败');
              } finally {
                setLoading(false);
              }
            }}
          >
            <Form.Item name="phone" label="手机号" rules={[{ required: true, message: '请输入手机号' }]}>
              <Input size="large" placeholder="13800000000" maxLength={11} />
            </Form.Item>
            <Form.Item name="code" label="验证码" rules={[{ required: true, message: '请输入验证码' }]}>
              <Input size="large" placeholder="1234" maxLength={6} />
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>
              进入管理台
            </Button>
          </Form>
        </Card>
      </section>
    </div>
  );
}
