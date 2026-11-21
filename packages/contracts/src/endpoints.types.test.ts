import { describe, expectTypeOf, it } from 'vitest';
import type { Me } from './api/accounts';
import type { z } from 'zod';
import { ReviewQuery } from './api/review';
import type { BodyOf, ParamsOf, ParsedQueryOf, QueryOf, ResponseOf } from './endpoints';

describe('endpoint type helpers', () => {
  it('reads path parameters from the path', () => {
    expectTypeOf<ParamsOf<'exams.adjustTask'>>().toEqualTypeOf<{
      examId: string;
      taskId: string;
    }>();
    expectTypeOf<ParamsOf<'exams.get'>>().toEqualTypeOf<{ examId: string }>();
    expectTypeOf<ParamsOf<'me.get'>>().toEqualTypeOf<Record<never, string>>();
  });

  it('separates what the browser sends from what the handler gets', () => {
    expectTypeOf<QueryOf<'review.queue'>>().toEqualTypeOf<z.input<typeof ReviewQuery>>();
    expectTypeOf<ParsedQueryOf<'review.queue'>>().toEqualTypeOf<ReviewQuery>();
    expectTypeOf<QueryOf<'review.queue'>>().not.toEqualTypeOf<ReviewQuery>(); // filter is optional
    expectTypeOf<BodyOf<'me.get'>>().toEqualTypeOf<undefined>();
  });

  it('gives JSON types for JSON responses and Response for the others', () => {
    expectTypeOf<ResponseOf<'me.get'>>().toEqualTypeOf<Me>();
    expectTypeOf<ResponseOf<'exams.gradesCsv'>>().toEqualTypeOf<Response>();
    expectTypeOf<ResponseOf<'test.clock'>>().toEqualTypeOf<{ now: string }>();
  });
});
