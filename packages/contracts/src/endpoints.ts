import { z } from 'zod';
import { Ok } from './common';
import {
  AuthStartQuery,
  ClassListBody,
  ClassListResponse,
  DemoLoginBody,
  JoinExamBody,
  JoinExamResponse,
  Me,
  Member,
  UpdateMeBody,
  UpdateMemberBody,
} from './api/accounts';
import {
  CreateExamBody,
  ExamDetail,
  ExamListResponse,
  ExamSummary,
  NewVersionBody,
  SaveDraftResponse,
  TaskAdjustment,
  TaskAdjustmentBody,
  UpdateSettingsBody,
  VersionResponse,
} from './api/exams';
import { AiStatus, TrialGradeBody, TrialGradeResponse } from './api/grading';
import {
  ExamStatus,
  StatusQuery,
  TestClockBody,
  TestClockResponse,
  TestRunJobsResponse,
} from './api/platform';
import {
  ConfirmAllResponse,
  ConfirmBody,
  MyResults,
  ReleaseResponse,
  ReviewQuery,
  ReviewQueue,
  ScoreRecord,
  SubmissionReview,
} from './api/review';
import {
  LateDecisionBody,
  MySubmissionsResponse,
  RecheckBatch,
  RecheckQuery,
  RecheckSubmitBody,
  RecheckSubmitResponse,
  Receipt,
  SubmissionListResponse,
  SubmitBody,
} from './api/submissions';
import { ExamContent } from './examContent';

/** 'professor' and 'student' mean the role in the exam when scope isn't 'none', the user's role otherwise. */
export const Access = z.enum(['public', 'signed-in', 'professor', 'student']);
export type Access = z.infer<typeof Access>;

export const Scope = z.enum(['none', 'exam', 'submission', 'scoreRecord']);
export type Scope = z.infer<typeof Scope>;

export const ModuleName = z.enum([
  'platform',
  'accounts',
  'exams',
  'submissions',
  'review',
  'grading',
]);
export type ModuleName = z.infer<typeof ModuleName>;

export type ResponseKind = z.ZodType | 'redirect' | 'csv';

export type EndpointDef = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string; // Hono style, without /api (API-1)
  module: ModuleName;
  access: Access;
  scope: Scope;
  summary: string;
  body?: z.ZodType;
  query?: z.ZodType;
  response: ResponseKind;
};

/** The 33 endpoints of docs/api.md, in its order. The Worker registers its routes from this. */
export const endpoints = {
  'auth.start': {
    method: 'GET',
    path: '/auth/:provider/start',
    module: 'accounts',
    access: 'public',
    scope: 'none',
    summary: 'Start sign-in with Google or GitHub',
    query: AuthStartQuery,
    response: 'redirect',
  },
  'auth.callback': {
    method: 'GET',
    path: '/auth/:provider/callback',
    module: 'accounts',
    access: 'public',
    scope: 'none',
    summary: 'Finish sign-in and create a session',
    response: 'redirect',
  },
  'auth.demo': {
    method: 'POST',
    path: '/auth/demo',
    module: 'accounts',
    access: 'public',
    scope: 'none',
    summary: 'Sign in as a demo user',
    body: DemoLoginBody,
    response: Me,
  },
  'auth.logout': {
    method: 'POST',
    path: '/auth/logout',
    module: 'accounts',
    access: 'signed-in',
    scope: 'none',
    summary: 'Sign out and delete the session',
    response: Ok,
  },
  'me.get': {
    method: 'GET',
    path: '/me',
    module: 'accounts',
    access: 'signed-in',
    scope: 'none',
    summary: 'The signed-in user',
    response: Me,
  },
  'me.update': {
    method: 'PATCH',
    path: '/me',
    module: 'accounts',
    access: 'signed-in',
    scope: 'none',
    summary: "Change the caller's enrolment number or language",
    body: UpdateMeBody,
    response: Me,
  },
  'exams.join': {
    method: 'POST',
    path: '/exams/join',
    module: 'accounts',
    access: 'student',
    scope: 'none',
    summary: 'Join an exam with its join code and an enrolment number',
    body: JoinExamBody,
    response: JoinExamResponse,
  },
  'exams.classList': {
    method: 'PUT',
    path: '/exams/:examId/class-list',
    module: 'accounts',
    access: 'professor',
    scope: 'exam',
    summary: "Replace the exam's class list",
    body: ClassListBody,
    response: ClassListResponse,
  },
  'members.update': {
    method: 'PATCH',
    path: '/exams/:examId/members/:userId',
    module: 'accounts',
    access: 'professor',
    scope: 'exam',
    summary: "Correct a student member's enrolment number",
    body: UpdateMemberBody,
    response: Member,
  },
  'exams.status': {
    method: 'GET',
    path: '/exams/:examId/status',
    module: 'platform',
    access: 'signed-in',
    scope: 'exam',
    summary: 'State, times, version and new notices of an exam (polled)',
    query: StatusQuery,
    response: ExamStatus,
  },
  'exams.create': {
    method: 'POST',
    path: '/exams',
    module: 'exams',
    access: 'professor',
    scope: 'none',
    summary: 'Create an exam',
    body: CreateExamBody,
    response: ExamSummary,
  },
  'exams.list': {
    method: 'GET',
    path: '/exams',
    module: 'exams',
    access: 'signed-in',
    scope: 'none',
    summary: 'Every exam the caller is a member of',
    response: ExamListResponse,
  },
  'exams.get': {
    method: 'GET',
    path: '/exams/:examId',
    module: 'exams',
    access: 'signed-in',
    scope: 'exam',
    summary: "The exam as the caller's role sees it",
    response: ExamDetail,
  },
  'exams.saveDraft': {
    method: 'PUT',
    path: '/exams/:examId/draft',
    module: 'exams',
    access: 'professor',
    scope: 'exam',
    summary: 'Replace the draft',
    body: ExamContent,
    response: SaveDraftResponse,
  },
  'exams.updateSettings': {
    method: 'PATCH',
    path: '/exams/:examId/settings',
    module: 'exams',
    access: 'professor',
    scope: 'exam',
    summary: 'Change the title, times or settings',
    body: UpdateSettingsBody,
    response: ExamSummary,
  },
  'exams.publish': {
    method: 'POST',
    path: '/exams/:examId/publish',
    module: 'exams',
    access: 'professor',
    scope: 'exam',
    summary: 'Publish the draft as version 1',
    response: VersionResponse,
  },
  'exams.newVersion': {
    method: 'POST',
    path: '/exams/:examId/versions',
    module: 'exams',
    access: 'professor',
    scope: 'exam',
    summary: 'Publish the draft as a new version',
    body: NewVersionBody,
    response: VersionResponse,
  },
  'exams.adjustTask': {
    method: 'PUT',
    path: '/exams/:examId/tasks/:taskId/adjustment',
    module: 'exams',
    access: 'professor',
    scope: 'exam',
    summary: 'Remove a task from the grade, or count it again',
    body: TaskAdjustmentBody,
    response: TaskAdjustment,
  },
  'exams.gradesCsv': {
    method: 'GET',
    path: '/exams/:examId/grades.csv',
    module: 'exams',
    access: 'professor',
    scope: 'exam',
    summary: 'Export the grades as CSV',
    response: 'csv',
  },
  'submissions.create': {
    method: 'POST',
    path: '/exams/:examId/tasks/:taskId/submissions',
    module: 'submissions',
    access: 'student',
    scope: 'exam',
    summary: 'Submit code for a task',
    body: SubmitBody,
    response: Receipt,
  },
  'submissions.mine': {
    method: 'GET',
    path: '/exams/:examId/my-submissions',
    module: 'submissions',
    access: 'student',
    scope: 'exam',
    summary: "The caller's receipts in this exam",
    response: MySubmissionsResponse,
  },
  'submissions.list': {
    method: 'GET',
    path: '/exams/:examId/submissions',
    module: 'submissions',
    access: 'professor',
    scope: 'exam',
    summary: 'Every student member with their submissions per task',
    response: SubmissionListResponse,
  },
  'submissions.lateDecision': {
    method: 'POST',
    path: '/submissions/:submissionId/late-decision',
    module: 'submissions',
    access: 'professor',
    scope: 'submission',
    summary: 'Accept or reject a late submission',
    body: LateDecisionBody,
    response: Ok,
  },
  'recheck.next': {
    method: 'GET',
    path: '/exams/:examId/recheck',
    module: 'submissions',
    access: 'professor',
    scope: 'exam',
    summary: 'The next batch of counted submissions for the hidden-test check',
    query: RecheckQuery,
    response: RecheckBatch,
  },
  'recheck.submit': {
    method: 'POST',
    path: '/exams/:examId/recheck',
    module: 'submissions',
    access: 'professor',
    scope: 'exam',
    summary: 'Store hidden-test check results and queue grading',
    body: RecheckSubmitBody,
    response: RecheckSubmitResponse,
  },
  'grading.trial': {
    method: 'POST',
    path: '/exams/:examId/tasks/:taskId/trial-grade',
    module: 'grading',
    access: 'professor',
    scope: 'exam',
    summary: 'Trial-grade sample code with the AI',
    body: TrialGradeBody,
    response: TrialGradeResponse,
  },
  'grading.aiStatus': {
    method: 'GET',
    path: '/exams/:examId/ai-status',
    module: 'grading',
    access: 'professor',
    scope: 'exam',
    summary: 'Grading progress and the AI budget',
    response: AiStatus,
  },
  'review.queue': {
    method: 'GET',
    path: '/exams/:examId/review',
    module: 'review',
    access: 'professor',
    scope: 'exam',
    summary: 'The review queue',
    query: ReviewQuery,
    response: ReviewQueue,
  },
  'review.submission': {
    method: 'GET',
    path: '/submissions/:submissionId/review',
    module: 'review',
    access: 'professor',
    scope: 'submission',
    summary: 'One submission with its check result, score records and history',
    response: SubmissionReview,
  },
  'review.confirm': {
    method: 'POST',
    path: '/score-records/:scoreRecordId/confirm',
    module: 'review',
    access: 'professor',
    scope: 'scoreRecord',
    summary: 'Confirm or change one score',
    body: ConfirmBody,
    response: ScoreRecord,
  },
  'review.confirmAll': {
    method: 'POST',
    path: '/submissions/:submissionId/confirm-all',
    module: 'review',
    access: 'professor',
    scope: 'submission',
    summary: 'Confirm every suggested score of a submission',
    response: ConfirmAllResponse,
  },
  'review.release': {
    method: 'POST',
    path: '/exams/:examId/release',
    module: 'review',
    access: 'professor',
    scope: 'exam',
    summary: 'Release the results to students',
    response: ReleaseResponse,
  },
  'review.myResults': {
    method: 'GET',
    path: '/exams/:examId/my-results',
    module: 'review',
    access: 'student',
    scope: 'exam',
    summary: "The caller's released results",
    response: MyResults,
  },
} as const satisfies Record<string, EndpointDef>;
export type EndpointKey = keyof typeof endpoints;

/** api.md T1 and T2: registered only when APP_ENV is test, without the Origin and session checks. */
export const testEndpoints = {
  'test.clock': {
    method: 'POST',
    path: '/test/clock',
    module: 'platform',
    access: 'public',
    scope: 'none',
    summary: 'Set the fake clock, or return to the real clock',
    body: TestClockBody,
    response: TestClockResponse,
  },
  'test.runJobs': {
    method: 'POST',
    path: '/test/run-jobs',
    module: 'platform',
    access: 'public',
    scope: 'none',
    summary: 'Close due exams, then run due jobs until none is due',
    response: TestRunJobsResponse,
  },
} as const satisfies Record<string, EndpointDef>;
export type TestEndpointKey = keyof typeof testEndpoints;

// Type helpers for the Worker (HandlerArgs) and the browser (api()), docs/internal-interfaces.md.
type Endpoints = typeof endpoints & typeof testEndpoints;
type AnyKey = EndpointKey | TestEndpointKey;

type PathParamNames<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? Name | PathParamNames<`/${Rest}`>
  : P extends `${string}:${infer Name}`
    ? Name
    : never;

/** The path parameters, as strings (there are no parameter schemas). */
export type ParamsOf<K extends AnyKey> = {
  [N in PathParamNames<Endpoints[K]['path']>]: string;
};
/** What the browser sends. */
export type QueryOf<K extends AnyKey> = Endpoints[K] extends { query: infer S extends z.ZodType }
  ? z.input<S>
  : undefined;
export type BodyOf<K extends AnyKey> = Endpoints[K] extends { body: infer S extends z.ZodType }
  ? z.input<S>
  : undefined;
/** What the handler gets, after the schema's defaults and transforms. */
export type ParsedQueryOf<K extends AnyKey> = Endpoints[K] extends {
  query: infer S extends z.ZodType;
}
  ? z.output<S>
  : undefined;
export type ParsedBodyOf<K extends AnyKey> = Endpoints[K] extends {
  body: infer S extends z.ZodType;
}
  ? z.output<S>
  : undefined;
/** The JSON response, or a raw Response for redirects and CSV. */
export type ResponseOf<K extends AnyKey> = Endpoints[K]['response'] extends infer S extends
  z.ZodType
  ? z.output<S>
  : Response;
