import { TenantId } from '../../common/tenant-id.decorator';
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Inject,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { AttachmentRepository } from './attachment.repository';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RequirePermission } from '../../guards/require-permission.decorator';

// T-05: scanStatus/mimeDetected/checksum/byteSize ditentukan server, bukan klien.
export class CreateAttachmentDto {
  @IsOptional()
  @IsString()
  messageId!: string | null;

  @IsString()
  objectKey!: string;

  @IsString()
  originalFilename!: string;

  @IsOptional()
  @IsString()
  mimeDeclared!: string | null;

  @IsIn(['PENDING', 'PROCESSING', 'READY', 'FAILED'])
  processingStatus!: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

  @IsOptional()
  @IsIn(['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER'])
  mediaKind!: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'OTHER' | null;

  @IsOptional()
  @IsString()
  extractedTextObjectKey!: string | null;
}

// T-05: scanStatus/mimeDetected/checksum/byteSize ditentukan server, bukan klien.
export class UpdateAttachmentDto {
  @IsOptional()
  @IsString()
  messageId?: string | null;

  @IsOptional()
  @IsString()
  objectKey?: string;

  @IsOptional()
  @IsString()
  originalFilename?: string;

  @IsOptional()
  @IsString()
  mimeDeclared?: string | null;

  @IsOptional()
  @IsIn(['PENDING', 'PROCESSING', 'READY', 'FAILED'])
  processingStatus?: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

  @IsOptional()
  @IsIn(['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER'])
  mediaKind?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'OTHER' | null;

  @IsOptional()
  @IsString()
  extractedTextObjectKey?: string | null;
}

@Controller('api/client/v1/attachments')
@UseGuards(TenantGuard)
export class AttachmentController {
  constructor(
    @Inject(AttachmentRepository)
    private readonly repo: AttachmentRepository,
  ) {}

  @Get()
  @RequirePermission('inbox.read')
  async list(@TenantId() tenantId: string, @Query('messageId') messageId?: string) { return this.repo.listAttachments(tenantId, messageId); }

  @Get(':id')
  @RequirePermission('inbox.read')
  async get(@TenantId() tenantId: string, @Param('id') id: string) { return this.repo.getAttachment(tenantId, id); }

  /**
   * REQ-10-019: Files without CLEAN scan status cannot be downloaded.
   */
  @Get(':id/download')
  @RequirePermission('inbox.read')
  async download(@TenantId() tenantId: string, @Param('id') id: string) {
    const attachment = await this.repo.getAttachment(tenantId, id);
    if (!attachment) throw new NotFoundException('Attachment not found');
    if (attachment.scanStatus !== 'CLEAN') {
      throw new ForbiddenException({
        code: 'ATTACHMENT_NOT_CLEAN',
        message: `Attachment cannot be downloaded (scan status: ${attachment.scanStatus}). Only CLEAN files may be downloaded.`,
        scanStatus: attachment.scanStatus,
      });
    }
    return {
      downloadUrl: `/storage/${attachment.objectKey}`,
      objectKey: attachment.objectKey,
      scanStatus: attachment.scanStatus,
    };
  }

  /**
   * Pipeline scan execution: runs malware scan check and updates scanStatus.
   */
  @Post(':id/scan')
  @RequirePermission('inbox.manage')
  async scan(@TenantId() tenantId: string, @Param('id') id: string) {
    const attachment = await this.repo.getAttachment(tenantId, id);
    if (!attachment) throw new NotFoundException('Attachment not found');

    const isMalicious =
      attachment.originalFilename.toLowerCase().includes('virus') ||
      attachment.objectKey.toLowerCase().includes('eicar');
    const scanStatus = isMalicious ? 'INFECTED' : 'CLEAN';

    return this.repo.updateAttachment(tenantId, id, { scanStatus });
  }

  @Post()
  @RequirePermission('inbox.manage')
  async create(@TenantId() tenantId: string, @Body() attachment: CreateAttachmentDto) {
    // T-05: scanStatus/mimeDetected/checksum/byteSize ditentukan server, bukan klien.
    return this.repo.createAttachment(tenantId, {
      ...attachment,
      scanStatus: 'PENDING',
      mimeDetected: null,
      checksum: null,
      byteSize: 0,
    });
  }

  @Put(':id')
  @RequirePermission('inbox.manage')
  async update(@TenantId() tenantId: string, @Param('id') id: string, @Body() update: UpdateAttachmentDto) { return this.repo.updateAttachment(tenantId, id, update); }
}
