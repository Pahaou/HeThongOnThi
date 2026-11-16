import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { JwtPayload } from '../auth/auth.types';
import { Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { examRoom, ProctorService } from './proctor.service';

/**
 * Màn giám thị realtime. Xác thực bằng access token gửi trong handshake
 * (`auth.token`); chỉ giảng viên của khóa hoặc admin được vào phòng kỳ thi.
 */
@WebSocketGateway({
  namespace: '/proctor',
  cors: { origin: true, credentials: true },
})
export class ProctorGateway implements OnGatewayInit {
  private readonly logger = new Logger(ProctorGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly proctor: ProctorService,
  ) {}

  /**
   * Xác thực trong middleware (chạy trước khi kết nối được thiết lập), nên
   * không có chuyện client gửi join khi server chưa kịp đọc token.
   */
  afterInit(server: Namespace) {
    this.proctor.server = server;
    server.use((socket, next) => {
      const token = (socket.handshake.auth as { token?: string } | undefined)
        ?.token;
      this.jwt
        .verifyAsync<JwtPayload>(token ?? '')
        .then((user) => {
          if (user.role !== Role.INSTRUCTOR && user.role !== Role.ADMIN) {
            return next(new Error('Không có quyền giám thị'));
          }
          (socket.data as { user?: JwtPayload }).user = user;
          next();
        })
        .catch(() => next(new Error('Chưa đăng nhập')));
    });
  }

  /** Vào phòng kỳ thi; trả danh sách thí sinh hiện tại để client dựng bảng ban đầu. */
  @SubscribeMessage('join')
  async join(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { examId?: string },
  ) {
    const user = (client.data as { user?: JwtPayload }).user;
    const examId = typeof body?.examId === 'string' ? body.examId : '';
    const exam = examId
      ? await this.prisma.exam
          .findUnique({
            where: { id: examId },
            include: { course: { select: { instructorId: true } } },
          })
          .catch(() => null)
      : null;
    if (
      !user ||
      !exam ||
      (user.role !== Role.ADMIN && exam.course.instructorId !== user.sub)
    ) {
      return { ok: false, message: 'Không có quyền giám thị kỳ thi này' };
    }
    await client.join(examRoom(examId));
    this.logger.log(`Giám thị ${user.email} vào phòng ${examId}`);
    return {
      ok: true,
      rows: await this.proctor.rows(examId),
      serverNow: new Date(),
    };
  }
}
