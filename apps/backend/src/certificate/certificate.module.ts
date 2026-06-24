import { Module } from '@nestjs/common';
import { CertificateController } from './certificate.controller';
import { CertificateService } from './certificate.service';
import { CertificateListener } from './certificate.listener';

@Module({
  controllers: [CertificateController],
  providers: [CertificateService, CertificateListener],
  exports: [CertificateService],
})
export class CertificateModule {}
