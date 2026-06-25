'use client';

import {
  Document,
  Page,
  View,
  Text,
  Font,
  StyleSheet,
} from '@react-pdf/renderer';
import type { CertificateView } from '@/lib/api/certificate.api';

// Font tiếng Việt (Be Vietnam Pro, OFL) — phục vụ từ /public/fonts.
Font.register({
  family: 'BeVietnamPro',
  fonts: [
    { src: '/fonts/BeVietnamPro-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/BeVietnamPro-SemiBold.ttf', fontWeight: 600 },
    { src: '/fonts/BeVietnamPro-Bold.ttf', fontWeight: 700 },
  ],
});
// Không tự ngắt từ giữa chừng cho tiếng Việt.
Font.registerHyphenationCallback((word) => [word]);

const NAVY = '#1e293b';
const GOLD = '#b8860b';
const MUTED = '#64748b';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'BeVietnamPro',
    backgroundColor: '#ffffff',
    padding: 24,
  },
  border: {
    flex: 1,
    borderWidth: 2,
    borderColor: GOLD,
    borderStyle: 'solid',
    padding: 4,
  },
  innerBorder: {
    flex: 1,
    borderWidth: 1,
    borderColor: GOLD,
    borderStyle: 'solid',
    paddingVertical: 36,
    paddingHorizontal: 48,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { fontSize: 12, letterSpacing: 2, color: MUTED, fontWeight: 600 },
  title: {
    fontSize: 32,
    fontWeight: 700,
    color: NAVY,
    letterSpacing: 4,
    marginTop: 8,
  },
  rule: {
    width: 80,
    height: 3,
    backgroundColor: GOLD,
    marginVertical: 14,
  },
  subtitle: { fontSize: 12, color: MUTED },
  name: {
    fontSize: 28,
    fontWeight: 700,
    color: GOLD,
    marginVertical: 10,
    textAlign: 'center',
  },
  courseLabel: { fontSize: 12, color: MUTED, marginTop: 6 },
  courseTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: NAVY,
    textAlign: 'center',
    marginTop: 4,
  },
  disclaimer: {
    fontSize: 9.5,
    color: MUTED,
    textAlign: 'center',
    marginTop: 16,
    maxWidth: 460,
    lineHeight: 1.4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 24,
  },
  footerCol: { alignItems: 'center', width: 200 },
  footerValue: { fontSize: 12, fontWeight: 600, color: NAVY },
  footerLabel: { fontSize: 9, color: MUTED, marginTop: 3 },
  signLine: {
    width: 150,
    borderBottomWidth: 1,
    borderBottomColor: MUTED,
    borderBottomStyle: 'solid',
    marginBottom: 4,
    height: 18,
  },
  verifyRow: { alignItems: 'center', marginTop: 18 },
  verifyText: { fontSize: 8.5, color: MUTED },
  code: { fontSize: 10, fontWeight: 600, color: NAVY, marginTop: 2 },
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export interface CertificateDocumentProps {
  data: CertificateView;
  /** Gốc URL để dựng liên kết xác minh (vd https://app.com). */
  origin?: string;
  platformName?: string;
}

export function CertificateDocument({
  data,
  origin = '',
  platformName = 'E-LEARNING',
}: CertificateDocumentProps) {
  const verifyUrl = `${origin}/verify/${data.code}`;
  return (
    <Document
      title={`Chứng chỉ - ${data.courseTitle}`}
      author={platformName}
      subject={`Chứng chỉ hoàn thành khóa học của ${data.studentFullName}`}
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.border}>
          <View style={styles.innerBorder}>
            {/* Đầu trang */}
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.brand}>{platformName}</Text>
              <Text style={styles.title}>CHỨNG CHỈ HOÀN THÀNH</Text>
              <View style={styles.rule} />
              <Text style={styles.subtitle}>Chứng nhận rằng học viên</Text>
              <Text style={styles.name}>{data.studentFullName}</Text>
              <Text style={styles.courseLabel}>đã hoàn thành khóa học</Text>
              <Text style={styles.courseTitle}>{data.courseTitle}</Text>
            </View>

            {/* Tuyên bố giá trị */}
            <Text style={styles.disclaimer}>
              Chứng chỉ này chỉ mang tính minh chứng kỹ năng, không có giá trị
              học thuật.
            </Text>

            {/* Chân trang: ngày & giảng viên */}
            <View style={{ width: '100%', alignItems: 'center' }}>
              <View style={styles.footerRow}>
                <View style={styles.footerCol}>
                  <Text style={styles.footerValue}>
                    {formatDate(data.issuedAt)}
                  </Text>
                  <Text style={styles.footerLabel}>Ngày cấp</Text>
                </View>
                <View style={styles.footerCol}>
                  <View style={styles.signLine} />
                  <Text style={styles.footerValue}>
                    {data.instructorName || '—'}
                  </Text>
                  <Text style={styles.footerLabel}>Giảng viên</Text>
                </View>
              </View>

              <View style={styles.verifyRow}>
                <Text style={styles.verifyText}>
                  Xác minh tại: {verifyUrl}
                </Text>
                <Text style={styles.code}>Mã: {data.code}</Text>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
