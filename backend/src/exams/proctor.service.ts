import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Namespace } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

// Máy thí sinh liên lạc trong khoảng này thì coi là đang online (client hỏi trạng thái 20 giây/lần)
const ONLINE_WITHIN_MS = 45_000;
// Lưu bài rất dày khi đông thí sinh: mỗi thí sinh phát tối đa một cập nhật trong khoảng này
const THROTTLE_MS = 2_000;

const CANDIDATE_INCLUDE = {
  user: { select: { id: true, fullName: true, email: true } },
  attempt: {
    select: {
      id: true,
      status: true,
      startedAt: true,
      deadlineAt: true,
      submittedAt: true,
      totalCount: true,
      score: true,
      violationCount: true,
      sessionTakeovers: true,
      lastSeenAt: true,
    },
  },
} as const;

export const examRoom = (examId: string) => `exam:${examId}`;

/** Dữ liệu màn giám thị và phát cập nhật realtime tới phòng của kỳ thi. */
@Injectable()
export class ProctorService implements OnModuleDestroy {
  private readonly logger = new Logger(ProctorService.name);
  /** Namespace /proctor, gateway gán khi khởi tạo */
  server?: Namespace;
  private readonly lastEmit = new Map<string, number>();
  private readonly scheduled = new Map<string, NodeJS.Timeout>();
  private closed = false;

  constructor(private readonly prisma: PrismaService) {}

  /** Tắt app: hủy các lần phát đang hẹn giờ để không chạm DB sau khi đóng. */
  onModuleDestroy() {
    this.closed = true;
    this.scheduled.forEach((t) => clearTimeout(t));
    this.scheduled.clear();
  }

  async rows(examId: string) {
    const candidates = await this.prisma.examCandidate.findMany({
      where: { examId },
      orderBy: { user: { fullName: 'asc' } },
      include: CANDIDATE_INCLUDE,
    });
    const answered = await this.answeredCounts(
      candidates.flatMap((c) => (c.attempt ? [c.attempt.id] : [])),
    );
    return candidates.map((c) => this.toRow(c, answered));
  }

  async row(candidateId: string) {
    const c = await this.prisma.examCandidate.findUnique({
      where: { id: candidateId },
      include: CANDIDATE_INCLUDE,
    });
    if (!c) return null;
    const answered = await this.answeredCounts(c.attempt ? [c.attempt.id] : []);
    return this.toRow(c, answered);
  }

  /**
   * Phát dòng mới nhất của thí sinh tới giám thị đang xem kỳ thi. Không chặn
   * request gọi nó và không bao giờ ném lỗi ra ngoài. throttle=true cho các
   * sự kiện dày (lưu bài, hỏi trạng thái): gom lại, phát bản cuối sau tối đa 2 giây.
   */
  notify(examId: string, candidateId: string, throttle = false): void {
    if (!this.server || this.closed) return;
    // Không có giám thị nào đang xem kỳ thi này: khỏi truy vấn dựng dòng
    if (!this.server.adapter.rooms.get(examRoom(examId))?.size) return;
    const now = Date.now();
    const last = this.lastEmit.get(candidateId) ?? 0;
    if (throttle && now - last < THROTTLE_MS) {
      if (this.scheduled.has(candidateId)) return;
      const timer = setTimeout(
        () => {
          this.scheduled.delete(candidateId);
          this.emit(examId, candidateId);
        },
        THROTTLE_MS - (now - last),
      );
      timer.unref();
      this.scheduled.set(candidateId, timer);
      return;
    }
    this.emit(examId, candidateId);
  }

  private emit(examId: string, candidateId: string) {
    if (this.closed) return;
    this.lastEmit.set(candidateId, Date.now());
    this.row(candidateId)
      .then((row) => {
        // Bài đã chấm thì không còn cập nhật dày (lưu bài, hỏi trạng thái): bỏ mốc để Map không lớn mãi
        if (row?.attempt?.status === 'GRADED')
          this.lastEmit.delete(candidateId);
        if (row)
          this.server?.to(examRoom(examId)).emit('candidate:update', row);
      })
      .catch((e: Error) =>
        this.logger.warn(`Không phát được cập nhật giám thị: ${e.message}`),
      );
  }

  /** Số câu đã chọn của từng lượt thi */
  private async answeredCounts(attemptIds: string[]) {
    if (attemptIds.length === 0) return new Map<string, number>();
    const groups = await this.prisma.attemptQuestion.groupBy({
      by: ['attemptId'],
      where: {
        attemptId: { in: attemptIds },
        NOT: { selectedOptionIds: { isEmpty: true } },
      },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.attemptId, g._count._all]));
  }

  private toRow(
    c: {
      id: string;
      verdict: string;
      verdictNote: string | null;
      user: { id: string; fullName: string; email: string };
      attempt: {
        id: string;
        status: string;
        startedAt: Date;
        deadlineAt: Date;
        submittedAt: Date | null;
        totalCount: number;
        score: number | null;
        violationCount: number;
        sessionTakeovers: number;
        lastSeenAt: Date | null;
      } | null;
    },
    answered: Map<string, number>,
  ) {
    const a = c.attempt;
    return {
      candidateId: c.id,
      user: c.user,
      verdict: c.verdict,
      verdictNote: c.verdictNote,
      attempt: a && {
        status: a.status,
        startedAt: a.startedAt,
        deadlineAt: a.deadlineAt,
        submittedAt: a.submittedAt,
        totalCount: a.totalCount,
        answeredCount: answered.get(a.id) ?? 0,
        score: a.score,
        violationCount: a.violationCount,
        sessionTakeovers: a.sessionTakeovers,
        lastSeenAt: a.lastSeenAt,
        online:
          a.status === 'IN_PROGRESS' &&
          !!a.lastSeenAt &&
          Date.now() - a.lastSeenAt.getTime() < ONLINE_WITHIN_MS,
      },
    };
  }
}
