import { Router } from 'express';
import { communityPosts, leaders, userProfile } from '../data/community.js';

const router = Router();

// GET /api/v1/community/posts - 社区帖子列表
router.get('/posts', (req, res) => {
  const { type } = req.query;
  let result = [...communityPosts];
  if (type && type !== 'all') {
    result = result.filter(p => p.type === type);
  }
  result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  res.json({ data: result });
});

// GET /api/v1/community/leaders - 领队列表
router.get('/leaders', (req, res) => {
  res.json({ data: leaders });
});

// GET /api/v1/community/leaders/:id - 领队详情
router.get('/leaders/:id', (req, res) => {
  const leader = leaders.find(l => l.id === req.params.id);
  if (!leader) {
    res.status(404).json({ error: '领队不存在' });
    return;
  }
  res.json({ data: leader });
});

// GET /api/v1/community/user/profile - 用户信息
router.get('/user/profile', (req, res) => {
  res.json({ data: userProfile });
});

export default router;
