import serverless from 'serverless-http';
import { app, initDB } from '../server.js';

await initDB();

export default serverless(app);
