import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { LessonService } from '../lesson.service';
import { Client } from 'minio';
import { ConfigService } from '@nestjs/config';

const ALLOWED_VIDEO = ['video/mp4', 'video/webm'];
const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024;

@Injectable()
export class VideoService {
  private minioClient: Client;

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private lessonService: LessonService,
    private config: ConfigService,
  ) {
    this.minioClient = new Client({
      endPoint: this.config.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: this.config.get<number>('MINIO_PORT', 9000),
      useSSL: this.config.get<boolean>('MINIO_USE_SSL', false),
      accessKey: this.config.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.config.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
    });
  }

  async uploadVideo(lessonId: string, userId: string, userRole: string, file: Express.Multer.File) {
    if (!ALLOWED_VIDEO.includes(file.mimetype)) {
      throw new BadRequestException('Only MP4 and WebM videos are allowed');
    }
    if (file.size > MAX_VIDEO_SIZE) {
      throw new BadRequestException('Video must not exceed 2GB');
    }

    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    if (lesson.type !== 'video') throw new BadRequestException('Lesson is not a video type');

    const section = await this.prisma.section.findUnique({ where: { id: lesson.sectionId }, include: { course: true } });
    if (userRole !== 'admin' && section?.course.instructorId !== userId) throw new ForbiddenException('Access denied');

    const ext = file.mimetype === 'video/mp4' ? 'mp4' : 'webm';
    const key = `videos/${lessonId}/${randomUUID()}.${ext}`;

    const existing = await this.prisma.videoAsset.findUnique({ where: { lessonId } });
    if (existing?.videoUrl) await this.storage.deleteFile(this.storage.extractKeyFromUrl(existing.videoUrl));

    const url = await this.storage.uploadFile(key, file.buffer, file.mimetype);

    const asset = await this.prisma.videoAsset.upsert({
      where: { lessonId },
      update: { videoUrl: url, hlsUrl: url, processingStatus: 'ready' },
      create: { lessonId, videoUrl: url, hlsUrl: url, processingStatus: 'ready' },
    });

    await this.prisma.lesson.update({ where: { id: lessonId }, data: { durationSec: asset.durationSec } });
    await this.lessonService.updateCourseStats(lesson.sectionId);

    return asset;
  }

  async getSignedVideoUrl(lessonId: string, userId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { videoAsset: true, section: { include: { course: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    if (!lesson.isPreview) {
      const enrolled = await this.lessonService.isEnrolled(userId, lesson.section.courseId);
      const isInstructor = lesson.section.course.instructorId === userId;
      if (!enrolled && !isInstructor) throw new ForbiddenException('Not enrolled in this course');
    }

    if (!lesson.videoAsset?.videoUrl) throw new NotFoundException('Video not uploaded yet');
    if (lesson.isPreview) return { url: lesson.videoAsset.videoUrl };

    const key = this.storage.extractKeyFromUrl(lesson.videoAsset.videoUrl);
    const bucket = this.config.get<string>('MINIO_BUCKET', 'elearning');
    const signedUrl = await this.minioClient.presignedGetObject(bucket, key, 15 * 60);
    return { url: signedUrl };
  }
}
