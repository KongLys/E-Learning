import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { unlink } from 'fs/promises';
import type { Express } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateReferenceMaterialDto } from './dto/create-reference-material.dto';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ALLOWED_FILE = ['application/pdf', DOCX_MIME];
const ALLOWED_VIDEO = ['video/mp4', 'video/webm'];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_VIDEO_SIZE = 1024 * 1024 * 1024; // 1GB
const URL_TTL = 60 * 60; // 1h

const YOUTUBE_RE =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)[\w-]{6,}/i;

type Owned = { fileUrl: string | null; fileSize: bigint | null };

type LessonFile = {
  lessonId: string;
  lessonTitle: string;
  lessonOrderIndex: number;
  fileName: string | null;
  fileType: string;
  pageCount: number;
  fileSize: string | null;
};

@Injectable()
export class ReferenceMaterialService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async create(
    courseId: string,
    userId: string,
    userRole: string,
    dto: CreateReferenceMaterialDto,
    file?: Express.Multer.File,
  ) {
    await this.assertOwner(courseId, userId, userRole);

    let fileUrl: string | null = null;
    let fileName: string | null = null;
    let fileType: string | null = null;
    let fileSize: bigint | null = null;
    let externalUrl: string | null = null;

    try {
      if (dto.type === 'youtube') {
        if (!dto.externalUrl || !YOUTUBE_RE.test(dto.externalUrl.trim())) {
          throw new BadRequestException('Link YouTube không hợp lệ');
        }
        externalUrl = dto.externalUrl.trim();
      } else {
        if (!file) throw new BadRequestException('Thiếu tệp tải lên');
        const isVideo = dto.type === 'video';
        const allowed = isVideo ? ALLOWED_VIDEO : ALLOWED_FILE;
        if (!allowed.includes(file.mimetype)) {
          throw new BadRequestException(
            isVideo
              ? 'Chỉ chấp nhận video MP4/WebM'
              : 'Chỉ chấp nhận tệp PDF/DOCX',
          );
        }
        if (file.size > (isVideo ? MAX_VIDEO_SIZE : MAX_FILE_SIZE)) {
          throw new BadRequestException(
            isVideo ? 'Video không vượt quá 1GB' : 'Tệp không vượt quá 100MB',
          );
        }
        fileType = isVideo
          ? file.mimetype === 'video/webm'
            ? 'webm'
            : 'mp4'
          : file.mimetype === 'application/pdf'
            ? 'pdf'
            : 'docx';
        const key = `references/${courseId}/${randomUUID()}.${fileType}`;
        fileUrl = await this.storage.uploadFile(
          key,
          createReadStream(file.path),
          file.mimetype,
        );
        fileName = file.originalname;
        fileSize = BigInt(file.size);
      }
    } finally {
      if (file?.path) await unlink(file.path).catch(() => undefined);
    }

    const last = await this.prisma.referenceMaterial.findFirst({
      where: { courseId },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });

    const material = await this.prisma.referenceMaterial.create({
      data: {
        courseId,
        title: dto.title,
        description: dto.description ?? null,
        type: dto.type,
        fileUrl,
        fileName,
        fileType,
        fileSize,
        externalUrl,
        orderIndex: (last?.orderIndex ?? -1) + 1,
      },
    });
    return this.serialize(material);
  }

  async list(courseId: string, userId: string, userRole: string) {
    await this.assertAccess(courseId, userId, userRole);
    const materials = await this.prisma.referenceMaterial.findMany({
      where: { courseId },
      orderBy: { orderIndex: 'asc' },
    });
    return materials.map((m) => this.serialize(m));
  }

  /** URL để xem: youtube → externalUrl; video/file → signed URL R2. */
  async getUrl(id: string, userId: string, userRole: string) {
    const material = await this.prisma.referenceMaterial.findUnique({
      where: { id },
    });
    if (!material) throw new NotFoundException('Reference material not found');
    await this.assertAccess(material.courseId, userId, userRole);

    if (material.type === 'youtube') return { url: material.externalUrl };
    if (!material.fileUrl) throw new NotFoundException('File not available');
    const key = this.storage.extractKeyFromUrl(material.fileUrl);
    const url = await this.storage.getSignedUrl(key, URL_TTL);
    return { url };
  }

  async remove(id: string, userId: string, userRole: string) {
    const material = await this.prisma.referenceMaterial.findUnique({
      where: { id },
    });
    if (!material) throw new NotFoundException('Reference material not found');
    await this.assertOwner(material.courseId, userId, userRole);

    if (material.fileUrl) {
      await this.storage.deleteFile(
        this.storage.extractKeyFromUrl(material.fileUrl),
      );
    }
    await this.prisma.referenceMaterial.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  /** Gom các file PDF/DOCX đính kèm trong các bài, nhóm theo Phần → Bài. */
  async lessonFiles(courseId: string, userId: string, userRole: string) {
    await this.assertAccess(courseId, userId, userRole);
    const docs = await this.prisma.documentAsset.findMany({
      where: { fileUrl: { not: null }, lesson: { section: { courseId } } },
      select: {
        fileName: true,
        fileType: true,
        pageCount: true,
        fileSize: true,
        lesson: {
          select: {
            id: true,
            title: true,
            orderIndex: true,
            section: { select: { id: true, title: true, orderIndex: true } },
          },
        },
      },
    });

    // Nhóm theo Phần, giữ thứ tự Phần → Bài.
    const sectionsMap = new Map<
      string,
      { id: string; title: string; orderIndex: number; files: LessonFile[] }
    >();
    for (const d of docs) {
      const s = d.lesson.section;
      if (!sectionsMap.has(s.id)) {
        sectionsMap.set(s.id, {
          id: s.id,
          title: s.title,
          orderIndex: s.orderIndex,
          files: [],
        });
      }
      sectionsMap.get(s.id)!.files.push({
        lessonId: d.lesson.id,
        lessonTitle: d.lesson.title,
        lessonOrderIndex: d.lesson.orderIndex,
        fileName: d.fileName,
        fileType: d.fileType,
        pageCount: d.pageCount,
        fileSize: d.fileSize ? d.fileSize.toString() : null,
      });
    }

    return [...sectionsMap.values()]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((s) => ({
        ...s,
        files: s.files.sort((a, b) => a.lessonOrderIndex - b.lessonOrderIndex),
      }));
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private serialize<T extends Owned>(m: T) {
    return { ...m, fileSize: m.fileSize ? m.fileSize.toString() : null };
  }

  private async assertOwner(
    courseId: string,
    userId: string,
    userRole: string,
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { instructorId: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (userRole !== 'admin' && course.instructorId !== userId) {
      throw new ForbiddenException('Access denied');
    }
  }

  private async assertAccess(
    courseId: string,
    userId: string,
    userRole: string,
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { instructorId: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (userRole === 'admin' || course.instructorId === userId) return;
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId: userId, courseId, status: 'active' },
    });
    if (!enrollment)
      throw new ForbiddenException('Not enrolled in this course');
  }
}
