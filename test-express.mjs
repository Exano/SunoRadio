import express from 'express';
const app = express();
app.get('/x/y', (req, res) => { res.json({ok:'xy'}); });
app.get('/test', (req, res) => { res.json({ok:'test'}); });
const server = app.listen(3001, async () => {
  try {
    const r1 = await fetch('http://localhost:3001/test');
    console.log('/test:', r1.status, await r1.text());
    const r2 = await fetch('http://localhost:3001/x/y');
    console.log('/x/y:', r2.status, await r2.text());
  } finally {
    server.close();
  }
});
