process.env.NODE_ENV = process.env.NODE_ENV || 'production';
const express = require('express');
const cors = require('cors');
const path = require('path');
const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({
  region: process.env.S3_REGION || 'us-west-2',
  endpoint: process.env.S3_ENDPOINT || 'https://s3.us-west-2.idrivee2.com',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'QRmndJEoROtNte9VIpgw',
    secretAccessKey: process.env.S3_SECRET_KEY || '3jX6XfyBFmILbkzA0EYr5Mn1P95tM1opxgXyi4xN'
  },
  forcePathStyle: true
});

const BUCKET = process.env.S3_BUCKET || 'upali-erp';
const PORT = process.env.PORT || 3456;
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes
app.get('/api/:key', async (req, res) => {
  try {
    const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: `${req.params.key}.json` });
    const result = await s3.send(cmd);
    const body = await result.Body.transformToString();
    res.json(JSON.parse(body));
  } catch (e) {
    if (e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) {
      res.status(404).json(null);
    } else {
      console.error('Load error:', e.message);
      res.status(500).json({ error: e.message });
    }
  }
});

app.post('/api/:key', async (req, res) => {
  try {
    const cmd = new PutObjectCommand({
      Bucket: BUCKET,
      Key: `${req.params.key}.json`,
      Body: JSON.stringify(req.body),
      ContentType: 'application/json'
    });
    await s3.send(cmd);
    res.json({ ok: true });
  } catch (e) {
    console.error('Save error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Document library - list all docs
app.get('/api/documents', async (req, res) => {
  try {
    const cmd = new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'documents/' });
    const result = await s3.send(cmd);
    const docs = (result.Contents || [])
      .filter(o => !o.Key.endsWith('/'))
      .map(o => ({
        name: o.Key.replace('documents/', ''),
        key: o.Key,
        size: o.Size,
        updated: o.LastModified
      }));
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Document download - generate fresh signed URL (1 hour)
app.get('/api/documents/download/:filename', async (req, res) => {
  try {
    const key = `documents/${req.params.filename}`;
    const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });
    res.redirect(url);
  } catch (e) {
    res.status(404).json({ error: 'Document not found' });
  }
});

// Serve built React frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, () => console.log(`✅ Upali ERP running on port ${PORT}`));
