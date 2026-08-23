#!/usr/bin/env node

import { rm } from 'node:fs/promises';
import { URL } from 'node:url';

await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
await rm(new URL('../coverage/', import.meta.url), { recursive: true, force: true });
