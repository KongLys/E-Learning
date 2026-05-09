import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-hairline bg-canvas">
      <div className="max-w-300 mx-auto px-6 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <span className="font-display text-lg text-ink">ELearn</span>
            <p className="mt-3 text-sm text-muted leading-relaxed">
              Nền tảng học trực tuyến với hàng trăm khóa học chất lượng cao từ các chuyên gia hàng đầu.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-soft mb-4">
              Khám phá
            </p>
            <ul className="space-y-2.5">
              <li>
                <Link href="/courses" className="text-sm text-muted hover:text-ink transition-colors">
                  Tất cả khóa học
                </Link>
              </li>
              <li>
                <Link href="/courses?price=free" className="text-sm text-muted hover:text-ink transition-colors">
                  Học miễn phí
                </Link>
              </li>
              <li>
                <Link href="/courses?sort=popular" className="text-sm text-muted hover:text-ink transition-colors">
                  Phổ biến nhất
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-soft mb-4">
              Tài khoản
            </p>
            <ul className="space-y-2.5">
              <li>
                <Link href="/login" className="text-sm text-muted hover:text-ink transition-colors">
                  Đăng nhập
                </Link>
              </li>
              <li>
                <Link href="/register" className="text-sm text-muted hover:text-ink transition-colors">
                  Đăng ký
                </Link>
              </li>
              <li>
                <Link href="/my-courses" className="text-sm text-muted hover:text-ink transition-colors">
                  Khóa học của tôi
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-soft mb-4">
              Giảng viên
            </p>
            <ul className="space-y-2.5">
              <li>
                <Link href="/instructor/dashboard" className="text-sm text-muted hover:text-ink transition-colors">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/instructor/courses/new" className="text-sm text-muted hover:text-ink transition-colors">
                  Tạo khóa học
                </Link>
              </li>
              <li>
                <Link href="/instructor/questions" className="text-sm text-muted hover:text-ink transition-colors">
                  Câu hỏi học viên
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-hairline">
          <p className="text-xs text-muted-soft">
            &copy; {new Date().getFullYear()} ELearn. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
