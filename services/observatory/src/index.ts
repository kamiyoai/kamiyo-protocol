import { loadConfig } from './config';
import { openDb } from './db';
import { createApp } from './app';

const config = loadConfig();
const db = openDb(config.dbPath);

createApp(config, db).listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`observatory listening on :${config.port}`);
});

