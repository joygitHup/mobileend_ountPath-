import { Router } from 'express';

const router = Router();

interface GuardSession {
  id: string;
  user_id: string;
  route_id: string;
  status: 'active' | 'completed' | 'sos';
  started_at: string;
  planned_duration_hours: number;
  guardians: string[];
  last_location: { lat: number; lng: number; timestamp: string } | null;
}

const activeSessions: Map<string, GuardSession> = new Map();

// POST /api/v1/guard/start - 开始守护
router.post('/start', (req, res) => {
  const { route_id, planned_duration_hours, guardians } = req.body;
  const sessionId = `guard_${Date.now()}`;
  const session: GuardSession = {
    id: sessionId,
    user_id: 'u1',
    route_id: route_id || 'unknown',
    status: 'active',
    started_at: new Date().toISOString(),
    planned_duration_hours: planned_duration_hours || 8,
    guardians: guardians || ['家人'],
    last_location: { lat: 30.1234, lng: 118.5678, timestamp: new Date().toISOString() },
  };
  activeSessions.set(sessionId, session);
  res.json({ data: session });
});

// GET /api/v1/guard/status - 获取守护状态
router.get('/status', (req, res) => {
  const sessions = Array.from(activeSessions.values());
  const active = sessions.find(s => s.status === 'active');
  if (!active) {
    res.json({ data: null, message: '当前无活跃守护' });
    return;
  }
  res.json({ data: active });
});

// POST /api/v1/guard/sos - SOS求救
router.post('/sos', (req, res) => {
  const { session_id, message } = req.body;
  const session = activeSessions.get(session_id);
  if (!session) {
    res.status(404).json({ error: '守护会话不存在' });
    return;
  }
  session.status = 'sos';
  res.json({
    data: {
      ...session,
      sos_message: message || '紧急求救',
      sos_time: new Date().toISOString(),
      last_known_location: session.last_location,
    },
  });
});

// POST /api/v1/guard/stop - 结束守护
router.post('/stop', (req, res) => {
  const { session_id } = req.body;
  const session = activeSessions.get(session_id);
  if (!session) {
    res.status(404).json({ error: '守护会话不存在' });
    return;
  }
  session.status = 'completed';
  res.json({ data: session });
});

export default router;
