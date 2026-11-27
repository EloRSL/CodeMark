// The accounts module's public functions (docs/internal-interfaces.md section 3).
export {
  addMemberQuery,
  checkAccess,
  getMembership,
  getUserNames,
  listStudentMembers,
  resolveScopeExamId,
} from './service';
export type { Membership, ScopeResolvers } from './service';
