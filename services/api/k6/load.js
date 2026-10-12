/* global __ENV */
// k6 load test for the public, cacheable endpoints (https://k6.io, free and open source).
//   k6 run -e API=https://api-staging.example -e PLAYER=0x... services/api/k6/load.js
// Targets (docs/04 gate 3): p95 < 300 ms and < 1 % errors at 200 virtual users.
import http from 'k6/http';
import { check, sleep } from 'k6';

const API = __ENV.API || 'http://127.0.0.1:8787';
const PLAYER = __ENV.PLAYER || '0xbA27372EaE81EE53d7D434deD7D3299A383C2a6c';

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 200 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const pages = [
    '/world',
    '/economy/daily?days=30',
    '/leaderboards/contribution?limit=50',
    '/leaderboards/crews',
    `/profiles/${PLAYER}`,
  ];
  for (const path of pages) {
    const res = http.get(`${API}${path}`);
    check(res, { [`${path} ok`]: (r) => r.status === 200 || r.status === 404 });
  }
  sleep(1);
}
