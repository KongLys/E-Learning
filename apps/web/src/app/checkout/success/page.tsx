'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

function SuccessContent() {
  const params = useSearchParams();
  const responseCode = params.get('vnp_ResponseCode');
  const isSuccess = responseCode === '00' || !responseCode;

  if (!isSuccess) {
    return (
      <div className="text-center">
        <div className="text-5xl mb-4">❌</div>
        <h1 className="text-2xl font-bold text-red-600 mb-2">Thanh toán thất bại</h1>
        <p className="text-gray-500 mb-6">Mã lỗi: {responseCode}</p>
        <div className="flex gap-3 justify-center">
          <Link href="/courses" className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Về trang khóa học</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="text-5xl mb-4">🎉</div>
      <h1 className="text-2xl font-bold text-green-600 mb-2">Thanh toán thành công!</h1>
      <p className="text-gray-500 mb-6">Bạn đã đăng ký khóa học thành công. Bắt đầu học ngay!</p>
      <Link
        href="/my-courses"
        className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700"
      >
        Xem khóa học của tôi
      </Link>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <Suspense fallback={<div>Đang tải...</div>}>
        <SuccessContent />
      </Suspense>
    </div>
  );
}
