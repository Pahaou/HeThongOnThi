// k6: N thí sinh làm bài thi cùng lúc: vào thi → lưu từng câu → nộp gần như đồng thời.
// Chạy qua Docker (xem loadtest/README.md). BASE_URL mặc định là backend trên máy chủ.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import exec from 'k6/execution';

const BASE = __ENV.BASE_URL || 'http://host.docker.internal:3000/api';
const data = JSON.parse(open('./data.json'));
const VUS = Number(__ENV.VUS || data.tokens.length);

export const options = {
  scenarios: {
    exam: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: 1,
      maxDuration: '5m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:save}': ['p(95)<1000'],
    'http_req_duration{name:submit}': ['p(95)<1500'],
  },
};

const savesOk = new Counter('saves_ok');
const submitsOk = new Counter('submits_ok');
const startTime = new Trend('start_duration', true);

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function () {
  const token = data.tokens[exec.vu.idInTest - 1];
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const sessionId = uuid();
  const url = `${BASE}/exams/${data.examId}`;

  const start = http.post(`${url}/start`, JSON.stringify({ sessionId }), {
    headers,
    tags: { name: 'start' },
  });
  startTime.add(start.timings.duration);
  if (!check(start, { 'vào thi 200': (r) => r.status === 200 })) {
    console.warn(`vào thi lỗi: status=${start.status} error=${start.error_code} ${start.error}`);
    return;
  }
  const questions = start.json('questions');

  // Đọc đề rồi chọn từng câu, mỗi câu lưu ngay (như client thật)
  for (const q of questions) {
    sleep(1 + Math.random() * 2);
    const res = http.put(
      `${url}/attempt/answers`,
      JSON.stringify({
        sessionId,
        answers: [
          {
            questionId: q.questionId,
            selectedOptionIds: [q.options[0].id],
            clientSavedAt: new Date().toISOString(),
          },
        ],
      }),
      { headers, tags: { name: 'save' } },
    );
    if (check(res, { 'lưu 200': (r) => r.status === 200 && r.json('saved') === 1 })) savesOk.add(1);
  }

  // Mọi thí sinh nộp gần như cùng lúc
  const submit = http.post(`${url}/attempt/submit`, JSON.stringify({ sessionId }), {
    headers,
    tags: { name: 'submit' },
  });
  if (check(submit, { 'nộp 200': (r) => r.status === 200 })) submitsOk.add(1);
}
