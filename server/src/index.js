import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/status', (req, res) => {
  res.json({ status: 'ok', message: 'Alumni system backend is running' });
});

app.get('/api/alumni', (req, res) => {
  res.json([
    { id: 1, name: 'Jane Doe', gradYear: 2021, degree: 'B.Sc. Computer Science' },
    { id: 2, name: 'John Smith', gradYear: 2020, degree: 'B.A. Economics' }
  ]);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.join(__dirname, '../../client/dist');

app.use(express.static(clientDist));

app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
