import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderService } from './order.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  order: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn() },
  course: { findMany: jest.fn() },
  enrollment: { findFirst: jest.fn() },
  payment: { update: jest.fn() },
};

describe('OrderService', () => {
  let service: OrderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
    jest.clearAllMocks();
  });

  describe('createOrder', () => {
    const dto = { courseIds: ['course-1'], idempotencyKey: 'key-1' };

    it('throws ForbiddenException for non-student role', async () => {
      await expect(service.createOrder('user-1', 'instructor', dto))
        .rejects.toThrow(ForbiddenException);
    });

    it('returns existing order for duplicate idempotencyKey', async () => {
      const existingOrder = {
        id: 'order-1', totalAmount: 100000, currency: 'VND', status: 'pending',
        idempotencyKey: 'key-1', paidAt: null, createdAt: new Date(),
        items: [{ courseId: 'course-1', price: 100000, course: { id: 'course-1', title: 'Test' } }],
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
      await expect(service.createOrder('student-1', 'student', dto))
        .rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when already enrolled', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);
      mockPrisma.course.findMany.mockResolvedValue([{ id: 'course-1', price: 100000 }]);
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 'enroll-1' });
      await expect(service.createOrder('student-1', 'student', dto))
        .rejects.toThrow(ConflictException);
    });

    it('throws UnprocessableEntityException for free course order', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);
      mockPrisma.course.findMany.mockResolvedValue([{ id: 'course-1', price: 0 }]);
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      await expect(service.createOrder('student-1', 'student', dto))
        .rejects.toThrow(UnprocessableEntityException);
    });

    it('creates order for paid course', async () => {
      mockPrisma.order.findUnique.mockResolvedValue(null);
      mockPrisma.course.findMany.mockResolvedValue([{ id: 'course-1', price: 299000, title: 'Test Course' }]);
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      mockPrisma.order.create.mockResolvedValue({
        id: 'order-new', totalAmount: 299000, currency: 'VND', status: 'pending',
        idempotencyKey: 'key-1', paidAt: null, createdAt: new Date(),
        items: [{ courseId: 'course-1', price: 299000, course: { id: 'course-1', title: 'Test Course' } }],
        payment: null,
      });

      const result = await service.createOrder('student-1', 'student', dto);
      expect(result.orderId).toBe('order-new');
      expect(result.totalAmount).toBe(299000);
    });
  });
});
