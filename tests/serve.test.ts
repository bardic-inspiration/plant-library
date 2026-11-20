import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { get, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serve } from '../lib/serve';

const dist = mkdtempSync(join(tmpdir(), 'serve-'));
let server: Server;
let port: number;

/** A GET of a raw path, as written (no URL parsing on the way out). */
function status(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    get({ host: '127.0.0.1', port, path }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    }).on('error', reject);
  });
}

beforeAll(async () => {
  mkdirSync(join(dist, 'plant'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<p>home</p>');
  ({ server } = await serve(dist, '/base/', 0));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => {
  server.close();
  rmSync(dist, { recursive: true, force: true });
});

describe('the preview server', () => {
  it('answers a malformed escape with 400 and keeps serving', async () => {
    expect(await status('/base/%E0%A4%A')).toBe(400);
    expect(await status('/base/')).toBe(200);
    expect(await status('/base/missing')).toBe(404);
  });
});
