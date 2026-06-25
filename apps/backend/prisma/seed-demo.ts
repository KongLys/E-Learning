/**
 * Seed dữ liệu DEMO cho môi trường DEV: tài khoản học viên ảo + đơn hàng/thanh toán THÀNH CÔNG.
 *
 * - Gắn mọi đơn hàng vào khóa học "Redis" có sẵn trong DB (đổi giá -> 30.000đ).
 * - Tạo ~30 học viên ảo (email tiền tố `demo.`), phần lớn có mua khóa.
 * - Mỗi đơn: Order(paid) + OrderItem + Payment(success) + Enrollment (+ Certificate nếu completed).
 * - Idempotent: chạy lại không tạo bản ghi trùng (upsert + key tất định).
 *
 * CHẠY:  cd apps/backend && npx ts-node prisma/seed-demo.ts
 *
 * KHÔNG đụng schema — chỉ INSERT/UPDATE dữ liệu (an toàn với DB đang drifted).
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const COURSE_PRICE = 30000;
const STUDENT_COUNT = 30;
const BUYER_COUNT = 28; // vài tài khoản chưa mua cho thực tế

// Họ + tên để ghép tên tiếng Việt thực tế
const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương'];
const TEN_DEM = ['Văn', 'Thị', 'Hữu', 'Đức', 'Minh', 'Ngọc', 'Quang', 'Thanh', 'Gia', 'Hoài'];
const TEN = ['An', 'Bình', 'Cường', 'Dũng', 'Hà', 'Hùng', 'Khoa', 'Lan', 'Linh', 'Mai', 'Nam', 'Phúc', 'Quân', 'Trang', 'Tú', 'Vy', 'Yến', 'Sơn', 'Thảo', 'Đạt'];

/** Random số nguyên trong [min, max]. */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** transferCode đúng regex ^DH[0-9A-F]{8}$ (tất định theo index). */
function demoTransferCode(n: number): string {
  return 'DH' + n.toString(16).toUpperCase().padStart(8, '0');
}

/** Ngày paidAt rải đều trong ~90 ngày gần đây. */
function demoPaidAt(n: number): Date {
  const daysAgo = randInt(0, 89);
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(randInt(8, 21), randInt(0, 59), randInt(0, 59), 0);
  return d;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('⛔ seed-demo chỉ dành cho DEV, không chạy ở production.');
  }

  // 1) Tìm & cập nhật khóa Redis
  const course = await prisma.course.findFirst({
    where: { title: { contains: 'Redis', mode: 'insensitive' } },
  });
  if (!course) {
    throw new Error('❌ Không tìm thấy khóa học "Redis" trong DB. Hủy seed-demo.');
  }
  await prisma.course.update({ where: { id: course.id }, data: { price: COURSE_PRICE } });
  console.log(`📘 Khóa: "${course.title}" (${course.id}) — giá đặt = ${COURSE_PRICE}đ`);

  // 2) Tạo học viên ảo
  const passwordHash = await bcrypt.hash('Demo@123', 10);
  const students: { id: string; email: string; fullName: string }[] = [];

  for (let i = 1; i <= STUDENT_COUNT; i++) {
    const idx = String(i).padStart(2, '0');
    const email = `demo.student${idx}@elearning.local`;
    const fullName = `${HO[i % HO.length]} ${TEN_DEM[i % TEN_DEM.length]} ${TEN[i % TEN.length]}`;
    const phone = '09' + String(randInt(0, 99999999)).padStart(8, '0');

    const user = await prisma.user.upsert({
      where: { email },
      update: { fullName },
      create: { email, passwordHash, fullName, phone, role: 'student', status: 'active' },
      select: { id: true, email: true, fullName: true },
    });
    students.push(user);
  }
  console.log(`👥 Đã tạo/cập nhật ${students.length} học viên ảo.`);

  // 3) Đơn hàng + thanh toán + ghi danh cho BUYER_COUNT học viên đầu
  let orders = 0;
  let certs = 0;
  let revenue = 0;

  for (let i = 0; i < BUYER_COUNT; i++) {
    const student = students[i];
    const n = i + 1;
    const paidAt = demoPaidAt(n);
    const createdAt = new Date(paidAt.getTime() - randInt(2, 30) * 60 * 1000); // sớm hơn vài phút
    const transferCode = demoTransferCode(n);

    // Order (upsert theo idempotencyKey)
    const order = await prisma.order.upsert({
      where: { idempotencyKey: `demo-order-${n}` },
      update: { status: 'paid', paidAt, totalAmount: COURSE_PRICE },
      create: {
        userId: student.id,
        totalAmount: COURSE_PRICE,
        currency: 'VND',
        status: 'paid',
        paymentMethod: 'sepay',
        discountAmount: 0,
        idempotencyKey: `demo-order-${n}`,
        createdAt,
        paidAt,
      },
    });

    // OrderItem (không có unique tự nhiên -> kiểm tra trước)
    const existingItem = await prisma.orderItem.findFirst({
      where: { orderId: order.id, courseId: course.id },
    });
    if (!existingItem) {
      await prisma.orderItem.create({
        data: { orderId: order.id, courseId: course.id, price: COURSE_PRICE, discount: 0 },
      });
    }

    // Payment (upsert theo orderId 1-1)
    const rawResponse: Prisma.InputJsonValue = {
      id: `demo-sepay-${n}`,
      gateway: 'BIDV',
      transferType: 'in',
      transferAmount: COURSE_PRICE,
      accountNumber: '7621929005',
      content: `LIO ${transferCode}`,
      transactionDate: paidAt.toISOString(),
    };
    await prisma.payment.upsert({
      where: { orderId: order.id },
      update: { status: 'success', amount: COURSE_PRICE, transferCode, rawResponse },
      create: {
        orderId: order.id,
        gateway: 'sepay',
        transferCode,
        gatewayTxnId: `demo-txn-${n}`,
        amount: COURSE_PRICE,
        currency: 'VND',
        status: 'success',
        rawResponse,
        createdAt: paidAt,
      },
    });

    // Enrollment (upsert theo unique studentId+courseId)
    const completed = i % 3 === 0; // ~1/3 hoàn thành
    const progressPercent = completed ? 100 : randInt(0, 95);
    await prisma.enrollment.upsert({
      where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
      update: { status: completed ? 'completed' : 'active', progressPercent },
      create: {
        studentId: student.id,
        courseId: course.id,
        status: completed ? 'completed' : 'active',
        progressPercent,
        enrolledAt: paidAt,
      },
    });

    // Certificate cho học viên đã completed
    if (completed) {
      await prisma.certificate.upsert({
        where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
        update: {},
        create: {
          code: `DEMO-REDIS-${String(n).padStart(3, '0')}`,
          studentId: student.id,
          courseId: course.id,
          issuedAt: paidAt,
        },
      });
      certs++;
    }

    orders++;
    revenue += COURSE_PRICE;
  }

  // 4) Cập nhật thống kê khóa học (đếm lại cho chính xác, idempotent)
  const totalStudents = await prisma.enrollment.count({ where: { courseId: course.id } });
  await prisma.course.update({ where: { id: course.id }, data: { totalStudents } });

  // 5) Tổng kết
  console.log('✅ Seed demo hoàn tất:', {
    hocVien: students.length,
    donHangThanhToan: orders,
    chungChi: certs,
    tongDoanhThu: revenue.toLocaleString('vi-VN') + 'đ',
    giaKhoa: COURSE_PRICE.toLocaleString('vi-VN') + 'đ',
    totalStudents,
    dangNhap: 'demo.student01@elearning.local … / Demo@123',
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
