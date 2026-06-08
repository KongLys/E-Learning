import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { OnEvent } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import type { Express } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import {
  MATERIAL_QUEUE,
  ProcessMaterialJob,
} from '../../ai/processors/material.processor';

const MAX_MATERIAL_SIZE = 100 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, 'pdf' | 'docx'> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

@Injectable()
export class MaterialService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    @InjectQueue(MATERIAL_QUEUE) private queue: Queue<ProcessMaterialJob>,
  ) {}

  async uploadMaterial(
    courseId: string,
    userId: string,
    userRole: string,
    file: Express.Multer.File,
  ) {
    await this.assertCourseOwner(courseId, userId, userRole);

    const fileType = ALLOWED_TYPES[file.mimetype];
    if (!fileType) {
      throw new BadRequestException('Only PDF or DOCX files are allowed');
    }
    if (file.size > MAX_MATERIAL_SIZE) {
      throw new BadRequestException('File must not exceed 100MB');
    }

    const ext = fileType === 'pdf' ? 'pdf' : 'docx';
    const key = `materials/${courseId}/${randomUUID()}.${ext}`;
    const url = await this.storage.uploadFile(key, file.buffer, file.mimetype);

    const material = await this.prisma.courseMaterial.create({
      data: {
        courseId,
        fileName: file.originalname,
        fileUrl: url,
        fileType,
        fileSize: BigInt(file.size),
        status: 'uploaded',
      },
    });

    await this.enqueue(material.id);
    return this.serialize(material);
  }

  async listMaterials(courseId: string, userId: string, userRole: string) {
    await this.assertCourseOwner(courseId, userId, userRole);
    const items = await this.prisma.courseMaterial.findMany({
      where: { courseId },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((m) => this.serialize(m));
  }

  async deleteMaterial(courseId: string, materialId: string, userId: string, userRole: string) {
    await this.assertCourseOwner(courseId, userId, userRole);
    const material = await this.prisma.courseMaterial.findFirst({
      where: { id: materialId, courseId },
    });
    if (!material) throw new NotFoundException('Material not found');

    await Promise.all([
      this.storage.deleteFile(this.storage.extractKeyFromUrl(material.fileUrl)),
      material.markdownUrl
        ? this.storage.deleteFile(this.storage.extractKeyFromUrl(material.markdownUrl))
        : Promise.resolve(),
    ]);
    await this.prisma.courseMaterial.delete({ where: { id: materialId } });
    return { id: materialId, deleted: true };
  }

  async retryMaterial(courseId: string, materialId: string, userId: string, userRole: string) {
    await this.assertCourseOwner(courseId, userId, userRole);
    const material = await this.prisma.courseMaterial.findFirst({
      where: { id: materialId, courseId },
    });
    if (!material) throw new NotFoundException('Material not found');
    if (material.status !== 'failed') {
      throw new BadRequestException('Only failed materials can be retried');
    }
    await this.prisma.courseMaterial.update({
      where: { id: materialId },
      data: { status: 'uploaded', errorMsg: null, chunkCount: 0 },
    });
    await this.enqueue(materialId);
    return { id: materialId, status: 'uploaded' };
  }

  /**
   * Re-run the processing pipeline after an admin approves a previously
   * rejected/pending material. The material's moderationStatus is already
   * 'approved', so the processor skips classification and indexes directly.
   */
  @OnEvent('moderation.material.reindex')
  async onReindex(payload: { materialId: string }) {
    await this.prisma.courseMaterial.update({
      where: { id: payload.materialId },
      data: { status: 'uploaded', errorMsg: null, chunkCount: 0 },
    });
    await this.enqueue(payload.materialId);
  }

  private async enqueue(materialId: string) {
    await this.queue.add(
      'process',
      { materialId },
      {
        jobId: `material-${materialId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      },
    );
  }

  private async assertCourseOwner(courseId: string, userId: string, userRole: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { instructorId: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (userRole !== 'admin' && course.instructorId !== userId) {
      throw new ForbiddenException('Access denied');
    }
  }

  private serialize(m: {
    id: string;
    courseId: string;
    fileName: string;
    fileUrl: string;
    markdownUrl: string | null;
    fileType: string;
    fileSize: bigint;
    status: string;
    errorMsg: string | null;
    chunkCount: number;
    createdAt: Date;
    updatedAt: Date;
    moderationStatus: string;
    moderationLabel: string | null;
    moderationScore: number | null;
    moderationReason: string | null;
    appealReason: string | null;
    moderatedAt: Date | null;
  }) {
    return {
      id: m.id,
      courseId: m.courseId,
      fileName: m.fileName,
      fileUrl: m.fileUrl,
      markdownUrl: m.markdownUrl,
      fileType: m.fileType,
      fileSize: m.fileSize.toString(),
      status: m.status,
      errorMsg: m.errorMsg,
      chunkCount: m.chunkCount,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      moderationStatus: m.moderationStatus,
      moderationLabel: m.moderationLabel,
      moderationScore: m.moderationScore,
      moderationReason: m.moderationReason,
      appealReason: m.appealReason,
      moderatedAt: m.moderatedAt,
    };
  }
}
