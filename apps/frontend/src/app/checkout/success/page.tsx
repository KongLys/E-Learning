import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

export default function CheckoutSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center">
        <CheckCircle2 size={56} className="mx-auto mb-4 text-green-600" />
        <h1 className="text-2xl font-bold text-green-600 mb-2">Thanh toán thành công!</h1>
        <p className="text-gray-500 mb-6">Bạn đã đăng ký khóa học thành công. Bắt đầu học ngay!</p>
        <Link
          href="/my-courses"
          className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700"
        >
          Xem khóa học của tôi
        </Link>
      </div>
    </div>
  );
}
