import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly from: string;

  constructor(private config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST', 'smtp.gmail.com');
    const port = Number(this.config.get('SMTP_PORT', 465));
    const user = this.config.get<string>('SMTP_USER', '');
    const pass = this.config.get<string>('SMTP_PASS', '');
    this.from =
      this.config.get<string>('MAIL_FROM', '') || (user ? `ELearn <${user}>` : '');

    if (!user || !pass) {
      this.logger.warn(
        'SMTP_USER/SMTP_PASS chưa được cấu hình — email OTP sẽ không gửi được.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true cho 465, false cho 587 (STARTTLS)
      auth: { user, pass },
    });
  }

  async sendOtpEmail(to: string, code: string, ttlSeconds: number): Promise<void> {
    if (!this.transporter) {
      throw new Error('Dịch vụ gửi email chưa được cấu hình (SMTP).');
    }

    const minutes = Math.round(ttlSeconds / 60);
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2937">
        <h2 style="margin:0 0 16px">Xác minh email của bạn</h2>
        <p style="margin:0 0 16px">Mã xác minh đăng ký tài khoản ELearn của bạn là:</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;margin:0 0 16px;color:#0ea5e9">${code}</p>
        <p style="margin:0 0 8px">Mã có hiệu lực trong <strong>${minutes} phút</strong>.</p>
        <p style="margin:0;color:#6b7280;font-size:13px">Nếu bạn không yêu cầu đăng ký, hãy bỏ qua email này.</p>
      </div>
    `;

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: `Mã xác minh ELearn: ${code}`,
      text: `Mã xác minh đăng ký của bạn là ${code}. Mã có hiệu lực trong ${minutes} phút.`,
      html,
    });
  }

  /**
   * Nhắc học viên đang trễ tiến độ so với lộ trình đề xuất của khóa học,
   * khuyến khích quay lại học tiếp.
   */
  async sendProgressReminderEmail(
    to: string,
    params: {
      studentName: string;
      courseTitle: string;
      courseUrl: string;
      progressPercent: number;
      expectedPercent: number;
    },
  ): Promise<void> {
    if (!this.transporter) {
      throw new Error('Dịch vụ gửi email chưa được cấu hình (SMTP).');
    }

    const { studentName, courseTitle, courseUrl } = params;
    const progress = Math.round(params.progressPercent);
    const expected = Math.round(params.expectedPercent);

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2937">
        <h2 style="margin:0 0 16px">Tiếp tục hành trình học của bạn nhé!</h2>
        <p style="margin:0 0 12px">Chào ${studentName},</p>
        <p style="margin:0 0 12px">Chúng tôi nhận thấy bạn đang học chậm hơn lộ trình đề xuất của khóa học <strong>${courseTitle}</strong>. Đừng để khoảng cách ngày một xa nhé!</p>
        <p style="margin:0 0 4px">Tiến độ hiện tại của bạn: <strong style="color:#0ea5e9">${progress}%</strong></p>
        <p style="margin:0 0 16px">Mức nên đạt được tới hiện tại: <strong>${expected}%</strong></p>
        <p style="margin:0 0 20px">Chỉ cần dành ra một chút thời gian mỗi ngày là bạn sẽ sớm bắt kịp lộ trình.</p>
        <p style="text-align:center;margin:0 0 20px">
          <a href="${courseUrl}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700">Tiếp tục học ngay</a>
        </p>
        <p style="margin:0;color:#6b7280;font-size:13px">Nếu bạn đã tạm dừng khóa học này có chủ đích, hãy bỏ qua email này.</p>
      </div>
    `;

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: `Nhắc nhở: tiếp tục khóa học "${courseTitle}"`,
      text: `Chào ${studentName}, bạn đang học chậm hơn lộ trình đề xuất của khóa học "${courseTitle}". Tiến độ hiện tại ${progress}% (nên đạt khoảng ${expected}%). Quay lại học tiếp tại: ${courseUrl}`,
      html,
    });
  }
}
