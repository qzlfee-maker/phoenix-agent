#!/usr/bin/env node

import { runCLI } from '../dist/cli/index.js';

runCLI().catch((err) => {
  console.error(err);
  process.exit(1);
});
