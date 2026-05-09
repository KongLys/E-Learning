import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Categories
  const [lapTrinh, thietKe, kinhDoanh] = await Promise.all([
    prisma.category.upsert({
      where: { slug: 'lap-trinh' },
      update: {},
      create: { name: 'Lập trình', slug: 'lap-trinh', description: 'Các khóa học lập trình' },
    }),
    prisma.category.upsert({
      where: { slug: 'thiet-ke' },
      update: {},
      create: { name: 'Thiết kế', slug: 'thiet-ke', description: 'Các khóa học thiết kế' },
    }),
    prisma.category.upsert({
      where: { slug: 'kinh-doanh' },
      update: {},
      create: { name: 'Kinh doanh', slug: 'kinh-doanh', description: 'Các khóa học kinh doanh' },
    }),
  ]);

  // Users
  const adminHash = await bcrypt.hash('Admin@123', 10);
  const demoHash = await bcrypt.hash('Demo@123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@elearning.local' },
    update: {},
    create: {
      email: 'admin@elearning.local',
      passwordHash: adminHash,
      fullName: 'Admin',
      role: 'admin',
    },
  });

  const instructor = await prisma.user.upsert({
    where: { email: 'instructor@elearning.local' },
    update: {},
    create: {
      email: 'instructor@elearning.local',
      passwordHash: demoHash,
      fullName: 'Demo Instructor',
      role: 'instructor',
      bio: 'Senior developer with 10+ years experience in NestJS and TypeScript.',
    },
  });

  const student = await prisma.user.upsert({
    where: { email: 'student@elearning.local' },
    update: {},
    create: {
      email: 'student@elearning.local',
      passwordHash: demoHash,
      fullName: 'Demo Student',
      role: 'student',
    },
  });

  // Demo course
  const course = await prisma.course.upsert({
    where: { slug: 'nestjs-cho-nguoi-moi' },
    update: {},
    create: {
      instructorId: instructor.id,
      categoryId: lapTrinh.id,
      title: 'NestJS cho người mới bắt đầu',
      slug: 'nestjs-cho-nguoi-moi',
      description: 'Khóa học NestJS từ A đến Z, phù hợp cho người mới bắt đầu.',
      shortDescription: 'Học NestJS từ đầu với các ví dụ thực tế.',
      price: 0,
      level: 'beginner',
      status: 'published',
      publishedAt: new Date(),
      totalLessons: 3,
    },
  });

  // Section 1
  const section1 = await prisma.section.upsert({
    where: { id: 'seed-section-1' },
    update: {},
    create: {
      id: 'seed-section-1',
      courseId: course.id,
      title: 'Giới thiệu NestJS',
      orderIndex: 1,
    },
  });

  // Section 2
  const section2 = await prisma.section.upsert({
    where: { id: 'seed-section-2' },
    update: {},
    create: {
      id: 'seed-section-2',
      courseId: course.id,
      title: 'Xây dựng API đầu tiên',
      orderIndex: 2,
    },
  });

  // Lesson 1 — Video
  const lesson1 = await prisma.lesson.upsert({
    where: { id: 'seed-lesson-1' },
    update: {},
    create: {
      id: 'seed-lesson-1',
      sectionId: section1.id,
      title: 'NestJS là gì?',
      type: 'video',
      orderIndex: 1,
      durationSec: 600,
      isPreview: true,
    },
  });

  await prisma.videoAsset.upsert({
    where: { lessonId: lesson1.id },
    update: {},
    create: {
      lessonId: lesson1.id,
      videoUrl: 'https://example.com/videos/nestjs-intro.mp4',
      durationSec: 600,
      processingStatus: 'ready',
    },
  });

  // Lesson 2 — Document
  const lesson2 = await prisma.lesson.upsert({
    where: { id: 'seed-lesson-2' },
    update: {},
    create: {
      id: 'seed-lesson-2',
      sectionId: section1.id,
      title: 'Tài liệu tham khảo NestJS',
      type: 'document',
      orderIndex: 2,
    },
  });

  await prisma.documentAsset.upsert({
    where: { lessonId: lesson2.id },
    update: {},
    create: {
      lessonId: lesson2.id,
      fileUrl: 'https://example.com/docs/nestjs-guide.pdf',
      fileType: 'pdf',
      pageCount: 20,
    },
  });

  // Lesson 3 — Quiz
  const lesson3 = await prisma.lesson.upsert({
    where: { id: 'seed-lesson-3' },
    update: {},
    create: {
      id: 'seed-lesson-3',
      sectionId: section2.id,
      title: 'Kiểm tra kiến thức',
      type: 'quiz',
      orderIndex: 1,
    },
  });

  const quizLesson = await prisma.quizLesson.upsert({
    where: { lessonId: lesson3.id },
    update: {},
    create: {
      lessonId: lesson3.id,
      passingScore: 70,
      timeLimit: 10,
      maxAttempts: 3,
    },
  });

  const q1 = await prisma.quizQuestion.upsert({
    where: { id: 'seed-q1' },
    update: {},
    create: {
      id: 'seed-q1',
      quizLessonId: quizLesson.id,
      content: 'NestJS được xây dựng dựa trên framework nào?',
      questionType: 'single',
      orderIndex: 1,
      points: 1,
    },
  });

  await Promise.all([
    prisma.quizOption.upsert({
      where: { id: 'seed-opt-1' },
      update: {},
      create: { id: 'seed-opt-1', questionId: q1.id, content: 'Express.js', isCorrect: true, orderIndex: 1 },
    }),
    prisma.quizOption.upsert({
      where: { id: 'seed-opt-2' },
      update: {},
      create: { id: 'seed-opt-2', questionId: q1.id, content: 'Fastify', isCorrect: false, orderIndex: 2 },
    }),
    prisma.quizOption.upsert({
      where: { id: 'seed-opt-3' },
      update: {},
      create: { id: 'seed-opt-3', questionId: q1.id, content: 'Koa', isCorrect: false, orderIndex: 3 },
    }),
  ]);

  console.log('✅ Seed completed:', {
    categories: [lapTrinh.slug, thietKe.slug, kinhDoanh.slug],
    users: [admin.email, instructor.email, student.email],
    course: course.slug,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
