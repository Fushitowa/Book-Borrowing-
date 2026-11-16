import 'dotenv/config';
import app from './index.js';

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`Carbonell Library API listening on port ${port}.`);
});
