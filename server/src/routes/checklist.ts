import { Router } from 'express';
import { getChecklist } from '../data/checklist.js';
import { routes } from '../data/routes.js';

const router = Router();

// GET /api/v1/checklist/:routeId - 获取智能准备清单
router.get('/:routeId', (req, res) => {
  const route = routes.find(r => r.id === req.params.routeId);
  if (!route) {
    res.status(404).json({ error: '路线不存在' });
    return;
  }
  const checklist = getChecklist(route.id, route.difficulty);
  checklist.route_name = route.name;
  res.json({ data: checklist });
});

export default router;
