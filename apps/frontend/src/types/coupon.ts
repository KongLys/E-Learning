// Kiểu dùng chung cho mã giảm giá (coupon) ở trang khuyến mãi / công cụ coupon.

export interface Coupon {
  id: string;
  code: string;
  discountPct: number;
  maxUses: number;
  usedCount: number;
  courseId?: string | null;
  course?: { id?: string; title?: string } | null;
  expiresAt?: string | null;
  createdAt?: string;
}
