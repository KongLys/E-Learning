import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderService } from './order.service';
import { PrismaService } from '../prisma/prisma.service';
import { CouponService } from '../coupon/coupon.service';

const mockPrisma = {
  order: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  course: { findMany: jest.fn() },
  enrollment: { findFirst: jest.fn() },
  payment: { update: jest.fn() },
};

const mockCoupon = {
  applyCouponToCourse: jest.fn(),
  redeemByCode: jest.fn(),
};

const mockEmitter = { emit: jest.fn() };

describe('OrderService', () => {
  let service: OrderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CouponService, useValue: mockCoupon },
        { provide: EventEmitter2, useValue: mockEmitter },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
    jest.clearAllMocks();
  });

  describe('createOrder', () => {
    const dto = { courseIds: ['course-1'], idempotencyKey: 'key-1' };

    it('throws ForbiddenException for admin role', async () => {
      await expect(service.createOrder('user-1', 'admin', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when buying own course', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);
      mockPrisma.course.findMany.mockResolvedValue([
        { id: 'course-1', price: 100000, instructorId: 'instructor-1' },
      ]);
      await expect(
        service.createOrder('instructor-1', 'instructor', dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows an instructor to buy another instructor’s course', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);
      mockPrisma.course.findMany.mockResolvedValue([
        {
          id: 'course-1',
          price: 299000,
          title: 'Test Course',
          instructorId: 'instructor-x',
        },
      ]);
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      mockPrisma.order.create.mockResolvedValue({
        id: 'order-i',
        totalAmount: 299000,
        currency: 'VND',
        status: 'pending',
        idempotencyKey: 'key-1',
        paidAt: null,
        createdAt: new Date(),
        items: [
          {
            courseId: 'course-1',
            price: 299000,
            course: { id: 'course-1', title: 'Test Course' },
          },
        ],
        payment: null,
      });

      const result = await service.createOrder(
        'instructor-1',
        'instructor',
        dto,
      );
      expect(result.orderId).toBe('order-i');
    });

    it('returns existing order for duplicate idempotencyKey', async () => {
      const existingOrder = {
        id: 'order-1',
        totalAmount: 100000,
        currency: 'VND',
        status: 'pending',
        idempotencyKey: 'key-1',
        paidAt: null,
        createdAt: new Date(),
        items: [
          {
            courseId: 'course-1',
            price: 100000,
            course: { id: 'course-1', title: 'Test' },
          },
        ],
        payment: null,
      };
      mockPrisma.order.findUnique.mockResolvedValue(existingOrder);

      const result = await service.createOrder('student-1', 'student', dto);
      expect(result.orderId).toBe('order-1');
      expect(mockPrisma.order.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when course not found', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);
      mockPrisma.course.findMany.mockResolvedValue([]);
      await expect(
        service.createOrder('student-1', 'student', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when already enrolled', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);
      mockPrisma.course.findMany.mockResolvedValue([
        { id: 'course-1', price: 100000 },
      ]);
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 'enroll-1' });
      await expect(
        service.createOrder('student-1', 'student', dto),
      ).rejects.toThrow(ConflictException);
    });

    it('throws UnprocessableEntityException for free course order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);
      mockPrisma.course.findMany.mockResolvedValue([
        { id: 'course-1', price: 0 },
      ]);
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      await expect(
        service.createOrder('student-1', 'student', dto),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('creates order for paid course', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);
      mockPrisma.course.findMany.mockResolvedValue([
        { id: 'course-1', price: 299000, title: 'Test Course' },
      ]);
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      mockPrisma.order.create.mockResolvedValue({
        id: 'order-new',
        totalAmount: 299000,
        currency: 'VND',
        status: 'pending',
        idempotencyKey: 'key-1',
        paidAt: null,
        createdAt: new Date(),
        items: [
          {
            courseId: 'course-1',
            price: 299000,
            course: { id: 'course-1', title: 'Test Course' },
          },
        ],
        payment: null,
      });

      const result = await service.createOrder('student-1', 'student', dto);
      expect(result.orderId).toBe('order-new');
      expect(result.totalAmount).toBe(299000);
    });

    it('applies a discount code to a single-course order', async () => {
      const couponDto = { ...dto, discountCode: 'SALE10' };
      mockPrisma.order.findUnique.mockResolvedValue(null);
      mockPrisma.course.findMany.mockResolvedValue([
        { id: 'course-1', price: 300000, title: 'Test', instructorId: 'inst-x' },
      ]);
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      mockCoupon.applyCouponToCourse.mockResolvedValue({
        code: 'SALE10',
        couponId: 'coupon-1',
        discountAmount: 30000,
      });
      mockPrisma.order.create.mockResolvedValue({
        id: 'order-disc',
        totalAmount: 270000,
        discountCode: 'SALE10',
        discountAmount: 30000,
        currency: 'VND',
        status: 'pending',
        idempotencyKey: 'key-1',
        paidAt: null,
        createdAt: new Date(),
        items: [{ courseId: 'course-1', price: 300000, discount: 30000 }],
        payment: null,
      });

      const result = await service.createOrder('student-1', 'student', couponDto);

      expect(mockCoupon.applyCouponToCourse).toHaveBeenCalledWith(
        'SALE10',
        expect.objectContaining({ id: 'course-1' }),
      );
      // Đơn chưa thanh toán → chưa ghi nhận lượt dùng mã.
      expect(mockCoupon.redeemByCode).not.toHaveBeenCalled();
      const createArg = mockPrisma.order.create.mock.calls[0][0].data;
      expect(createArg.totalAmount).toBe(270000);
      expect(createArg.discountAmount).toBe(30000);
      expect(result.totalAmount).toBe(270000);
      expect(result.discountAmount).toBe(30000);
    });

    it('rejects a discount code on multi-course orders', async () => {
      const couponDto = {
        courseIds: ['course-1', 'course-2'],
        idempotencyKey: 'key-1',
        discountCode: 'SALE10',
      };
      mockPrisma.order.findUnique.mockResolvedValue(null);
      mockPrisma.course.findMany.mockResolvedValue([
        { id: 'course-1', price: 100000, instructorId: 'inst-x' },
        { id: 'course-2', price: 200000, instructorId: 'inst-x' },
      ]);
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);

      await expect(
        service.createOrder('student-1', 'student', couponDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('auto-completes and enrolls a 100%-off (zero total) order', async () => {
      const couponDto = { ...dto, discountCode: 'FREE100' };
      mockPrisma.order.findUnique.mockResolvedValue(null);
      mockPrisma.course.findMany.mockResolvedValue([
        { id: 'course-1', price: 300000, title: 'Test', instructorId: 'inst-x' },
      ]);
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      mockCoupon.applyCouponToCourse.mockResolvedValue({
        code: 'FREE100',
        couponId: 'coupon-2',
        discountAmount: 300000,
      });
      mockPrisma.order.create.mockResolvedValue({
        id: 'order-free',
        totalAmount: 0,
        discountCode: 'FREE100',
        discountAmount: 300000,
        currency: 'VND',
        status: 'paid',
        idempotencyKey: 'key-1',
        paidAt: new Date(),
        createdAt: new Date(),
        items: [{ courseId: 'course-1', price: 300000, discount: 300000 }],
        payment: null,
      });

      const result = await service.createOrder('student-1', 'student', couponDto);

      const createArg = mockPrisma.order.create.mock.calls[0][0].data;
      expect(createArg.status).toBe('paid');
      expect(mockCoupon.redeemByCode).toHaveBeenCalledWith('FREE100');
      expect(mockEmitter.emit).toHaveBeenCalledWith(
        'order.paid',
        expect.objectContaining({ userId: 'student-1', courseId: 'course-1' }),
      );
      expect(result.status).toBe('paid');
    });
  });
});
