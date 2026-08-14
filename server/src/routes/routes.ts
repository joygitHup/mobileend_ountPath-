import { Router } from 'express';
import { routes } from '../data/routes.js';

const router = Router();

// GET /api/v1/routes - 路线列表
router.get('/', (req, res) => {
  const { difficulty, province, sort } = req.query;
  let result = [...routes];

  if (difficulty && difficulty !== 'all') {
    result = result.filter(r => r.difficulty === difficulty);
  }
  if (province && province !== 'all') {
    result = result.filter(r => r.province === province);
  }
  if (sort === 'match') {
    result.sort((a, b) => b.match_score - a.match_score);
  } else if (sort === 'difficulty') {
    result.sort((a, b) => a.difficulty_stars - b.difficulty_stars);
  }

  res.json({ data: result });
});

// GET /api/v1/routes/search - 搜索路线
router.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q) {
    res.json({ data: routes });
    return;
  }
  const query = String(q).toLowerCase();
  const result = routes.filter(r =>
    r.name.toLowerCase().includes(query) ||
    r.location.toLowerCase().includes(query) ||
    r.tags.some(t => t.toLowerCase().includes(query))
  );
  res.json({ data: result });
});

// GET /api/v1/routes/:id - 路线详情
router.get('/:id', (req, res) => {
  const route = routes.find(r => r.id === req.params.id);
  if (!route) {
    res.status(404).json({ error: '路线不存在' });
    return;
  }
  res.json({ data: route });
});

export default router;
