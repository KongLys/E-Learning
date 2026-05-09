import Link from 'next/link';

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

const COL_LINK = 'text-sm text-muted hover:text-ink transition-colors';

export function Footer() {
  return (
    <footer className="bg-canvas-soft border-t border-hairline">
      <div className="max-w-300 mx-auto px-6 py-14">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-4">
          {/* Brand */}
          <div>
            <span className="font-display text-xl text-ink">ELearn</span>
            <p className="mt-3 text-sm text-muted leading-relaxed">
              Nâng tầm kiến thức Việt thông qua nền tảng học tập tinh gọn, thẩm mỹ và hiệu quả.
            </p>
            <div className="flex items-center gap-4 mt-5 text-muted-soft">
              <button className="hover:text-muted transition-colors"><GlobeIcon /></button>
              <button className="hover:text-muted transition-colors"><MailIcon /></button>
              <button className="hover:text-muted transition-colors"><ShareIcon /></button>
            </div>
          </div>

          {/* Về chúng tôi */}
          <div>
            <p className="text-sm font-semibold text-ink mb-4">Về chúng tôi</p>
            <ul className="space-y-3">
              <li><Link href="#" className={COL_LINK}>Giới thiệu</Link></li>
              <li><Link href="#" className={COL_LINK}>Đội ngũ</Link></li>
              <li><Link href="#" className={COL_LINK}>Tuyển dụng</Link></li>
            </ul>
          </div>

          {/* Hỗ trợ */}
          <div>
            <p className="text-sm font-semibold text-ink mb-4">Hỗ trợ</p>
            <ul className="space-y-3">
              <li><Link href="#" className={COL_LINK}>Trợ giúp</Link></li>
              <li><Link href="#" className={COL_LINK}>Điều khoản</Link></li>
              <li><Link href="#" className={COL_LINK}>Bảo mật</Link></li>
            </ul>
          </div>

          {/* Liên hệ */}
          <div>
            <p className="text-sm font-semibold text-ink mb-4">Liên hệ</p>
            <ul className="space-y-3">
              <li><Link href="mailto:hello@elearn.vn" className={COL_LINK}>Email</Link></li>
              <li><Link href="#" className={COL_LINK}>Văn phòng</Link></li>
              <li><Link href="#" className="text-sm text-blue-500 hover:text-blue-600 transition-colors">Facebook</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-hairline text-center">
          <p className="text-xs text-muted-soft">
            &copy; {new Date().getFullYear()} ELearn. Thiết kế bởi Minimalist Editorial.
          </p>
        </div>
      </div>
    </footer>
  );
}
