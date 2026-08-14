import express from "express";
import cors from "cors";
import routesRouter from './routes/routes.js';
import checklistRouter from './routes/checklist.js';
import communityRouter from './routes/community.js';
import guardRouter from './routes/guard.js';

const app = express();
const port = process.env.PORT || 9091;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/api/v1/health', (req, res) => {
  console.log('Health check success');
  res.status(200).json({ status: 'ok' });
});

// Routes - static before dynamic
app.use('/api/v1/routes', routesRouter);
app.use('/api/v1/checklist', checklistRouter);
app.use('/api/v1/community', communityRouter);
app.use('/api/v1/guard', guardRouter);

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}/`);
});
