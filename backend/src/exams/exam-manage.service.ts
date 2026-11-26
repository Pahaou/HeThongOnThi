import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtPayload } from '../auth/auth.types';
import { canManageCourse } from '../courses/course-access';
import {
  CandidateVerdict,
  ExamAttemptStatus,
  ExamStatus,
  Role,
} from '../generated/prisma/client';
import { loadPools, poolKey } from '../practice/question-pool';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExamDto, UpdateExamDto } from './dto/exam.dto';
import { ExamGradingService } from './exam-grading.service';
import { ProctorService } from './proctor.service';

@Injectable()
export class ExamManageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly grading: ExamGradingService,
    private readonly proctor: ProctorService,
  ) {}

  async list(actor: JwtPayload, courseId: string) {
    await this.assertCourse(actor, courseId);
    const exams = await this.prisma.exam.findMany({
      where: { courseId },
      orderBy: { opensAt: 'desc' },
      include: {
        rules: { select: { count: true } },
        _count: { select: { candidates: true } },
      },
    });
    return exams.map(({ rules, _count, ...e }) => ({
      ...e,
      totalQuestions: rules.reduce((s, r) => s + r.count, 0),
      candidateCount: _count.candidates,
    }));
  }

  async create(actor: JwtPayload, courseId: string, dto: CreateExamDto) {
    await this.assertCourse(actor, courseId);
    assertWindow(dto.opensAt, dto.closesAt, dto.durationSec);
    const blueprint = await this.prisma.examBlueprint.findFirst({
      where: { id: dto.blueprintId, courseId },
      include: { rules: true },
    });
    if (!blueprint) {
      throw new BadRequestException('Đề thi thử không thuộc khóa học này');
    }
    return this.prisma.exam.create({
      data: {
        courseId,
        createdById: actor.sub,
        title: dto.title.trim(),
        opensAt: dto.opensAt,
        closesAt: dto.closesAt,
        durationSec: dto.durationSec,
        shuffleOptions: dto.shuffleOptions ?? true,
        rules: {
          create: blueprint.rules.map(({ topicId, difficulty, count }) => ({
            topicId,
            difficulty,
            count,
          })),
        },
      },
    });
  }

  async get(actor: JwtPayload, examId: string) {
    const exam = await this.assertExam(actor, examId);
    const [rules, pools, started] = await Promise.all([
      this.prisma.examRule.findMany({
        where: { examId },
        include: { topic: { select: { id: true, name: true } } },
      }),
      loadPools(this.prisma, exam.courseId),
      this.startedCount(examId),
    ]);
    return {
      ...exam,
      startedCount: started,
      rules: rules.map((r) => ({
        topic: r.topic,
        difficulty: r.difficulty,
        count: r.count,
        available: pools.get(poolKey(r.topicId, r.difficulty))?.length ?? 0,
      })),
    };
  }

  /** Đã có thí sinh bắt đầu thì chỉ đổi được tên và gia hạn giờ đóng. */
  async update(actor: JwtPayload, examId: string, dto: UpdateExamDto) {
    const exam = await this.assertExam(actor, examId);
    const started = (await this.startedCount(examId)) > 0;
    if (
      started &&
      (dto.opensAt !== undefined ||
        dto.durationSec !== undefined ||
        dto.shuffleOptions !== undefined ||
        (dto.closesAt && dto.closesAt < exam.closesAt))
    ) {
      throw new ConflictException(
        'Đã có thí sinh làm bài: chỉ được đổi tên hoặc lùi giờ đóng',
      );
    }
    assertWindow(
      dto.opensAt ?? exam.opensAt,
      dto.closesAt ?? exam.closesAt,
      dto.durationSec ?? exam.durationSec,
    );
    return this.prisma.exam.update({
      where: { id: examId },
      data: {
        title: dto.title?.trim(),
        opensAt: dto.opensAt,
        closesAt: dto.closesAt,
        durationSec: dto.durationSec,
        shuffleOptions: dto.shuffleOptions,
      },
    });
  }

  /** Công bố cần có thí sinh và kho đủ câu cho ma trận. */
  async setPublished(actor: JwtPayload, examId: string, published: boolean) {
    const exam = await this.assertExam(actor, examId);
    if (!published && (await this.startedCount(examId)) > 0) {
      throw new ConflictException(
        'Đã có thí sinh làm bài, không thể hủy công bố',
      );
    }
    if (published) {
      const candidates = await this.prisma.examCandidate.count({
        where: { examId },
      });
      if (candidates === 0) {
        throw new BadRequestException('Kỳ thi chưa có thí sinh nào');
      }
      const detail = await this.get(actor, examId);
      const short = detail.rules.filter((r) => r.available < r.count);
      if (short.length > 0) {
        throw new BadRequestException(
          `Kho chưa đủ câu cho: ${short.map((r) => r.topic.name).join(', ')}`,
        );
      }
    }
    await this.prisma.exam.update({
      where: { id: exam.id },
      data: { status: published ? ExamStatus.PUBLISHED : ExamStatus.DRAFT },
    });
  }

  async remove(actor: JwtPayload, examId: string) {
    await this.assertExam(actor, examId);
    if ((await this.startedCount(examId)) > 0) {
      throw new ConflictException(
        'Đã có thí sinh làm bài, không thể xóa kỳ thi',
      );
    }
    await this.prisma.exam.delete({ where: { id: examId } });
  }

  // ---------- Thí sinh ----------

  /** Thêm thí sinh theo email; báo lại email không tồn tại hoặc đã có. */
  async addCandidates(actor: JwtPayload, examId: string, emails: string[]) {
    await this.assertExam(actor, examId);
    const normalized = [...new Set(emails.map((e) => e.trim().toLowerCase()))];
    const users = await this.prisma.user.findMany({
      where: { email: { in: normalized } },
      select: { id: true, email: true },
    });
    const existing = await this.prisma.examCandidate.findMany({
      where: { examId, userId: { in: users.map((u) => u.id) } },
      select: { userId: true },
    });
    const already = new Set(existing.map((c) => c.userId));
    const toAdd = users.filter((u) => !already.has(u.id));
    await this.prisma.examCandidate.createMany({
      data: toAdd.map((u) => ({ examId, userId: u.id })),
      skipDuplicates: true,
    });
    const found = new Set(users.map((u) => u.email));
    return {
      added: toAdd.map((u) => u.email),
      alreadyAdded: users.filter((u) => already.has(u.id)).map((u) => u.email),
      notFound: normalized.filter((e) => !found.has(e)),
    };
  }

  async removeCandidate(
    actor: JwtPayload,
    examId: string,
    candidateId: string,
  ) {
    await this.assertExam(actor, examId);
    const candidate = await this.prisma.examCandidate.findFirst({
      where: { id: candidateId, examId },
      include: { attempt: { select: { id: true } } },
    });
    if (!candidate) throw new NotFoundException('Không tìm thấy thí sinh');
    if (candidate.attempt) {
      throw new ConflictException('Thí sinh đã làm bài, không thể xóa');
    }
    await this.prisma.examCandidate.delete({ where: { id: candidateId } });
  }

  /** Danh sách thí sinh và kết quả; bài quá hạn chưa nộp được chấm luôn. */
  async results(actor: JwtPayload, examId: string) {
    await this.assertExam(actor, examId);
    // Tự nộp bài quá hạn và xếp hàng chấm bài bị kẹt của kỳ thi này
    await this.grading.sweep(examId);
    const candidates = await this.prisma.examCandidate.findMany({
      where: { examId },
      orderBy: { user: { fullName: 'asc' } },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        attempt: {
          select: {
            status: true,
            startedAt: true,
            deadlineAt: true,
            submittedAt: true,
            totalCount: true,
            correctCount: true,
            score: true,
            violationCount: true,
            sessionTakeovers: true,
          },
        },
      },
    });
    return candidates.map((c) => ({
      id: c.id,
      user: c.user,
      verdict: c.verdict,
      attempt: c.attempt,
    }));
  }

  /**
   * Gia hạn cho một thí sinh đang làm bài (vd. mất điện, lỗi máy). Hạn mới
   * có thể vượt giờ đóng kỳ thi; mỗi lần gia hạn đều ghi lại người cho và lý do.
   */
  async extendTime(
    actor: JwtPayload,
    examId: string,
    candidateId: string,
    minutes: number,
    reason: string,
  ) {
    await this.assertExam(actor, examId);
    const attempt = await this.prisma.examAttempt.findFirst({
      where: { candidateId, candidate: { examId } },
    });
    if (!attempt) {
      throw new ConflictException('Thí sinh chưa vào thi, chưa thể gia hạn');
    }
    if (attempt.status !== ExamAttemptStatus.IN_PROGRESS) {
      throw new ConflictException('Thí sinh đã nộp bài, không thể gia hạn');
    }
    const extraSec = minutes * 60;
    const deadlineAt = await this.prisma.$transaction(async (tx) => {
      // Cộng trực tiếp trong SQL để hai lần gia hạn đồng thời không mất lần nào;
      // điều kiện trạng thái chặn trường hợp lượt quét vừa tự nộp bài ngay trước đó
      const rows = await tx.$queryRaw<{ deadline_at: Date }[]>`
        UPDATE exam_attempts
        SET deadline_at = deadline_at + make_interval(secs => ${extraSec})
        WHERE id = ${attempt.id}::uuid AND status = 'IN_PROGRESS'
        RETURNING deadline_at`;
      if (rows.length === 0) {
        throw new ConflictException('Thí sinh đã nộp bài, không thể gia hạn');
      }
      await tx.timeExtension.create({
        data: {
          attemptId: attempt.id,
          grantedById: actor.sub,
          extraSec,
          reason: reason.trim(),
        },
      });
      return rows[0].deadline_at;
    });
    this.proctor.notify(examId, candidateId);
    return { deadlineAt };
  }

  /**
   * Giám thị phân xử: hợp lệ / nghi vấn / vi phạm. Vi phạm thì buộc nộp bài
   * ngay (vẫn chấm để lưu hồ sơ) và thí sinh không vào lại được.
   */
  async setVerdict(
    actor: JwtPayload,
    examId: string,
    candidateId: string,
    verdict: CandidateVerdict,
    note?: string,
  ) {
    await this.assertExam(actor, examId);
    const candidate = await this.prisma.examCandidate.findFirst({
      where: { id: candidateId, examId },
      include: { attempt: { select: { id: true, status: true } } },
    });
    if (!candidate) throw new NotFoundException('Không tìm thấy thí sinh');
    await this.prisma.examCandidate.update({
      where: { id: candidateId },
      data: { verdict, verdictNote: note?.trim() || null },
    });
    if (
      verdict === CandidateVerdict.VIOLATION &&
      candidate.attempt?.status === ExamAttemptStatus.IN_PROGRESS
    ) {
      await this.grading.submit(candidate.attempt.id);
    }
    this.proctor.notify(examId, candidateId);
    return this.proctor.row(candidateId);
  }

  /** Bảng giám thị ban đầu (sau đó cập nhật qua WebSocket). */
  async proctorRows(actor: JwtPayload, examId: string) {
    await this.assertExam(actor, examId);
    return this.proctor.rows(examId);
  }

  /** Nhật ký một thí sinh: các lần gia hạn và sự kiện khi thi, theo thời gian. */
  async candidateLog(actor: JwtPayload, examId: string, candidateId: string) {
    await this.assertExam(actor, examId);
    const candidate = await this.prisma.examCandidate.findFirst({
      where: { id: candidateId, examId },
      include: {
        user: { select: { fullName: true, email: true } },
        attempt: {
          include: {
            extensions: {
              orderBy: { createdAt: 'asc' },
              include: { grantedBy: { select: { fullName: true } } },
            },
            events: { orderBy: { clientAt: 'asc' }, take: 500 },
          },
        },
      },
    });
    if (!candidate) throw new NotFoundException('Không tìm thấy thí sinh');
    const a = candidate.attempt;
    return {
      user: candidate.user,
      verdict: candidate.verdict,
      violationCount: a?.violationCount ?? 0,
      sessionTakeovers: a?.sessionTakeovers ?? 0,
      extensions: (a?.extensions ?? []).map((e) => ({
        minutes: e.extraSec / 60,
        reason: e.reason,
        grantedBy: e.grantedBy.fullName,
        createdAt: e.createdAt,
      })),
      // bigint không chuyển JSON được nên đổi id sang chuỗi
      events: (a?.events ?? []).map((e) => ({ ...e, id: e.id.toString() })),
    };
  }

  // ---------- Hỗ trợ ----------

  private startedCount(examId: string) {
    return this.prisma.examAttempt.count({ where: { candidate: { examId } } });
  }

  private async assertCourse(actor: JwtPayload, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    if (!canManageCourse(course, actor)) {
      throw new ForbiddenException(
        'Bạn không phải giảng viên của khóa học này',
      );
    }
  }

  private async assertExam(actor: JwtPayload, examId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: { course: { select: { instructorId: true } } },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy kỳ thi');
    if (actor.role !== Role.ADMIN && exam.course.instructorId !== actor.sub) {
      throw new ForbiddenException(
        'Bạn không phải giảng viên của khóa học này',
      );
    }
    const { course: _course, ...rest } = exam;
    return rest;
  }
}

function assertWindow(opensAt: Date, closesAt: Date, durationSec: number) {
  if (closesAt <= opensAt) {
    throw new BadRequestException('Giờ đóng phải sau giờ mở');
  }
  if (closesAt.getTime() - opensAt.getTime() < durationSec * 1000) {
    throw new BadRequestException(
      'Khoảng thời gian mở đề phải dài ít nhất bằng thời lượng làm bài',
    );
  }
}
