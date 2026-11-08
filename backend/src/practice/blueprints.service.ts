import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtPayload } from '../auth/auth.types';
import { canManageCourse } from '../courses/course-access';
import { PrismaService } from '../prisma/prisma.service';
import { BlueprintDto, MAX_PAPER_QUESTIONS } from './dto/practice.dto';
import { loadPools, poolKey } from './question-pool';

@Injectable()
export class BlueprintsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Danh sách ma trận kèm số câu hiện có trong kho cho từng quy tắc. */
  async list(actor: JwtPayload, courseId: string) {
    await this.assertCourse(actor, courseId);
    const [blueprints, pools] = await Promise.all([
      this.prisma.examBlueprint.findMany({
        where: { courseId },
        orderBy: { createdAt: 'desc' },
        include: {
          rules: { include: { topic: { select: { id: true, name: true } } } },
        },
      }),
      loadPools(this.prisma, courseId),
    ]);
    return blueprints.map((b) => {
      const rules = b.rules.map(({ blueprintId: _b, topicId: _t, ...r }) => ({
        ...r,
        available: pools.get(poolKey(r.topic.id, r.difficulty))?.length ?? 0,
      }));
      return {
        ...b,
        rules,
        totalQuestions: rules.reduce((s, r) => s + r.count, 0),
        ready: rules.every((r) => r.available >= r.count),
      };
    });
  }

  async create(actor: JwtPayload, courseId: string, dto: BlueprintDto) {
    await this.assertCourse(actor, courseId);
    await this.assertRules(courseId, dto);
    return this.prisma.examBlueprint.create({
      data: {
        courseId,
        title: dto.title.trim(),
        durationSec: dto.durationSec,
        rules: { create: dto.rules },
      },
    });
  }

  /** Sửa ma trận thì chuyển về nháp, để giảng viên kiểm tra lại trước khi công bố. */
  async update(actor: JwtPayload, blueprintId: string, dto: BlueprintDto) {
    const blueprint = await this.assertBlueprint(actor, blueprintId);
    await this.assertRules(blueprint.courseId, dto);
    await this.prisma.$transaction([
      this.prisma.blueprintRule.deleteMany({ where: { blueprintId } }),
      this.prisma.examBlueprint.update({
        where: { id: blueprintId },
        data: {
          title: dto.title.trim(),
          durationSec: dto.durationSec,
          published: false,
          rules: { create: dto.rules },
        },
      }),
    ]);
  }

  async setPublished(
    actor: JwtPayload,
    blueprintId: string,
    published: boolean,
  ) {
    const blueprint = await this.assertBlueprint(actor, blueprintId);
    if (published) {
      const pools = await loadPools(this.prisma, blueprint.courseId);
      const rules = await this.prisma.blueprintRule.findMany({
        where: { blueprintId },
        include: { topic: { select: { name: true } } },
      });
      const short = rules.filter(
        (r) =>
          (pools.get(poolKey(r.topicId, r.difficulty))?.length ?? 0) < r.count,
      );
      if (short.length > 0) {
        throw new BadRequestException(
          `Kho chưa đủ câu cho: ${short.map((r) => r.topic.name).join(', ')}`,
        );
      }
    }
    await this.prisma.examBlueprint.update({
      where: { id: blueprintId },
      data: { published },
    });
  }

  async remove(actor: JwtPayload, blueprintId: string) {
    await this.assertBlueprint(actor, blueprintId);
    await this.prisma.examBlueprint.delete({ where: { id: blueprintId } });
  }

  private async assertRules(courseId: string, dto: BlueprintDto) {
    const keys = dto.rules.map((r) => poolKey(r.topicId, r.difficulty));
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException(
        'Mỗi cặp chủ đề + độ khó chỉ khai báo một lần',
      );
    }
    const total = dto.rules.reduce((s, r) => s + r.count, 0);
    if (total > MAX_PAPER_QUESTIONS) {
      throw new BadRequestException(`Một đề tối đa ${MAX_PAPER_QUESTIONS} câu`);
    }
    const topicIds = [...new Set(dto.rules.map((r) => r.topicId))];
    const found = await this.prisma.topic.count({
      where: { id: { in: topicIds }, courseId },
    });
    if (found !== topicIds.length) {
      throw new BadRequestException('Có chủ đề không thuộc khóa học này');
    }
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

  private async assertBlueprint(actor: JwtPayload, blueprintId: string) {
    const blueprint = await this.prisma.examBlueprint.findUnique({
      where: { id: blueprintId },
    });
    if (!blueprint) throw new NotFoundException('Không tìm thấy đề thi thử');
    await this.assertCourse(actor, blueprint.courseId);
    return blueprint;
  }
}
