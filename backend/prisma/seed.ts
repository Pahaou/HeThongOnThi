import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import {
  Difficulty,
  LessonType,
  PrismaClient,
  QuestionType,
  Role,
} from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function upsertUser(
  email: string,
  password: string,
  fullName: string,
  role: Role,
) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      fullName,
      role,
      passwordHash: await bcrypt.hash(password, 10),
    },
  });
}

async function seedDemoCourse(instructorId: string) {
  const slug = 'nhap-mon-lap-trinh-web';
  if (await prisma.course.findUnique({ where: { slug } })) return;

  await prisma.course.create({
    data: {
      slug,
      instructorId,
      title: 'Nhập môn lập trình Web',
      description:
        'Khóa học mẫu: HTML, CSS và JavaScript cơ bản để dựng trang web đầu tiên.',
      published: true,
      chapters: {
        create: [
          {
            title: 'Làm quen với Web',
            position: 0,
            lessons: {
              create: [
                {
                  type: LessonType.READING,
                  title: 'Web hoạt động như thế nào?',
                  position: 0,
                  durationSec: 600,
                  content: [
                    '## Trình duyệt và máy chủ',
                    '',
                    'Khi bạn gõ một địa chỉ, trình duyệt gửi **HTTP request** tới máy chủ và nhận về HTML, CSS, JavaScript.',
                    '',
                    '- **HTML**: cấu trúc nội dung',
                    '- **CSS**: trình bày',
                    '- **JavaScript**: tương tác',
                  ].join('\n'),
                },
                {
                  type: LessonType.VIDEO,
                  title: 'Video mẫu: trình phát bài giảng',
                  position: 1,
                  durationSec: 60,
                  videoUrl:
                    'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
                  content:
                    'Bài video có thể dùng link YouTube hoặc file .mp4. Sau bài này, thử viết một trang HTML có tiêu đề và đoạn văn.',
                },
              ],
            },
          },
          {
            title: 'CSS cơ bản',
            position: 1,
            lessons: {
              create: [
                {
                  type: LessonType.READING,
                  title: 'Bộ chọn và hộp (box model)',
                  position: 0,
                  durationSec: 900,
                  content: [
                    '## Bộ chọn',
                    '',
                    '```css',
                    'h1 { color: navy; }',
                    '.note { padding: 12px; }',
                    '```',
                    '',
                    'Mỗi phần tử là một hộp gồm `content`, `padding`, `border`, `margin`.',
                  ].join('\n'),
                },
              ],
            },
          },
        ],
      },
    },
  });
  console.log(`Khóa học mẫu: /courses/${slug}`);
}

async function seedJsCourse(instructorId: string) {
  const slug = 'javascript-co-ban';
  if (await prisma.course.findUnique({ where: { slug } })) return;

  await prisma.course.create({
    data: {
      slug,
      instructorId,
      title: 'JavaScript cơ bản',
      description:
        'Khóa học mẫu: biến, hàm và thao tác với trang web bằng JavaScript.',
      published: true,
      chapters: {
        create: [
          {
            title: 'Ngôn ngữ JavaScript',
            position: 0,
            lessons: {
              create: [
                {
                  type: LessonType.READING,
                  title: 'Biến và kiểu dữ liệu',
                  position: 0,
                  durationSec: 720,
                  content: [
                    '## Khai báo biến',
                    '',
                    '```js',
                    "const name = 'HTON';",
                    'let score = 0;',
                    'score += 10;',
                    '```',
                    '',
                    'Dùng `const` cho giá trị không gán lại, `let` cho giá trị thay đổi.',
                  ].join('\n'),
                },
                {
                  type: LessonType.READING,
                  title: 'Hàm',
                  position: 1,
                  durationSec: 600,
                  content: [
                    '## Khai báo hàm',
                    '',
                    '```js',
                    'const add = (a, b) => a + b;',
                    'console.log(add(2, 3)); // 5',
                    '```',
                  ].join('\n'),
                },
              ],
            },
          },
          {
            title: 'JavaScript và trang web',
            position: 1,
            lessons: {
              create: {
                type: LessonType.READING,
                title: 'Thao tác DOM',
                position: 0,
                durationSec: 900,
                content: [
                  '## Chọn và sửa phần tử',
                  '',
                  '```js',
                  "document.querySelector('h1').textContent = 'Xin chào';",
                  '```',
                ].join('\n'),
              },
            },
          },
        ],
      },
    },
  });
  console.log(`Khóa học mẫu: /courses/${slug}`);
}

async function seedDemoPath(createdById: string) {
  const slug = 'lap-trinh-web-tu-con-so-0';
  if (await prisma.learningPath.findUnique({ where: { slug } })) return;

  const courses = await prisma.course.findMany({
    where: { slug: { in: ['nhap-mon-lap-trinh-web', 'javascript-co-ban'] } },
    select: { id: true, slug: true },
  });
  const order = ['nhap-mon-lap-trinh-web', 'javascript-co-ban'];
  courses.sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));

  await prisma.learningPath.create({
    data: {
      slug,
      createdById,
      title: 'Lập trình Web từ con số 0',
      description:
        'Lộ trình mẫu: bắt đầu từ HTML/CSS rồi tới JavaScript để tự dựng trang web.',
      published: true,
      courses: {
        create: courses.map((c, position) => ({ courseId: c.id, position })),
      },
    },
  });
  console.log(`Lộ trình mẫu: /paths/${slug}`);
}

type SeedQuestion = [
  topic: string,
  type: QuestionType,
  difficulty: Difficulty,
  content: string,
  options: string[],
  correct: number[],
  explanation: string,
];

const { SINGLE, MULTIPLE, TRUE_FALSE } = QuestionType;
const { EASY, MEDIUM, HARD } = Difficulty;

const WEB_QUESTIONS: SeedQuestion[] = [
  [
    'HTML',
    SINGLE,
    EASY,
    'Thẻ nào dùng để tạo liên kết?',
    ['<a>', '<link>', '<href>', '<url>'],
    [0],
    'Thẻ <a> với thuộc tính href tạo liên kết; <link> dùng để nạp CSS.',
  ],
  [
    'HTML',
    SINGLE,
    EASY,
    'Tiêu đề lớn nhất trong HTML là thẻ nào?',
    ['<h1>', '<h6>', '<head>', '<title>'],
    [0],
    'Có 6 cấp tiêu đề, <h1> là lớn nhất.',
  ],
  [
    'HTML',
    MULTIPLE,
    MEDIUM,
    'Những thẻ nào là thẻ ngữ nghĩa (semantic)?',
    ['<article>', '<nav>', '<div>', '<span>'],
    [0, 1],
    '<div> và <span> không mang ý nghĩa nội dung.',
  ],
  [
    'HTML',
    TRUE_FALSE,
    EASY,
    'Thẻ <img> cần có thẻ đóng </img>.',
    ['Đúng', 'Sai'],
    [1],
    '<img> là thẻ rỗng, không có thẻ đóng.',
  ],
  [
    'HTML',
    SINGLE,
    HARD,
    'Thuộc tính nào giúp trình đọc màn hình mô tả ảnh?',
    ['alt', 'title', 'src', 'aria-hidden'],
    [0],
    'alt là văn bản thay thế cho ảnh.',
  ],
  [
    'CSS',
    SINGLE,
    EASY,
    'Thuộc tính nào đổi màu chữ?',
    ['color', 'font-color', 'text-color', 'background'],
    [0],
    '',
  ],
  [
    'CSS',
    SINGLE,
    MEDIUM,
    'Thứ tự các lớp trong box model từ trong ra ngoài là?',
    [
      'content, padding, border, margin',
      'content, margin, border, padding',
      'padding, content, border, margin',
      'margin, border, padding, content',
    ],
    [0],
    '',
  ],
  [
    'CSS',
    MULTIPLE,
    MEDIUM,
    'Những giá trị nào hợp lệ cho thuộc tính display?',
    ['flex', 'grid', 'block', 'center'],
    [0, 1, 2],
    'center là giá trị của text-align/justify-content, không phải display.',
  ],
  [
    'CSS',
    TRUE_FALSE,
    MEDIUM,
    'Bộ chọn #id có độ ưu tiên cao hơn bộ chọn .class.',
    ['Đúng', 'Sai'],
    [0],
    '',
  ],
  [
    'CSS',
    SINGLE,
    HARD,
    'position: sticky bám theo phần tử nào khi cuộn?',
    [
      'Phần tử cha gần nhất có thể cuộn',
      'Luôn là cửa sổ trình duyệt',
      'Phần tử có position: relative gần nhất',
      'Thẻ body',
    ],
    [0],
    '',
  ],
  [
    'HTTP',
    SINGLE,
    EASY,
    'Mã trạng thái nào nghĩa là không tìm thấy?',
    ['404', '200', '500', '301'],
    [0],
    '',
  ],
  [
    'HTTP',
    MULTIPLE,
    HARD,
    'Những phương thức HTTP nào là idempotent?',
    ['GET', 'PUT', 'DELETE', 'POST'],
    [0, 1, 2],
    'Gửi lại POST có thể tạo thêm bản ghi, nên không idempotent.',
  ],
  [
    'HTTP',
    TRUE_FALSE,
    EASY,
    'HTTPS mã hóa dữ liệu giữa trình duyệt và máy chủ.',
    ['Đúng', 'Sai'],
    [0],
    '',
  ],
];

async function seedDemoQuestions(createdById: string) {
  const course = await prisma.course.findUnique({
    where: { slug: 'nhap-mon-lap-trinh-web' },
    select: { id: true, _count: { select: { questions: true } } },
  });
  if (!course || course._count.questions > 0) return;

  const topicIds = new Map<string, string>();
  for (const name of new Set(WEB_QUESTIONS.map((q) => q[0]))) {
    const topic = await prisma.topic.create({
      data: { courseId: course.id, name },
    });
    topicIds.set(name, topic.id);
  }
  for (const [
    topic,
    type,
    difficulty,
    content,
    options,
    correct,
    explanation,
  ] of WEB_QUESTIONS) {
    await prisma.question.create({
      data: {
        courseId: course.id,
        topicId: topicIds.get(topic)!,
        createdById,
        type,
        difficulty,
        content,
        explanation,
        options: {
          create: options.map((o, position) => ({
            content: o,
            isCorrect: correct.includes(position),
            position,
          })),
        },
      },
    });
  }
  console.log(`Ngân hàng câu hỏi mẫu: ${WEB_QUESTIONS.length} câu`);
}

/** Đề thi thử mẫu: 6 câu trong 10 phút, đủ câu trong kho mẫu ở trên. */
async function seedDemoBlueprint() {
  const course = await prisma.course.findUnique({
    where: { slug: 'nhap-mon-lap-trinh-web' },
    include: { topics: true, blueprints: { select: { id: true } } },
  });
  if (!course || course.blueprints.length > 0) return;
  const topic = (name: string) => course.topics.find((t) => t.name === name);
  const html = topic('HTML');
  const css = topic('CSS');
  const http = topic('HTTP');
  if (!html || !css || !http) return;

  await prisma.examBlueprint.create({
    data: {
      courseId: course.id,
      title: 'Thi thử: Nhập môn lập trình Web',
      durationSec: 10 * 60,
      published: true,
      rules: {
        create: [
          { topicId: html.id, difficulty: EASY, count: 2 },
          { topicId: css.id, difficulty: MEDIUM, count: 2 },
          { topicId: http.id, difficulty: EASY, count: 2 },
        ],
      },
    },
  });
  console.log('Đề thi thử mẫu: 6 câu, 10 phút');
}

async function main() {
  const adminEmail = (
    process.env.ADMIN_EMAIL ?? 'admin@hton.local'
  ).toLowerCase();
  await upsertUser(
    adminEmail,
    process.env.ADMIN_PASSWORD ?? 'Admin@123',
    'Quản trị viên',
    Role.ADMIN,
  );
  console.log(`Admin: ${adminEmail}`);

  const instructor = await upsertUser(
    'gv@hton.local',
    'Giangvien@123',
    'Giảng viên mẫu',
    Role.INSTRUCTOR,
  );
  console.log('Giảng viên mẫu: gv@hton.local');
  await seedDemoCourse(instructor.id);
  await seedJsCourse(instructor.id);
  await seedDemoPath(instructor.id);
  await seedDemoQuestions(instructor.id);
  await seedDemoBlueprint();

  await upsertUser(
    'hv@hton.local',
    'Hocvien@123',
    'Học viên mẫu',
    Role.STUDENT,
  );
  console.log('Học viên mẫu: hv@hton.local');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
