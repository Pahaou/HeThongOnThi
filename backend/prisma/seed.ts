import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { LessonType, PrismaClient, Role } from '../src/generated/prisma/client';

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
