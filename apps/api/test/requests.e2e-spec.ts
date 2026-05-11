import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Requests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let plainToken: string;
  let plainUserId: string;
  let reagentId: string;
  let stockId: string;

  async function ensureFixtureUser(
    email: string,
    name: string,
    password = 'pass1234',
  ) {
    const hash = await bcrypt.hash(password, 10);
    const plainRole = await prisma.role.findUniqueOrThrow({
      where: { code: 'PLAIN_USER' },
    });
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        passwordHash: hash,
        tokenVersion: 0,
        deletedAt: null,
        currentRefreshJti: null,
        labId: null,
      },
      create: {
        email,
        name,
        passwordHash: hash,
        roles: { create: [{ roleId: plainRole.id }] },
      },
    });
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: plainRole.id },
    });
    return user;
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.issueRecord.deleteMany({});
    await prisma.approval.deleteMany({});
    await prisma.request.deleteMany({});

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@lab.local', password: 'admin123' });
    adminToken = adminLogin.body.accessToken;

    await ensureFixtureUser('requester@lab.local', 'Requester');
    const reqLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'requester@lab.local', password: 'pass1234' });
    plainToken = reqLogin.body.accessToken;
    const u = await prisma.user.findUnique({ where: { email: 'requester@lab.local' } });
    plainUserId = u!.id;
    await prisma.user.update({
      where: { id: plainUserId },
      data: { labId: 'lab-default' },
    });

    const reagent = await prisma.reagent.upsert({
      where: { id: 'reagent-req-test' },
      update: {},
      create: { id: 'reagent-req-test', name: 'TestReagent-ReqFlow', category: '有机' },
    });
    reagentId = reagent.id;

    const stock = await prisma.reagentStock.create({
      data: {
        reagentId,
        labId: 'lab-default',
        batchNo: 'ReqBatch-01',
        initialQty: '1000',
        currentQty: '1000',
        unit: 'mL',
      },
    });
    stockId = stock.id;

    await prisma.reagent.upsert({
      where: { id: 'reagent-ctrl-test' },
      update: {},
      create: {
        id: 'reagent-ctrl-test',
        name: 'TestReagent-Controlled',
        category: '管控',
        hazardLevel: 'CONTROLLED',
        controlType: 'TOXIC',
      },
    });
    await prisma.reagentStock.upsert({
      where: { id: 'stock-ctrl-test' },
      update: {
        currentQty: '500',
        initialQty: '500',
      },
      create: {
        id: 'stock-ctrl-test',
        reagentId: 'reagent-ctrl-test',
        labId: 'lab-default',
        batchNo: 'CtrlBatch-01',
        initialQty: '500',
        currentQty: '500',
        unit: 'g',
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('applicant creates request (PENDING)', async () => {
    const r = await request(app.getHttpServer())
      .post('/requests')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({
        reagentId,
        stockId,
        quantity: '50',
        unit: 'mL',
        purpose: '做反应实验',
      });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('PENDING');
    expect(r.body.labId).toBe('lab-default');
    expect(r.body.applicantId).toBe(plainUserId);
  });

  it('applicant lists only own requests', async () => {
    const r = await request(app.getHttpServer())
      .get('/requests')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(r.status).toBe(200);
    expect(r.body.every((x: any) => x.applicantId === plainUserId)).toBe(true);
    expect(r.body.length).toBeGreaterThanOrEqual(1);
  });

  it('SYS_ADMIN lists all', async () => {
    const r = await request(app.getHttpServer())
      .get('/requests')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it('rejects request when quantity exceeds stock', async () => {
    const r = await request(app.getHttpServer())
      .post('/requests')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({
        reagentId,
        stockId,
        quantity: '99999',
        unit: 'mL',
        purpose: '超库存申请',
      });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/stock|库存/i);
  });

  it('applicant cancels own pending request', async () => {
    const create = await request(app.getHttpServer())
      .post('/requests')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({
        reagentId,
        stockId,
        quantity: '10',
        unit: 'mL',
        purpose: '待取消',
      });
    const id = create.body.id;
    const r = await request(app.getHttpServer())
      .post(`/requests/${id}/cancel`)
      .set('Authorization', `Bearer ${plainToken}`);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CANCELLED');
  });

  it('cannot cancel other user request', async () => {
    await ensureFixtureUser('other@lab.local', 'Other');
    const otherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'other@lab.local', password: 'pass1234' });

    const create = await request(app.getHttpServer())
      .post('/requests')
      .set('Authorization', `Bearer ${plainToken}`)
      .send({
        reagentId,
        stockId,
        quantity: '10',
        unit: 'mL',
        purpose: '非法取消测试',
      });
    const id = create.body.id;
    const r = await request(app.getHttpServer())
      .post(`/requests/${id}/cancel`)
      .set('Authorization', `Bearer ${otherLogin.body.accessToken}`);
    expect(r.status).toBe(403);
  });

  describe('controlled create validation', () => {
    let controlledReagentId: string;
    let controlledStockId: string;

    beforeAll(async () => {
      const r = await prisma.reagent.findUniqueOrThrow({ where: { id: 'reagent-ctrl-test' } });
      const s = await prisma.reagentStock.findFirstOrThrow({
        where: { reagentId: r.id, batchNo: 'CtrlBatch-01' },
      });
      controlledReagentId = r.id;
      controlledStockId = s.id;
    });

    it('rejects controlled request with short purpose', async () => {
      const r = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({
          reagentId: controlledReagentId,
          stockId: controlledStockId,
          quantity: '5',
          unit: 'g',
          purpose: '短用途',
          projectRef: 'P1',
          useLocation: 'L1',
        });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/purpose/i);
    });

    it('rejects controlled request missing projectRef', async () => {
      const r = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({
          reagentId: controlledReagentId,
          stockId: controlledStockId,
          quantity: '5',
          unit: 'g',
          purpose: '这是一段足够长的管控试剂用途说明必须超过五十字的详细描述内容一二三四五六七八九十ABCDEF测试用例合规',
          useLocation: 'L1',
        });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/projectRef/);
    });

    it('rejects controlled request missing useLocation', async () => {
      const r = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({
          reagentId: controlledReagentId,
          stockId: controlledStockId,
          quantity: '5',
          unit: 'g',
          purpose: '这是一段足够长的管控试剂用途说明必须超过五十字的详细描述内容一二三四五六七八九十ABCDEF测试用例合规',
          projectRef: 'P1',
        });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/useLocation/);
    });

    it('accepts controlled request meeting all rules', async () => {
      const r = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({
          reagentId: controlledReagentId,
          stockId: controlledStockId,
          quantity: '3',
          unit: 'g',
          purpose: '这是一段足够长的管控试剂用途说明必须超过五十字的详细描述内容一二三四五六七八九十ABCDEF测试用例合规',
          projectRef: 'P1',
          useLocation: 'L1',
        });
      expect(r.status).toBe(201);
      expect(r.body.status).toBe('PENDING');
    });
  });

  describe('approvals', () => {
    let labHeadToken: string;
    let labHeadId: string;
    let pendingRequestId: string;

    beforeAll(async () => {
      await ensureFixtureUser('labhead@lab.local', 'LabHead');
      const u = await prisma.user.findUnique({ where: { email: 'labhead@lab.local' } });
      labHeadId = u!.id;
      const labHeadRole = await prisma.role.findUniqueOrThrow({
        where: { code: 'LAB_HEAD' },
      });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: labHeadId, roleId: labHeadRole.id } },
        update: {},
        create: { userId: labHeadId, roleId: labHeadRole.id },
      });
      await prisma.user.update({
        where: { id: labHeadId },
        data: { labId: 'lab-default' },
      });
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'labhead@lab.local', password: 'pass1234' });
      labHeadToken = login.body.accessToken;

      const create = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({
          reagentId,
          stockId,
          quantity: '20',
          unit: 'mL',
          purpose: '待审批测试',
        });
      pendingRequestId = create.body.id;
    });

    it('plain user cannot approve', async () => {
      const r = await request(app.getHttpServer())
        .post(`/requests/${pendingRequestId}/approvals`)
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ action: 'APPROVE' });
      expect(r.status).toBe(403);
    });

    it('lab head approves', async () => {
      const r = await request(app.getHttpServer())
        .post(`/requests/${pendingRequestId}/approvals`)
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ action: 'APPROVE', comment: '通过' });
      expect(r.status).toBe(201);
      expect(r.body.request.status).toBe('APPROVED');
      expect(r.body.approval.action).toBe('APPROVE');
      expect(r.body.approval.approverId).toBe(labHeadId);
    });

    it('cannot approve already-approved request', async () => {
      const r = await request(app.getHttpServer())
        .post(`/requests/${pendingRequestId}/approvals`)
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ action: 'APPROVE' });
      expect(r.status).toBe(400);
    });

    it('lab head rejects new request with reason', async () => {
      const create = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({
          reagentId,
          stockId,
          quantity: '30',
          unit: 'mL',
          purpose: '将被拒绝',
        });
      const r = await request(app.getHttpServer())
        .post(`/requests/${create.body.id}/approvals`)
        .set('Authorization', `Bearer ${labHeadToken}`)
        .send({ action: 'REJECT', comment: '用途不明' });
      expect(r.status).toBe(201);
      expect(r.body.request.status).toBe('REJECTED');
      expect(r.body.request.rejectedReason).toBe('L1: 用途不明');
    });

    describe('two-level for controlled', () => {
      let safetyToken: string;
      let safetyId: string;
      let ctrlPendingId: string;

      beforeAll(async () => {
        await ensureFixtureUser('safety@lab.local', 'Safety');
        const u = await prisma.user.findUnique({ where: { email: 'safety@lab.local' } });
        safetyId = u!.id;
        const role = await prisma.role.findUniqueOrThrow({ where: { code: 'SAFETY_OFFICER' } });
        await prisma.userRole.upsert({
          where: { userId_roleId: { userId: safetyId, roleId: role.id } },
          update: {},
          create: { userId: safetyId, roleId: role.id },
        });
        await prisma.user.update({
          where: { id: safetyId },
          data: { labId: 'lab-default' },
        });
        const login = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'safety@lab.local', password: 'pass1234' });
        safetyToken = login.body.accessToken;

        const create = await request(app.getHttpServer())
          .post('/requests')
          .set('Authorization', `Bearer ${plainToken}`)
          .send({
            reagentId: 'reagent-ctrl-test',
            stockId: 'stock-ctrl-test',
            quantity: '2',
            unit: 'g',
            purpose: '这是一段足够长的管控试剂用途说明必须超过五十字的详细描述内容一二三四五六七八九十ABCDEF测试用例合规',
            projectRef: 'P-ctrl',
            useLocation: 'Lab-A',
          });
        ctrlPendingId = create.body.id;
      });

      it('level=2 before level=1 returns 400', async () => {
        const r = await request(app.getHttpServer())
          .post(`/requests/${ctrlPendingId}/approvals`)
          .set('Authorization', `Bearer ${safetyToken}`)
          .send({ action: 'APPROVE', level: 2 });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/level=1/);
      });

      it('LAB_HEAD level=1 APPROVE keeps PENDING', async () => {
        const r = await request(app.getHttpServer())
          .post(`/requests/${ctrlPendingId}/approvals`)
          .set('Authorization', `Bearer ${labHeadToken}`)
          .send({ action: 'APPROVE', level: 1 });
        expect(r.status).toBe(201);
        expect(r.body.request.status).toBe('PENDING');
        expect(r.body.approval.level).toBe(1);
      });

      it('LAB_HEAD cannot submit level=2 → 403', async () => {
        const r = await request(app.getHttpServer())
          .post(`/requests/${ctrlPendingId}/approvals`)
          .set('Authorization', `Bearer ${labHeadToken}`)
          .send({ action: 'APPROVE', level: 2 });
        expect(r.status).toBe(403);
      });

      it('SAFETY_OFFICER level=2 APPROVE → APPROVED', async () => {
        const r = await request(app.getHttpServer())
          .post(`/requests/${ctrlPendingId}/approvals`)
          .set('Authorization', `Bearer ${safetyToken}`)
          .send({ action: 'APPROVE', level: 2 });
        expect(r.status).toBe(201);
        expect(r.body.request.status).toBe('APPROVED');
        expect(r.body.approval.level).toBe(2);
      });

      it('SAFETY_OFFICER on non-controlled level=1 → 403', async () => {
        const plainCreate = await request(app.getHttpServer())
          .post('/requests')
          .set('Authorization', `Bearer ${plainToken}`)
          .send({
            reagentId,
            stockId,
            quantity: '3',
            unit: 'mL',
            purpose: '安全员越权测试',
          });
        const r = await request(app.getHttpServer())
          .post(`/requests/${plainCreate.body.id}/approvals`)
          .set('Authorization', `Bearer ${safetyToken}`)
          .send({ action: 'APPROVE', level: 1 });
        expect(r.status).toBe(403);
      });

      it('level=2 on non-controlled returns 400', async () => {
        const plainCreate = await request(app.getHttpServer())
          .post('/requests')
          .set('Authorization', `Bearer ${plainToken}`)
          .send({
            reagentId,
            stockId,
            quantity: '3',
            unit: 'mL',
            purpose: 'level 2 对普通无意义',
          });
        const r = await request(app.getHttpServer())
          .post(`/requests/${plainCreate.body.id}/approvals`)
          .set('Authorization', `Bearer ${safetyToken}`)
          .send({ action: 'APPROVE', level: 2 });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/level=2 not applicable/);
      });
    });
  });

  describe('issues', () => {
    let approvedRequestId: string;
    const approvedQty = '25';

    beforeAll(async () => {
      const create = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({
          reagentId,
          stockId,
          quantity: approvedQty,
          unit: 'mL',
          purpose: '待发放',
        });
      approvedRequestId = create.body.id;
      const lh = await prisma.user.findUnique({
        where: { email: 'labhead@lab.local' },
      });
      if (!lh) throw new Error('labhead fixture missing');
      const lhLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'labhead@lab.local', password: 'pass1234' });
      await request(app.getHttpServer())
        .post(`/requests/${approvedRequestId}/approvals`)
        .set('Authorization', `Bearer ${lhLogin.body.accessToken}`)
        .send({ action: 'APPROVE' });
    });

    it('plain user cannot issue', async () => {
      const r = await request(app.getHttpServer())
        .post(`/requests/${approvedRequestId}/issues`)
        .set('Authorization', `Bearer ${plainToken}`)
        .send({ actualQty: approvedQty });
      expect(r.status).toBe(403);
    });

    it('admin issues approved request and decrements stock', async () => {
      const stockBefore = await prisma.reagentStock.findUnique({
        where: { id: stockId },
      });
      const qtyBefore = stockBefore!.currentQty.toString();

      const r = await request(app.getHttpServer())
        .post(`/requests/${approvedRequestId}/issues`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ actualQty: approvedQty });
      expect(r.status).toBe(201);
      expect(r.body.request.status).toBe('ISSUED');
      expect(r.body.issue.actualQty).toBe(approvedQty);
      expect(r.body.issue.receiverId).toBeDefined();

      const stockAfter = await prisma.reagentStock.findUnique({
        where: { id: stockId },
      });
      const delta = Number(qtyBefore) - Number(stockAfter!.currentQty);
      expect(delta).toBeCloseTo(Number(approvedQty), 3);
    });

    it('cannot issue PENDING request', async () => {
      const create = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({
          reagentId,
          stockId,
          quantity: '5',
          unit: 'mL',
          purpose: 'pending not issuable',
        });
      const r = await request(app.getHttpServer())
        .post(`/requests/${create.body.id}/issues`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ actualQty: '5' });
      expect(r.status).toBe(400);
    });

    it('rejects issue when actualQty exceeds current stock', async () => {
      const create = await request(app.getHttpServer())
        .post('/requests')
        .set('Authorization', `Bearer ${plainToken}`)
        .send({
          reagentId,
          stockId,
          quantity: '10',
          unit: 'mL',
          purpose: '库存不足路径',
        });
      const lhLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'labhead@lab.local', password: 'pass1234' });
      await request(app.getHttpServer())
        .post(`/requests/${create.body.id}/approvals`)
        .set('Authorization', `Bearer ${lhLogin.body.accessToken}`)
        .send({ action: 'APPROVE' });

      await prisma.reagentStock.update({
        where: { id: stockId },
        data: { currentQty: '1' },
      });

      const r = await request(app.getHttpServer())
        .post(`/requests/${create.body.id}/issues`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ actualQty: '10' });
      expect(r.status).toBe(400);
      expect(r.body.message).toMatch(/stock|库存/i);

      await prisma.reagentStock.update({
        where: { id: stockId },
        data: { currentQty: '1000' },
      });
    });

    describe('controlled double-witness', () => {
      let safetyToken: string;
      let labHeadToken2: string;
      let labHeadId2: string;
      let adminUserId: string;
      let ctrlApprovedId: string;
      const validSig =
        'data:image/png;base64,iVBORw0KGgoAAAANS' + 'A'.repeat(64);

      beforeAll(async () => {
        const sfLogin = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'safety@lab.local', password: 'pass1234' });
        safetyToken = sfLogin.body.accessToken;

        const lhLogin = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'labhead@lab.local', password: 'pass1234' });
        labHeadToken2 = lhLogin.body.accessToken;

        const lh = await prisma.user.findUniqueOrThrow({
          where: { email: 'labhead@lab.local' },
        });
        labHeadId2 = lh.id;

        const admin = await prisma.user.findUniqueOrThrow({
          where: { email: 'admin@lab.local' },
        });
        adminUserId = admin.id;
        await prisma.user.update({
          where: { id: adminUserId },
          data: { labId: 'lab-default' },
        });

        await prisma.reagentStock.update({
          where: { id: 'stock-ctrl-test' },
          data: { currentQty: '500' },
        });

        const create = await request(app.getHttpServer())
          .post('/requests')
          .set('Authorization', `Bearer ${plainToken}`)
          .send({
            reagentId: 'reagent-ctrl-test',
            stockId: 'stock-ctrl-test',
            quantity: '4',
            unit: 'g',
            purpose:
              '这是一段足够长的管控试剂用途说明必须超过五十字的详细描述内容一二三四五六七八九十ABCDEF测试用例合规',
            projectRef: 'P-iss',
            useLocation: 'Lab-A',
          });
        ctrlApprovedId = create.body.id;
        await request(app.getHttpServer())
          .post(`/requests/${ctrlApprovedId}/approvals`)
          .set('Authorization', `Bearer ${labHeadToken2}`)
          .send({ action: 'APPROVE', level: 1 });
        await request(app.getHttpServer())
          .post(`/requests/${ctrlApprovedId}/approvals`)
          .set('Authorization', `Bearer ${safetyToken}`)
          .send({ action: 'APPROVE', level: 2 });
      });

      it('rejects controlled issue missing witnessId', async () => {
        const r = await request(app.getHttpServer())
          .post(`/requests/${ctrlApprovedId}/issues`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ actualQty: '4', signatureDataUrl: validSig });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/witnessId/);
      });

      it('rejects controlled issue missing signature', async () => {
        const r = await request(app.getHttpServer())
          .post(`/requests/${ctrlApprovedId}/issues`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ actualQty: '4', witnessId: labHeadId2 });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/signature/i);
      });

      it('rejects when witness === issuer', async () => {
        const r = await request(app.getHttpServer())
          .post(`/requests/${ctrlApprovedId}/issues`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            actualQty: '4',
            witnessId: adminUserId,
            signatureDataUrl: validSig,
          });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/witness/);
      });

      it('rejects when witness has wrong role', async () => {
        const r = await request(app.getHttpServer())
          .post(`/requests/${ctrlApprovedId}/issues`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            actualQty: '4',
            witnessId: plainUserId,
            signatureDataUrl: validSig,
          });
        expect(r.status).toBe(400);
        expect(r.body.message).toMatch(/witness/);
      });

      it('accepts controlled issue with lab_head witness and decrements stock', async () => {
        const ctrlStock = await prisma.reagentStock.findFirstOrThrow({
          where: { batchNo: 'CtrlBatch-01' },
        });
        const before = Number(ctrlStock.currentQty);

        const r = await request(app.getHttpServer())
          .post(`/requests/${ctrlApprovedId}/issues`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            actualQty: '4',
            witnessId: labHeadId2,
            signatureDataUrl: validSig,
          });
        expect(r.status).toBe(201);
        expect(r.body.request.status).toBe('ISSUED');
        expect(r.body.issue.witnessId).toBe(labHeadId2);
        expect(r.body.issue.signatureDataUrl).toContain('data:image/');

        const after = await prisma.reagentStock.findUniqueOrThrow({
          where: { id: ctrlStock.id },
        });
        expect(before - Number(after.currentQty)).toBeCloseTo(4, 3);
      });
    });
  });
});
