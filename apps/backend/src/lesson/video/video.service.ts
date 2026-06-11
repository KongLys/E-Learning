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
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { LessonService } from '../lesson.service';

const ALLOWED_VIDEO = ['video/mp4', 'video/webm'];
const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024;
// Presigned video URL TTL — long enough that a lengthy lecture won't expire mid-playback.
const VIDEO_URL_TTL = 4 * 60 * 60;

@Injectable()
export class VideoService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private lessonService: LessonService,
  ) {}

  async uploadVideo(
    lessonId: string,
    userId: string,
    userRole: string,
    file: Express.Multer.File,
  ) {
    if (!ALLOWED_VIDEO.includes(file.mimetype)) {
      throw new BadRequestException('Only MP4 and WebM videos are allowed');
    }
    if (file.size > MAX_VIDEO_SIZE) {
      throw new BadRequestException('Video must not exceed 2GB');
    }

    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    if (lesson.type !== 'video')
      throw new BadRequestException('Lesson is not a video type');

    const section = await this.prisma.section.findUnique({
      where: { id: lesson.sectionId },
      include: { course: true },
    });
    if (userRole !== 'admin' && section?.course.instructorId !== userId)
      throw new ForbiddenException('Access denied');

    const ext = file.mimetype === 'video/mp4' ? 'mp4' : 'webm';
    const key = `videos/${lessonId}/${randomUUID()}.${ext}`;

    const existing = await this.prisma.videoAsset.findUnique({
      where: { lessonId },
    });
    if (existing?.videoUrl)
      await this.storage.deleteFile(
        this.storage.extractKeyFromUrl(existing.videoUrl),
      );

    // Stream the temp file to storage (multipart) instead of buffering the whole video in RAM.
    let url: string;
    try {
      url = await this.storage.uploadFile(
        key,
        createReadStream(file.path),
        file.mimetype,
      );
    } finally {
      await unlink(file.path).catch(() => undefined);
    }

    const asset = await this.prisma.videoAsset.upsert({
      where: { lessonId },
      update: { videoUrl: url, hlsUrl: url, processingStatus: 'ready', fileName: file.originalname },
      create: {
        lessonId,
        videoUrl: url,
        hlsUrl: url,
        processingStatus: 'ready',
        fileName: file.originalname,
      },
    });

    await this.prisma.lesson.update({
      where: { id: lessonId },
      data: { durationSec: asset.durationSec },
    });
    await this.lessonService.updateCourseStats(lesson.sectionId);

    return asset;
  }

  async deleteVideo(lessonId: string, userId: string, userRole: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    if (lesson.type !== 'video')
      throw new BadRequestException('Lesson is not a video type');

    const section = await this.prisma.section.findUnique({
      where: { id: lesson.sectionId },
      include: { course: true },
    });
    if (userRole !== 'admin' && section?.course.instructorId !== userId)
      throw new ForbiddenException('Access denied');

    const existing = await this.prisma.videoAsset.findUnique({
      where: { lessonId },
    });
    if (existing?.videoUrl)
      await this.storage.deleteFile(
        this.storage.extractKeyFromUrl(existing.videoUrl),
      );

    const asset = await this.prisma.videoAsset.update({
      where: { lessonId },
      data: {
        videoUrl: null,
        hlsUrl: null,
        thumbnailUrl: null,
        fileName: null,
        durationSec: 0,
        processingStatus: 'pending',
      },
    });

    await this.prisma.lesson.update({
      where: { id: lessonId },
      data: { durationSec: 0 },
    });
    await this.lessonService.updateCourseStats(lesson.sectionId);

    return asset;
  }

  async configVideo(
    lessonId: string,
    userId: string,
    userRole: string,
    dto: { completionMode: 'percent_90' | 'ended_autonext' },
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    if (lesson.type !== 'video')
      throw new BadRequestException('Lesson is not a video type');

    const section = await this.prisma.section.findUnique({
      where: { id: lesson.sectionId },
      include: { course: true },
    });
    if (userRole !== 'admin' && section?.course.instructorId !== userId)
      throw new ForbiddenException('Access denied');

    return this.prisma.videoAsset.upsert({
      where: { lessonId },
      update: { completionMode: dto.completionMode },
      create: { lessonId, completionMode: dto.completionMode },
    });
  }

  async getSignedVideoUrl(lessonId: string, userId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { videoAsset: true, section: { include: { course: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    if (!lesson.isPreview) {
      const enrolled = await this.lessonService.isEnrolled(
        userId,
        lesson.section.courseId,
      );
      const isInstructor = lesson.section.course.instructorId === userId;
      if (!enrolled && !isInstructor)
        throw new ForbiddenException('Not enrolled in this course');
    }

    if (!lesson.videoAsset?.videoUrl)
      throw new NotFoundException('Video not uploaded yet');
    if (lesson.isPreview) return { url: lesson.videoAsset.videoUrl };

    const key = this.storage.extractKeyFromUrl(lesson.videoAsset.videoUrl);
    const signedUrl = await this.storage.getSignedUrl(key, VIDEO_URL_TTL);
    return { url: signedUrl };
  }
}
