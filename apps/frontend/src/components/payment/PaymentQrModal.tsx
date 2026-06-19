'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { orderApi, type SepayPaymentInfo } from '@/lib/api/course.api';
import { formatVND } from '@/lib/utils';

interface PaymentQrModalProps {
  payment: SepayPaymentInfo;
  /** Khóa học để điều hướng tới trang học sau khi thanh toán thành công. */
  courseId: string;
  onClose: () => void;
  /** Gọi khi đơn hàng chuyển sang trạng thái 'paid'. */
  onPaid: () => void;
}

const EXPIRE_SECONDS = 10 * 60;

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-xs text-emphasis hover:underline shrink-0"
    >
      {copied ? 'Đã chép' : 'Sao chép'}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="flex items-center gap-2 text-sm font-medium text-ink">
        <span className="truncate">{value}</span>
        <CopyButton value={value} />
      </span>
    </div>
  );
}

export function PaymentQrModal({ payment, courseId, onClose, onPaid }: PaymentQrModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(EXPIRE_SECONDS);
  const expired = secondsLeft <= 0;

  // Poll trạng thái đơn hàng tới khi 'paid' (hoặc hết hạn).
  const { data } = useQuery({
    queryKey: ['order-status', payment.orderId],
    queryFn: () => orderApi.getOrder(payment.orderId),
    refetchInterval: expired ? false : 3000,
    enabled: !expired,
  });

  const status: string | undefined = data?.data?.status;
  const isPaid = status === 'paid';

  // Dùng ref để cleanup effect có thể đọc giá trị mới nhất khi unmount.
  const paidRef = useRef(false);
  useEffect(() => {
    if (isPaid) paidRef.current = true;
  }, [isPaid]);

  // Huỷ đơn hàng khi user đóng modal mà chưa thanh toán xong.
  useEffect(() => {
    return () => {
      if (!paidRef.current) {
        orderApi.cancelOrder(payment.orderId).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isPaid) onPaid();
  }, [isPaid, onPaid]);

  useEffect(() => {
    if (expired) return;
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [expired]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md my-8 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold">Quét mã QR để thanh toán</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 leading-none" aria-label="Đóng">
            <X size={20} />
          </button>
        </div>

        {isPaid ? (
          <div className="px-6 py-10 text-center">
            <CheckCircle2 size={48} className="mx-auto mb-3 text-semantic-success" />
            <p className="text-lg font-bold text-semantic-success mb-1">Thanh toán thành công!</p>
            <p className="text-sm text-gray-500">Đang chuyển tới trang học...</p>
          </div>
        ) : expired ? (
          <div className="px-6 py-10 text-center">
            <div className="text-5xl mb-3">⌛</div>
            <p className="text-lg font-bold text-red-600 mb-1">Mã QR đã hết hạn</p>
            <p className="text-sm text-gray-500 mb-5">Vui lòng đóng và thử lại.</p>
            <button onClick={onClose} className="text-sm border px-4 py-2 rounded-lg hover:bg-gray-50">
              Đóng
            </button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            <div className="flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={payment.qrUrl}
                alt="Mã QR thanh toán SePay"
                className="w-56 h-56 object-contain border rounded-xl"
              />
              <p className="mt-2 text-2xl font-bold text-ink">{formatVND(payment.amount)}</p>
              <p className="text-xs text-gray-400">Mã QR hết hạn sau {mm}:{ss}</p>
            </div>

            <div className="rounded-xl border border-hairline bg-canvas px-4 py-3">
              <p className="text-xs text-gray-500 mb-1">Hoặc chuyển khoản thủ công:</p>
              {payment.accountName && <InfoRow label="Chủ tài khoản" value={payment.accountName} />}
              <InfoRow label="Số tài khoản" value={payment.accountNumber} />
              <InfoRow label="Ngân hàng" value={payment.bankCode} />
              <InfoRow label="Số tiền" value={String(Math.round(payment.amount))} />
              <InfoRow label="Nội dung CK" value={payment.transferCode} />
            </div>

            <p className="text-center text-xs text-gray-400">
              Nhập đúng <span className="font-semibold text-gray-600">nội dung chuyển khoản</span> để hệ thống tự
              động xác nhận. Đơn hàng sẽ được kích hoạt ngay sau khi nhận tiền.
            </p>

            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              Đang chờ thanh toán...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
