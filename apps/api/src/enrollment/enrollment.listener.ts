import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EnrollmentService } from './enrollment.service';

export class OrderPaidEvent {
  constructor(
    public readonly userId: string,
    public readonly courseId: string,
  ) {}
}

@Injectable()
export class EnrollmentListener {
  constructor(private enrollmentService: EnrollmentService) {}

  @OnEvent('order.paid')
  async handleOrderPaid(event: OrderPaidEvent) {
    await this.enrollmentService.enrollAfterPayment(event.userId, event.courseId);
  }
}
