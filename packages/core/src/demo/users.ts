import type { DemoUser, EnrolmentNo, UserRole, Uuid } from '@codemark/contracts';

type DemoUserRow = {
  id: Uuid;
  name: string;
  email: string;
  role: UserRole;
  enrolmentNo: EnrolmentNo | null;
};

/** The demo accounts (docs/demo-data.md). All have demo = 1 and locale sl. */
export const DEMO_USERS: Record<DemoUser, DemoUserRow> = {
  professor: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Demo Professor',
    email: 'professor@demo.invalid',
    role: 'professor',
    enrolmentNo: null,
  },
  student1: {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Ana Novak',
    email: 'ana@demo.invalid',
    role: 'student',
    enrolmentNo: '63240001',
  },
  student2: {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Bor Kranjc',
    email: 'bor@demo.invalid',
    role: 'student',
    enrolmentNo: '63240002',
  },
  student3: {
    id: '00000000-0000-4000-8000-000000000004',
    name: 'Cvetka Zupan',
    email: 'cvetka@demo.invalid',
    role: 'student',
    enrolmentNo: '63240003',
  },
};
