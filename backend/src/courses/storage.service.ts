import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

export function uploadDir(config: ConfigService): string {
  return resolve(config.get<string>('UPLOAD_DIR') ?? 'uploads');
}

/** Lưu file đính kèm trên đĩa local. Đổi sang S3/MinIO chỉ cần sửa lớp này. */
@Injectable()
export class StorageService implements OnModuleInit {
  readonly dir: string;

  constructor(config: ConfigService) {
    this.dir = uploadDir(config);
  }

  async onModuleInit() {
    await mkdir(this.dir, { recursive: true });
  }

  path(storageKey: string): string {
    return resolve(this.dir, storageKey);
  }

  /** Xóa file, bỏ qua file không còn tồn tại. */
  async remove(storageKeys: string[]): Promise<void> {
    await Promise.all(
      storageKeys.map((key) =>
        unlink(this.path(key)).catch((e: NodeJS.ErrnoException) => {
          if (e.code !== 'ENOENT') throw e;
        }),
      ),
    );
  }
}
