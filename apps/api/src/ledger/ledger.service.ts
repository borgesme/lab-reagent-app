import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isControlled } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QueryLedgerDto } from './dto/query-ledger.dto';

export interface LedgerActor {
  sub: string;
  roles: string[];
}

export interface LedgerRow {
  date: string;
  reagentName: string;
  batchNo: string;
  hazardLevel: string;
  controlType: string | null;
  applicant: string;
  projectRef: string;
  purpose: string;
  actualQty: string;
  unit: string;
  issuer: string;
  witness: string;
  signed: 'Y' | 'N';
  labId: string;
}

const CSV_HEADERS: (keyof LedgerRow)[] = [
  'date',
  'reagentName',
  'batchNo',
  'controlType',
  'applicant',
  'projectRef',
  'purpose',
  'actualQty',
  'unit',
  'issuer',
  'witness',
  'signed',
];

@Injectable()
export class LedgerService {
  constructor(private prisma: PrismaService) {}

  async resolveLabScope(
    query: Pick<QueryLedgerDto, 'labId'>,
    actor: LedgerActor,
  ): Promise<string | undefined> {
    if (actor.roles.includes('SYS_ADMIN')) return query.labId;
    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
    });
    if (!user?.labId) throw new ForbiddenException('user has no lab');
    return user.labId;
  }

  async query(query: QueryLedgerDto, actor: LedgerActor): Promise<LedgerRow[]> {
    const allowed = ['LAB_HEAD', 'REAGENT_ADMIN', 'SAFETY_OFFICER', 'SYS_ADMIN'];
    if (!actor.roles.some((r) => allowed.includes(r))) {
      throw new ForbiddenException('role not allowed');
    }
    const labId = await this.resolveLabScope(query, actor);

    const where: Prisma.IssueRecordWhereInput = {};
    if (labId) where.request = { labId };
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) (where.createdAt as any).gte = new Date(query.from);
      if (query.to) (where.createdAt as any).lte = new Date(query.to);
    }

    const issues = await this.prisma.issueRecord.findMany({
      where,
      include: {
        request: { include: { reagent: true, applicant: true, stock: true } },
        issuer: true,
        witness: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return issues
      .filter((i) => isControlled(i.request.reagent))
      .map<LedgerRow>((i) => ({
        date: i.createdAt.toISOString().slice(0, 10),
        reagentName: i.request.reagent.name,
        batchNo: i.request.stock.batchNo ?? '',
        hazardLevel: i.request.reagent.hazardLevel,
        controlType: i.request.reagent.controlType,
        applicant: i.request.applicant.name,
        projectRef: i.request.projectRef ?? '',
        purpose: i.request.purpose,
        actualQty: i.actualQty.toString(),
        unit: i.request.unit,
        issuer: i.issuer.name,
        witness: i.witness?.name ?? '',
        signed: i.signatureDataUrl ? 'Y' : 'N',
        labId: i.request.labId,
      }));
  }

  toCsv(rows: LedgerRow[]): string {
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const head = CSV_HEADERS.join(',');
    const body = rows
      .map((r) => CSV_HEADERS.map((k) => esc(r[k])).join(','))
      .join('\n');
    return '\uFEFF' + head + (body ? '\n' + body : '\n');
  }

  async generateMonthly(yearMonth: string, labId: string) {
    const [y, m] = yearMonth.split('-').map((s) => Number(s));
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1));

    const issues = await this.prisma.issueRecord.findMany({
      where: {
        createdAt: { gte: from, lt: to },
        request: { labId },
      },
      include: {
        request: { include: { reagent: true, applicant: true, stock: true } },
        issuer: true,
        witness: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const rows: LedgerRow[] = issues
      .filter((i) => isControlled(i.request.reagent))
      .map((i) => ({
        date: i.createdAt.toISOString().slice(0, 10),
        reagentName: i.request.reagent.name,
        batchNo: i.request.stock.batchNo ?? '',
        hazardLevel: i.request.reagent.hazardLevel,
        controlType: i.request.reagent.controlType,
        applicant: i.request.applicant.name,
        projectRef: i.request.projectRef ?? '',
        purpose: i.request.purpose,
        actualQty: i.actualQty.toString(),
        unit: i.request.unit,
        issuer: i.issuer.name,
        witness: i.witness?.name ?? '',
        signed: i.signatureDataUrl ? 'Y' : 'N',
        labId: i.request.labId,
      }));

    const csvContent = this.toCsv(rows);

    const snap = await this.prisma.controlledLedgerSnapshot.upsert({
      where: { labId_yearMonth: { labId, yearMonth } },
      update: { csvContent, rowCount: rows.length },
      create: { labId, yearMonth, csvContent, rowCount: rows.length },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: null,
        action: 'LEDGER_SNAPSHOT_GENERATE',
        entityType: 'ControlledLedgerSnapshot',
        entityId: snap.id,
        after: { labId, yearMonth, rowCount: rows.length } as any,
      },
    });

    return snap;
  }

  async listSnapshots(labId: string | undefined, actor: LedgerActor) {
    const scope = await this.resolveLabScope({ labId }, actor);
    return this.prisma.controlledLedgerSnapshot.findMany({
      where: scope ? { labId: scope } : {},
      orderBy: { yearMonth: 'desc' },
    });
  }

  async getSnapshot(id: string, actor: LedgerActor) {
    const snap = await this.prisma.controlledLedgerSnapshot.findUnique({
      where: { id },
    });
    if (!snap) return null;
    if (!actor.roles.includes('SYS_ADMIN')) {
      const user = await this.prisma.user.findUnique({
        where: { id: actor.sub },
      });
      if (user?.labId !== snap.labId) return null;
    }
    return snap;
  }

  listAllLabIds() {
    return this.prisma.lab.findMany({ select: { id: true } });
  }
}
