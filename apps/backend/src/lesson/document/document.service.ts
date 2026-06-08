import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { readFile, unlink } from 'fs/promises';
import type { Express } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { LessonService } from '../lesson.service';
import { sanitizeRichText } from '../../common/sanitize-html.util';

const MAX_PDF_SIZE = 100 * 1024 * 1024;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ALLOWED_DOC = ['application/pdf', DOCX_MIME];
const DOCUMENT_URL_TTL = 60 * 60;

@Injectable()
export class DocumentService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private lessonService: LessonService,
  ) {}

  async uploadDocument(lessonId: string, userId: string, userRole: string, file: Express.Multer.File) {
    if (!ALLOWED_DOC.includes(file.mimetype)) {
      throw new BadRequestException('Only PDF and DOCX files are allowed');
    }
    if (file.size > MAX_PDF_SIZE) {
      throw new BadRequestException('File must not exceed 100MB');
    }

    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    if (lesson.type !== 'document') throw new BadRequestException('Lesson is not a document type');

    const section = await this.prisma.section.findUnique({ where: { id: lesson.sectionId }, include: { course: true } });
    if (userRole !== 'admin' && section?.course.instructorId !== userId) throw new ForbiddenException('Access denied');

    const isPdf = file.mimetype === 'application/pdf';
    const fileType = isPdf ? 'pdf' : 'docx';

    let pageCount = 0;
    if (isPdf) {
      try {
        const pdfParse = await import('pdf-parse') as unknown as (buf: Buffer) => Promise<{ numpages: number }>;
        const buf = await readFile(file.path);
        const parsed = await pdfParse(buf);
        pageCount = parsed.numpages;
      } catch {
        pageCount = 0;
      }
    }

    const key = `docs/${lessonId}/${randomUUID()}.${fileType}`;
    const existing = await this.prisma.documentAsset.findUnique({ where: { lessonId } });
    if (existing?.fileUrl) await this.storage.deleteFile(this.storage.extractKeyFromUrl(existing.fileUrl));

    let url: string;
    try {
      url = await this.storage.uploadFile(key, createReadStream(file.path), file.mimetype);
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
    const asset = await this.prisma.documentAsset.upsert({
      where: { lessonId },
      update: { fileUrl: url, fileType, pageCount, fileSize: BigInt(file.size) },
      create: { lessonId, fileUrl: url, fileType, pageCount, fileSize: BigInt(file.size) },
    });

    return { ...asset, fileSize: asset.fileSize.toString() };
  }

  async configDocument(
    lessonId: string,
    userId: string,
    userRole: string,
    dto: { contentHtml?: string; minReadTimeSec?: number },
  ) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    if (lesson.type !== 'document') throw new BadRequestException('Lesson is not a document type');

    const section = await this.prisma.section.findUnique({ where: { id: lesson.sectionId }, include: { course: true } });
    if (userRole !== 'admin' && section?.course.instructorId !== userId) throw new ForbiddenException('Access denied');

    const data: { contentHtml?: string; minReadTimeSec?: number } = {};
    if (dto.contentHtml !== undefined) data.contentHtml = sanitizeRichText(dto.contentHtml);
    if (dto.minReadTimeSec !== undefined) data.minReadTimeSec = dto.minReadTimeSec;

    const asset = await this.prisma.documentAsset.upsert({
      where: { lessonId },
      update: data,
      create: { lessonId, ...data },
    });
    // Nội dung đọc đổi → vector hóa lại nội dung chương
    if (dto.contentHtml !== undefined) await this.lessonService.enqueueLessonIndex(lessonId);
    return { ...asset, fileSize: asset.fileSize.toString() };
  }

  async getSignedDocumentUrl(lessonId: string, userId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { documentAsset: true, section: { include: { course: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    if (!lesson.isPreview) {
      const enrolled = await this.lessonService.isEnrolled(userId, lesson.section.courseId);
      const isInstructor = lesson.section.course.instructorId === userId;
      if (!enrolled && !isInstructor) throw new ForbiddenException('Not enrolled in this course');
    }

    if (!lesson.documentAsset?.fileUrl) throw new NotFoundException('Document not uploaded yet');
    if (lesson.isPreview) return { url: lesson.documentAsset.fileUrl };

    const key = this.storage.extractKeyFromUrl(lesson.documentAsset.fileUrl);
    const signedUrl = await this.storage.getSignedUrl(key, DOCUMENT_URL_TTL);
    return { url: signedUrl };
  }
}
